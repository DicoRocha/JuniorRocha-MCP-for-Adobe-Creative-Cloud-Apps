/*
 * bridges/uxp-photoshop/main.js
 * Native UXP Plugin Bridge for Adobe Photoshop (Manifest v5).
 * Executes DOM + batchPlay + arbitrary UXP JS inside executeAsModal with suspendHistory.
 *
 * Rules kept by every handler in this file:
 *  - an operation this bridge does not implement THROWS (never reports success for a no-op);
 *  - a layer named by the caller that does not exist THROWS (never falls back to the active layer);
 *  - batchPlay results are checked, because batchPlay reports failures as result objects, not exceptions;
 *  - actions that only ExtendScript can do are answered with ACTION_NOT_SUPPORTED so the MCP router
 *    retries them on the CEP panel or the Windows COM fallback.
 */

const photoshop = require("photoshop");
const uxp = require("uxp");
const { app, core, action, constants } = photoshop;
const { batchPlay } = action;
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
  const el = document.getElementById("log");
  if (el) {
    el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + el.textContent.slice(0, 3000);
  }
}

function updateStatus(connected) {
  const st = document.getElementById("status");
  if (st) {
    st.textContent = connected ? "Connected" : "Disconnected";
    st.className = "status " + (connected ? "ok" : "err");
  }
}

function unsupported(message) {
  const err = new Error(message);
  err.code = "ACTION_NOT_SUPPORTED";
  return err;
}

/* ------------------------------------------------- hybrid: ExtendScript through this UXP panel */
// Live 19/11/2026 (Photoshop 28): batchPlay "AdobeScriptAutomation Scripts" runs a .jsx file from UXP (0.2 s),
// so the actions only ExtendScript implements run here too and the CEP panel is not needed in Photoshop.
// The .jsx handlers ship inside the plugin (jsx/), the result comes back through a temp file.
let esBundleCache = null;

async function loadExtendScriptBundle() {
  if (esBundleCache) return esBundleCache;
  const folder = await uxp.storage.localFileSystem.getPluginFolder();
  const read = async (name) => {
    const entry = await folder.getEntry("jsx/" + name);
    return String(await entry.read());
  };
  esBundleCache = (await read("es3-runtime.jsx")) + "\n" + (await read("ps-handlers.jsx")) + "\n";
  return esBundleCache;
}

