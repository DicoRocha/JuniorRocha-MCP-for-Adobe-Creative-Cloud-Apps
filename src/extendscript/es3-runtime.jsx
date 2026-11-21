/*
 * es3-runtime.jsx
 * Pure ECMAScript 3 runtime for Adobe ExtendScript (After Effects, Illustrator, Premiere Pro, Photoshop).
 * IMPORTANT: Do NOT use const, let, arrow functions (=>), template literals (`), or ES5+ methods without polyfills.
 */

if (typeof JSON === "undefined") {
  JSON = {};
}

(function () {
  function pad4(n) {
    var s = n.toString(16);
    while (s.length < 4) {
      s = "0" + s;
    }
    return "\\u" + s;
  }

  function escapeString(str) {
    var out = '"';
    var s = String(str);
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      var code = s.charCodeAt(i);
      if (ch === '"') {
        out += '\\"';
      } else if (ch === "\\") {
        out += "\\\\";
      } else if (ch === "\b") {
        out += "\\b";
      } else if (ch === "\f") {
        out += "\\f";
      } else if (ch === "\n") {
        out += "\\n";
      } else if (ch === "\r") {
        out += "\\r";
      } else if (ch === "\t") {
        out += "\\t";
      } else if (code < 0x20 || code === 0x2028 || code === 0x2029) {
        out += pad4(code);
      } else {
        out += ch;
      }
    }
    return out + '"';
  }

  function serializeValue(val, depth) {
    if (depth > 12) {
      return '"[MaxDepthExceeded]"';
    }
    if (val === null || typeof val === "undefined") {
      return "null";
    }
    var t = typeof val;
    if (t === "boolean") {
      return val ? "true" : "false";
    }
    if (t === "number") {
      return isFinite(val) ? String(val) : "null";
    }
    if (t === "string") {
      return escapeString(val);
    }
    if (t === "object") {
      if (val instanceof Array || (typeof val.length === "number" && typeof val.splice === "function")) {
        var arrParts = [];
        for (var i = 0; i < val.length; i++) {
          arrParts.push(serializeValue(val[i], depth + 1));
        }
        return "[" + arrParts.join(",") + "]";
      }
      var objParts = [];
      for (var k in val) {
        try {
          if (Object.prototype.hasOwnProperty.call(val, k)) {
            var v = val[k];
            if (typeof v !== "function" && typeof v !== "undefined") {
              objParts.push(escapeString(k) + ":" + serializeValue(v, depth + 1));
            }
          }
        } catch (eProp) {
          objParts.push(escapeString(k) + ':"[UnreadableProperty]"');
        }
      }
      return "{" + objParts.join(",") + "}";
    }
    return "null";
  }

  if (typeof JSON.stringify !== "function") {
    JSON.stringify = function (value) {
      return serializeValue(value, 0);
    };
  }

  if (typeof JSON.parse !== "function") {
    JSON.parse = function (text) {
      if (typeof text !== "string" || text === "") {
        return null;
      }
      return eval("(" + text + ")");
    };
  }
})();

/**
 * Safely executes an action inside an undo group (when supported by the host app)
 * and always returns a serialized JSON envelope.
 */
/**
 * Signals that this bridge does not implement an action (or one variant of it).
 * The MCP router reads the ACTION_NOT_SUPPORTED code and retries the command on another bridge.
 */
function __mcpUnsupported(message) {
  var e = new Error(message);
  e.name = "ACTION_NOT_SUPPORTED";
  throw e;
}

/**
 * Runs user code from the *_execute_extendscript tools. The value of the last expression is returned
 * (eval semantics); code that uses a top-level `return` is also accepted and run as a function body.
 */
function __mcpEvalUserCode(code) {
  try {
    return eval(String(code));
  } catch (e) {
    var isIllegalReturn = e && (e instanceof SyntaxError) && /return/i.test(String(e.message || e));
    if (!isIllegalReturn) {
      throw e;
    }
  }
  return (new Function(String(code)))();
}

/**
 * Undo group opened by __mcpExecuteWithUndo for the command now running (After Effects).
 * Re-evaluating this file inside a running command must not lose the open group (14/11/2026: a test
 * that re-loaded the runtime left a group open and the next render raised "Undo group mismatch"), so
 * the state is kept on $.global when it already exists, and the wrapper decides with its own token.
 */
