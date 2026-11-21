/**
 * What the agent should do after an error, by error code. Attached to every tool error by
 * formatErrorResponse so the model does not have to guess from a raw host message (in the
 * 2026-11-12 test a bare "EvalScript error." looked like a modal dialog but was a syntax error
 * in a handler, and a timeout was retried into an app that was still busy).
 */

export interface ErrorHint {
  /** True when the same call can succeed after the user or the agent acts (close a dialog, wait, fix input). */
  recoverable: boolean;
  hint: string;
  nextTools?: string[];
}

const SCRIPT_ERROR_HINT: ErrorHint = {
  recoverable: true,
  hint:
    "The script raised an error inside the app (see line). Fix the code and retry. ExtendScript is ES3: no let/const, " +
    "arrow functions, template literals or reserved words as unquoted keys. Explore the API with jradb_inspect_dom " +
    "instead of guessing property names.",
  nextTools: ["jradb_inspect_dom"]
};

const HINTS: Record<string, ErrorHint> = {
  BRIDGE_TIMEOUT: {
    recoverable: true,
    hint:
      "The app did not answer in time. It may still be running the command (heavy file, render, long script) or be " +
      "blocked by a dialog. Do not resend heavy commands in a loop: the next command to this app first sends a short " +
      "probe and returns APP_BUSY if the app is still stuck. Check jradb_get_status; save work with jradb_checkpoint " +
      "before retrying long operations.",
    nextTools: ["jradb_get_status", "jradb_checkpoint"]
  },
  APP_BUSY: {
    recoverable: true,
    hint:
      "The app is still busy with an earlier command or blocked by a dialog, so nothing was sent. Ask the user to look " +
      "at the app (close dialogs, wait for the render), then retry. jradb_get_status shows the command in flight.",
    nextTools: ["jradb_get_status"]
  },
  HOST_BLOCKED: {
    recoverable: true,
    hint:
      "The app's script engine did not run even a one-line probe: a modal dialog is open or the app is frozen. Ask the " +
      "user to check the app window and close any dialog, then retry.",
    nextTools: ["jradb_get_status"]
  },
  SCRIPT_PARSE_ERROR: {
    recoverable: false,
    hint:
      "The app runs scripts, but rejected the MCP handler file itself (syntax error or reserved word in the installed " +
      ".jsx). This is a bridge bug, not your input: run `npm run install-bridges` in the MCP folder and retry; if it " +
      "persists, report it. Other apps are not affected.",
    nextTools: ["jradb_get_status"]
  },
  EVALSCRIPT_FAILED: {
    recoverable: true,
    hint:
      "An older panel cannot tell a modal dialog from a handler syntax error. Ask the user to check the app for an open " +
      "dialog; if there is none, reinstall the bridges (`npm run install-bridges`) — the new panel reports the exact cause.",
    nextTools: ["jradb_get_status"]
  },
  BRIDGE_NOT_CONNECTED: {
    recoverable: true,
    hint:
      "No bridge is connected for this app. Start it (jradb_launch_app), open its MCP panel (Window > Extensions) or, for " +
      "Lightroom, the plug-in, then check jradb_get_status.",
    nextTools: ["jradb_launch_app", "jradb_get_status"]
  },
  HUB_NOT_CONNECTED: {
    recoverable: true,
    hint: "The MCP hub is not running or another process holds its port. Check jradb_get_status (hub role and error).",
    nextTools: ["jradb_get_status"]
  },
  ACTION_NOT_SUPPORTED: {
    recoverable: false,
    hint:
      "No connected bridge implements this action. Use the app's escape hatch (*_execute_extendscript, ps_batch_play, " +
      "lr_execute_lua) or connect the bridge named in the message.",
    nextTools: ["jradb_inspect_dom"]
  },
  CATALOG_BUSY: {
    recoverable: true,
    hint: "Lightroom did not grant catalog write access (another edit or a dialog is running). Wait a moment and retry.",
    nextTools: ["jradb_get_status"]
  },
  COM_TIMEOUT_PANEL_DISCONNECTED: {
    recoverable: true,
    hint:
      "The app's MCP panel is disconnected and the command went through the slower COM path, whose answer was lost. The script " +
      "may have finished. Check the result first (ps_list_documents / ps_get_layer_tree, ai_get_document_info), ask the user to " +
      "reopen the MCP panel (Window > Extensions) and only then continue. Never repeat a command that creates or saves things blindly.",
    nextTools: ["jradb_get_status", "ps_list_documents", "ps_get_layer_tree"]
  },
  AE_CLI_FALLBACK_FAILED: {
    recoverable: true,
    hint:
      "The After Effects panel is not connected and the command-line fallback failed. Open the MCP panel in After Effects " +
      "(Window > Extensions) and allow scripts to write files (Settings > Scripting & Expressions).",
    nextTools: ["jradb_get_status"]
  },
  PROJECT_MISMATCH: {
    recoverable: true,
    hint: "Another Premiere project is active. Activate the expected project (or call pr_expect_project with the right name / clear: true) and retry. Nothing was changed."
  },
  INVALID_PARAMS: {
    recoverable: true,
    hint: "Fix the parameters named in the message and retry."
  },
  CEP_HANDLERS_NOT_FOUND: {
    recoverable: false,
    hint: "The panel cannot find its .jsx handlers. Run `npm run install-bridges` and restart the app."
  },
  FOLDER_CREATE_FAILED: {
    recoverable: true,
    hint:
      "The output folder does not exist and could not be created (permissions, invalid name, disconnected drive). Pick a " +
      "writable folder or ask the user to create it, then retry.",
    nextTools: ["jradb_get_status"]
  },
  SAVE_PATH_MISMATCH: {
    recoverable: true,
    hint:
      "The app saved somewhere other than the requested path (a Save As dialog or a fallback location). Check the path " +
      "in the message, then save again to the intended path; tell the user about the stray file.",
    nextTools: ["jradb_get_status"]
  },
  SAVE_FAILED: {
    recoverable: true,
    hint:
      "The app reported success but the file is not on disk. Check the folder and free space, look at the app for a " +
      "dialog, then retry once.",
    nextTools: ["jradb_get_status"]
  },
  DOCUMENT_NOT_FOUND: {
    recoverable: true,
    hint:
      "No open document has that name. List the open documents and pass the exact name (the user may have closed or " +
      "renamed it); leave documentName out to act on the active document.",
    nextTools: ["ps_list_documents"]
  },
  PROJECT_DIRTY: {
    recoverable: true,
    hint:
      "The open project has unsaved changes and the app would ask in a dialog. Save it first (manage project, operation " +
      "'save') or repeat with discardChanges: true if losing those changes is fine.",
    nextTools: ["jradb_checkpoint"]
  },
  EFFECT_AMBIGUOUS: {
    recoverable: true,
    hint:
      "Two installed effects share this name and Premiere applied the wrong one (already removed). List the names with " +
      "pr_list_effects and use an unambiguous one, e.g. 'Gaussian Blur (Legacy)'.",
    nextTools: ["pr_list_effects"]
  },
  PREVIEW_FAILED: {
    recoverable: true,
    hint:
      "Lightroom produced no preview, even through an export. Check the photo in Lightroom (missing original, offline " +
      "drive); as a visual check, export it with lr_export_photos and look at the file.",
    nextTools: ["lr_export_photos", "lr_get_catalog_info"]
  },
  SyntaxError: SCRIPT_ERROR_HINT,
  ReferenceError: SCRIPT_ERROR_HINT,
  TypeError: SCRIPT_ERROR_HINT,
  RangeError: SCRIPT_ERROR_HINT,
  EvalError: SCRIPT_ERROR_HINT,
  EXTENDSCRIPT_ERROR: SCRIPT_ERROR_HINT
};