/** ExtendScript reads a .jsx without BOM in the system code page: keep the file pure ASCII. */
function asciiOnly(source) {
  return source.replace(/[\u0080-\uffff]/g, (c) => "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4));
}

async function runExtendScriptHybrid(actionName, params, options) {
  const bundle = await loadExtendScriptBundle();
  const lfs = uxp.storage.localFileSystem;
  const tmp = await lfs.getTemporaryFolder();
  const jsxFile = await tmp.createFile("mcp_hybrid.jsx", { overwrite: true });
  const resFile = await tmp.createFile("mcp_hybrid_result.json", { overwrite: true });
  await resFile.write("PENDING"); // an empty write is refused by UXP
  const undoName = (options && options.undoGroup) || "MCP: " + actionName;
  const script =
    bundle +
    "\nvar __mcpHybridOut;\ntry {\n  __mcpHybridOut = __mcpExecuteWithUndo(\"photoshop\", " +
    JSON.stringify(undoName) +
    ", function () { return __mcpDispatch(" +
    JSON.stringify(actionName) +
    ", " +
    JSON.stringify(params || {}) +
    ", " +
    JSON.stringify(options || {}) +
    "); });\n} catch (__mcpHybridErr) {\n" +
    "  __mcpHybridOut = '{\"ok\":false,\"error\":{\"code\":\"EXTENDSCRIPT_ERROR\",\"message\":\"' + String(__mcpHybridErr).replace(/[\\\\\"\\r\\n]/g, ' ') + '\"}}';\n}\n" +
    "var __mcpHybridFile = new File(" +
    JSON.stringify(resFile.nativePath.replace(/\\/g, "/")) +
    ");\n__mcpHybridFile.encoding = \"UTF-8\";\n__mcpHybridFile.open(\"w\");\n__mcpHybridFile.write(String(__mcpHybridOut));\n__mcpHybridFile.close();\n";
  await jsxFile.write(asciiOnly(script));
  const token = lfs.createSessionToken(jsxFile);
  await core.executeAsModal(
    async () => {
      await batchPlay(
        [
          {
            _obj: "AdobeScriptAutomation Scripts",
            javaScript: { _path: token, _kind: "local" },
            javaScriptMessage: "undefined",
            _options: { dialogOptions: "dontDisplay" }
          }
        ],
        {}
      );
    },
    { commandName: undoName }
  );
  const raw = String(await resFile.read());
  if (!raw || raw === "PENDING") {
    const err = new Error(`ExtendScript ran '${actionName}' but returned nothing (script error before the result was written).`);
    err.code = "EXTENDSCRIPT_NO_RESULT";
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_e) {
    const err = new Error("ExtendScript returned an unreadable result: " + raw.slice(0, 300));
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

/** Execution context of the modal scope currently open (set while a batch or command runs). */
let activeModalContext = null;

/**
 * Runs `callback` inside executeAsModal with one history state. Re-entrant: when already inside a
 * modal scope (a batch runs many commands), the callback runs directly in that scope, so the whole
 * batch is a single modal call and a single history state.
 */
async function waitForActiveDocument() {
  for (let i = 0; i < 20; i++) {
    if (app.activeDocument) return app.activeDocument;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

async function runModalWithHistory(commandName, callback) {
  if (activeModalContext) {
    return await callback(activeModalContext);
  }
  // executeAsModal rethrows a failure as a plain Error built from its text, which loses err.code. The code is what
  // tells the caller to run the action through the ExtendScript handlers (ACTION_NOT_SUPPORTED), so keep the original.
  let original = null;
  try {
    return await core.executeAsModal(
      async (executionContext) => {
        activeModalContext = executionContext;
        try {
          return await runWithSuspendedHistory(executionContext, commandName, callback);
        } catch (err) {
          original = err;
          throw err;
        } finally {
          activeModalContext = null;
        }
      },
      { commandName: commandName || "MCP Photoshop Command" }
    );
  } catch (errModal) {
    throw original || errModal;
  }
}

async function runWithSuspendedHistory(executionContext, commandName, callback) {
  let suspensionId = null;
  const activeDoc = app.activeDocument;
  if (activeDoc && executionContext.hostControl && executionContext.hostControl.suspendHistory) {
    try {
      suspensionId = await executionContext.hostControl.suspendHistory({
        documentID: activeDoc.id,
        name: commandName || "MCP Action"
      });
    } catch (_e) {
      suspensionId = null;
    }
  }

  try {
    const res = await callback(executionContext);
    if (suspensionId !== null) {
      await executionContext.hostControl.resumeHistory(suspensionId, true);
    }
    return res;
  } catch (err) {
    if (suspensionId !== null) {
      try {
        await executionContext.hostControl.resumeHistory(suspensionId, false);
      } catch (_ignore) {}
    }
    throw err;
  }
}

/** batchPlay that throws when Photoshop reports an error object instead of a result. */
async function bp(descriptors, options) {
  const results = await batchPlay(descriptors, options || {});
  const list = Array.isArray(results) ? results : [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r && (r._obj === "error" || (typeof r.result === "number" && r.result < 0 && r.message))) {
      const what = descriptors[i] && descriptors[i]._obj ? descriptors[i]._obj : "command";
      throw new Error(`Photoshop rejected '${what}': ${r.message || "unknown error"}`);
    }
  }
  return list;
}

function px(value) {
  return { _unit: "pixelsUnit", _value: value };
}

function pct(value) {
  return { _unit: "percentUnit", _value: value };
}

function parseColor(spec, fallback) {
  const base = fallback || { r: 0, g: 0, b: 0 };
  if (!spec) return base;
  if (typeof spec === "string") {
    const hex = spec.replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
      throw new Error(`Invalid color '${spec}'. Use '#RRGGBB' or { r, g, b } (0-255).`);
    }
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16)
    };
  }
  return {
    r: typeof spec.r === "number" ? spec.r : base.r,
    g: typeof spec.g === "number" ? spec.g : base.g,
    b: typeof spec.b === "number" ? spec.b : base.b
  };
}

/** ActionManager RGB colour ("grain" is Photoshop's key for green). */
function rgbDescriptor(spec, fallback) {
  const c = parseColor(spec, fallback);
  return { _obj: "RGBColor", red: c.r, grain: c.g, blue: c.b };
}

function requireDoc() {
  const doc = app.activeDocument;
  if (!doc) throw new Error("No active document in Photoshop.");
  return doc;
}

function collectLayerTree(layers, depth, maxDepth) {
  if (!layers || depth > maxDepth) return [];
  const list = [];
  for (const lyr of layers) {
    const item = {
      id: lyr.id,
      name: lyr.name,
      kind: String(lyr.kind),
      visible: lyr.visible,
      opacity: lyr.opacity,
      blendMode: String(lyr.blendMode),
      locked: lyr.locked,
      bounds: lyr.bounds
        ? {
            left: lyr.bounds.left,
            top: lyr.bounds.top,
            right: lyr.bounds.right,
            bottom: lyr.bounds.bottom
          }
        : null
    };
    if (lyr.layers && lyr.layers.length > 0) {
      item.children = collectLayerTree(lyr.layers, depth + 1, maxDepth);
    }
    list.push(item);
  }
  return list;
}

function findLayerByIdOrName(layers, id, name) {
  if (!layers) return null;
  for (const lyr of layers) {
    if ((typeof id === "number" && lyr.id === id) || (name && lyr.name === name)) {
      return lyr;
    }
    if (lyr.layers && lyr.layers.length > 0) {
      const sub = findLayerByIdOrName(lyr.layers, id, name);
      if (sub) return sub;
    }
  }
  return null;
}

/**
 * The layer named by layerId / layerName, or the active layer when the caller named none.
 * A named layer that does not exist is an error: editing the active layer instead would be silent data loss.
 */
function resolveTargetLayer(doc, params) {
  const named = typeof params.layerId === "number" || Boolean(params.layerName);
  if (named) {
    const found = findLayerByIdOrName(doc.layers, params.layerId, params.layerName);
    if (!found) {
      throw new Error(`Layer not found (layerId=${params.layerId}, layerName=${params.layerName}).`);
    }
    return found;
  }
  const active = doc.activeLayers && doc.activeLayers[0];
  if (!active) throw new Error("No layer is selected and no layerId / layerName was given.");
  return active;
}

async function selectLayer(layer) {
  await bp([{ _obj: "select", _target: [{ _ref: "layer", _id: layer.id }], makeVisible: false }]);
}

function toFileUrl(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");
  return "file:/" + normalized.replace(/^\/+/, "");
}

async function entryForExistingFile(filePath) {
  const fs = uxp.storage.localFileSystem;
  try {
    return await fs.getEntryWithUrl(toFileUrl(filePath));
  } catch (err) {
    throw new Error(`File not found or not readable: ${filePath} (${err && err.message ? err.message : err})`);
  }
}

/** Creates a folder and its missing parents (a save into a missing folder fails in Photoshop). */
async function ensureFolder(folderPath) {
  const fs = uxp.storage.localFileSystem;
  const clean = String(folderPath).replace(/[\\/]+$/, "");
  if (!clean || /^[A-Za-z]:$/.test(clean)) return;
  try {
    const existing = await fs.getEntryWithUrl(toFileUrl(clean));
    if (existing) return;
  } catch (_e) {
    // missing: create it below
  }
  const parent = clean.replace(/[\\/][^\\/]+$/, "");
  if (parent && parent !== clean) await ensureFolder(parent);
  try {
    await fs.createEntryWithUrl(toFileUrl(clean), { type: uxp.storage.types.folder });
  } catch (err) {
    const e = new Error(`Cannot create the folder ${clean}: ${err && err.message ? err.message : err}`);
    e.code = "FOLDER_CREATE_FAILED";
    throw e;
  }
}

async function entryForNewFile(filePath) {
  const fs = uxp.storage.localFileSystem;
  const folder = String(filePath).replace(/[\\/][^\\/]+$/, "");
  if (folder && folder !== filePath) await ensureFolder(folder);
  return await fs.createEntryWithUrl(toFileUrl(filePath), { overwrite: true });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    out += chars[bytes[i] >> 2];
    out += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    out += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    out += chars[bytes[i + 2] & 63];
  }
  if (i < bytes.length) {
    out += chars[bytes[i] >> 2];
    if (i + 1 < bytes.length) {
      out += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
      out += chars[(bytes[i + 1] & 15) << 2];
      out += "=";
    } else {
      out += chars[(bytes[i] & 3) << 4];
      out += "==";
    }
  }
  return out;
}

