import * as path from "node:path";
import { watchRender } from "../../media/render-watch.js";
import { z } from "zod";
import { lookSettings, VIDEO_LOOKS } from "../../core/video-looks.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../core/bridge-router.js";
import {
  buildImageToolResponse,
  formatErrorResponse,
  formatSuccessResponse
} from "../../core/image-helper.js";
import { AdobeBridgeError } from "../../core/types.js";
import { musicBedKeys } from "../../media/audio-analysis.js";
import { parseSrt } from "../../media/captions.js";
import { auditPremiere, summarize, type PrAuditData } from "../../core/audit.js";
import { FORMATS } from "../../core/formats.js";
import { loadAudio } from "../../media/ffmpeg.js";
import { measureLoudness } from "../../media/audio-analysis.js";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { CatalogCache, normalizeText, suggestEffects } from "../../core/effect-catalog.js";

const ClipTarget = {
  trackType: z.enum(["video", "audio"]).optional().default("video"),
  trackIndex: z.number().int().min(0).default(0).describe("0-based track index (V1 = 0, A1 = 0)."),
  clipIndex: z.number().int().min(0).optional().default(0).describe("0-based clip index on the track, gaps not counted.")
};

type PrListKind = "videoEffects" | "audioEffects" | "videoTransitions" | "audioTransitions";

const prNameCache = new CatalogCache<string[]>();

async function withPrSuggestions(router: BridgeRouter, err: unknown, wanted: string, kind: PrListKind): Promise<unknown> {
  if (!(err instanceof AdobeBridgeError) || err.code !== "EFFECT_NOT_FOUND") {
    return err;
  }
  try {
    const names = await prNameCache.get(kind, async () => {
      const res = await router.dispatch("premiere", "pr.effect.list", { kind }, { timeoutMs: 60000 });
      return ((res.data as { names?: string[] }).names || []) as string[];
    });
    const near = suggestEffects(
      names.map((n) => ({ displayName: n, matchName: n, category: "" })),
      wanted,
      5
    ).map((e) => e.displayName);
    return new AdobeBridgeError(err.app, err.code, `${err.message} Closest names: ${near.join("; ")}.`, err.details);
  } catch {
    return err;
  }
}

/**
 * Lumetri has ~120 parameters: a full readback for four clips was 78 KB on 13/11/2026. Keep every
 * parameter for small effects; for big ones keep only the parameters that were asked for (all
 * occurrences, Lumetri repeats names per section) on the first clip and a count on the others.
 */
export function compactEffectReadback(data: unknown, asked: string[], limit = 30): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as { clips?: Array<Record<string, any>> };
  if (!Array.isArray(d.clips)) return data;
  const wanted = new Set(asked.map((a) => a.toLowerCase()));
  d.clips = d.clips.map((clip, i) => {
    const comp = clip.component;
    const props: Array<Record<string, unknown>> | undefined = comp && Array.isArray(comp.properties) ? comp.properties : undefined;
    if (!props || props.length <= limit) return clip;
    const kept = i === 0 ? props.filter((p) => wanted.has(String(p.displayName ?? "").toLowerCase())) : [];
    return {
      ...clip,
      component: {
        ...comp,
        properties: kept,
        propertiesTotal: props.length,
        note:
          i === 0
            ? "Large effect: only the parameters you set are listed. Use pr_list_clip_effects for the full list."
            : "Same effect as clip 0; parameters omitted."
      }
    };
  });
  return d;
}

/** Built-in caption templates (made with After Effects, text exposed): templates/legendas in the repo. */
const CAPTION_TEMPLATES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "templates", "legendas");

/** Times (s) of the 0.25 s windows whose sample peak passes thresholdDb, merged within 1 s; at most 10. */
export function hotSpots(samples: Float32Array, sr: number, thresholdDb: number): number[] {
  const lim = Math.pow(10, thresholdDb / 20);
  const win = Math.round(sr * 0.25);
  const out: number[] = [];
  for (let i = 0; i < samples.length; i += win) {
    let m = 0;
    for (let j = i; j < Math.min(samples.length, i + win); j++) m = Math.max(m, Math.abs(samples[j]));
    const t = i / sr;
    if (m > lim && (!out.length || t - out[out.length - 1] > 1)) out.push(Math.round(t * 10) / 10);
    if (out.length >= 10) break;
  }
  return out;
}