/** Outdated installed bridges announce themselves through these messages. */
const OUTDATED_BRIDGE = /getfenv|Yielding is not allowed|__mcpDispatch is not defined|__mcpPrepareOutputFile is not defined/i;

/** Photoshop's answer to a save into a folder that does not exist (13/11/2026). */
const PS_SAVE_INVALID = /parameters for command "Save" are not currently valid/i;

export function getErrorHint(code: string | undefined, message = ""): ErrorHint | undefined {
  if (OUTDATED_BRIDGE.test(message)) {
    return {
      recoverable: false,
      hint:
        "The installed bridge is older than the MCP server (a bug already fixed in the project). Run " +
        "`npm run install-bridges` in the MCP folder and restart the app (Lightroom must be restarted).",
      nextTools: ["jradb_get_status"]
    };
  }
  if (PS_SAVE_INVALID.test(message)) {
    return {
      recoverable: true,
      hint:
        "Photoshop rejected the save, usually because the destination folder does not exist or the format does not fit " +
        "the document (e.g. JPEG with layers is fine, 16-bit PNG is not). The current bridge creates folders; on an older " +
        "bridge run `npm run install-bridges`, or create the folder and retry.",
      nextTools: ["jradb_get_status"]
    };
  }
  if (!code) {
    return undefined;
  }
  return HINTS[code];
}
