/*
 * bridges/uxp-indesign/main.js
 * UXP plugin bridge for Adobe InDesign (Manifest v5, InDesign 18.5+), hybrid by design.
 *
 * InDesign's UXP can run ExtendScript synchronously (app.doScript with ScriptLanguage.JAVASCRIPT) and returns
 * the script's value, so this plugin carries the same handlers the CEP panel uses (jsx/es3-runtime.jsx +
 * jsx/id-handlers.jsx) and runs every command through them. One code path for InDesign, on Windows and macOS,
 * and no CEP debug mode. Verified live on InDesign 22.0 / UXP 9.4 (Windows) on 20/11/2026; macOS not validated.
 */

const indesign = require("indesign");
const uxp = require("uxp");
const { app, ScriptLanguage, UndoModes } = indesign;
const { entrypoints } = uxp;

const HUB_URLS = ["ws://127.0.0.1:31001/plugin", "ws://localhost:31001/plugin"];
let hubAttempt = 0;
const RECONNECT_DELAY_MS = 2500;
let ws = null;
let reconnectTimer = null;
let reconnectButtonBound = false;


// A long script leaves the app without reaction until it ends and it looks frozen (22/11/2026): show what runs.
const __busy = { list: [], timer: null };
function __busyLabel(action) {
  if (/raw\.execute|execute(Uxp|Extend)Script|\.code$/i.test(action)) return "script";
  if (/render/i.test(action)) return "render";
  if (/export/i.test(action)) return "exportando";
  if (/save/i.test(action)) return "salvando";
  return action;
}
function __busyPaint() {
  const el = document.getElementById("busy");
  if (!el) return;
  if (!el.style) return;
  if (!__busy.list.length) {
    el.style.display = "none";
    return;
  }
  const cur = __busy.list[0];
  const secs = Math.round((Date.now() - cur.t0) / 1000);
  const more = __busy.list.length > 1 ? ` (+${__busy.list.length - 1} na fila)` : "";
  el.textContent = `Executando: ${__busyLabel(cur.action)} \u00b7 ${secs} s${more}. O app pode n\u00e3o responder at\u00e9 terminar.`;
  el.style.display = "block";
}
// setTimeout chain, not setInterval: one tick a second only while something runs.
function __busyTick() {
  if (__busy.timer || !__busy.list.length) return;
  __busy.timer = setTimeout(() => {
    __busy.timer = null;
    __busyPaint();
    __busyTick();
  }, 1000);
}
// Newer release on GitHub (sent by the MCP server; the user installs it himself).
function showNotice(msg) {
  const text = msg && (msg.type === "notice" ? msg.text : msg.notice);
  if (!text) return;
  const el = document.getElementById("notice");
  if (el && el.style) {
    el.textContent = text;
    el.style.display = "block";
  }
  log(text);
}
function busyStart(action) {
  __busy.list.push({ action, t0: Date.now() });
  __busyPaint();
  __busyTick();
}
function busyEnd(action) {
  const i = __busy.list.findIndex((b) => b.action === action);
  if (i >= 0) {
    const secs = Math.round((Date.now() - __busy.list[i].t0) / 1000);
    if (secs >= 5) log(`Fim: ${__busyLabel(action)} (${secs} s)`);
    __busy.list.splice(i, 1);
  }
  __busyPaint();
}

function log(msg) {
  const el = typeof document !== "undefined" ? document.getElementById("log") : null;
  if (el) {
    el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + el.textContent.slice(0, 3000);
  }
}

function updateStatus(connected) {
  const st = typeof document !== "undefined" ? document.getElementById("status") : null;
  if (st) {
    st.textContent = connected ? "Connected" : "Disconnected";
    st.className = "status " + (connected ? "ok" : "err");
  }
}

/* ------------------------------------------------- ExtendScript handlers through this UXP plugin */
let esBundleCache = null;

async function loadExtendScriptBundle() {
  if (esBundleCache) return esBundleCache;
  const folder = await uxp.storage.localFileSystem.getPluginFolder();
  const read = async (name) => {
    const entry = await folder.getEntry("jsx/" + name);
    return String(await entry.read());
  };
  esBundleCache = (await read("es3-runtime.jsx")) + "\n" + (await read("id-handlers.jsx")) + "\n";
  return esBundleCache;
}