export function registerPremiereTools(server: McpServer, router: BridgeRouter): void {
  server.tool(
    "pr_get_project_info",
    "Retrieve Adobe Premiere Pro active project metadata, sequences list, and bin/clip hierarchy.",
    {},
    async () => {
      try {
        const res = await router.dispatch("premiere", "pr.project.getInfo", {});
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_manage_project",
    "Create a new project (operation 'new' + filePath .prproj), open, save, save-as, or create bins in Adobe Premiere Pro. Missing folders are created.",
    {
      operation: z.enum(["new", "open", "save", "createBin"]),
      filePath: z.string().optional().describe("File path for new, open or save-as."),
      binName: z.string().optional().describe("Bin name when operation='createBin'."),
      closePrevious: z
        .boolean()
        .optional()
        .describe("new: save and close the projects already open so the new one is the active project (default true).")
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.project.manage", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_import_media",
    "Import video, audio, graphics, or image sequences into the active Premiere Pro project. An After Effects project (.aep) " +
      "is imported through Dynamic Link: the comps named in aeCompNames, or all of them.",
    {
      filePaths: z.array(z.string()).min(1).describe("Array of absolute file paths to import."),
      aeCompNames: z
        .array(z.string())
        .optional()
        .describe("For .aep files: comps to bring in by Dynamic Link (default: every comp)."),
      targetBinName: z.string().optional().describe("Optional destination bin name."),
      importAsNumberedStills: z.boolean().optional().default(false)
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.media.import", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_get_sequence_state",
    "Get the complete state of the active Premiere Pro sequence: frame size, playhead position, all video tracks (V1..Vn), audio tracks (A1..An), and clips with start/end/duration.",
    {},
    async () => {
      try {
        const res = await router.dispatch("premiere", "pr.sequence.getState", {});
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_organize_project",
    "Organise a Premiere project: items at the root go into bins by type (01 Sequencias, 02 Video, 03 Audio, 04 " +
      "Graficos, 05 Imagens; created when missing, existing bins untouched). Also lists the tracks of the active sequence " +
      "with their clip counts, to check the rule V1 main video, V2 cover, V3 graphics; A1 voice, A2 music, A3 effects. " +
      "apply: false (default) only reports.",
    { apply: z.boolean().optional().default(false) },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.organize", params, { undoGroup: "MCP: Organize project", timeoutMs: 60000 });
        const d = (res.data || {}) as Record<string, unknown>;
        if (!params.apply) d.next = "Call again with apply: true to move the items into the bins.";
        return formatSuccessResponse(d);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_duplicate_sequence",
    "Duplicate a sequence (default: the active one) to work on a copy and leave the user's edit untouched; renames it, " +
      "optionally moves it to a bin (created if missing) and makes it active. Effects, Color Mode and nests come along.",
    {
      sequenceName: z.string().optional().describe("Sequence to copy (default: active)."),
      newName: z.string().optional().describe("Name of the copy (default: Premiere's 'Copy' name)."),
      targetBinName: z.string().optional(),
      activate: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.sequence.duplicate", params, { undoGroup: "MCP: Duplicate sequence" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_create_sequence",
    "Create a new sequence in Premiere Pro without opening the New Sequence dialog: from an imported clip (its format), or from a sequence preset file (default: HD 1080p 29.97 fps; change the size afterwards with the sequence settings).",
    {
      name: z.string().default("Main Sequence"),
      presetPath: z.string().optional().describe("A .sqpreset file. Default: the app's HD 1080p 29.97 fps preset."),
      fromClipName: z.string().optional().describe("Create sequence matching the settings of this project clip."),
      empty: z.boolean().optional().describe("With fromClipName: keep the clip's format but remove the clip from the new timeline.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.sequence.create", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_place_clip_on_timeline",
    "Insert (ripple) or overwrite a project clip onto a video/audio track in the active Premiere Pro sequence at a specified time in seconds.",
    {
      clipNameOrPath: z.string().describe("Name or media path of the imported ProjectItem."),
      mode: z.enum(["overwrite", "insert"]).optional().default("overwrite"),
      videoTrackIndex: z.number().int().min(0).optional().default(0).describe("0-based video track index (0 = V1)."),
      timeSeconds: z.coerce.number().min(0).optional().default(0).describe("Timeline position in seconds.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.timeline.placeClip", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_modify_timeline_clip",
    "Enable/disable, remove (with or without ripple), or modify intrinsic/effect component properties (Motion Position, Scale, Rotation, Opacity, Volume, etc.) of a clip on the timeline.",
    {
      trackType: z.enum(["video", "audio"]).optional().default("video"),
      trackIndex: z.number().int().min(0).default(0).describe("0-based track index."),
      clipIndex: z.number().int().min(0).default(0).describe("0-based clip index on the track."),
      disabled: z.boolean().optional(),
      remove: z.boolean().optional().default(false),
      ripple: z.boolean().optional().default(false),
      alignToVideo: z.boolean().optional().default(true),
      componentName: z.string().optional().describe("Component displayName or matchName (e.g. 'Motion', 'Opacity', 'Volume')."),
      componentProperties: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Map of property displayName to value (e.g. { 'Scale': 120, 'Rotation': 15 }).")
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.timeline.modifyClip", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_manage_markers",
    "List or add timeline markers on the active Premiere Pro sequence.",
    {
      operation: z.enum(["list", "add"]).default("list"),
      timeSeconds: z.coerce.number().min(0).optional().default(0),
      durationSeconds: z.number().min(0).optional(),
      name: z.string().optional(),
      comments: z.string().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.markers.manage", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_list_effects",
    "Search the video effects, audio effects, video transitions or audio transitions installed in Premiere Pro " +
      "(native and third-party). Names follow Premiere's interface language and are what pr_apply_effect / pr_apply_transition expect.",
    {
      kind: z.enum(["videoEffects", "audioEffects", "videoTransitions", "audioTransitions"]).default("videoEffects"),
      search: z.string().optional().describe("Words to look for; accents and case are ignored."),
      limit: z.number().int().positive().max(2000).optional().default(300),
      refresh: z.boolean().optional().default(false)
    },
    async ({ kind, search, limit, refresh }) => {
      try {
        const names = await prNameCache.get(
          kind,
          async () => {
            const res = await router.dispatch("premiere", "pr.effect.list", { kind }, { timeoutMs: 60000 });
            return ((res.data as { names?: string[] }).names || []) as string[];
          },
          refresh
        );
        const tokens = normalizeText(search || "").split(/\s+/).filter(Boolean);
        const matched = names.filter((n) => tokens.every((t) => normalizeText(n).includes(t))).sort((a, b) => a.localeCompare(b));
        return formatSuccessResponse({ kind, installed: names.length, matched: matched.length, truncated: matched.length > limit, names: matched.slice(0, limit) });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_apply_transition",
    "Apply a video or audio transition (e.g. Cross Dissolve, Dip to Black, Constant Power) to one clip edge or to EVERY cut " +
      "between adjacent clips of a track in the active sequence. Clip indices are 0-based and ignore gaps.",
    {
      ...ClipTarget,
      transitionName: z.string().describe("Transition name as listed by pr_list_effects (kind videoTransitions/audioTransitions)."),
      allCuts: z.boolean().optional().default(false).describe("Apply at every cut where two clips touch on this track."),
      position: z.enum(["start", "end", "both"]).optional().default("end").describe("Clip edge when allCuts is false."),
      durationSeconds: z.number().positive().optional().describe("Transition length; default = Premiere's default duration.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.transition.apply", params, { timeoutMs: 120000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(await withPrSuggestions(router, err, params.transitionName, params.trackType === "audio" ? "audioTransitions" : "videoTransitions"));
      }
    }
  );

  server.tool(
    "pr_apply_effect",
    "Apply any installed video/audio effect to one clip, several clips or all clips of a track, optionally setting parameters " +
      "and keyframes. Returns the new effect's parameters with their current values (readback).",
    {
      ...ClipTarget,
      clipIndices: z.array(z.number().int().min(0)).optional().describe("Several clips at once."),
      allClips: z.boolean().optional().default(false).describe("Every clip on the track."),
      effectName: z.string().describe("Effect name as listed by pr_list_effects."),
      parameters: z.record(z.string(), z.unknown()).optional().describe("Parameter display name → value."),
      keyframes: z
        .array(z.object({ parameter: z.string(), time: z.number().describe("Seconds in sequence time."), value: z.unknown() }))
        .optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.effect.apply", params, { timeoutMs: 120000 });
        const asked = [...Object.keys(params.parameters || {}), ...(params.keyframes || []).map((k) => k.parameter)];
        return formatSuccessResponse(compactEffectReadback(res.data, asked));
      } catch (err) {
        return formatErrorResponse(await withPrSuggestions(router, err, params.effectName, params.trackType === "audio" ? "audioEffects" : "videoEffects"));
      }
    }
  );

  server.tool(
    "pr_list_clip_effects",
    "Readback: every effect (component) on a clip — Motion, Opacity, Volume and applied effects — with parameter names and current values.",
    { ...ClipTarget },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.effect.listOnClip", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_set_effect_params",
    "Set parameters and keyframes of an effect already on a clip (including Motion: Position/Scale/Rotation, Opacity, Lumetri). " +
      "Find component and parameter names with pr_list_clip_effects.",
    {
      ...ClipTarget,
      clipIndices: z.array(z.number().int().min(0)).optional(),
      allClips: z.boolean().optional().default(false),
      componentName: z.string().optional().describe("Component display name or matchName, e.g. 'Motion', 'Opacity', 'Gaussian Blur'."),
      componentIndex: z.number().int().min(0).optional().describe("0-based component index (alternative to componentName)."),
      parameters: z.record(z.string(), z.unknown()).optional().describe("Parameter display name → static value."),
      keyframes: z
        .array(z.object({ parameter: z.string(), time: z.number().describe("Seconds in sequence time."), value: z.unknown() }))
        .optional()
    },
    async (params) => {
      try {
        if (params.componentName === undefined && params.componentIndex === undefined) {
          throw new Error("Give componentName or componentIndex.");
        }
        const res = await router.dispatch("premiere", "pr.effect.setParams", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_set_volume",
    "Set the volume of audio clips in decibels (converted to Premiere's internal level). 0 dB = unchanged, -6 dB ≈ half loudness.",
    {
      trackIndex: z.number().int().min(0).default(0).describe("0-based audio track index."),
      clipIndex: z.number().int().min(0).optional().default(0),
      clipIndices: z.array(z.number().int().min(0)).optional(),
      allClips: z.boolean().optional().default(false),
      db: z.number().min(-96).max(15).describe("Gain in dB.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.audio.setVolume", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_export_frame_or_sequence",
    "Export the current Program Monitor frame as a PNG (returning base64 ImageContent for visual inspection) or render the full sequence to disk.",
    {
      mode: z.enum(["frame", "sequence"]).default("frame"),
      timeSeconds: z.coerce.number().min(0).optional().describe("frame: move the playhead to this time first (default: current playhead)."),
      outputPath: z.string().optional().describe("Absolute path for the exported frame PNG or rendered media."),
      presetPath: z.string().optional().describe("Path to .epr Adobe Media Encoder preset when mode='sequence'."),
      queueInAME: z
        .boolean()
        .optional()
        .describe("sequence: render in Adobe Media Encoder in the background (returns at once with a jobId; check the file afterwards). Recommended for anything over ~30 s."),
      includeImageContent: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.export.frameOrSequence", params, {
          timeoutMs: params.mode === "sequence" && !params.queueInAME ? 600000 : undefined
        });
        const dataObj = (res.data || {}) as Record<string, unknown>;
        if (params.mode === "frame") {
          return buildImageToolResponse(dataObj, {
            filePath: typeof dataObj.outputPath === "string" ? dataObj.outputPath : params.outputPath,
            base64Data: res.previewBase64 || (typeof dataObj.previewBase64 === "string" ? dataObj.previewBase64 : undefined),
            includeImageContent: params.includeImageContent
          });
        }
        if ((params.queueInAME || dataObj.engine === "media-encoder") && typeof dataObj.outputPath === "string") {
          const job = watchRender(dataObj.outputPath, `AME ${path.basename(dataObj.outputPath)}`);
          return formatSuccessResponse({ ...dataObj, renderJobId: job.id, next: `Poll media_job_status { jobId: "${job.id}" }: done when the file stops growing.` });
        }
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_import_captions",
    "Import an SRT (or SCC/XML) as a caption track of the active sequence, starting at startSeconds. Build the SRT " +
      "with media_transcribe / media_build_captions (glossary, line length, re-timed to the cut). Styling is done " +
      "with a caption style in Premiere (not scriptable); for styled, animated captions use pr_captions_as_mogrt. " +
      "Needs the CEP panel (creation) and, to confirm the result, the UXP panel.",
    {
      filePath: z.string().describe("Absolute path to the .srt."),
      startSeconds: z.number().min(0).optional().default(0),
      format: z.enum(["subtitle", "cea608", "cea708", "teletext", "ebu", "op42", "op47"]).optional().default("subtitle")
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.captions.import", params, { timeoutMs: 60000 });
        const data = (res.data ?? {}) as Record<string, unknown>;
        // ExtendScript cannot see caption tracks in Premiere 27 (counts come back -1): confirm through the UXP panel.
        try {
          const chk = await router.dispatch("premiere", "pr.captions.tracks", { operation: "list" }, { preferBridge: "uxp", timeoutMs: 20000 });
          const c = (chk.data ?? {}) as Record<string, unknown>;
          data.verifiedBy = "uxp";
          data.captionTrackCount = c.captionTrackCount;
          data.tracks = c.tracks;
        } catch (_e) {
          data.verifiedBy = null;
          data.verifyNote = "Open the Junior Rocha MCP UXP panel to confirm the caption track and its blocks (pr_caption_tracks).";
        }
        return formatSuccessResponse(data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_caption_tracks",
    "Native caption tracks of the active sequence, through the Premiere UXP panel (ExtendScript cannot see them): " +
      "list tracks and their blocks (start/end), mute/unmute (hide/show) or rename a track. Block text and style are " +
      "not exposed to scripts; for styled captions use pr_captions_as_mogrt.",
    {
      operation: z.enum(["list", "mute", "unmute", "rename"]).optional().default("list"),
      trackIndex: z.number().int().min(0).optional().default(0),
      name: z.string().optional().describe("rename: the new track name."),
      maxBlocks: z.number().int().positive().optional().default(500)
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.captions.tracks", params, { preferBridge: "uxp", timeoutMs: 30000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_native_transcript",
    "Premiere's own speech-to-text (Text panel), through the Premiere UXP panel: list the languages and which are installed, " +
      "start the transcription of a clip of the Project panel, check whether a clip has a transcript, or read it back as " +
      "lines (and per-word times). The transcript stays in the project, so the editor can use it for text-based editing " +
      "and captions. No cloud credits: it runs on the machine with the installed language pack.",
    {
      operation: z.enum(["languages", "status", "transcribe", "export"]).optional().default("status"),
      clipName: z.string().optional().describe("Clip name in the Project panel (not needed for 'languages')."),
      language: z.string().optional().describe("transcribe: language code from 'languages', e.g. 'pt-pt', 'en-us'."),
      includeWords: z.boolean().optional().describe("export: also return every word with start and duration (seconds)."),
      maxSegments: z.number().int().positive().optional().default(200),
      maxWords: z.number().int().positive().optional().default(2000),
      outputPath: z.string().optional().describe("export/transcribe: also write the full transcript JSON to this file.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.transcript", params, { preferBridge: "uxp", timeoutMs: 70000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_scene_edit_detection",
    "Scene Edit Detection on the clips of one video track of the active sequence, through the Premiere UXP panel: find the " +
      "cuts inside an already edited video and mark them, cut the clip at each one, or create subclips. Use it to break a " +
      "finished video back into shots before re-editing. 'cuts' changes the timeline; 'markers' does not.",
    {
      apply: z.enum(["markers", "cuts", "subclips"]).optional().default("markers"),
      sensitivity: z.enum(["low", "medium", "high"]).optional().default("medium"),
      videoTrackIndex: z.number().int().min(0).optional().default(0),
      clipIndex: z.number().int().min(0).optional().describe("One clip of the track (0-based). Default: every clip of the track.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.scene.detect", params, { preferBridge: "uxp", timeoutMs: 70000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_clip_speed",
    "Speed of a video clip on the timeline: percent (100 normal, 50 half speed, 200 double), reverse, and how the " +
      "in-between frames are made (frameSampling, frameBlending, opticalFlow). The clip keeps the same content, so " +
      "its length changes with the speed (200 % = half as long) and by default the clips after it ripple.",
    {
      trackIndex: z.number().int().min(0).optional().default(0),
      clipIndex: z.number().int().min(0).optional(),
      atSeconds: z.number().optional().describe("Pick the clip under this time instead of by index."),
      speedPercent: z.number().positive().optional(),
      reverse: z.boolean().optional(),
      ripple: z.boolean().optional().default(true),
      keepDuration: z.boolean().optional().describe("Keep the clip's length on the timeline and let the content change instead (default false)."),
      frameInterpolation: z.enum(["frameSampling", "frameBlending", "opticalFlow"]).optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.clip.speed", params, { preferBridge: "cep" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_sequence_points",
    "In/out points, work area and tracks of the active sequence: read them (get), set the sequence in and out points " +
      "(setInOut), set or enable the work area (workArea), or add video/audio tracks (addTracks). Times are seconds.",
    {
      operation: z.enum(["get", "setInOut", "workArea", "addTracks"]).optional().default("get"),
      inSeconds: z.number().min(0).optional(),
      outSeconds: z.number().min(0).optional(),
      enabled: z.boolean().optional().describe("workArea: show and use the work area bar."),
      video: z.number().int().min(0).max(20).optional().describe("addTracks: how many video tracks."),
      audio: z.number().int().min(0).max(20).optional().describe("addTracks: how many audio tracks.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.sequence.points", params, { preferBridge: "cep" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_label_items",
    "Colour labels of items in the Project panel (0-15, in the order of Premiere's label preferences), to mark takes, " +
      "B-roll, music and so on.",
    {
      clipNames: z.array(z.string()).min(1),
      label: z.number().int().min(0).max(15)
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.item.label", params, { preferBridge: "cep" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_color",
    "Colour-correct a clip with Lumetri Color using the same control names as the Lightroom and Camera Raw tools: " +
      "temperature, tint, exposure, contrast, highlights, shadows, whites, blacks, saturation, vibrance, sharpen, fadedFilm. " +
      "Adds the effect if the clip does not have it and returns the values read back. Effect names follow Premiere's " +
      "language; in another language use pr_apply_effect with the listed name. Named looks: " +
      Object.keys(VIDEO_LOOKS).join(", ") +
      " (after the correction, intensity 0.5-0.8). A look the user made by hand stays: use his, not one of these.",
    {
      trackIndex: z.number().int().min(0).optional().default(0),
      clipIndex: z.number().int().min(0).optional(),
      atSeconds: z.number().optional(),
      settings: z.record(z.string(), z.number()).optional().describe("e.g. { exposure: 0.3, contrast: 12, saturation: 110, temperature: 8 }"),
      look: z.enum(Object.keys(VIDEO_LOOKS) as [string, ...string[]]).optional().describe("Named look applied at `intensity`; settings override its values."),
      intensity: z.number().min(0).max(1.5).optional().default(0.7)
    },
    async (params) => {
      try {
        const settings = params.look ? lookSettings(params.look, params.intensity, params.settings ?? {}) : params.settings;
        if (!settings || !Object.keys(settings).length) throw Object.assign(new Error("Give settings or a look."), { code: "INVALID_PARAMS" });
        const res = await router.dispatch("premiere", "pr.color", { ...params, settings }, { preferBridge: "cep" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_expect_project",
    "Safety lock: name the Premiere project this work belongs to. From then on every Premiere command is refused " +
      "(PROJECT_MISMATCH, nothing changed) when another project is the active one - several projects can be open and " +
      "the active one changes when the person clicks. Call it before the first write of a job; clear: true removes it.",
    {
      name: z.string().optional().describe("Project file name, e.g. 'campanha.prproj'."),
      clear: z.boolean().optional()
    },
    async ({ name, clear }) => {
      try {
        if (clear) router.setExpectedProject("premiere", null);
        else if (name) router.setExpectedProject("premiere", name);
        let active: unknown = null;
        try {
          const ping = await router.dispatch("premiere", "adobe.ping", {}, { timeoutMs: 8000 });
          active = (ping.data as Record<string, unknown> | undefined)?.project ?? null;
        } catch (_e) {
          active = null;
        }
        const expected = router.getExpectedProject("premiere");
        return formatSuccessResponse({
          expectedProject: expected,
          activeProject: active,
          matches: expected && typeof active === "string" ? expected.toLowerCase() === active.toLowerCase() : null
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_apply_cut_plan",
    "Edit out pauses: place only the kept ranges (source seconds) of one project clip back to back on a video " +
      "track, audio included, starting at timeSeconds. Get the ranges from media_analyze_audio (cutPlan.keep) and " +
      "re-time the captions with media_build_captions keep=…. Returns where each piece landed.",
    {
      clipNameOrPath: z.string(),
      keep: z.array(z.object({ start: z.number().min(0), end: z.number().min(0) })).min(1),
      timeSeconds: z.number().min(0).optional().default(0),
      videoTrackIndex: z.number().int().min(0).optional().default(0),
      punchIn: z
        .object({
          every: z.number().int().min(2).max(6).optional().default(2).describe("Every Nth piece is punched in (2 = every other)."),
          scale: z.number().min(101).max(140).optional().default(110).describe("Motion scale in % (108-115 reads as a new shot on a talking head).")
        })
        .optional()
        .describe("Hide jump cuts in a talking head: every Nth piece a little closer."),
      audioFadeFrames: z
        .number()
        .int()
        .min(0)
        .max(6)
        .optional()
        .default(2)
        .describe("Constant Power crossfade of this many frames on every audio cut (2-3 for speech: no clicks); 0 = none."),
      audioTrackIndex: z.number().int().min(0).optional().describe("Audio track of the pieces (default: same index as the video track).")
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.cut.assemble", params, { timeoutMs: 70000, undoGroup: "MCP: Cut plan" });
        const d = (res.data || {}) as Record<string, unknown>;
        if (params.audioFadeFrames > 0 && Number(d.segments) > 1) {
          try {
            const au = await router.dispatch("premiere", "pr.audit", {}, { timeoutMs: 30000 });
            const fps = Number((au.data as { fps?: number })?.fps) || 30;
            const tr = await router.dispatch(
              "premiere",
              "pr.transition.apply",
              { trackType: "audio", trackIndex: params.audioTrackIndex ?? params.videoTrackIndex, transitionName: "Constant Power", allCuts: true, durationSeconds: params.audioFadeFrames / fps },
              { timeoutMs: 60000, undoGroup: "MCP: Audio crossfades" }
            );
            d.audioFades = { frames: params.audioFadeFrames, fps, result: tr.data };
          } catch (eFade) {
            d.audioFades = { error: (eFade as Error).message.slice(0, 200), hint: "Run pr_apply_transition trackType audio allCuts." };
          }
        }
        return formatSuccessResponse(d);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_audio_keyframes",
    "Set Volume keyframes (sequence seconds, dB) on audio clips: fades, rides, ducking. Replaces the clip's " +
      "existing volume keyframes unless clearExisting is false.",
    {
      trackIndex: z.number().int().min(0).default(0),
      clipIndex: z.number().int().min(0).optional(),
      clipIndices: z.array(z.number().int().min(0)).optional(),
      allClips: z.boolean().optional(),
      keys: z.array(z.object({ time: z.number().min(0), db: z.number().min(-96).max(15) })).min(1),
      clearExisting: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.audio.keyframes", params, { timeoutMs: 60000, undoGroup: "MCP: Volume keyframes" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_duck_music",
    "Lower a music bed under speech: from speech ranges (sequence seconds — the kept pieces of the voice clips, or " +
      "media_analyze_audio speech) builds volume keyframes (baseDb → baseDb − duckDb with attack/release) on every " +
      "clip of the music track, plus optional fade in/out.",
    {
      trackIndex: z.number().int().min(0).describe("Audio track with the music (0 = A1)."),
      speech: z.array(z.object({ start: z.number().min(0), end: z.number().min(0) })).min(1),
      baseDb: z.number().max(6).optional().default(-6).describe("Music level without speech."),
      duckDb: z.number().optional().default(14).describe("How far it goes down under speech."),
      attack: z.number().min(0).max(2).optional().default(0.25),
      release: z.number().min(0).max(3).optional().default(0.5),
      fadeIn: z.number().min(0).max(5).optional().default(0.6),
      fadeOut: z.number().min(0).max(8).optional().default(1.5),
      startSeconds: z.number().min(0).optional().default(0).describe("Where the music starts on the timeline."),
      endSeconds: z.number().min(0).optional().describe("Where the music must be silent (end of the video).")
    },
    async (params) => {
      try {
        const keys = musicBedKeys(params.speech, {
          baseDb: params.baseDb,
          duckDb: params.duckDb,
          attack: params.attack,
          release: params.release,
          fadeIn: params.fadeIn,
          fadeOut: params.fadeOut,
          endSeconds: params.endSeconds,
          startSeconds: params.startSeconds
        });
        const res = await router.dispatch(
          "premiere",
          "pr.audio.keyframes",
          { trackIndex: params.trackIndex, allClips: true, keys, clearExisting: true },
          { timeoutMs: 60000, undoGroup: "MCP: Duck music" }
        );
        return formatSuccessResponse({ keys: keys.length, ...(res.data as Record<string, unknown>) });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_insert_mogrt",
    "Place a Motion Graphics template (.mogrt — titles, lower thirds, animated captions exported with " +
      "ae_export_mogrt) on a video track and fill its parameters by display name (text fields take plain text). " +
      "Returns the template's parameter names. Missing tracks are added.",
    {
      filePath: z.string().describe("Absolute path to the .mogrt."),
      timeSeconds: z.number().min(0).default(0),
      durationSeconds: z.number().positive().optional(),
      videoTrackIndex: z.number().int().min(0).optional().default(1),
      audioTrackIndex: z.number().int().min(0).optional().default(0),
      values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe("Parameter display name → value, e.g. {'Titel': 'Photoshop Beta'}.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.mogrt.insert", params, { timeoutMs: 60000, undoGroup: "MCP: Insert MOGRT" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_edit_timeline",
    "Edit the active sequence like an editor: razor (cut every track, or listed tracks, at one or more times), extract " +
      "(ripple delete a time range on every unlocked track — the gap closes), slip (change which part of the source " +
      "plays, clip stays put), trim (new start/end edges; the picture stays in sync) and move (by offset or to a time). " +
      "slip/trim/move act on the clip and its linked audio/video (linked: false for one item). Target a clip by " +
      "trackType + trackIndex + clipIndex, or atSeconds on that track. Times snap to frames; the reply reports where " +
      "edits landed. pr_get_sequence_state shows clip indices.",
    {
      operation: z.enum(["razor", "extract", "slip", "trim", "move"]),
      timeSeconds: z.number().min(0).optional().describe("razor: where to cut."),
      times: z.array(z.number().min(0)).optional().describe("razor: several cuts at once."),
      tracks: z
        .array(z.object({ type: z.enum(["video", "audio"]), index: z.number().int().min(0) }))
        .optional()
        .describe("razor: only these tracks (default: all tracks)."),
      startSeconds: z.number().min(0).optional().describe("extract: range start · trim: new clip start."),
      endSeconds: z.number().min(0).optional().describe("extract: range end · trim: new clip end."),
      trackType: z.enum(["video", "audio"]).optional().default("video"),
      trackIndex: z.number().int().min(0).optional().default(0),
      clipIndex: z.number().int().min(0).optional(),
      atSeconds: z.number().min(0).optional().describe("Target the clip under this time on the track."),
      offsetSeconds: z.number().optional().describe("slip: source offset (+ shows later material) · move: shift on the timeline."),
      toSeconds: z.number().min(0).optional().describe("move: new start time."),
      linked: z.boolean().optional().default(true),
      keepPlayhead: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.timeline.edit", params, { timeoutMs: 120000, undoGroup: `MCP: ${params.operation}` });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_auto_reframe",
    "Auto Reframe: make a new sequence in another aspect ratio (9:16, 4:5, 1:1, 16:9) that follows the action in the " +
      "picture — one edit becomes reels, feed and YouTube versions. The new sequence opens; check titles and safe " +
      "areas afterwards (they are reframed with the picture).",
    {
      aspect: z.string().optional().describe("'9:16', '4:5', '1:1', '16:9'."),
      numerator: z.number().int().positive().optional(),
      denominator: z.number().int().positive().optional(),
      motion: z.enum(["slower", "default", "faster"]).optional().describe("How quickly the frame follows the action."),
      newName: z.string().optional(),
      sequenceName: z.string().optional().describe("Source sequence (default: the active one)."),
      useNestedSequences: z.boolean().optional(),
      open: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.sequence.autoReframe", params, { timeoutMs: 600000, undoGroup: "MCP: Auto Reframe" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_captions_as_mogrt",
    "Styled captions: put one Motion Graphics template clip per caption cue (from an SRT, or cues) on a video track, " +
      "with the cue text in the template's text field — font, box, colour and animation come from the .mogrt (e.g. one " +
      "made with ae_export_mogrt). Premiere's native caption track cannot be styled by script; use this when the look " +
      "matters. Build the SRT with media_build_captions (maxLines 1–2, maxChars 16–32). Without filePath it uses the " +
      "built-in caption template (vertical or horizontal by the sequence, scaled to its height; fields: Texto, " +
      "Cor do texto, Cor da caixa, Tamanho, Opacidade da caixa, Altura, Entrada animada - set them with extraValues).",
    {
      filePath: z.string().optional().describe("The caption .mogrt (default: the built-in template)."),
      srtPath: z.string().optional(),
      cues: z.array(z.object({ start: z.number().min(0), end: z.number().min(0), text: z.string() })).optional(),
      textParam: z.string().optional().describe("Display name of the text parameter (default: the template's first text field)."),
      extraValues: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe("Same values on every clip (e.g. a colour)."),
      offsetSeconds: z.number().optional().describe("Shift every cue (cue times are relative to the sequence start)."),
      videoTrackIndex: z.number().int().min(0).optional().default(2),
      audioTrackIndex: z.number().int().min(0).optional().default(0),
      maxCues: z.number().int().positive().optional().default(400)
    },
    async (params) => {
      try {
        let cues = params.cues ?? [];
        if (params.srtPath) cues = parseSrt(fs.readFileSync(params.srtPath, "utf8")).map((c) => ({ start: c.start, end: c.end, text: c.text }));
        if (!cues.length) throw new Error("Give srtPath or cues.");
        if (cues.length > (params.maxCues ?? 400)) throw new Error(`${cues.length} cues is more than maxCues (${params.maxCues}); split the file or raise maxCues.`);
        const res = await router.dispatch(
          "premiere",
          "pr.mogrt.captions",
          {
            ...params,
            cues,
            srtPath: undefined,
            defaultTemplates: params.filePath
              ? undefined
              : {
                  vertical: path.join(CAPTION_TEMPLATES_DIR, "Legenda MCP Vertical.mogrt"),
                  horizontal: path.join(CAPTION_TEMPLATES_DIR, "Legenda MCP Horizontal.mogrt")
                }
          },
          { timeoutMs: Math.min(1800000, 60000 + cues.length * 4000), undoGroup: "MCP: Captions as MOGRT" }
        );
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_audit_timeline",
    "Check the active sequence before export: gaps on V1/A1 (black or silence), gap at start/end, offline media, " +
      "disabled clips, muted tracks with clips, speed changes, frame size vs format; with renderPath, also loudness " +
      "(target −14 LUFS ±1.5, peak ≤ −1 dB) and render duration. Returns findings by severity.",
    {
      format: z.enum(Object.keys(FORMATS) as [string, ...string[]]).optional(),
      renderPath: z.string().optional().describe("Rendered file to measure loudness (needs ffmpeg)."),
      targetLufs: z.number().optional().describe("Default −14 (social/YouTube); −16 for podcasts and long talks."),
      gapTracks: z
        .array(z.object({ kind: z.enum(["video", "audio"]), index: z.number().int().min(0) }))
        .optional()
        .describe("Tracks that must not have gaps (default V1 and A1).")
    },
    async (params) => {
      try {
        const res = await router.dispatch("premiere", "pr.audit", {}, { timeoutMs: 60000 });
        const data = res.data as PrAuditData;
        let loudness;
        let peakMoments: number[] = [];
        if (params.renderPath) {
          const samples = await loadAudio(params.renderPath, 16000);
          loudness = measureLoudness(samples, 16000);
          peakMoments = hotSpots(samples, 16000, -1);
        }
        const findings = auditPremiere(data, { format: params.format, loudness, targetLufs: params.targetLufs, gapTracks: params.gapTracks });
        if (peakMoments.length) {
          findings.push({
            severity: "warn",
            code: "AUDIO_PEAKS",
            message: `Audio above -1 dBFS at ${peakMoments.map((t) => `${t.toFixed(1)} s`).join(", ")}: lower those clips (pr_set_volume / pr_audio_keyframes) or normalise the render (media_normalize_loudness).`
          });
        }
        return formatSuccessResponse({
          sequence: data.sequence,
          size: `${data.width}×${data.height}`,
          fps: data.fps,
          duration: data.durationSeconds,
          ...summarize(findings),
          findings,
          loudness: loudness ?? null
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_execute_uxp_script",
    "Premiere Pro UXP escape hatch: execute arbitrary async JavaScript in Premiere Pro's UXP environment with `ppro` (the premierepro module), `project` (the active project) and `uxp` in scope; `return` the result. Requires the Premiere UXP panel.",
    {
      code: z.string().describe("Async JavaScript body to execute in Premiere UXP."),
      transactionName: z.string().optional().default("MCP Premiere UXP Action")
    },
    async ({ code, transactionName }) => {
      try {
        const res = await router.dispatch(
          "premiere",
          "pr.raw.executeUxp",
          { code, transactionName },
          { undoGroup: transactionName, preferBridge: "uxp" }
        );
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "pr_execute_extendscript",
    "Premiere Pro ExtendScript + QE DOM escape hatch: execute arbitrary .jsx ExtendScript in Premiere Pro with `app.project` and `qe.project` (`app.enableQE()`) enabled.",
    {
      code: z.string().describe("ExtendScript (ES3) code to evaluate in Premiere Pro."),
      enableQE: z.boolean().optional().default(true)
    },
    async ({ code, enableQE }) => {
      try {
        const res = await router.dispatch("premiere", "pr.raw.executeExtendScript", {
          code,
          enableQE
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}