/* ------------------------------------------------------------------ effects */

const FILTERS = {
  gaussianBlur: (s) => ({ _obj: "gaussianBlur", radius: px(s.radius || 10) }),
  motionBlur: (s) => ({ _obj: "motionBlur", angle: s.angle || 0, distance: px(s.distance || 15) }),
  highPass: (s) => ({ _obj: "highPass", radius: px(s.radius || 10) }),
  addNoise: (s) => ({
    _obj: "addNoise",
    distortion: { _enum: "distribution", _value: s.distribution === "uniform" ? "uniformDistribution" : "gaussianDistribution" },
    noise: pct(s.amount || 10),
    monochromatic: Boolean(s.monochromatic)
  }),
  unsharpMask: (s) => ({
    _obj: "unsharpMask",
    amount: pct(s.amount || 100),
    radius: px(s.radius || 1),
    threshold: s.threshold || 0
  })
};

const ADJUSTMENTS = {
  brightnessContrast: (s) => ({
    _obj: "brightnessEvent",
    brightness: s.brightness || 0,
    center: s.contrast || 0,
    useLegacy: false
  }),
  hueSaturation: (s) => ({
    _obj: "hueSaturation",
    colorize: Boolean(s.colorize),
    adjustment: [
      {
        _obj: "hueSatAdjustmentV2",
        hue: s.hue || 0,
        saturation: s.saturation || 0,
        lightness: s.lightness || 0
      }
    ]
  }),
  vibrance: (s) => ({ _obj: "vibrance", vibrance: s.vibrance || 0, saturation: s.saturation || 0 }),
  levels: () => ({ _obj: "levels", presetKind: { _enum: "presetKindType", _value: "presetKindDefault" } }),
  curves: () => ({ _obj: "curves", presetKind: { _enum: "presetKindType", _value: "presetKindDefault" } }),
  colorBalance: (s) => ({
    _obj: "colorBalance",
    shadowLevels: s.shadows || [0, 0, 0],
    midtoneLevels: s.midtones || [0, 0, 0],
    highlightLevels: s.highlights || [0, 0, 0],
    preserveLuminosity: s.preserveLuminosity !== false
  }),
  blackAndWhite: (s) => ({
    _obj: "blackAndWhite",
    presetKind: { _enum: "presetKindType", _value: "presetKindDefault" },
    red: typeof s.red === "number" ? s.red : 40,
    yellow: typeof s.yellow === "number" ? s.yellow : 60,
    grain: typeof s.green === "number" ? s.green : 40,
    cyan: typeof s.cyan === "number" ? s.cyan : 60,
    blue: typeof s.blue === "number" ? s.blue : 20,
    magenta: typeof s.magenta === "number" ? s.magenta : 80,
    useTint: false
  })
};

const LAYER_STYLES = {
  dropShadow: (s) => ({
    key: "dropShadow",
    value: {
      _obj: "dropShadow",
      enabled: true,
      present: true,
      showInDialog: true,
      mode: { _enum: "blendMode", _value: s.blendMode || "multiply" },
      color: rgbDescriptor(s.color, { r: 0, g: 0, b: 0 }),
      opacity: pct(typeof s.opacity === "number" ? s.opacity : 35),
      useGlobalAngle: false,
      localLightingAngle: { _unit: "angleUnit", _value: typeof s.angle === "number" ? s.angle : 120 },
      distance: px(typeof s.distance === "number" ? s.distance : 8),
      chokeMatte: px(s.spread || 0),
      blur: px(typeof s.size === "number" ? s.size : 16)
    }
  }),
  stroke: (s) => ({
    key: "frameFX",
    value: {
      _obj: "frameFX",
      enabled: true,
      present: true,
      showInDialog: true,
      style: {
        _enum: "frameStyle",
        _value: s.position === "inside" ? "insetFrame" : s.position === "center" ? "centeredFrame" : "outsetFrame"
      },
      paintType: { _enum: "frameFill", _value: "solidColor" },
      mode: { _enum: "blendMode", _value: s.blendMode || "normal" },
      opacity: pct(typeof s.opacity === "number" ? s.opacity : 100),
      size: px(typeof s.size === "number" ? s.size : 3),
      color: rgbDescriptor(s.color, { r: 0, g: 0, b: 0 })
    }
  }),
  outerGlow: (s) => ({
    key: "outerGlow",
    value: {
      _obj: "outerGlow",
      enabled: true,
      present: true,
      showInDialog: true,
      mode: { _enum: "blendMode", _value: s.blendMode || "screen" },
      color: rgbDescriptor(s.color, { r: 255, g: 255, b: 190 }),
      opacity: pct(typeof s.opacity === "number" ? s.opacity : 60),
      glowTechnique: { _enum: "matteTechnique", _value: "softMatte" },
      chokeMatte: px(s.spread || 0),
      blur: px(typeof s.size === "number" ? s.size : 16)
    }
  })
};

LAYER_STYLES.colorOverlay = (s) => ({
  key: "solidFill",
  value: {
    _obj: "solidFill",
    enabled: true,
    present: true,
    showInDialog: true,
    mode: { _enum: "blendMode", _value: s.blendMode || "normal" },
    opacity: pct(typeof s.opacity === "number" ? s.opacity : 100),
    color: rgbDescriptor(s.color, { r: 0, g: 0, b: 0 })
  }
});

LAYER_STYLES.gradientOverlay = (s) => ({
  key: "gradientFill",
  value: {
    _obj: "gradientFill",
    enabled: true,
    present: true,
    showInDialog: true,
    mode: { _enum: "blendMode", _value: s.blendMode || "normal" },
    opacity: pct(typeof s.opacity === "number" ? s.opacity : 100),
    angle: { _unit: "angleUnit", _value: typeof s.angle === "number" ? s.angle : 90 },
    type: { _enum: "gradientType", _value: s.style || "linear" },
    reverse: !!s.reverse,
    align: true,
    scale: pct(typeof s.scale === "number" ? s.scale : 100),
    gradient: {
      _obj: "gradientClassEvent",
      name: "MCP",
      gradientForm: { _enum: "gradientForm", _value: "customStops" },
      interfaceIconFrameDimmed: 4096,
      colors: [
        { _obj: "colorStop", color: rgbDescriptor(s.from || s.color, { r: 0, g: 0, b: 0 }), type: { _enum: "colorStopType", _value: "userStop" }, location: 0, midpoint: 50 },
        { _obj: "colorStop", color: rgbDescriptor(s.to, { r: 255, g: 255, b: 255 }), type: { _enum: "colorStopType", _value: "userStop" }, location: 4096, midpoint: 50 }
      ],
      transparency: [
        { _obj: "transferSpec", opacity: pct(typeof s.fromOpacity === "number" ? s.fromOpacity : 100), location: 0, midpoint: 50 },
        { _obj: "transferSpec", opacity: pct(typeof s.toOpacity === "number" ? s.toOpacity : 100), location: 4096, midpoint: 50 }
      ]
    }
  }
});