async function runExtendScriptHybrid(actionName, params, options) {
  const bundle = await loadExtendScriptBundle();
  const undoName = (options && options.undoGroup) || "MCP: " + actionName;
  // Same envelope the CEP panel evaluates: the runtime turns the command into one undo step and answers a JSON string.
  const script =
    bundle +
    "\n__mcpExecuteWithUndo(\"indesign\", " +
    JSON.stringify(undoName) +
    ", function () { return __mcpDispatch(" +
    JSON.stringify(actionName) +
    ", " +
    JSON.stringify(params || {}) +
    ", " +
    JSON.stringify(options || {}) +
    "); });";
  let raw = app.doScript(script, ScriptLanguage.JAVASCRIPT, [], UndoModes.SCRIPT_REQUEST, undoName);
  if (raw && typeof raw.then === "function") raw = await raw;
  if (raw === undefined || raw === null || raw === "") {
    const err = new Error(`ExtendScript ran '${actionName}' but returned nothing.`);
    err.code = "EXTENDSCRIPT_NO_RESULT";
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch (_e) {
    const err = new Error("ExtendScript returned an unreadable result: " + String(raw).slice(0, 300));
    err.code = "EXTENDSCRIPT_BAD_RESULT";
    throw err;
  }
  if (parsed && parsed.ok) return parsed.data;
  const info = (parsed && parsed.error) || {};
  const err = new Error(info.message || "ExtendScript error");
  err.code = info.code || "EXTENDSCRIPT_ERROR";
  if (info.details) err.details = info.details;
  throw err;
}

/* --------------------------------------------------------------- connection */

/* ------------------------------------------------- on/off switch per app (default: on) */
// Shared with the CEP panel of the same app through one small file PER APP in the user folder (two apps never
// rewrite each other's choice); if the file cannot be written from UXP, the choice stays in this panel's storage.
const BRIDGE_APP_ID = "indesign";
let bridgeDisabled = false;
let powerBound = false;

function bridgeStateFile() {
  try {
    return String(require("os").homedir()).replace(/\\/g, "/") + "/.jr-adb-mcp-bridge/bridge-state-" + BRIDGE_APP_ID + ".json";
  } catch (_e) {
    return "";
  }
}

function readBridgeState() {
  try {
    return JSON.parse(String(require("fs").readFileSync(bridgeStateFile(), "utf-8"))) || {};
  } catch (_e) {
    return {};
  }
}

function readBridgeDisabled() {
  const s = readBridgeState();
  if (s.disabled === true) return true;
  if (s.disabled === false) return false;
  try {
    return localStorage.getItem("mcpBridgeDisabled") === "1";
  } catch (_e) {
    return false;
  }
}

function writeBridgeDisabled(value) {
  try {
    localStorage.setItem("mcpBridgeDisabled", value ? "1" : "0");
  } catch (_e) {}
  try {
    const fsN = require("fs");
    const file = bridgeStateFile();
    try {
      fsN.mkdirSync(file.slice(0, file.lastIndexOf("/")));
    } catch (_e) {}
    fsN.writeFileSync(file, JSON.stringify({ app: BRIDGE_APP_ID, disabled: Boolean(value) }, null, 2));
  } catch (e) {
    log("Estado guardado so neste painel: " + (e && e.message ? e.message : e));
  }
}

function renderPower() {
  const btn = document.getElementById("btnPower");
  if (btn) btn.textContent = bridgeDisabled ? "Ligar MCP neste app" : "Desligar MCP neste app";
  if (bridgeDisabled) {
    const st = document.getElementById("status");
    if (st) {
      st.textContent = "Desligado";
      st.className = "status err";
    }
  }
}

function applyBridgeDisabled() {
  if (bridgeDisabled) {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const old = ws;
    ws = null;
    if (old) {
      old.onopen = null;
      old.onmessage = null;
      old.onclose = null;
      old.onerror = null;
      try {
        old.close();
      } catch (_e) {}
    }
    log("MCP desligado neste app.");
  } else {
    log("MCP ligado neste app.");
    connect();
  }
  renderPower();
}

function connect() {
  if (bridgeDisabled) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Retire the previous socket first and detach its handlers: otherwise its late onclose would
  // schedule a reconnect that kills the new socket, and the panel would flap forever.
  const previous = ws;
  ws = null;
  if (previous) {
    previous.onopen = null;
    previous.onmessage = null;
    previous.onclose = null;
    previous.onerror = null;
    try {
      previous.close();
    } catch (_e) {}
  }

  let socket;
  try {
    const hubUrl = HUB_URLS[hubAttempt++ % HUB_URLS.length];
    log("Connecting " + hubUrl);
    socket = new WebSocket(hubUrl);
  } catch (e) {
    log("WebSocket blocked: " + (e && e.message ? e.message : e));
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.onopen = () => {
    if (ws !== socket) return;
    updateStatus(true);
    log("Connected to MCP Hub");
    socket.send(
      JSON.stringify({
        type: "hello",
        app: "indesign",
        bridgeType: "uxp",
        appVersion: String(app.version || "unknown"),
        pluginVersion: "1.0.6",
        capabilities: ["uxp", "extendscriptHybrid", "extendscript", "dom"]
      })
    );
  };

  socket.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (_e) {
      return;
    }
    if (msg.type === "notice" || msg.type === "hello_ack") showNotice(msg);
    if (msg.type !== "command") return;

    log(`Action: ${msg.action}`);
    const start = Date.now();
    busyStart(msg.action);
    let reply;
    try {
      const data = await runExtendScriptHybrid(msg.action, msg.params || {}, msg.options || {});
      reply = { ok: true, data };
      if (data && typeof data.previewBase64 === "string") {
        reply.previewBase64 = data.previewBase64;
        reply.previewMimeType = data.previewMimeType || "image/png";
        reply.data = Object.assign({}, data);
        delete reply.data.previewBase64;
      }
    } catch (err) {
      reply = {
        ok: false,
        error: {
          code: (err && err.code) || "ID_UXP_ERROR",
          message: err && err.message ? err.message : String(err)
        }
      };
    }
    busyEnd(msg.action);
    try {
      socket.send(
        JSON.stringify(
          Object.assign({ type: "response", id: msg.id, app: "indesign", bridgeType: "uxp", durationMs: Date.now() - start }, reply)
        )
      );
    } catch (errTransport) {
      // Parsing the packet or sending the answer failed: without this line the MCP only sees a timeout.
      log("Transport error: " + (errTransport && errTransport.message ? errTransport.message : errTransport) + " | " + String(event && event.data).slice(0, 120));
    }
  };

  socket.onclose = (ev) => {
    if (ws !== socket) return;
    log("Closed code=" + (ev && ev.code) + " reason=" + ((ev && ev.reason) || "-"));
    ws = null;
    updateStatus(false);
    scheduleReconnect();
  };

  socket.onerror = (ev) => {
    if (ws !== socket) return;
    log("Socket error: " + ((ev && (ev.message || ev.type)) || "unknown"));
    updateStatus(false);
  };
}

function isConnectedOrConnecting() {
  return ws !== null && (typeof ws.readyState !== "number" || ws.readyState === 0 || ws.readyState === 1);
}

function ensureConnected() {
  if (!isConnectedOrConnecting()) {
    connect();
  }
}

function scheduleReconnect() {
  if (bridgeDisabled || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

entrypoints.setup({
  // Connect as soon as the app loads the plugin: the panel does not have to be opened (19/11/2026, to validate).
  plugin: {
    create() {
      try {
        bridgeDisabled = readBridgeDisabled();
        ensureConnected();
      } catch (_e) {}
    }
  },
  panels: {
    "com.jradbmcp.indesign.panel": {
      show() {
        const btn = document.getElementById("btnToggle");
        if (btn && !reconnectButtonBound) {
          reconnectButtonBound = true;
          btn.addEventListener("click", () => connect());
        }
        const power = document.getElementById("btnPower");
        if (power && !powerBound) {
          powerBound = true;
          power.addEventListener("click", () => {
            bridgeDisabled = !bridgeDisabled;
            writeBridgeDisabled(bridgeDisabled);
            applyBridgeDisabled();
          });
          // Follow the switch when the other panel of this app flips it.
          const every = typeof setInterval === "function" ? setInterval : () => 0;
          every(() => {
            const s = readBridgeState();
            let mine = false;
            try {
              mine = localStorage.getItem("mcpBridgeDisabled") === "1";
            } catch (_e) {}
            // The file (when it exists) is the truth for the whole app; without it, this panel's own choice.
            const now = typeof s.disabled === "boolean" ? s.disabled : mine;
            if (now !== bridgeDisabled) {
              bridgeDisabled = now;
              try {
                localStorage.setItem("mcpBridgeDisabled", now ? "1" : "0");
              } catch (_e) {}
              applyBridgeDisabled();
            }
          }, 2000);
        }
        bridgeDisabled = readBridgeDisabled();
        renderPower();
        ensureConnected();
      }
    }
  }
});

