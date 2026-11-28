/*
 * bridges/cep-universal-bridge/js/main.js
 * Universal CEP 12 WebSocket client for After Effects (AEFT), Premiere Pro (PPRO),
 * Illustrator (ILST), and Photoshop (PHXS).
 */

(function () {
  var fs = require("fs");
  var path = require("path");

  var HOST_MAP = {
    AEFT: "after-effects",
    PPRO: "premiere",
    ILST: "illustrator",
    PHXS: "photoshop",
    IDSN: "indesign"
  };

  var HANDLER_FILE_MAP = {
    "after-effects": "ae-handlers.jsx",
    premiere: "pr-handlers.jsx",
    illustrator: "ai-handlers.jsx",
    photoshop: "ps-handlers.jsx",
    indesign: "id-handlers.jsx"
  };

  var cep = window.__adobe_cep__;
  var hostEnv = cep ? JSON.parse(cep.getHostEnvironment()) : { appId: "AEFT", appVersion: "25.0" };
  var adobeAppId = HOST_MAP[hostEnv.appId] || "after-effects";

  var statusBadge = document.getElementById("statusBadge");
  var hostNameEl = document.getElementById("hostName");
  var logEl = document.getElementById("log");
  var btnReconnect = document.getElementById("btnReconnect");

  if (hostNameEl) {
    hostNameEl.textContent = adobeAppId + " v" + (hostEnv.appVersion || "");
  }

  function appendLog(msg) {
    if (!logEl) return;
    var line = "[" + new Date().toLocaleTimeString() + "] " + msg + "\n";
    logEl.textContent = (line + logEl.textContent).slice(0, 4000);
  }

  /*
   * A long script leaves the app without reaction until it ends, and it looks frozen (22/11/2026). The panel shows
   * what is running and for how long, so the person knows the app is working.
   */
  var busyEl = document.getElementById("busy");
  var busyRunning = [];
  var busyTimer = null;
  function busyLabel(action) {
    if (/raw\.execute|executeExtendScript|\.code$/i.test(action)) return "script";
    if (/render/i.test(action)) return "render";
    if (/export/i.test(action)) return "exportando";
    if (/save/i.test(action)) return "salvando";
    return action;
  }
  function busyPaint() {
    if (!busyEl || !busyEl.style) return;
    if (!busyRunning.length) {
      busyEl.style.display = "none";
      return;
    }
    var cur = busyRunning[0];
    var secs = Math.round((Date.now() - cur.t0) / 1000);
    var more = busyRunning.length > 1 ? " (+" + (busyRunning.length - 1) + " na fila)" : "";
    busyEl.textContent = "Executando: " + busyLabel(cur.action) + " \u00b7 " + secs + " s" + more + ". O app pode n\u00e3o responder at\u00e9 terminar.";
    busyEl.style.display = "block";
  }
  // setTimeout chain, not setInterval: one tick a second only while something runs.
  function busyTick() {
    if (busyTimer || !busyRunning.length) return;
    busyTimer = setTimeout(function () {
      busyTimer = null;
      busyPaint();
      busyTick();
    }, 1000);
  }
  function busyStart(action) {
    busyRunning.push({ action: action, t0: Date.now() });
    busyPaint();
    busyTick();
  }
  function busyEnd(action) {
    for (var i = 0; i < busyRunning.length; i++) {
      if (busyRunning[i].action === action) {
        var secs = Math.round((Date.now() - busyRunning[i].t0) / 1000);
        if (secs >= 5) appendLog("Fim: " + busyLabel(action) + " (" + secs + " s)");
        busyRunning.splice(i, 1);
        break;
      }
    }
    busyPaint();
  }

  function evalExtendScript(scriptCode) {
    return new Promise(function (resolve) {
      if (!cep || typeof cep.evalScript !== "function") {
        resolve(JSON.stringify({ ok: false, error: { code: "NO_CEP_HOST", message: "__adobe_cep__.evalScript unavailable" } }));
        return;
      }
      cep.evalScript(scriptCode, function (result) {
        resolve(result);
      });
    });
  }

  /** Resolves with null when the host does not call back within `ms` (blocked by a modal dialog, frozen). */
  function evalWithTimeout(scriptCode, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(null);
      }, ms);
      evalExtendScript(scriptCode).then(function (result) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  var PROBE_TOKEN = "__mcp_probe_ok__";

  /**
   * evalScript answers a bare "EvalScript error." both when the script does not parse and when the host
   * cannot run scripts (modal dialog). A one-line probe tells them apart: if the probe runs, the problem
   * is in the handler bundle (a bridge bug, e.g. a reserved word as an unquoted key); if it does not, the
   * host is blocked.
   */
  function diagnoseEvalFailure(rawResult) {
    return evalWithTimeout("'" + PROBE_TOKEN + "'", 3000).then(function (probe) {
      var handlerName = HANDLER_FILE_MAP[adobeAppId];
      if (probe === PROBE_TOKEN) {
        return {
          code: "SCRIPT_PARSE_ERROR",
          message:
            adobeAppId + " runs scripts, but rejected the MCP handler bundle (es3-runtime.jsx + " + handlerName +
            "): " + String(rawResult).slice(0, 200) + ". This is a bridge bug (syntax error or reserved word in the " +
            "installed .jsx), not a dialog. Run 'npm run install-bridges' and retry."
        };
      }
      return {
        code: "HOST_BLOCKED",
        message:
          adobeAppId + " did not run even a one-line probe script after '" + String(rawResult).slice(0, 120) +
          "': a modal dialog is probably open or the app is busy. Close any dialog in " + adobeAppId + " and retry."
      };
    });
  }

  /**
   * Folders that may hold the .jsx handlers. In a CEP panel `__dirname` is normally the folder of
   * index.html (the extension root), but it is the script folder in some hosts, so both are tried,
   * plus the path CEP itself reports for the extension and the repository layout used in development.
   */
  function candidateJsxDirs() {
    var dirs = [];
    function add(dir) {
      if (dir && dirs.indexOf(dir) === -1) dirs.push(dir);
    }
    try {
      if (cep && typeof cep.getSystemPath === "function") {
        var extPath = String(cep.getSystemPath("extension") || "").replace(/^file:\/+/, "/");
        if (/^\/[A-Za-z]:/.test(extPath)) extPath = extPath.slice(1);
        if (extPath) add(path.join(decodeURIComponent(extPath), "jsx"));
      }
    } catch (_e) {}
    if (typeof __dirname === "string" && __dirname) {
      add(path.join(__dirname, "jsx"));
      add(path.resolve(__dirname, "..", "jsx"));
      add(path.resolve(__dirname, "..", "..", "src", "extendscript"));
      add(path.resolve(__dirname, "..", "..", "..", "src", "extendscript"));
    }
    return dirs;
  }

  function resolveExtendScriptBundle() {
    var handlerName = HANDLER_FILE_MAP[adobeAppId];
    var dirs = candidateJsxDirs();
    for (var i = 0; i < dirs.length; i++) {
      var runtimePath = path.join(dirs[i], "es3-runtime.jsx");
      var handlerPath = path.join(dirs[i], handlerName);
      if (fs.existsSync(runtimePath) && fs.existsSync(handlerPath)) {
        return fs.readFileSync(runtimePath, "utf8") + "\n" + fs.readFileSync(handlerPath, "utf8") + "\n";
      }
    }
    var err = new Error(
      "ExtendScript handlers (es3-runtime.jsx + " + handlerName + ") were not found. Looked in: " +
        dirs.join(" | ") + ". Run 'npm run install-bridges' again."
    );
    err.code = "CEP_HANDLERS_NOT_FOUND";
    throw err;
  }

  var ws = null;
  var reconnectTimer = null;
  var hubUrl = "ws://127.0.0.1:31001/plugin";

  function setStatus(connected) {
    if (!statusBadge) return;
    statusBadge.textContent = connected ? "Connected" : "Disconnected";
    statusBadge.className = "badge " + (connected ? "connected" : "disconnected");
    if (typeof isBackground !== "undefined" && isBackground) sendCepEvent(EVT_ALIVE, connected ? "1" : "0");
  }

  async function handleCommandPacket(packet, socket) {
    var startMs = Date.now();
    var ws = socket;
    try {
      var bundle = resolveExtendScriptBundle();
      var undoName = (packet.options && packet.options.undoGroup) || ("MCP: " + packet.action);
      var script =
        bundle +
        "\n__mcpExecuteWithUndo(" +
        JSON.stringify(adobeAppId) +
        ", " +
        JSON.stringify(undoName) +
        ", function() { return __mcpDispatch(" +
        JSON.stringify(packet.action) +
        ", " +
        JSON.stringify(packet.params || {}) +
        ", " +
        JSON.stringify(packet.options || {}) +
        "); });";

      var rawResult = await evalExtendScript(script);
      var parsed;
      try {
        parsed = JSON.parse(rawResult);
      } catch (_parseErr) {
        // evalScript returns the literal "EvalScript error." when the script could not even be parsed/run.
        parsed = { ok: false, error: await diagnoseEvalFailure(rawResult) };
      }
      var durationMs = Date.now() - startMs;

      if (parsed && parsed.ok) {
        var dataObj = parsed.data || {};
        ws.send(
          JSON.stringify({
            type: "response",
            id: packet.id,
            app: adobeAppId,
            bridgeType: "cep",
            ok: true,
            durationMs: durationMs,
            data: parsed.data,
            previewBase64: dataObj.previewBase64,
            previewMimeType: dataObj.previewMimeType
          })
        );
      } else {
        ws.send(
          JSON.stringify({
            type: "response",
            id: packet.id,
            app: adobeAppId,
            bridgeType: "cep",
            ok: false,
            durationMs: durationMs,
            error: (parsed && parsed.error) || {
              code: "EVALSCRIPT_FAILED",
              message: String(rawResult)
            }
          })
        );
      }
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: "response",
          id: packet.id,
          app: adobeAppId,
          bridgeType: "cep",
          ok: false,
          durationMs: Date.now() - startMs,
          error: {
            code: (err && err.code) || "CEP_BRIDGE_EXCEPTION",
            message: err && err.message ? err.message : String(err)
          }
        })
      );
    }
  }

  // Two copies of this page can run in one app: the visible panel (Window > Extensions) and, in Premiere Pro,
  // the invisible background extension that starts with the app. Only one may hold the socket (the Hub keeps
  // one CEP bridge per app, two would kick each other out forever): the background one wins, the panel goes passive.
  var extensionId = "";
  try {
    extensionId = String(cep.getExtensionId());
  } catch (_eId) {}
  var isBackground = /\.background$/.test(extensionId);
  var passive = false;
  var backgroundConnected = false;
  var EVT_PING = "com.jradbmcp.universal.ping";
  var EVT_ALIVE = "com.jradbmcp.universal.backgroundAlive";
  var EVT_RECONNECT = "com.jradbmcp.universal.reconnect";

  function sendCepEvent(type, data) {
    try {
      cep.dispatchEvent({ type: type, scope: "APPLICATION", appId: hostEnv.appId, extensionId: extensionId, data: data || "" });
    } catch (_eEv) {}
  }

  // On/off switch per app, shared by every panel of that app (this page, its background copy and the UXP panel):
  // one small file PER APP in the user folder, so two apps never rewrite each other's choice. Default is ON (no file).
  var STATE_FILE = "";
  try {
    STATE_FILE = path.join(require("os").homedir(), ".jr-adb-mcp-bridge", "bridge-state-" + adobeAppId + ".json");
  } catch (_eOs) {}

  function readState() {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) || {};
    } catch (_eRd) {
      return {};
    }
  }

  function readDisabled() {
    return readState().disabled === true;
  }

  function writeDisabled(value) {
    try {
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    } catch (_eMk) {}
    // Write to a temp file and rename: a reader never sees a half-written file.
    var tmp = STATE_FILE + "." + (typeof process !== "undefined" && process.pid ? process.pid : "x") + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ app: adobeAppId, disabled: !!value }, null, 2));
    try {
      fs.renameSync(tmp, STATE_FILE);
    } catch (_eRn) {
      fs.writeFileSync(STATE_FILE, JSON.stringify({ app: adobeAppId, disabled: !!value }, null, 2));
      try {
        fs.unlinkSync(tmp);
      } catch (_eUl) {}
    }
  }

  var disabled = readDisabled();
  var btnPower = document.getElementById("btnPower");

  function renderPower() {
    if (btnPower) btnPower.textContent = disabled ? "Ligar MCP neste app" : "Desligar MCP neste app";
    if (!statusBadge) return;
    if (disabled) {
      statusBadge.textContent = "Desligado";
      statusBadge.className = "badge";
    } else if (passive) {
      statusBadge.textContent = backgroundConnected ? "Conectado (2o plano)" : "Desconectado (2o plano)";
      statusBadge.className = "badge " + (backgroundConnected ? "connected" : "disconnected");
    }
  }

  function closeSocketQuietly() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    var old = ws;
    ws = null;
    if (old) {
      old.onopen = null;
      old.onmessage = null;
      old.onclose = null;
      old.onerror = null;
      try {
        old.close();
      } catch (_eCl) {}
    }
  }

  function applyDisabled() {
    if (disabled) {
      closeSocketQuietly();
      appendLog("MCP desligado neste app. Use o botao para ligar de novo.");
    } else if (!passive) {
      appendLog("MCP ligado neste app.");
      connect();
    }
    renderPower();
  }

  function goPassive() {
    if (passive) return;
    passive = true;
    closeSocketQuietly();
    renderPower();
    appendLog("A ponte roda em segundo plano neste app: este painel mostra o estado e pode ser fechado.");
  }

  function connect() {
    if (passive || disabled) return;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Retire the previous socket and detach its handlers first: otherwise its late onclose would
    // schedule a reconnect that kills the new socket, and the panel would flap every 2.5 s.
    var previous = ws;
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

    var socket;
    try {
      socket = new WebSocket(hubUrl);
    } catch (err) {
      appendLog("WebSocket init error: " + err);
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.onopen = function () {
      if (ws !== socket) return;
      setStatus(true);
      appendLog("Connected to MCP Hub");
      socket.send(
        JSON.stringify({
          type: "hello",
          app: adobeAppId,
          bridgeType: "cep",
          appVersion: String(hostEnv.appVersion || "unknown"),
          pluginVersion: "1.4.27",
          capabilities: ["extendscript", "evalScript", "dom", "inspectDom"]
        })
      );
    };

    socket.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === "notice" || msg.type === "hello_ack") {
          var noticeText = msg.type === "notice" ? msg.text : msg.notice;
          var noticeEl = document.getElementById("notice");
          if (noticeText && noticeEl && noticeEl.style) {
            noticeEl.textContent = noticeText;
            noticeEl.style.display = "block";
          }
          if (noticeText) appendLog(noticeText);
        }
        if (msg.type === "command") {
          appendLog("Cmd: " + msg.action);
          busyStart(msg.action);
          var doneCmd = function () { busyEnd(msg.action); };
          handleCommandPacket(msg, socket).then(doneCmd, doneCmd);
        }
      } catch (e) {
        appendLog("Message error: " + e);
      }
    };

    socket.onclose = function () {
      if (ws !== socket) return;
      ws = null;
      setStatus(false);
      scheduleReconnect();
    };

    socket.onerror = function () {
      if (ws !== socket) return;
      setStatus(false);
    };
  }

  function scheduleReconnect() {
    if (passive || disabled || reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, 2500);
  }

  if (btnReconnect) {
    btnReconnect.addEventListener("click", function () {
      appendLog("Manual reconnect triggered");
      if (disabled) {
        appendLog("MCP desligado neste app: ligue antes de reconectar.");
        return;
      }
      if (passive) sendCepEvent(EVT_RECONNECT);
      else connect();
    });
  }

  if (btnPower) {
    btnPower.addEventListener("click", function () {
      try {
        writeDisabled(!disabled);
      } catch (eWr) {
        appendLog("Nao consegui gravar o estado: " + eWr);
        return;
      }
      disabled = !disabled;
      applyDisabled();
    });
  }

  // Follow the switch when another panel of this app flips it.
  if (typeof setInterval === "function") {
    setInterval(function () {
      var now = readDisabled();
      if (now !== disabled) {
        disabled = now;
        applyDisabled();
      }
    }, 2000);
  }
  renderPower();

  if (isBackground) {
    try {
      cep.addEventListener(EVT_PING, function () {
        sendCepEvent(EVT_ALIVE, ws && ws.readyState === 1 ? "1" : "0");
      });
      cep.addEventListener(EVT_RECONNECT, function () {
        connect();
      });
    } catch (_eL1) {}
    connect();
    sendCepEvent(EVT_ALIVE, "0");
  } else {
    try {
      cep.addEventListener(EVT_ALIVE, function (ev) {
        backgroundConnected = !!(ev && String(ev.data) === "1");
        goPassive();
        renderPower();
      });
    } catch (_eL2) {}
    // Connect at once (as always); if the background extension answers, goPassive() hands the socket back
    // and the background one reconnects by itself within 2.5 s.
    connect();
    sendCepEvent(EVT_PING);
  }
})();
