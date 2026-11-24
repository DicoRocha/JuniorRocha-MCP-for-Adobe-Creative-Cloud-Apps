/**
 * App-independent media tools that run in the MCP server: transcription, captions, audio analysis
 * (silences → cut plan, beats, loudness) and ducking keyframes. Their output feeds the Premiere tools
 * (pr_import_captions, pr_apply_cut_plan, pr_duck_music) and the skills video-reels / video-legendas-e-som.
 */
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatErrorResponse, formatSuccessResponse } from "../../core/image-helper.js";
import { buildCues, toSrt, parseSrt, Transcript, Glossary } from "../../media/captions.js";
import {
  measureLoudness,
  detectSilences,
  invertRanges,
  buildCutPlan,
  detectBeats,
  duckingKeyframes,
  Range
} from "../../media/audio-analysis.js";
import { loadAudio } from "../../media/ffmpeg.js";
import { normalizeLoudness } from "../../media/loudnorm.js";
import { decodeImageRgb } from "../../media/ffmpeg.js";
import { zoneMap, zoneReport } from "../../media/zones.js";
import { encodePng } from "../../core/png.js";
import { kitCaptionTerms } from "../../core/brand-kit.js";
import { balanceLines } from "../../media/balance.js";
import { transcribeFile, WhisperSize } from "../../media/transcribe.js";
import { runJob, getJob, jobView, listJobs } from "../../media/jobs.js";

const RangeSchema = z.object({ start: z.number().min(0), end: z.number().min(0) });

const CueStyle = {
  maxChars: z.number().int().min(10).max(60).optional().describe("Characters per line (reels 24–32, widescreen 42). Default 32."),
  maxLines: z.number().int().min(1).max(3).optional().describe("Lines per caption (reels 1–2). Default 2."),
  minDuration: z.number().min(0.3).max(3).optional(),
  maxDuration: z.number().min(1).max(8).optional(),
  uppercase: z.boolean().optional(),
  stripPunctuation: z.boolean().optional(),
  glossary: z
    .record(z.string(), z.string())
    .optional()
    .describe("Corrections 'wrong' → 'right' applied before splitting, e.g. {'chat GPP': 'ChatGPT', 'em camadas': 'em camadas'}."),
  terms: z
    .array(z.string())
    .optional()
    .describe("Names and brands spelled right (5+ letters); runs of 1–3 words that sound close are fixed, e.g. ['Levatio', 'ChatGPT', 'Invisalign'].")
};

