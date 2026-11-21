/**
 * pr_assemble_reel (phase 3 recipe): talking-head clips → cut pauses → captions → music bed ducked under speech →
 * timeline audit → optional export, in one call, from pieces that were each validated on their own.
 */
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../core/bridge-router.js";
import { formatErrorResponse, formatSuccessResponse } from "../../core/image-helper.js";
import { auditPremiere, summarize, type PrAuditData } from "../../core/audit.js";
import { FORMATS } from "../../core/formats.js";
import { loadAudio } from "../../media/ffmpeg.js";
import { buildCutPlan, detectSilences, invertRanges, mapTimeThroughCuts, musicBedKeys, type Range } from "../../media/audio-analysis.js";
import { buildCues, toSrt, type Cue } from "../../media/captions.js";
import { transcribeFile } from "../../media/transcribe.js";

const SR = 16000;

/** Speech ranges of a clip expressed on the timeline after its cut plan (clip placed at `offset`). */
export function speechOnTimeline(speech: Range[], keep: Range[], offset: number): Range[] {
  const out: Range[] = [];
  for (const r of speech) {
    // clip each speech range to the kept parts, then map both ends
    for (const k of keep) {
      const s = Math.max(r.start, k.start);
      const e = Math.min(r.end, k.end);
      if (e - s < 0.05) continue;
      const ms = mapTimeThroughCuts(s, keep);
      const me = mapTimeThroughCuts(e - 0.0005, keep);
      if (ms === null || me === null) continue;
      out.push({ start: Math.round((offset + ms) * 1000) / 1000, end: Math.round((offset + me) * 1000) / 1000 });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function registerReelTool(server: McpServer, router: BridgeRouter): void {
  server.tool(
    "pr_assemble_reel",
    "Recipe: talking-head reel in one call. Imports the clips (in order) into a bin, creates the sequence from the first " +
      "clip, removes the pauses of each clip (silence detection → cut plan, audio and video together), transcribes and " +
      "builds captions re-timed to the cuts (styled .mogrt per cue, or Premiere's caption track), lays a music bed on A2 " +
      "trimmed to the edit and ducked under the speech, audits the timeline and can queue the export in Media Encoder. " +
      "Everything stays editable. Transcription needs the optional speech packages (SETUP.bat).",
    {
      clips: z.array(z.string()).min(1).describe("Absolute paths of the talking clips, in order."),
      sequenceName: z.string().optional().default("Reel"),
      binName: z.string().optional().default("Reel MCP"),
      cutPauses: z.boolean().optional().default(true),
      minSilence: z.number().min(0.15).max(3).optional().default(0.45).describe("Pauses at least this long are cut (s)."),
      padding: z.number().min(0).max(1).optional().default(0.1).describe("Breath kept around speech (s)."),
      captions: z.enum(["mogrt", "native", "none"]).optional().describe("Default: mogrt when captionsMogrt is given, else native."),
      captionsMogrt: z.string().optional().describe("Caption .mogrt (e.g. exported with ae_export_mogrt)."),
      captionsTrack: z.number().int().min(1).optional().default(2).describe("Video track for .mogrt captions (0 = V1)."),
      language: z.string().optional().describe("ISO code of the speech (pt, de, en). Empty = detect."),
      model: z.enum(["tiny", "base", "small", "medium"]).optional(),
      glossary: z.record(z.string(), z.string()).optional().describe("Wrong → right, e.g. {'chat de apt': 'ChatGPT'}."),
      terms: z.array(z.string()).optional().describe("Names/brands spelled right; close-sounding runs of words are fixed (e.g. ['Levatio'])."),
      maxChars: z.number().int().min(10).max(60).optional().default(26),
      maxLines: z.number().int().min(1).max(3).optional().default(2),
      uppercase: z.boolean().optional(),
      srtPath: z.string().optional().describe("Where to write the SRT (default: next to the first clip)."),
      musicPath: z.string().optional(),
      musicBaseDb: z.number().max(6).optional().default(-8),
      musicDuckDb: z.number().optional().default(14),
      format: z.enum(Object.keys(FORMATS) as [string, ...string[]]).optional().default("story9x16"),
      exportPath: z.string().optional().describe("Queue the export in Media Encoder to this file (H.264)."),
      presetPath: z.string().optional()
    },
    async (params) => {
      const steps: string[] = [];
      try {
        const all = [...params.clips, ...(params.musicPath ? [params.musicPath] : [])];
        for (const f of all) if (!fs.existsSync(f)) throw new Error(`File not found: ${f}`);
        await router.dispatch("premiere", "pr.media.import", { filePaths: all, targetBinName: params.binName }, { timeoutMs: 180000 });
        steps.push(`importado: ${all.length} arquivo(s) no bin "${params.binName}"`);
        const created = (
          await router.dispatch(
            "premiere",
            "pr.sequence.create",
            { name: params.sequenceName, fromClipName: path.basename(params.clips[0]), empty: true },
            { timeoutMs: 60000 }
          )
        ).data as { clearedClips?: number };
        if (typeof created?.clearedClips !== "number") {
          throw new Error(
            "The Premiere panel is running older MCP handlers (the new sequence still holds the clip). Run SETUP.bat " +
              "(it reinstalls the panel files), reopen the MCP panel in Premiere and call again; delete the sequence and bin just created."
          );
        }
        steps.push(`sequência "${params.sequenceName}" criada a partir de ${path.basename(params.clips[0])}`);

        const captionMode = params.captions ?? (params.captionsMogrt ? "mogrt" : "native");
        let t = 0;
        const speechAll: Range[] = [];
        const cues: Cue[] = [];
        const clipReport = [];
        for (const clip of params.clips) {
          const samples = await loadAudio(clip, SR);
          const duration = samples.length / SR;
          const { silences } = detectSilences(samples, SR, { minSilence: params.minSilence });
          const speech = invertRanges(silences, duration);
          const plan = params.cutPauses ? buildCutPlan(speech, duration, { padding: params.padding }) : { keep: [{ start: 0, end: duration }], newDuration: duration };
          const placed = (
            await router.dispatch(
              "premiere",
              "pr.cut.assemble",
              { clipNameOrPath: clip, keep: plan.keep, timeSeconds: t, videoTrackIndex: 0 },
              { timeoutMs: 120000, undoGroup: "MCP: Reel cut" }
            )
          ).data as { endSeconds: number; segments: number };
          speechAll.push(...speechOnTimeline(speech, plan.keep, t));
          if (captionMode !== "none") {
            const tr = await transcribeFile(clip, { language: params.language, model: params.model });
            const c = buildCues(tr, { keep: plan.keep, glossary: params.glossary, terms: params.terms, maxChars: params.maxChars, maxLines: params.maxLines, uppercase: params.uppercase });
            for (const cue of c) cues.push({ ...cue, index: cues.length + 1, start: Math.round((cue.start + t) * 1000) / 1000, end: Math.round((cue.end + t) * 1000) / 1000 });
          }
          clipReport.push({ clip: path.basename(clip), original: Math.round(duration * 100) / 100, kept: Math.round(plan.newDuration * 100) / 100, pieces: placed.segments, start: t, end: placed.endSeconds });
          t = placed.endSeconds;
        }
        steps.push(`cortes: ${clipReport.map((c) => `${c.clip} ${c.original}s → ${c.kept}s`).join("; ")}`);

        let captionsInfo: unknown = null;
        if (captionMode !== "none" && cues.length) {
          const srt = params.srtPath ?? path.join(path.dirname(params.clips[0]), `${params.sequenceName}.srt`);
          fs.mkdirSync(path.dirname(srt), { recursive: true });
          fs.writeFileSync(srt, toSrt(cues), "utf8");
          if (captionMode === "mogrt") {
            if (!params.captionsMogrt) throw new Error("captions 'mogrt' needs captionsMogrt.");
            captionsInfo = (
              await router.dispatch(
                "premiere",
                "pr.mogrt.captions",
                { filePath: params.captionsMogrt, cues: cues.map((c) => ({ start: c.start, end: c.end, text: c.text })), videoTrackIndex: params.captionsTrack },
                { timeoutMs: Math.min(1800000, 60000 + cues.length * 4000), undoGroup: "MCP: Reel captions" }
              )
            ).data;
          } else {
            captionsInfo = (await router.dispatch("premiere", "pr.captions.import", { filePath: srt, startSeconds: 0 }, { timeoutMs: 60000 })).data;
          }
          steps.push(`legendas: ${cues.length} bloco(s) (${captionMode}), SRT em ${srt}`);
        }

        let musicInfo: unknown = null;
        if (params.musicPath) {
          musicInfo = (
            await router.dispatch(
              "premiere",
              "pr.audio.placeBed",
              { clipNameOrPath: params.musicPath, audioTrackIndex: 1, startSeconds: 0, endSeconds: t },
              { timeoutMs: 60000 }
            )
          ).data;
          const keys = musicBedKeys(speechAll, { baseDb: params.musicBaseDb, duckDb: params.musicDuckDb, startSeconds: 0, endSeconds: t });
          await router.dispatch(
            "premiere",
            "pr.audio.keyframes",
            { trackIndex: 1, allClips: true, keys, clearExisting: true },
            { timeoutMs: 60000, undoGroup: "MCP: Reel ducking" }
          );
          steps.push(`trilha em A2 até ${t.toFixed(2)} s, abaixando ${params.musicDuckDb} dB sob ${speechAll.length} trecho(s) de fala`);
        }

        const audit = (await router.dispatch("premiere", "pr.audit", {}, { timeoutMs: 60000 })).data as PrAuditData;
        const findings = auditPremiere(audit, { format: params.format });
        let exportInfo: unknown = null;
        if (params.exportPath) {
          exportInfo = (
            await router.dispatch(
              "premiere",
              "pr.export.frameOrSequence",
              { mode: "sequence", outputPath: params.exportPath, presetPath: params.presetPath, queueInAME: true },
              { timeoutMs: 120000 }
            )
          ).data;
          steps.push(`export enfileirado no Media Encoder: ${params.exportPath} (confira o loudness depois com pr_audit_timeline renderPath)`);
        }
        return formatSuccessResponse({
          sequence: params.sequenceName,
          duration: Math.round(t * 100) / 100,
          steps,
          clips: clipReport,
          captions: captionsInfo,
          music: musicInfo,
          ...summarize(findings),
          findings,
          export: exportInfo
        });
      } catch (err) {
        const res = formatErrorResponse(err);
        if (steps.length) res.content.push({ type: "text", text: `Etapas concluídas antes do erro:\n- ${steps.join("\n- ")}` });
        return res;
      }
    }
  );
}
