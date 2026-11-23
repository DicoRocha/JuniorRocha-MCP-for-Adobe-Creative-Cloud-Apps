/**
 * Two-pass EBU R128 loudness normalisation with ffmpeg's loudnorm (Instagram/Reels: -14 LUFS, -1.5 dBTP).
 * Streams are mapped by type (0:v? and 0:a:0), never by index: a Media Encoder export put the audio first
 * (stream 0) on 22/11/2026 and an index map normalised the wrong stream.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { MediaToolError, requireFfmpeg, run } from "./ffmpeg.js";

export interface LoudnormTarget {
  lufs: number;
  truePeak: number;
  lra: number;
}

export interface LoudnormMeasure {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

export function measureArgs(input: string, t: LoudnormTarget): string[] {
  return ["-hide_banner", "-nostdin", "-i", input, "-map", "0:a:0", "-af", `loudnorm=I=${t.lufs}:TP=${t.truePeak}:LRA=${t.lra}:print_format=json`, "-f", "null", "-"];
}

/** The JSON block loudnorm prints at the end of stderr. */
export function parseLoudnorm(stderr: string): LoudnormMeasure {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end < start) throw new MediaToolError("MEDIA_DECODE_FAILED", "loudnorm printed no measurement (no audio stream?).");
  const j = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
  for (const k of ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"]) {
    if (j[k] === undefined) throw new MediaToolError("MEDIA_DECODE_FAILED", `loudnorm measurement lacks ${k}.`);
  }
  return j as unknown as LoudnormMeasure;
}

export function applyArgs(input: string, output: string, t: LoudnormTarget, m: LoudnormMeasure, opts: { audioBitrate?: string } = {}): string[] {
  const isAudioOnly = /\.(wav|mp3|m4a|aac|flac)$/i.test(output);
  const filter =
    `loudnorm=I=${t.lufs}:TP=${t.truePeak}:LRA=${t.lra}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:` +
    `measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000,aformat=channel_layouts=stereo`;
  const args = ["-hide_banner", "-nostdin", "-y", "-i", input];
  if (isAudioOnly) {
    args.push("-map", "0:a:0", "-af", filter);
    if (/\.wav$/i.test(output)) args.push("-c:a", "pcm_s16le");
    else args.push("-b:a", opts.audioBitrate ?? "256k");
  } else {
    args.push("-map", "0:v?", "-map", "0:a:0", "-c:v", "copy", "-af", filter, "-c:a", "aac", "-b:a", opts.audioBitrate ?? "256k", "-movflags", "+faststart");
  }
  args.push(output);
  return args;
}

export async function normalizeLoudness(
  input: string,
  output: string,
  target: Partial<LoudnormTarget> = {},
  opts: { audioBitrate?: string } = {}
): Promise<{ outputPath: string; before: { lufs: number; truePeak: number }; after: { lufs: number; truePeak: number }; target: LoudnormTarget }> {
  if (!fs.existsSync(input)) throw new MediaToolError("FILE_NOT_FOUND", `No file at ${input}.`);
  if (path.resolve(input) === path.resolve(output)) throw new MediaToolError("INVALID_PARAMS", "outputPath must differ from filePath (the original is kept).");
  const t: LoudnormTarget = { lufs: target.lufs ?? -14, truePeak: target.truePeak ?? -1.5, lra: target.lra ?? 11 };
  const ff = requireFfmpeg();
  const m1 = await run(ff, measureArgs(input, t), { maxStdout: 1024 });
  const measured = parseLoudnorm(m1.stderr);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const tmp = output.replace(/(\.[^.]+)$/, ".partial$1");
  const r = await run(ff, applyArgs(input, tmp, t, measured, opts), { maxStdout: 1024 });
  if (r.code !== 0 || !fs.existsSync(tmp)) throw new MediaToolError("MEDIA_DECODE_FAILED", `ffmpeg failed: ${r.stderr.slice(-600)}`);
  fs.renameSync(tmp, output);
  const m2 = parseLoudnorm((await run(ff, measureArgs(output, t), { maxStdout: 1024 })).stderr);
  return {
    outputPath: output,
    before: { lufs: Number(measured.input_i), truePeak: Number(measured.input_tp) },
    after: { lufs: Number(m2.input_i), truePeak: Number(m2.input_tp) },
    target: t
  };
}