var __mcpUndoState = (typeof $ !== "undefined" && $.global && $.global.__mcpUndoStateKeep) || { open: false, token: 0, closedToken: -1 };
if (typeof $ !== "undefined" && $.global) $.global.__mcpUndoStateKeep = __mcpUndoState;

/**
 * Closes the command's undo group early. After Effects shows "Undo group mismatch" when a render
 * (renderQueue.render / queueInAME) or a project switch happens inside an open undo group, so
 * handlers that do those call this first; the wrapper then does not close the group a second time.
 */
function __mcpCloseUndoGroup() {
  if (__mcpUndoState.open) {
    try {
      app.endUndoGroup();
    } catch (_e) {}
    __mcpUndoState.open = false;
    __mcpUndoState.closedToken = __mcpUndoState.token;
  }
}

/**
 * Rule (18/11/2026): user ExtendScript must never leave After Effects with unbalanced undo groups.
 * ae.raw.executeExtendScript rewrites app.beginUndoGroup/app.endUndoGroup in user code to these, which
 * flatten nested groups into one, ignore an extra end, and close whatever is left open when the script ends.
 */
var __mcpUserUndoDepth = 0;
function __mcpUserUndoBegin(name) {
  if (__mcpUserUndoDepth === 0) {
    app.beginUndoGroup(name || "MCP Custom ExtendScript");
  }
  __mcpUserUndoDepth++;
}
function __mcpUserUndoEnd() {
  if (__mcpUserUndoDepth > 0) {
    __mcpUserUndoDepth--;
    if (__mcpUserUndoDepth === 0) {
      try {
        app.endUndoGroup();
      } catch (_e) {}
    }
  }
}
function __mcpUserUndoCloseAll() {
  if (__mcpUserUndoDepth > 0) {
    __mcpUserUndoDepth = 0;
    try {
      app.endUndoGroup();
    } catch (_e) {}
  }
}
/** True when user code saves, opens, closes or renders: those must run outside any undo group. */
function __mcpCodeBreaksUndoGroup(code) {
  return /app\.project\.(save|close)\s*\(|app\.(newProject|open|openFast|purge)\s*\(|\.render\s*\(|queueInAME\s*\(|beginUndoGroup\s*\(/.test(String(code));
}
/** After Effects user code: the wrapper's group is closed first when needed; the script's own groups are tracked. */
function __mcpEvalAeUserCode(code) {
  var src = String(code);
  if (__mcpCodeBreaksUndoGroup(src)) __mcpCloseUndoGroup();
  src = src.replace(/app\.beginUndoGroup\s*\(/g, "__mcpUserUndoBegin(").replace(/app\.endUndoGroup\s*\(/g, "__mcpUserUndoEnd(");
  __mcpUserUndoDepth = 0;
  try {
    return __mcpEvalUserCode(src);
  } finally {
    __mcpUserUndoCloseAll();
  }
}

function __mcpExecuteWithUndo(appId, undoName, fn) {
  var undoOpened = false;
  var myToken = (__mcpUndoState.token || 0) + 1;
  __mcpUndoState.token = myToken;
  __mcpUndoState.open = false;
  var startTime = new Date().getTime();
  var label = undoName || "MCP Action";

  try {
    if (appId === "after-effects" && typeof app !== "undefined" && app && typeof app.beginUndoGroup === "function") {
      app.beginUndoGroup(label);
      undoOpened = true;
      __mcpUndoState.open = true;
    }

    // Rule (18/11/2026): no Illustrator command may stop on an alert the person has to click
    // ("PDF objects were reinterpreted", missing fonts, links). Alerts are suppressed for every command.
    var prevAiUil = null;
    if (appId === "illustrator" && typeof app !== "undefined" && app && typeof UserInteractionLevel !== "undefined") {
      try {
        prevAiUil = app.userInteractionLevel;
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
      } catch (_eUil) {
        prevAiUil = null;
      }
    }

    var resultData;
    if (appId === "indesign" && typeof app !== "undefined" && app && typeof app.doScript === "function" && app.documents.length > 0) {
      // InDesign: the whole command becomes ONE undo step (Edit > Undo "<label>").
      var box = { value: null, error: null };
      app.doScript(function () {
        try {
          box.value = fn();
        } catch (eInner) {
          box.error = eInner;
        }
      }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, label);
      if (box.error) {
        throw box.error;
      }
      resultData = box.value;
    } else {
      try {
        resultData = fn();
      } finally {
        if (prevAiUil !== null) {
          try {
            app.userInteractionLevel = prevAiUil;
          } catch (_eUil2) {}
        }
      }
    }

    // Close unless a handler already closed THIS command's group (state may have been re-created).
    if (undoOpened && __mcpUndoState.closedToken !== myToken) {
      app.endUndoGroup();
    }
    undoOpened = false;
    __mcpUndoState.open = false;

    return JSON.stringify({
      ok: true,
      durationMs: new Date().getTime() - startTime,
      data: typeof resultData === "undefined" ? null : resultData
    });
  } catch (err) {
    var rolledBack = false;
    if (undoOpened && __mcpUndoState.closedToken !== myToken) {
      // B2 (18/11/2026, measured live on After Effects 27): a command that fails half-way no longer leaves
      // its leftovers (a stray solid, a null). Edit > Undo (command 16) undoes the group that was just
      // closed - but an EMPTY group creates no undo step, and Undo would then revert the person's own
      // previous action. So a marker folder is added INSIDE the group first: the group is never empty and
      // the undo removes exactly this command (marker included). The menu text cannot be used as a guard:
      // findMenuCommandId does not see the dynamic "Undo <label>" item.
      var marked = false;
      var noRollback = false;
      try {
        noRollback = !!($.global && $.global.__mcpNoRollback);
      } catch (_eNr) {}
      if (!noRollback) {
        try {
          app.project.items.addFolder("__mcp_rollback");
          marked = true;
        } catch (_eMark) {}
      }
      try {
        app.endUndoGroup();
      } catch (_ignore) {}
      if (marked) {
        try {
          app.executeCommand(16);
          rolledBack = true;
        } catch (_eUndo) {}
      }
    }
    __mcpUndoState.open = false;

    return JSON.stringify({
      ok: false,
      durationMs: new Date().getTime() - startTime,
      rolledBack: rolledBack,
      error: {
        code: (err && err.name) ? String(err.name) : "EXTENDSCRIPT_ERROR",
        message: ((err && err.message) ? String(err.message) : String(err)) + (rolledBack ? " [rolled back: everything this command had done was undone]" : ""),
        rolledBack: rolledBack,
        line: (err && typeof err.line !== "undefined") ? err.line : null,
        fileName: (err && err.fileName) ? String(err.fileName) : null
      }
    });
  }
}

/**
 * Reflects any ExtendScript object for 100% DOM introspection by the AI agent.
 */
function __mcpInspectDomObject(targetExpr, maxProperties) {
  var limit = maxProperties || 150;
  var obj = eval(targetExpr);
  if (obj === null || typeof obj === "undefined") {
    return { target: targetExpr, type: typeof obj, exists: false };
  }

  var info = {
    target: targetExpr,
    type: typeof obj,
    typename: (obj && obj.typename) ? String(obj.typename) : null,
    exists: true,
    properties: [],
    methods: []
  };

  if (obj && obj.reflect) {
    var props = obj.reflect.properties;
    for (var i = 0; i < props.length && i < limit; i++) {
      var pName = String(props[i].name);
      if (pName === "__proto__" || pName === "reflect") continue;
      var valPreview = null;
      try {
        var rawVal = obj[pName];
        var rt = typeof rawVal;
        if (rt === "string" || rt === "number" || rt === "boolean") {
          valPreview = rawVal;
        } else if (rawVal && rawVal.typename) {
          valPreview = "[" + rawVal.typename + "]";
        } else if (rawVal instanceof Array) {
          valPreview = "[Array(" + rawVal.length + ")]";
        }
      } catch (_errP) {
        valPreview = "[Restricted]";
      }
      info.properties.push({
        name: pName,
        dataType: String(props[i].dataType || ""),
        type: String(props[i].type || ""),
        valuePreview: valPreview
      });
    }

    var methods = obj.reflect.methods;
    for (var j = 0; j < methods.length && j < limit; j++) {
      info.methods.push({
        name: String(methods[j].name),
        arguments: String(methods[j].arguments || ""),
        returnType: String(methods[j].dataType || "")
      });
    }
  } else if (typeof obj === "object") {
    var count = 0;
    for (var k in obj) {
      if (count >= limit) break;
      info.properties.push({ name: String(k), type: typeof obj[k] });
      count++;
    }
  }

  return info;
}

/* ------------------------------------------------------------------ batch */

/** Actions only the UXP bridges implement; a batch containing one must run on UXP. */
var __MCP_UXP_ONLY_ACTIONS = {
  "ps.raw.executeUxp": true,
  "pr.raw.executeUxp": true
};

function __mcpErrorInfo(err) {
  return {
    code: (err && err.name) ? String(err.name) : "EXTENDSCRIPT_ERROR",
    message: (err && err.message) ? String(err.message) : String(err),
    line: (err && typeof err.line !== "undefined") ? err.line : null
  };
}

/** Runs already-validated batch operations through __mcpDispatch and reports each result. */
function __mcpRunBatchOps(ops, stopOnError) {
  var results = [];
  var failed = 0;
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    var started = new Date().getTime();
    try {
      var data = __mcpDispatch(op.action, op.params || {}, {});
      results.push({
        index: i,
        action: op.action,
        ok: true,
        durationMs: new Date().getTime() - started,
        data: typeof data === "undefined" ? null : data
      });
    } catch (err) {
      failed++;
      results.push({
        index: i,
        action: op.action,
        ok: false,
        durationMs: new Date().getTime() - started,
        error: __mcpErrorInfo(err)
      });
      if (stopOnError) {
        break;
      }
    }
  }
  return {
    total: ops.length,
    executed: results.length,
    succeeded: results.length - failed,
    failed: failed,
    stoppedEarly: results.length < ops.length,
    results: results
  };
}

/**
 * Entry point for the "<prefix>.batch" action (prefix = ps | ae | pr | ai).
 * params: { operations: [{action, params}], stopOnError (default true), undoName }.
 * After Effects: the caller (__mcpExecuteWithUndo) already wraps the whole batch in one undo group.
 * Photoshop: all operations become a single history state through suspendHistory.
 */
function __mcpBatch(params, prefix) {
  params = params || {};
  var ops = params.operations;
  if (!(ops instanceof Array) || ops.length === 0) {
    throw new Error("Batch 'operations' must be a non-empty array.");
  }
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    if (!op || typeof op.action !== "string") {
      throw new Error("Batch operation " + i + " has no 'action'.");
    }
    if (op.action === prefix + ".batch") {
      throw new Error("Batch operation " + i + " is itself a batch; nesting is not allowed.");
    }
    if (op.action.indexOf(prefix + ".") !== 0 && op.action !== "adobe.inspectDom") {
      throw new Error("Batch operation " + i + " (" + op.action + ") belongs to another app.");
    }
    if (__MCP_UXP_ONLY_ACTIONS[op.action] === true) {
      __mcpUnsupported("Batch operation " + i + " (" + op.action + ") needs the UXP bridge; run the batch on UXP or split it.");
    }
  }

  var stopOnError = params.stopOnError !== false;
  var canSuspendHistory =
    prefix === "ps" &&
    typeof app !== "undefined" && app && app.documents && app.documents.length > 0 &&
    typeof $ !== "undefined" && $ && $.global;

  if (canSuspendHistory) {
    $.global.__mcpBatchState = { ops: ops, stop: stopOnError, out: null, err: null };
    app.activeDocument.suspendHistory(
      String(params.undoName || "MCP Batch"),
      "try { $.global.__mcpBatchState.out = __mcpRunBatchOps($.global.__mcpBatchState.ops, $.global.__mcpBatchState.stop); }" +
        " catch (__e) { $.global.__mcpBatchState.err = __e; }"
    );
    var state = $.global.__mcpBatchState;
    $.global.__mcpBatchState = null;
    if (state.err) {
      throw state.err;
    }
    state.out.singleHistoryState = true;
    return state.out;
  }

  var out = __mcpRunBatchOps(ops, stopOnError);
  out.singleHistoryState = prefix === "ae";
  return out;
}

/**
 * Destination File for adobe.checkpoint: <folder>/<base>__<label>__YYYYMMDD-HHMMSS.<ext>.
 * Folder: params.folder, else "_checkpoints" next to the original file, else Documents/MCP-checkpoints.
 */
function __mcpCheckpointFile(baseName, ext, label, folderPath, originalFile) {
  var pad = function (n) {
    return n < 10 ? "0" + n : String(n);
  };
  var clean = function (v) {
    return String(v || "")
      .replace(/[\\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_")
      .replace(/^[-_.]+|[-_.]+$/g, "")
      .slice(0, 60);
  };
  var d = new Date();
  var stamp =
    d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  var dir;
  if (folderPath) {
    dir = new Folder(folderPath);
  } else if (originalFile && originalFile.parent) {
    dir = new Folder(originalFile.parent.fsName + "/_checkpoints");
  } else {
    dir = new Folder(Folder.myDocuments.fsName + "/MCP-checkpoints");
  }
  if (!dir.exists && !dir.create()) {
    throw new Error("Cannot create the checkpoint folder: " + dir.fsName);
  }
  var base = clean(String(baseName || "").replace(/\.[^.]+$/, "")) || "document";
  var lab = clean(label);
  return new File(dir.fsName + "/" + base + (lab ? "__" + lab : "") + "__" + stamp + "." + ext);
}

/** Copies a file and throws with the host's reason when it fails. */
function __mcpCopyFile(src, dest) {
  if (!src.copy(dest.fsName)) {
    throw new Error("Could not copy " + src.fsName + " to " + dest.fsName + (src.error ? ": " + src.error : ""));
  }
  return dest;
}

/** Throws an Error whose name is read by the MCP router as the error code. */
function __mcpFail(code, message) {
  var e = new Error(message);
  e.name = code;
  throw e;
}

/** Creates a folder and every missing parent; throws FOLDER_CREATE_FAILED when the host refuses. */
function __mcpEnsureFolder(dir, depth) {
  depth = depth || 0;
  if (!dir || dir.exists) return dir;
  var parent = dir.parent;
  // Stop at the drive root (whose parent is null or itself) and at absurd depths.
  if (parent && parent.fsName !== dir.fsName && depth < 64 && !parent.exists) __mcpEnsureFolder(parent, depth + 1);
  if (!dir.create() && !dir.exists) {
    __mcpFail("FOLDER_CREATE_FAILED", "Cannot create the folder " + dir.fsName + (dir.error ? ": " + dir.error : ""));
  }
  return dir;
}

/**
 * File for a save or export. Creates the missing parent folders first: a host asked to write into a
 * folder that does not exist opens a modal dialog (Illustrator Save As, After Effects warning) or fails
 * with a vague error (Photoshop), and a modal dialog blocks the app until someone clicks it.
 */
function __mcpPrepareOutputFile(path) {
  if (!path) __mcpFail("INVALID_PARAMS", "filePath is required.");
  var f = new File(path);
  __mcpEnsureFolder(f.parent);
  return f;
}

// macOS (validated 20/11/2026, Premiere 27): paths read back from the app (app.project.path) come decomposed (NFD:
// "a" + U+0303) while paths passed in are composed (NFC: U+00E3), so a folder like "Ação" never matched. ES3 has no
// String.normalize: compose the Latin accents used in Portuguese, Spanish and French (after lower-casing).
var __mcpNfcMap = {
  "à": "à", "á": "á", "â": "â", "ã": "ã", "ä": "ä", "å": "å",
  "ç": "ç",
  "è": "è", "é": "é", "ê": "ê", "ë": "ë",
  "ì": "ì", "í": "í", "î": "î", "ï": "ï",
  "ñ": "ñ",
  "ò": "ò", "ó": "ó", "ô": "ô", "õ": "õ", "ö": "ö",
  "ù": "ù", "ú": "ú", "û": "û", "ü": "ü",
  "ý": "ý", "ÿ": "ÿ"
};
function __mcpComposeLatin(s) {
  return String(s).replace(/[aceinouy][̧̀́̂̃̈̊]/g, function (m) {
    return __mcpNfcMap[m] || m;
  });
}

/** Normalised absolute path for comparisons (slashes, case and NFC/NFD accents ignored). */
function __mcpSamePath(a, b) {
  var n = function (v) {
    return __mcpComposeLatin(String(new File(v).fsName).replace(/\\/g, "/").toLowerCase());
  };
  return n(a) === n(b);
}

/** Confirms that a save landed where it was asked to; throws SAVE_PATH_MISMATCH or SAVE_FAILED. */
function __mcpVerifySaved(expectedFile, actualPath) {
  if (actualPath && !__mcpSamePath(expectedFile.fsName, actualPath)) {
    __mcpFail(
      "SAVE_PATH_MISMATCH",
      "Asked to save to " + expectedFile.fsName + " but the document is now at " + new File(actualPath).fsName + "."
    );
  }
  if (!new File(expectedFile.fsName).exists) {
    __mcpFail("SAVE_FAILED", "The app reported no error but " + expectedFile.fsName + " does not exist.");
  }
  return expectedFile;
}
