/*
 * bridges/uxp-premiere/main.js
 * Native UXP Plugin Bridge for Adobe Premiere Pro (25.6+ / 27.0).
 */

const ppro = require("premierepro");
const uxp = require("uxp");
const { entrypoints } = uxp;

const HUB_URLS = ["ws://127.0.0.1:31001/plugin", "ws://localhost:31001/plugin"];
let hubAttempt = 0;
const RECONNECT_DELAY_MS = 2500;
let ws = null;
let reconnectTimer = null;
let reconnectButtonBound = false;

function unsupported(message) {
  const err = new Error(message);
  err.code = "ACTION_NOT_SUPPORTED";
  return err;
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

// Everything else is answered with ACTION_NOT_SUPPORTED so the MCP router retries the command on the
// CEP panel (ExtendScript + QE DOM), which implements the full timeline tool set.
const UXP_ACTIONS = ["pr.project.getInfo", "pr.media.import", "pr.raw.executeUxp", "pr.captions.tracks", "pr.transcript", "pr.scene.detect"];

async function dispatchPremiereUxp(actionName, params) {
  if (UXP_ACTIONS.indexOf(actionName) === -1) {
    throw unsupported(`Action '${actionName}' is routed via pr_execute_uxp_script or CEP ExtendScript bridge.`);
  }
  if (actionName === "pr.media.import" && params.targetBinName) {
    throw unsupported("pr.media.import with targetBinName is handled by the CEP ExtendScript bridge.");
  }
  if (actionName === "pr.media.import" && (params.filePaths || []).some((f) => /\.aep$/i.test(String(f)))) {
    // importFiles on an .aep opens the "Import After Effects Composition" dialog; CEP uses importAEComps.
    throw unsupported("pr.media.import of After Effects projects (Dynamic Link) is handled by the CEP ExtendScript bridge.");
  }
  const project = await ppro.Project.getActiveProject();
  if (params.expectedProject) {
    // Guard set by pr_expect_project: never touch a project other than the one the work is meant for.
    const activeName = project && project.name ? String(project.name) : "";
    if (activeName.toLowerCase() !== String(params.expectedProject).toLowerCase()) {
      const err = new Error(
        `The active Premiere project is '${activeName || "none"}', not '${params.expectedProject}'. Nothing was changed. ` +
          "Activate the right project, or call pr_expect_project again (name, or clear: true)."
      );
      err.code = "PROJECT_MISMATCH";
      throw err;
    }
  }
  if (!project && actionName !== "pr.raw.executeUxp") {
    throw new Error("No active Premiere Pro project.");
  }

  if (actionName === "pr.captions.tracks") {
    // Native caption tracks are invisible to ExtendScript in Premiere 27; UXP can read, mute and rename them.
    const seq = await project.getActiveSequence();
    if (!seq) throw new Error("No active sequence in Premiere Pro.");
    const op = params.operation || "list";
    const count = await seq.getCaptionTrackCount();
    if (op !== "list") {
      const idx = Number(params.trackIndex) || 0;
      if (idx < 0 || idx >= count) {
        const err = new Error(`Caption track ${idx} does not exist (the sequence has ${count}).`);
        err.code = "INVALID_PARAMS";
        throw err;
      }
      const track = await seq.getCaptionTrack(idx);
      if (op === "mute" || op === "unmute") {
        await track.setMute(op === "mute");
      } else if (op === "rename") {
        if (!params.name) {
          const err = new Error("rename needs name.");
          err.code = "INVALID_PARAMS";
          throw err;
        }
        project.lockedAccess(() => {
          project.executeTransaction((ca) => ca.addAction(track.createSetNameAction(String(params.name))), "MCP: Rename caption track");
        });
      }
    }
    const tracks = [];
    for (let i = 0; i < count; i++) {
      const t = await seq.getCaptionTrack(i);
      const items = await t.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
      const blocks = [];
      for (const it of items.slice(0, Number(params.maxBlocks) || 500)) {
        blocks.push({
          start: Math.round((await it.getStartTime()).seconds * 1000) / 1000,
          end: Math.round((await it.getEndTime()).seconds * 1000) / 1000
        });
      }
      tracks.push({ index: i, name: t.name, muted: await t.isMuted(), blockCount: items.length, blocks });
    }
    return {
      sequence: seq.name,
      operation: op,
      captionTrackCount: count,
      tracks,
      note: "Block text and style are not exposed to scripts. For styled captions use pr_captions_as_mogrt."
    };
  }

  if (actionName === "pr.transcript") {
    // Premiere's own speech-to-text (Text panel). Verified live on Premiere 27.0 (20/11/2026): languages are
    // listed, a clip is transcribed with { language }, and the result comes back with per-word times.
    const op = params.operation || "status";
    if (op === "languages") {
      const langs = await ppro.Transcript.querySupportedLanguages();
      const out = [];
      for (const l of langs || []) {
        let installed = null;
        try {
          installed = Boolean(await ppro.Transcript.isLanguagePackAvailable(l.languageCode));
        } catch (_e) {
          installed = null;
        }
        out.push({ code: l.languageCode, name: l.displayString, installed });
      }
      return { operation: op, languages: out, note: "A language that is not installed has to be downloaded in Premiere (Text panel) before it can be used." };
    }
    if (!params.clipName) {
      const err = new Error("clipName is required: the name of the clip in the Project panel.");
      err.code = "INVALID_PARAMS";
      throw err;
    }
    const wanted = String(params.clipName).toLowerCase();
    let clip = null;
    const walk = async (folder, depth) => {
      const children = await folder.getItems();
      for (const it of children) {
        if (clip) return;
        if (String(it.name).toLowerCase() === wanted) {
          try {
            clip = ppro.ClipProjectItem.cast(it);
          } catch (_e) {
            clip = null;
          }
          if (clip) return;
        }
        let sub = null;
        try {
          sub = ppro.FolderItem.cast(it);
        } catch (_e) {
          sub = null;
        }
        if (sub && depth < 6) await walk(sub, depth + 1);
      }
    };
    await walk(await project.getRootItem(), 0);
    if (!clip) {
      const err = new Error(`Clip '${params.clipName}' was not found in the Project panel.`);
      err.code = "CLIP_NOT_FOUND";
      throw err;
    }
    const readTranscript = async () => {
      // hasTranscript answers true for any clip, so the segments are what counts.
      let data = null;
      try {
        const json = await ppro.Transcript.exportToJSON(clip);
        data = json ? JSON.parse(String(json)) : null;
      } catch (_e) {
        data = null;
      }
      const segments = (data && data.segments) || [];
      let words = 0;
      const lines = [];
      for (const s of segments) {
        const ws = s.words || [];
        words += ws.length;
        lines.push({
          start: ws.length ? ws[0].start : s.start,
          end: ws.length ? ws[ws.length - 1].start + (ws[ws.length - 1].duration || 0) : null,
          speaker: s.speaker || null,
          text: ws.map((w) => w.text).join(" ")
        });
      }
      return { data, segments, words, lines };
    };
    let transcribed = false;
    if (op === "transcribe") {
      const language = String(params.language || "").toLowerCase();
      if (!language) {
        const err = new Error("language is required for transcribe (e.g. 'pt-pt', 'en-us'). List them with operation 'languages'.");
        err.code = "INVALID_PARAMS";
        throw err;
      }
      let installed = true;
      try {
        installed = Boolean(await ppro.Transcript.isLanguagePackAvailable(language));
      } catch (_e) {
        installed = true;
      }
      if (!installed) {
        const err = new Error(`The language pack '${language}' is not installed in Premiere. Download it in the Text panel, or pick an installed language (operation 'languages').`);
        err.code = "LANGUAGE_PACK_MISSING";
        throw err;
      }
      const ok = await ppro.Transcript.transcribeClipProjectItem(clip, { language });
      if (!ok) throw new Error("Premiere refused to transcribe this clip (no audio, or the media is offline).");
      transcribed = true;
    } else if (op !== "status" && op !== "export") {
      const err = new Error("operation must be languages, status, transcribe or export.");
      err.code = "INVALID_PARAMS";
      throw err;
    }
    const t = await readTranscript();
    const result = {
      operation: op,
      clip: params.clipName,
      transcribed,
      hasTranscript: t.segments.length > 0,
      language: t.data ? t.data.language : null,
      segments: t.segments.length,
      words: t.words
    };
    if (op === "status") return result;
    const maxLines = Number(params.maxSegments) || 200;
    result.lines = t.lines.slice(0, maxLines);
    if (t.lines.length > maxLines) result.truncated = true;
    if (params.includeWords) {
      const flat = [];
      for (const s of t.segments) for (const w of s.words || []) flat.push({ text: w.text, start: w.start, duration: w.duration });
      result.wordTimes = flat.slice(0, Number(params.maxWords) || 2000);
    }
    if (params.outputPath) {
      const fsN = require("fs");
      const target = String(params.outputPath).replace(/\\/g, "/");
      fsN.writeFileSync("file:" + target, JSON.stringify(t.data, null, 2));
      result.outputPath = params.outputPath;
    }
    return result;
  }

  if (actionName === "pr.scene.detect") {
    // Scene Edit Detection on the clips of one video track of the active sequence (live 20/11/2026, Premiere 27.0).
    const seq = await project.getActiveSequence();
    if (!seq) throw new Error("No active sequence in Premiere Pro.");
    const SU = ppro.SequenceUtils;
    const ops = { markers: SU.SEQUENCE_OPERATION_CREATEMARKER, cuts: SU.SEQUENCE_OPERATION_APPLYCUT, subclips: SU.SEQUENCE_OPERATION_CREATESUBCLIP };
    const sens = { low: "LowSensitivity", medium: "MediumSensitivity", high: "HighSensitivity" };
    const apply = String(params.apply || "markers");
    const sensitivity = String(params.sensitivity || "medium");
    if (!ops[apply] || !sens[sensitivity]) {
      const err = new Error("apply must be markers, cuts or subclips; sensitivity must be low, medium or high.");
      err.code = "INVALID_PARAMS";
      throw err;
    }
    const trackIndex = Number(params.videoTrackIndex) || 0;
    const trackCount = await seq.getVideoTrackCount();
    if (trackIndex < 0 || trackIndex >= trackCount) {
      const err = new Error(`Video track ${trackIndex} does not exist (the sequence has ${trackCount}).`);
      err.code = "INVALID_PARAMS";
      throw err;
    }
    const track = await seq.getVideoTrack(trackIndex);
    const before = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
    if (!before.length) throw new Error(`Video track ${trackIndex} has no clips.`);
    const selection = await seq.getSelection();
    for (const old of await selection.getTrackItems()) selection.removeItem(old);
    const picked = typeof params.clipIndex === "number" ? [before[params.clipIndex]] : before;
    if (!picked[0]) {
      const err = new Error(`Clip ${params.clipIndex} does not exist on video track ${trackIndex} (it has ${before.length}).`);
      err.code = "INVALID_PARAMS";
      throw err;
    }
    for (const it of picked) selection.addItem(it);
    await seq.setSelection(selection);
    const markerCount = async () => {
      try {
        return (await ppro.Markers.getMarkers(seq)).getMarkers().length;
      } catch (_e) {
        return null;
      }
    };
    const markersBefore = await markerCount();
    const ok = await SU.performSceneEditDetectionOnSelection(ops[apply], selection, sens[sensitivity]);
    if (!ok) throw new Error("Premiere did not run Scene Edit Detection on the selection.");
    const after = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
    const markersAfter = await markerCount();
    return {
      sequence: seq.name,
      apply,
      sensitivity,
      videoTrackIndex: trackIndex,
      analysedClips: picked.length,
      clipsBefore: before.length,
      clipsAfter: after.length,
      cutsAdded: after.length - before.length,
      sequenceMarkersAdded: markersBefore === null || markersAfter === null ? null : markersAfter - markersBefore,
      note: "A clip filmed in one take has no cuts to find. With apply 'markers' the markers are placed on the clip."
    };
  }

  if (actionName === "pr.project.getInfo") {
    const seq = await project.getActiveSequence();
    const seqs = await project.getSequences();
    return {
      name: project.name,
      path: project.path,
      activeSequenceName: seq ? seq.name : null,
      sequencesCount: seqs ? seqs.length : 0,
      sequences: (seqs || []).map((s, idx) => ({
        index: idx,
        name: s.name,
        id: s.guid
      }))
    };
  }

  if (actionName === "pr.media.import") {
    const rootItem = await project.getRootItem();
    const imported = await project.importFiles(params.filePaths || [], true, rootItem, Boolean(params.importAsNumberedStills));
    return { imported: Boolean(imported), files: params.filePaths || [] };
  }

  if (actionName === "pr.raw.executeUxp") {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction("ppro", "project", "uxp", params.code);
    const result = await fn(ppro, project, uxp);
    return { executed: true, result: typeof result === "undefined" ? null : result };
  }

  throw unsupported(`Action '${actionName}' is routed via pr_execute_uxp_script or CEP ExtendScript bridge.`);
}

function hostVersion() {
  try {
    return String((uxp.host && uxp.host.version) || "unknown");
  } catch (_e) {
    return "unknown";
  }
}

/* ------------------------------------------------- on/off switch per app (default: on) */
// Shared with the CEP panel of the same app through one small file PER APP in the user folder (two apps never
// rewrite each other's choice); if the file cannot be written from UXP, the choice stays in this panel's storage.
const BRIDGE_APP_ID = "premiere";
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

  // Retire the previous socket and detach its handlers first: otherwise its late onclose would
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
  } catch (_e) {
    log("WebSocket blocked: " + (_e && _e.message ? _e.message : _e));
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
        app: "premiere",
        bridgeType: "uxp",
        appVersion: hostVersion(),
        pluginVersion: "1.4.1",
        capabilities: ["uxp", "executeUxp", "lockedAccess"]
      })
    );
  };

  socket.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "command") {
        log(`Action: ${msg.action}`);
        const start = Date.now();
        try {
          const data = await dispatchPremiereUxp(msg.action, msg.params || {});
          socket.send(
            JSON.stringify({
              type: "response",
              id: msg.id,
              app: "premiere",
              bridgeType: "uxp",
              ok: true,
              durationMs: Date.now() - start,
              data
            })
          );
        } catch (err) {
          socket.send(
            JSON.stringify({
              type: "response",
              id: msg.id,
              app: "premiere",
              bridgeType: "uxp",
              ok: false,
              durationMs: Date.now() - start,
              error: {
                code: (err && err.code) || "PR_UXP_ERROR",
                message: err && err.message ? err.message : String(err)
              }
            })
          );
        }
      }
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

function ensureConnected() {
  const alive = ws !== null && (typeof ws.readyState !== "number" || ws.readyState === 0 || ws.readyState === 1);
  if (!alive) {
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
    "com.jradbmcp.premiere.panel": {
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