function supportedList(table) {
  return Object.keys(table).join(", ");
}

/* ----------------------------------------------------------------- dispatch */

/** Resolves "EnumName.VALUE" strings (e.g. "NoiseDistribution.GAUSSIAN") to Photoshop UXP constants. */
function resolveEnumArg(a) {
  if (typeof a !== "string") return a;
  const m = /^([A-Z][A-Za-z]+)\.([A-Z][A-Z_0-9]*)$/.exec(a);
  if (m && constants[m[1]] && constants[m[1]][m[2]] !== undefined) return constants[m[1]][m[2]];
  return a;
}

/** batchPlay needs session tokens, not paths: replaces every {_path: "C:\\..."} with a token. */
async function withPathTokens(node) {
  if (Array.isArray(node)) {
    const out = [];
    for (const item of node) out.push(await withPathTokens(item));
    return out;
  }
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "_path" && typeof value === "string" && /^([A-Za-z]:[\\/]|\/)/.test(value)) {
      const entry = await entryForExistingFile(value);
      out._path = uxp.storage.localFileSystem.createSessionToken(entry);
    } else {
      out[key] = await withPathTokens(value);
    }
  }
  return out;
}

/** Actions this bridge implements that may run inside ps.batch. */
const UXP_BATCHABLE_ACTIONS = new Set([
  "adobe.inspectDom",
  "ps.doc.create",
  "ps.doc.list",
  "ps.doc.modifyCanvas",
  "ps.doc.open",
  "ps.doc.save",
  "ps.doc.snapshot",
  "ps.effects.apply",
  "ps.layer.create",
  "ps.layer.editText",
  "ps.layer.getTree",
  "ps.layer.manage",
  "ps.raw.batchPlay",
  "ps.raw.executeUxp",
  "ps.selection.operate",
  "ps.filter.applyDom",
  "ps.menu.perform",
  "ps.action.list",
  "ps.action.play",
  "ps.fonts.list",
  "ps.layer.place",
  "ps.variants"
]);