function sidecar(file: string, outputDir: string | undefined, ext: string): string {
  const dir = outputDir || path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${path.basename(file).replace(/\.[^.]+$/, "")}${ext}`);
}

export function registerMediaTools(server: McpServer): void {
  server.tool(
    "media_transcribe",
    "Transcribe speech in a video or audio file locally (Whisper via sherpa-onnx, CPU, no cloud; the model downloads " +
      "once from GitHub). Writes <name>.transcript.json and <name>.srt next to the file (or in outputDir) and returns " +
      "the segments. Long files continue as a job: poll media_job_status. Then fix names with a glossary in " +
      "media_build_captions and import with pr_import_captions.",
    {
      filePath: z.string().describe("Absolute path to a video or audio file."),
      language: z.string().optional().describe("ISO code of the spoken language (pt, de, en…). Empty = detect."),
      model: z.enum(["tiny", "base", "small", "medium"]).optional().default("small"),
      wordTimestamps: z
        .boolean()
        .optional()
        .describe("Real time of every word (Parakeet TDT v3; ~480 MB download once). Also writes <name>.words.json for word-by-word animated captions. Use it for any animated caption."),
      outputDir: z.string().optional(),
      ...CueStyle,
      waitSeconds: z.number().min(0).max(60).optional().default(45)
    },
    async (p) => {
      try {
        const job = await runJob(
          "transcribe",
          async () => {
            const t = await transcribeFile(p.filePath, { language: p.language, model: p.model as WhisperSize, wordTimestamps: p.wordTimestamps });
            const jsonPath = sidecar(p.filePath, p.outputDir, ".transcript.json");
            fs.writeFileSync(jsonPath, JSON.stringify(t, null, 1), "utf8");
            let wordsPath: string | undefined;
            if (p.wordTimestamps) {
              wordsPath = sidecar(p.filePath, p.outputDir, ".words.json");
              const words = t.segments.flatMap((sg) => sg.words ?? []);
              fs.writeFileSync(wordsPath, JSON.stringify({ language: t.language, duration: t.duration, words }, null, 1), "utf8");
            }
            const cues = buildCues(t, p);
            const srtPath = sidecar(p.filePath, p.outputDir, ".srt");
            fs.writeFileSync(srtPath, toSrt(cues), "utf8");
            return {
              transcriptPath: jsonPath,
              wordsPath,
              srtPath,
              language: t.language,
              duration: t.duration,
              model: t.model,
              downloaded: t.downloaded,
              segments: t.segments,
              cues: cues.length
            };
          },
          (p.waitSeconds ?? 45) * 1000,
          path.basename(p.filePath)
        );
        return formatSuccessResponse(jobView(job));
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "media_normalize_loudness",
    "Normalise the loudness of a video or audio file in two passes (EBU R128 loudnorm): default -14 LUFS and -1.5 dBTP " +
      "for Instagram/Reels. Video is copied untouched; streams are mapped by type. Writes a new file (the original stays) " +
      "and reports the level before and after. Long files become a job: poll media_job_status.",
    {
      filePath: z.string(),
      outputPath: z.string().describe("New file (must differ from filePath). .wav/.mp3/.m4a = audio only."),
      lufs: z.number().min(-36).max(-5).optional().default(-14),
      truePeak: z.number().min(-9).max(0).optional().default(-1.5),
      lra: z.number().min(1).max(20).optional().default(11),
      waitSeconds: z.number().int().min(0).max(55).optional().default(45)
    },
    async (p) => {
      try {
        const job = await runJob(
          "loudness",
          () => normalizeLoudness(p.filePath, p.outputPath, { lufs: p.lufs, truePeak: p.truePeak, lra: p.lra }),
          p.waitSeconds * 1000,
          path.basename(p.filePath)
        );
        if (job.status === "failed") throw Object.assign(new Error(job.error?.message), { code: job.error?.code });
        return formatSuccessResponse(job.status === "done" ? job.result : jobView(job));
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "media_zone_report",
    "Zone System report of a photo or a video frame (CIE L*: zone 0 = black … X = white): percent per zone, clipped " +
      "shadows/highlights, mean L*, key (low/mid/high), colour cast of the midtones and a diagnosis (FLAT, NO_BLACK, " +
      "HIGHLIGHTS_CLIPPED, MIDTONE_CAST…). Optional zone map PNG (each pixel painted with its zone grey). Use before and after a grade.",
    {
      filePath: z.string().describe("Image (jpg, png, tif, exported preview) or video."),
      atSeconds: z.number().min(0).optional().describe("Video: the frame to read."),
      width: z.number().int().min(64).max(2048).optional().default(512).describe("Analysis width (the image is scaled down)."),
      zoneMapPath: z.string().optional().describe("Write the zone map PNG here.")
    },
    async (p) => {
      try {
        const img = await decodeImageRgb(p.filePath, p.width, p.atSeconds);
        const report = zoneReport(img.data);
        let zoneMapFile: string | undefined;
        if (p.zoneMapPath) {
          fs.mkdirSync(path.dirname(p.zoneMapPath), { recursive: true });
          fs.writeFileSync(p.zoneMapPath, encodePng({ width: img.width, height: img.height, data: zoneMap(img.data) }));
          zoneMapFile = p.zoneMapPath;
        }
        return formatSuccessResponse({ filePath: p.filePath, size: `${img.width}×${img.height}`, ...report, ...(zoneMapFile ? { zoneMapPath: zoneMapFile } : {}) });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "media_job_status",
    "Status and result of a media job (media_transcribe, media_analyze_audio on long files). Without jobId, lists the jobs.",
    { jobId: z.string().optional() },
    async ({ jobId }) => {
      try {
        if (!jobId) return formatSuccessResponse({ jobs: listJobs().map((j) => ({ jobId: j.id, kind: j.kind, status: j.status, label: j.label })) });
        const job = getJob(jobId);
        if (!job) throw Object.assign(new Error(`No media job '${jobId}' (jobs are kept for an hour).`), { code: "INVALID_PARAMS" });
        return formatSuccessResponse(jobView(job));
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "media_build_captions",
    "Turn a transcript (file from media_transcribe, or segments) into caption cues and an SRT: glossary fixes, " +
      "line length, lines per cue, minimum time on screen, optional upper case. Pass keep (the cut plan's kept " +
      "ranges, in source seconds) to re-time the captions to the edited clip. Also re-styles an existing SRT.",
    {
      transcriptPath: z.string().optional(),
      segments: z.array(z.object({ start: z.number(), end: z.number(), text: z.string() })).optional(),
      srtPath: z.string().optional().describe("Re-style an existing SRT instead of a transcript."),
      keep: z.array(RangeSchema).optional(),
      offsetSeconds: z.number().optional().describe("Shift every cue (e.g. the clip starts at 2.5 s on the timeline)."),
      outputPath: z.string().describe("Where to write the .srt."),
      kitPath: z.string().optional().describe("Brand kit (00_briefing/kit-de-marca.json): its termos, glossario and client name fix the spelling too."),
      ...CueStyle
    },
    async (p) => {
      try {
        let transcript: Transcript;
        if (p.transcriptPath) transcript = JSON.parse(fs.readFileSync(p.transcriptPath, "utf8")) as Transcript;
        else if (p.segments) transcript = { segments: p.segments };
        else if (p.srtPath) transcript = { segments: parseSrt(fs.readFileSync(p.srtPath, "utf8")).map((c) => ({ start: c.start, end: c.end, text: c.text.replace(/\n/g, " ") })) };
        else throw Object.assign(new Error("Give transcriptPath, segments or srtPath."), { code: "INVALID_PARAMS" });
        const fromKit = p.kitPath ? kitCaptionTerms(p.kitPath) : { terms: [], glossary: {} };
        const glossary = { ...fromKit.glossary, ...((p.glossary as Glossary | undefined) ?? {}) };
        const terms = [...new Set([...fromKit.terms, ...((p.terms as string[] | undefined) ?? [])])];
        let cues = buildCues(transcript, {
          ...p,
          glossary: Object.keys(glossary).length ? glossary : undefined,
          terms: terms.length ? terms : undefined,
          keep: p.keep as Range[] | undefined
        });
        if (p.offsetSeconds) cues = cues.map((c) => ({ ...c, start: c.start + p.offsetSeconds!, end: c.end + p.offsetSeconds! }));
        fs.mkdirSync(path.dirname(p.outputPath), { recursive: true });
        fs.writeFileSync(p.outputPath, toSrt(cues), "utf8");
        return formatSuccessResponse({ srtPath: p.outputPath, cues: cues.length, preview: cues.slice(0, 12) });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "text_balance_lines",
    "Break a title or short support text into balanced lines: no single word alone on the last line, lines of similar width, " +
      "no line ending in a connector (de, o, em, the, of…). Give maxChars (box width in characters) and/or the number of lines. " +
      "Use the returned lines as explicit line breaks in the app (works for any app; no document needed).",
    {
      text: z.string().min(1),
      maxChars: z.number().int().min(4).optional().describe("Maximum characters per line."),
      lines: z.number().int().min(1).max(8).optional().describe("Force this number of lines.")
    },
    async (p) => {
      try {
        return formatSuccessResponse(balanceLines(p.text, { maxChars: p.maxChars, lines: p.lines }));
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "media_analyze_audio",
    "Analyse the audio of a file (WAV read directly, others through ffmpeg): loudness (peak, RMS, gated level, " +
      "noise floor), silences and speech ranges, a cut plan that removes pauses (keep/remove ranges for " +
      "pr_apply_cut_plan), beats/BPM for music, and ducking keyframes for a music bed under speech (pr_duck_music).",
    {
      filePath: z.string(),
      analyses: z
        .array(z.enum(["loudness", "silences", "cutPlan", "beats", "ducking"]))
        .optional()
        .default(["loudness", "silences", "cutPlan"]),
      thresholdDb: z.number().max(0).optional().describe("Silence threshold in dBFS (default: noise floor + 12 dB)."),
      minSilence: z.number().min(0.1).optional().describe("Shortest pause counted as silence, s (default 0.4)."),
      padding: z.number().min(0).max(1).optional().describe("Cut plan: breath kept around speech, s (default 0.12)."),
      minGap: z.number().min(0).optional().describe("Cut plan: pauses shorter than this stay (default 0.35)."),
      duckDb: z.number().optional().describe("Ducking: how far the music goes down under speech, dB (default 14)."),
      speechRanges: z.array(RangeSchema).optional().describe("Ducking: speech ranges on the timeline (default: from this file).")
    },
    async (p) => {
      try {
        const samples = await loadAudio(p.filePath, 16000);
        const sr = 16000;
        const duration = samples.length / sr;
        const out: Record<string, unknown> = { filePath: p.filePath, duration: Math.round(duration * 1000) / 1000 };
        const want = new Set(p.analyses);
        if (want.has("loudness")) out.loudness = measureLoudness(samples, sr);
        let speech: Range[] | undefined;
        if (want.has("silences") || want.has("cutPlan") || (want.has("ducking") && !p.speechRanges)) {
          const s = detectSilences(samples, sr, { thresholdDb: p.thresholdDb, minSilence: p.minSilence });
          speech = invertRanges(s.silences, duration);
          if (want.has("silences")) out.silences = { thresholdDb: s.thresholdDb, silences: s.silences, speech };
        }
        if (want.has("cutPlan") && speech) out.cutPlan = buildCutPlan(speech, duration, { padding: p.padding, minGap: p.minGap });
        if (want.has("beats")) {
          const b = detectBeats(samples, sr);
          out.beats = { ...b, beats: b.beats.slice(0, 400), onsets: b.onsets.slice(0, 400) };
        }
        if (want.has("ducking")) out.ducking = duckingKeyframes((p.speechRanges as Range[] | undefined) ?? speech ?? [], { duckDb: p.duckDb });
        return formatSuccessResponse(out);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}