async function dispatchPhotoshopCommand(actionName, params, options) {
  const undoLabel = (options && options.undoGroup) || `MCP: ${actionName}`;

  if (actionName === "ps.batch") {
    const ops = Array.isArray(params.operations) ? params.operations : [];
    if (ops.length === 0) throw new Error("Batch 'operations' must be a non-empty array.");
    ops.forEach((op, i) => {
      if (!op || typeof op.action !== "string") throw new Error(`Batch operation ${i} has no 'action'.`);
      if (op.action === "ps.batch") throw new Error(`Batch operation ${i} is itself a batch; nesting is not allowed.`);
      if (!UXP_BATCHABLE_ACTIONS.has(op.action)) {
        throw unsupported(`Batch operation ${i} (${op.action}) is not implemented by the Photoshop UXP bridge.`);
      }
    });
    const stopOnError = params.stopOnError !== false;
    return await runModalWithHistory(params.undoName || undoLabel, async () => {
      const results = [];
      let failed = 0;
      for (let i = 0; i < ops.length; i++) {
        const started = Date.now();
        try {
          const data = await dispatchPhotoshopCommand(ops[i].action, ops[i].params || {}, options);
          results.push({ index: i, action: ops[i].action, ok: true, durationMs: Date.now() - started, data: data === undefined ? null : data });
        } catch (err) {
          failed++;
          results.push({
            index: i,
            action: ops[i].action,
            ok: false,
            durationMs: Date.now() - started,
            error: { code: err.code || err.name || "UXP_ERROR", message: err.message || String(err) }
          });
          if (stopOnError) break;
        }
      }
      return {
        total: ops.length,
        executed: results.length,
        succeeded: results.length - failed,
        failed,
        stoppedEarly: results.length < ops.length,
        singleHistoryState: true,
        results
      };
    });
  }

  if (actionName === "ps.doc.list") {
    return {
      count: app.documents.length,
      activeDocumentId: app.activeDocument ? app.activeDocument.id : null,
      documents: app.documents.map((d) => ({
        id: d.id,
        name: d.name,
        width: d.width,
        height: d.height,
        resolution: d.resolution,
        mode: String(d.mode)
      }))
    };
  }

  if (actionName === "ps.doc.create") {
    return await runModalWithHistory(undoLabel, async () => {
      const created = await app.createDocument({
        name: params.name || "Untitled-MCP",
        width: params.width || 1920,
        height: params.height || 1080,
        resolution: params.resolution || 72,
        mode: params.mode || "RGBColorMode",
        fill: params.fill || "white"
      });
      // From the Home screen (no document open) createDocument can resolve with null although the document was made.
      const doc = created || (await waitForActiveDocument());
      if (!doc) throw new Error("Photoshop did not report the new document.");
      return { id: doc.id, name: doc.name, width: doc.width, height: doc.height };
    });
  }

  if (actionName === "ps.doc.open") {
    if (!params.filePath) throw new Error("filePath is required.");
    const entry = await entryForExistingFile(params.filePath);
    return await runModalWithHistory(undoLabel, async () => {
      const doc = (await app.open(entry)) || (await waitForActiveDocument());
      if (!doc) throw new Error("Photoshop did not report the opened document.");
      return { id: doc.id, name: doc.name, width: doc.width, height: doc.height };
    });
  }

  if (actionName === "ps.doc.save") {
    const doc = requireDoc();
    const fmt = String(params.format || "psd").toLowerCase();
    if (!params.filePath) {
      return await runModalWithHistory(undoLabel, async () => {
        await doc.save();
        return { saved: true, name: doc.name };
      });
    }
    const entry = await entryForNewFile(params.filePath);
    return await runModalWithHistory(undoLabel, async () => {
      if (fmt === "png") {
        await doc.saveAs.png(entry, {}, true);
      } else if (fmt === "jpg" || fmt === "jpeg") {
        await doc.saveAs.jpg(entry, { quality: params.quality || 10 }, true);
      } else if (fmt === "psd") {
        await doc.saveAs.psd(entry, {}, false);
      } else {
        throw new Error(`Unsupported save format: ${fmt}`);
      }
      return { saved: true, filePath: params.filePath, format: fmt };
    });
  }

  if (actionName === "ps.doc.modifyCanvas") {
    return await runModalWithHistory(undoLabel, async () => {
      const doc = requireDoc();
      const op = params.operation;
      if (op === "crop") {
        if (!params.bounds) throw new Error("operation 'crop' requires bounds { left, top, right, bottom } in pixels.");
        await doc.crop(params.bounds);
      } else if (op === "resizeImage") {
        if (!params.width && !params.height) throw new Error("operation 'resizeImage' requires width and/or height.");
        const w = params.width || Math.round((doc.width * params.height) / doc.height);
        const h = params.height || Math.round((doc.height * params.width) / doc.width);
        await doc.resizeImage(w, h);
      } else if (op === "resizeCanvas") {
        if (!params.width && !params.height) throw new Error("operation 'resizeCanvas' requires width and/or height.");
        await doc.resizeCanvas(params.width || doc.width, params.height || doc.height);
      } else if (op === "rotate") {
        if (typeof params.angle !== "number") throw new Error("operation 'rotate' requires angle in degrees.");
        await doc.rotate(params.angle);
      } else if (op === "trim") {
        await bp([
          {
            _obj: "trim",
            trimBasedOn: { _enum: "trimBasedOn", _value: "transparency" },
            top: true,
            bottom: true,
            left: true,
            right: true
          }
        ]);
      } else if (op === "flatten") {
        await doc.flatten();
      } else {
        throw new Error(`Unsupported ps.doc.modifyCanvas operation: ${op}`);
      }
      return { operation: op, width: doc.width, height: doc.height };
    });
  }

  if (actionName === "ps.doc.snapshot") {
    // documentName: the snapshot of a named document (a recipe's result), not of whatever tab is in front.
    const doc = params.documentName ? Array.from(app.documents).find((d) => d.name === params.documentName) || requireDoc() : requireDoc();
    const maxDim = params.maxDimension || 1024;
    const ratio = Math.min(1, maxDim / Math.max(doc.width, doc.height));
    const outW = Math.max(1, Math.round(doc.width * ratio));
    const outH = Math.max(1, Math.round(doc.height * ratio));
    const result = { documentId: doc.id, sourceWidth: doc.width, sourceHeight: doc.height, width: outW, height: outH };

    return await runModalWithHistory(undoLabel, async () => {
      if (params.outputPath) {
        const outEntry = await entryForNewFile(params.outputPath);
        await doc.saveAs.png(outEntry, {}, true);
        result.outputPath = params.outputPath;
      }

      const imaging = photoshop.imaging;
      if (imaging && typeof imaging.getPixels === "function" && typeof imaging.encodeImageData === "function") {
        const pixels = await imaging.getPixels({
          documentID: doc.id,
          targetSize: { width: outW, height: outH },
          colorSpace: "RGB",
          colorProfile: "sRGB IEC61966-2.1",
          componentSize: 8,
          applyAlpha: true
        });
        try {
          result.previewBase64 = await imaging.encodeImageData({ imageData: pixels.imageData, base64: true });
          result.previewMimeType = "image/jpeg";
        } finally {
          if (pixels.imageData && typeof pixels.imageData.dispose === "function") {
            pixels.imageData.dispose();
          }
        }
        return result;
      }

      // Photoshop older than 24.4 has no imaging API: export a full-size PNG copy and return its bytes.
      const fs = uxp.storage.localFileSystem;
      const tempFolder = await fs.getTemporaryFolder();
      const tempFile = await tempFolder.createFile("mcp_ps_snapshot.png", { overwrite: true });
      await doc.saveAs.png(tempFile, {}, true);
      const bytes = await tempFile.read({ format: uxp.storage.formats.binary });
      result.previewBase64 = arrayBufferToBase64(bytes);
      result.previewMimeType = "image/png";
      result.width = doc.width;
      result.height = doc.height;
      result.note = "Full-size snapshot (this Photoshop version has no imaging API to downscale).";
      return result;
    });
  }

  if (actionName === "ps.layer.getTree") {
    const doc = requireDoc();
    return {
      documentId: doc.id,
      documentName: doc.name,
      layers: collectLayerTree(doc.layers, 0, params.maxDepth || 5)
    };
  }

  if (actionName === "ps.layer.create") {
    return await runModalWithHistory(undoLabel, async () => {
      const doc = requireDoc();
      const kind = params.layerType || "pixel";
      let created = null;

      if (kind === "group") {
        created = await doc.createLayerGroup({ name: params.name || "Group" });
      } else if (kind === "text") {
        const text = params.text || "Text";
        const textStyle = {
          _obj: "textStyle",
          fontPostScriptName: params.font || "ArialMT",
          size: { _unit: "pointsUnit", _value: params.fontSize || 48 }
        };
        if (params.color) {
          textStyle.color = rgbDescriptor(params.color);
        }
        await bp([
          {
            _obj: "make",
            _target: [{ _ref: "textLayer" }],
            using: {
              _obj: "textLayer",
              textKey: text,
              textClickPoint: {
                _obj: "paint",
                horizontal: pct((((params.position && params.position[0]) || 100) / doc.width) * 100),
                vertical: pct((((params.position && params.position[1]) || 100) / doc.height) * 100)
              },
              textStyleRange: [{ _obj: "textStyleRange", from: 0, to: text.length, textStyle }]
            }
          }
        ]);
        created = doc.activeLayers[0];
      } else if (kind === "solidColor") {
        await bp([
          {
            _obj: "make",
            _target: [{ _ref: "contentLayer" }],
            using: {
              _obj: "contentLayer",
              type: { _obj: "solidColorLayer", color: rgbDescriptor(params.color, { r: 255, g: 255, b: 255 }) }
            }
          }
        ]);
        created = doc.activeLayers[0];
      } else if (kind === "pixel") {
        created = await doc.createLayer({ name: params.name || "Layer" });
      } else {
        throw new Error(`Unsupported layerType: ${kind}`);
      }

      if (!created) throw new Error(`Photoshop did not create the ${kind} layer.`);
      if (params.name) created.name = params.name;
      if (typeof params.opacity === "number") created.opacity = params.opacity;
      if (params.blendMode && params.blendMode !== "normal") created.blendMode = params.blendMode;
      let artboardName = null;
      if (params.artboard) {
        // Live 19/11 (Photoshop 28): in UXP a new layer lands in the active artboard and layer.move(artboard,
        // PLACEINSIDE) keeps its id - none of the stale references ExtendScript has with artboards.
        const boards = doc.layers.filter((l) => l.layers);
        const board = boards.find((l) => l.name === params.artboard);
        if (!board) {
          const err = new Error(`Artboard '${params.artboard}' not found. Top-level groups/artboards: ${boards.map((l) => l.name).join(", ") || "none"}.`);
          err.code = "INVALID_PARAMS";
          throw err;
        }
        if (!created.parent || created.parent.id !== board.id) created.move(board, constants.ElementPlacement.PLACEINSIDE);
        if (!created.parent || created.parent.id !== board.id) {
          throw new Error(`Layer '${created.name}' was created but could not be moved into artboard '${params.artboard}'.`);
        }
        artboardName = board.name;
      }
      return { id: created.id, name: created.name, layerType: kind, artboard: artboardName };
    });
  }

  if (actionName === "ps.layer.editText") {
    return await runModalWithHistory(undoLabel, async () => {
      const doc = requireDoc();
      const target = resolveTargetLayer(doc, params);
      const textItem = target.textItem;
      if (!textItem) throw new Error(`Layer '${target.name}' is not a text layer.`);

      if (typeof params.text === "string") textItem.contents = params.text;
      const cs = textItem.characterStyle;
      if (params.font) cs.font = params.font;
      if (params.fontSize) cs.size = params.fontSize;
      if (typeof params.tracking === "number") cs.tracking = params.tracking;
      if (typeof params.leading === "number") {
        cs.autoLeading = false;
        cs.leading = params.leading;
      }
      if (params.color) {
        const c = parseColor(params.color);
        const solid = new app.SolidColor();
        solid.rgb.red = c.r;
        solid.rgb.green = c.g;
        solid.rgb.blue = c.b;
        cs.color = solid;
      }
      if (params.alignment) {
        const J = constants.Justification || {};
        const map = { left: J.LEFT, center: J.CENTER, right: J.RIGHT, justify: J.FULLYJUSTIFIED };
        if (!map[params.alignment]) throw new Error(`Unsupported alignment: ${params.alignment}`);
        textItem.paragraphStyle.justification = map[params.alignment];
      }
      return { id: target.id, name: target.name, text: textItem.contents, updated: true };
    });
  }

  if (actionName === "ps.layer.manage") {
    return await runModalWithHistory(undoLabel, async () => {
      const doc = requireDoc();
      let target = resolveTargetLayer(doc, params);
      const op = params.operation || "updateProperties";

      if (op === "delete") {
        const info = { deleted: true, layerId: target.id, name: target.name };
        await target.delete();
        return info;
      }
      if (op === "duplicate") {
        const dup = await target.duplicate();
        if (params.newName) dup.name = params.newName;
        return { duplicated: true, id: dup.id, name: dup.name };
      }
      if (op === "translate") {
        await target.translate(params.deltaX || 0, params.deltaY || 0);
      } else if (op === "scale") {
        await target.scale(params.scaleX || 100, params.scaleY || params.scaleX || 100);
      } else if (op === "rotate") {
        await target.rotate(params.angle || 0);
      } else if (op === "flipHorizontal") {
        await target.flip("horizontal");
      } else if (op === "flipVertical") {
        await target.flip("vertical");
      } else if (op === "rasterize") {
        await selectLayer(target);
        await bp([
          { _obj: "rasterizeLayer", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }] }
        ]);
      } else if (op === "convertToSmartObject") {
        await selectLayer(target);
        await bp([{ _obj: "newPlacedLayer" }]);
        target = doc.activeLayers[0];
      } else if (op !== "updateProperties") {
        throw new Error(`Unsupported ps.layer.manage operation: ${op}`);
      }

      if (params.newName) target.name = params.newName;
      if (typeof params.visible === "boolean") target.visible = params.visible;
      if (typeof params.opacity === "number") target.opacity = params.opacity;
      if (params.blendMode) target.blendMode = params.blendMode;

      return { id: target.id, name: target.name, operation: op, updated: true };
    });
  }

  if (actionName === "ps.selection.operate") {
    return await runModalWithHistory(undoLabel, async () => {
      requireDoc();
      const op = params.operation;
      const selectionRef = [{ _ref: "channel", _property: "selection" }];
      const b = params.bounds;
      const needBounds = () => {
        if (!b) throw new Error(`operation '${op}' requires bounds { left, top, right, bottom } in pixels.`);
      };
      let featherable = false;

      if (op === "selectAll") {
        await bp([{ _obj: "set", _target: selectionRef, to: { _enum: "ordinal", _value: "allEnum" } }]);
      } else if (op === "clear") {
        await bp([{ _obj: "set", _target: selectionRef, to: { _enum: "ordinal", _value: "none" } }]);
      } else if (op === "invert") {
        await bp([{ _obj: "inverse" }]);
      } else if (op === "rectangle") {
        needBounds();
        await bp([
          {
            _obj: "set",
            _target: selectionRef,
            to: { _obj: "rectangle", top: px(b.top), left: px(b.left), bottom: px(b.bottom), right: px(b.right) }
          }
        ]);
        featherable = true;
      } else if (op === "ellipse") {
        needBounds();
        await bp([
          {
            _obj: "set",
            _target: selectionRef,
            to: { _obj: "ellipse", top: px(b.top), left: px(b.left), bottom: px(b.bottom), right: px(b.right) },
            antiAlias: true
          }
        ]);
        featherable = true;
      } else if (op === "polygon") {
        if (!params.points || params.points.length < 3) {
          throw new Error("operation 'polygon' requires points with at least 3 [x, y] vertices.");
        }
        await bp([
          {
            _obj: "set",
            _target: selectionRef,
            to: {
              _obj: "polygon",
              points: params.points.map((p) => ({ _obj: "paint", horizontal: px(p[0]), vertical: px(p[1]) }))
            },
            antiAlias: true
          }
        ]);
        featherable = true;
      } else if (op === "selectSubject") {
        await bp([{ _obj: "autoCutout", sampleAllLayers: false }]);
      } else if (op === "selectSky") {
        await bp([{ _obj: "selectSky", sampleAllLayers: false }]);
      } else if (op === "removeBackground") {
        await bp([{ _obj: "removeBackground" }]);
      } else if (op === "addMaskFromSelection") {
        await bp([
          {
            _obj: "make",
            new: { _class: "channel" },
            at: { _ref: "channel", _enum: "channel", _value: "mask" },
            using: { _enum: "userMaskEnabled", _value: "revealSelection" }
          }
        ]);
      } else if (op === "deleteMask") {
        await bp([{ _obj: "delete", _target: [{ _ref: "channel", _enum: "channel", _value: "mask" }] }]);
      } else {
        // expand, contract, smooth, feather, border, grow, similar, colorRange, save/load: ExtendScript handlers.
        throw unsupported(`ps.selection.operate '${op}' runs through the ExtendScript handlers.`);
      }

      if (featherable && params.feather > 0) {
        await bp([{ _obj: "feather", radius: px(params.feather) }]);
      }
      return { operation: op, completed: true };
    });
  }

  if (actionName === "ps.effects.apply") {
    return await runModalWithHistory(undoLabel, async () => {
      const doc = requireDoc();
      const s = params.settings || {};
      const category = params.category;
      const type = params.type;

      if (category === "adjustmentLayer") {
        const build = ADJUSTMENTS[type];
        if (!build) {
          throw new Error(
            `Adjustment layer '${type}' is not built in (available: ${supportedList(ADJUSTMENTS)}). Use ps_batch_play for others.`
          );
        }
        await bp([
          {
            _obj: "make",
            _target: [{ _ref: "adjustmentLayer" }],
            using: { _obj: "adjustmentLayer", type: build(s) }
          }
        ]);
        const made = doc.activeLayers[0];
        return { applied: type, category, layerId: made ? made.id : null, layerName: made ? made.name : null };
      }

      const target = resolveTargetLayer(doc, params);
      await selectLayer(target);

      if (category === "filter") {
        const build = FILTERS[type];
        if (!build) {
          throw new Error(
            `Filter '${type}' is not built in (available: ${supportedList(FILTERS)}). Use ps_batch_play for others.`
          );
        }
        await bp([build(s)]);
        return { applied: type, category, layerId: target.id };
      }

      if (category === "layerStyle") {
        const build = LAYER_STYLES[type];
        if (!build) {
          // innerShadow, innerGlow, bevelEmboss and satin live in the ExtendScript handlers (hybrid mode runs them here).
          throw unsupported(`Layer style '${type}' runs through the ExtendScript handlers.`);
        }
        const fx = build(s);
        // Keep the styles already on the layer: start from its current layerEffects and replace only this effect.
        let layerEffects = null;
        if (params.replaceExisting !== true) {
          try {
            const got = await bp([
              { _obj: "get", _target: [{ _property: "layerEffects" }, { _ref: "layer", _enum: "ordinal", _value: "targetEnum" }] }
            ]);
            if (got && got[0] && got[0].layerEffects) layerEffects = got[0].layerEffects;
          } catch (_e) {
            layerEffects = null;
          }
        }
        const keptExistingStyles = layerEffects !== null;
        if (!layerEffects) layerEffects = { _obj: "layerEffects", scale: pct(100) };
        delete layerEffects[fx.key + "Multi"];
        layerEffects[fx.key] = fx.value;
        await bp([
          {
            _obj: "set",
            _target: [
              { _ref: "property", _property: "layerEffects" },
              { _ref: "layer", _enum: "ordinal", _value: "targetEnum" }
            ],
            to: layerEffects
          }
        ]);
        return {
          applied: type,
          category,
          layerId: target.id,
          keptExistingStyles,
          // Only the effects switched on: skip "scale" (a unit value) and the "...Multi" lists Photoshop keeps internally.
          styles: Object.keys(layerEffects).filter((k) => {
            const v = layerEffects[k];
            return v && typeof v === "object" && !Array.isArray(v) && typeof v._obj === "string" && v.enabled !== false;
          })
        };
      }

      throw new Error(`Unsupported ps.effects.apply category: ${category}`);
    });
  }

  if (actionName === "ps.filter.applyDom") {
    const fname = String(params.filter || "");
    if (!/^apply[A-Z][A-Za-z]+$/.test(fname)) throw new Error("filter must be a Layer method name such as applyGaussianBlur.");
    return await runModalWithHistory(undoLabel, async () => {
      const doc = requireDoc();
      const layer = resolveTargetLayer(doc, params);
      if (typeof layer[fname] !== "function") {
        throw unsupported(`Layer.${fname} is not available in this Photoshop UXP version.`);
      }
      const args = (params.args || []).map(resolveEnumArg);
      await layer[fname](...args);
      return { filter: fname, layerId: layer.id, layerName: layer.name, layerKind: String(layer.kind) };
    });
  }

  if (actionName === "ps.menu.perform") {
    const commandID = Number(params.commandId);
    let available = null;
    let title = null;
    try {
      available = await core.getMenuCommandState({ commandID });
    } catch (_e) {}
    try {
      title = await core.getMenuCommandTitle({ commandID });
    } catch (_e) {}
    if (available === false || (Array.isArray(available) && available[0] === false)) {
      throw new Error(`Menu command ${commandID}${title ? ` (${title})` : ""} is not available right now.`);
    }
    const performed = await runModalWithHistory(undoLabel, async () => await core.performMenuCommand({ commandID }));
    return { performed: performed !== false, commandId: commandID, title };
  }

  if (actionName === "ps.artboards" || actionName === "ps.export.web" || actionName === "ps.audit" || actionName === "ps.recipe.socialSet") {
    // Duplicate-crop-export and Save for Web / WebP through Action Manager run in ExtendScript (CEP / COM).
    throw unsupported(`${actionName} runs through ExtendScript (CEP panel or COM).`);
  }

  if (actionName === "ps.variants") {
    // History-state juggling and saveAs copies run through ExtendScript (CEP / COM).
    throw unsupported("ps.variants runs through ExtendScript (CEP panel or COM).");
  }

  if (actionName === "ps.fonts.list") {
    const q = params.search ? String(params.search).toLowerCase().replace(/[\s_-]+/g, "") : "";
    const limit = typeof params.limit === "number" ? params.limit : 200;
    const all = Array.from(app.fonts || []);
    const hits = all.filter((f) => !q || `${f.family}${f.style}${f.postScriptName}`.toLowerCase().replace(/[\s_-]+/g, "").includes(q));
    return {
      installed: all.length,
      matched: hits.length,
      truncated: hits.length > limit,
      fonts: hits.slice(0, limit).map((f) => ({ postScriptName: f.postScriptName, family: f.family, style: f.style }))
    };
  }

  if (actionName === "ps.layer.place") {
    if (!params.filePath) throw new Error("filePath is required.");
    requireDoc();
    const token = uxp.storage.localFileSystem.createSessionToken(await entryForExistingFile(params.filePath));
    return await runModalWithHistory(undoLabel, async () => {
      const desc = { _obj: "placeEvent", null: { _path: token, _kind: "local" } };
      if (params.linked === true) desc.linked = true;
      await batchPlay([desc], {});
      const doc = app.activeDocument;
      const layer = doc.activeLayers[0];
      if (params.name) layer.name = String(params.name);
      let b = layer.bounds;
      const pw = b.right - b.left;
      const ph = b.bottom - b.top;
      const boxW = typeof params.width === "number" ? params.width : null;
      const boxH = typeof params.height === "number" ? params.height : null;
      const fit = params.fit || (boxW && boxH ? "contain" : boxW ? "width" : boxH ? "height" : "none");
      let pctScale = null;
      if (fit === "width" && boxW) pctScale = (boxW / pw) * 100;
      else if (fit === "height" && boxH) pctScale = (boxH / ph) * 100;
      else if (fit === "contain" && boxW && boxH) pctScale = Math.min(boxW / pw, boxH / ph) * 100;
      else if (fit === "cover" && boxW && boxH) pctScale = Math.max(boxW / pw, boxH / ph) * 100;
      if (pctScale !== null) await layer.scale(pctScale, pctScale, constants.AnchorPosition.TOPLEFT);
      b = layer.bounds;
      if (typeof params.x === "number" || typeof params.y === "number") {
        const nw = b.right - b.left;
        const nh = b.bottom - b.top;
        const tx = typeof params.x === "number" ? params.x + (boxW ? (boxW - nw) / 2 : 0) : b.left;
        const ty = typeof params.y === "number" ? params.y + (boxH ? (boxH - nh) / 2 : 0) : b.top;
        await layer.translate(tx - b.left, ty - b.top);
        b = layer.bounds;
      }
      return {
        layerId: layer.id,
        layerName: layer.name,
        kind: String(layer.kind),
        linked: params.linked === true,
        bounds: [b.left, b.top, b.right, b.bottom],
        scalePercent: pctScale
      };
    });
  }

  if (actionName === "ps.action.list") {
    const sets = (app.actionTree || []).map((set) => ({ name: set.name, actions: (set.actions || []).map((a) => a.name) }));
    return { count: sets.length, sets };
  }

  if (actionName === "ps.action.play") {
    const set = (app.actionTree || []).find((s) => s.name === params.setName);
    if (!set) throw new Error(`Action set '${params.setName}' not found. Use ps_list_actions.`);
    const act = (set.actions || []).find((a) => a.name === params.actionName);
    if (!act) throw new Error(`Action '${params.actionName}' not found in set '${params.setName}'.`);
    await runModalWithHistory(undoLabel, async () => await act.play());
    return { played: true, setName: set.name, actionName: act.name };
  }

  if (actionName === "ps.raw.batchPlay") {
    return await runModalWithHistory(params.commandName || undoLabel, async () => {
      const descriptors = await withPathTokens(params.descriptors || []);
      const result = await batchPlay(descriptors, params.options || {});
      const errors = (Array.isArray(result) ? result : []).filter((r) => r && r._obj === "error");
      return { count: (params.descriptors || []).length, errorCount: errors.length, results: result };
    });
  }

  if (actionName === "ps.raw.executeUxp") {
    return await runModalWithHistory(params.commandName || undoLabel, async (executionContext) => {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction("app", "core", "action", "batchPlay", "uxp", "constants", "executionContext", params.code);
      const output = await fn(app, core, action, batchPlay, uxp, constants, executionContext);
      return { executed: true, result: typeof output === "undefined" ? null : output };
    });
  }

  if (actionName === "adobe.inspectDom") {
    const target = eval(params.targetExpression || "app");
    const keys = target ? Object.getOwnPropertyNames(Object.getPrototypeOf(target) || target) : [];
    return {
      target: params.targetExpression || "app",
      keys: keys.slice(0, params.maxProperties || 150)
    };
  }

  throw unsupported(`Unknown Photoshop UXP action: ${actionName}`);
}

/* --------------------------------------------------------------- connection */

/* ------------------------------------------------- on/off switch per app (default: on) */
// Shared with the CEP panel of the same app through one small file PER APP in the user folder (two apps never
// rewrite each other's choice); if the file cannot be written from UXP, the choice stays in this panel's storage.
const BRIDGE_APP_ID = "photoshop";
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
        app: "photoshop",
        bridgeType: "uxp",
        appVersion: app.version || "unknown",
        pluginVersion: "1.4.16",
        capabilities: ["dom", "batchPlay", "executeUxp", "snapshot", "extendscriptHybrid"]
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
      let data;
      try {
        data = await dispatchPhotoshopCommand(msg.action, msg.params || {}, msg.options || {});
      } catch (errUxp) {
        if (!errUxp || errUxp.code !== "ACTION_NOT_SUPPORTED") throw errUxp;
        log(`ExtendScript (hybrid): ${msg.action}`);
        data = await runExtendScriptHybrid(msg.action, msg.params || {}, msg.options || {});
      }
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
          code: (err && err.code) || "PS_UXP_ERROR",
          message: err && err.message ? err.message : String(err)
        }
      };
    }
    busyEnd(msg.action);
    try {
      socket.send(
        JSON.stringify(
          Object.assign({ type: "response", id: msg.id, app: "photoshop", bridgeType: "uxp", durationMs: Date.now() - start }, reply)
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
    "com.jradbmcp.photoshop.panel": {
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
