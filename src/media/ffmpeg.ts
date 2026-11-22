/**
 * Finding and running ffmpeg/ffprobe on the machine that runs the MCP server (Windows with the
 * Adobe apps). Order: JRADB_MCP_FFMPEG → the optional `ffmpeg-static` package → PATH.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";

const require = createRequire(import.meta.url);

export class MediaToolError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

let cachedFfmpeg: string | null | undefined;

function onPath(exe: string): string | null {
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  // macOS apps started from the Dock get a short PATH: add the usual Homebrew / manual install folders.
  if (process.platform === "darwin") dirs.push("/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin");
  const names = process.platform === "win32" ? [`${exe}.exe`, exe] : [exe];
  for (const d of dirs) {
    for (const n of names) {
      const full = path.join(d, n);
      try {
        if (fs.statSync(full).isFile()) return full;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

export function findFfmpeg(): string | null {
  if (cachedFfmpeg !== undefined) return cachedFfmpeg;
  const fromEnv = process.env.JRADB_MCP_FFMPEG;
  if (fromEnv && fs.existsSync(fromEnv)) return (cachedFfmpeg = fromEnv);
  try {
    const p = require("ffmpeg-static") as string | null;
    if (p && fs.existsSync(p)) return (cachedFfmpeg = p);
  } catch {
    /* optional dependency not installed */
  }
  return (cachedFfmpeg = onPath("ffmpeg"));
}

export function requireFfmpeg(): string {
  const p = findFfmpeg();
  if (!p) {
    throw new MediaToolError(
      "FFMPEG_NOT_FOUND",
      "ffmpeg was not found. Install it (winget install Gyan.FFmpeg, or npm install in the MCP folder to get the " +
        "optional ffmpeg-static package) or set JRADB_MCP_FFMPEG to ffmpeg.exe, then restart the MCP server."
    );
  }
  return p;
}

/** Resets the cached lookup (tests). */
export function resetFfmpegCache(): void {
  cachedFfmpeg = undefined;
}

export function run(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; maxStdout?: number; env?: NodeJS.ProcessEnv } = {}
): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, ...(opts.env ? { env: opts.env } : {}) });
    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = "";
    const max = opts.maxStdout ?? 1024 * 1024 * 1024;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill();
          reject(new MediaToolError("MEDIA_TIMEOUT", `${path.basename(cmd)} did not finish within ${opts.timeoutMs} ms.`));
        }, opts.timeoutMs)
      : null;
    child.stdout.on("data", (d: Buffer) => {
      size += d.length;
      if (size <= max) chunks.push(d);
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < 20000) stderr += d.toString();
    });
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? -1, stdout: Buffer.concat(chunks), stderr });
    });
  });
}

/** Timestamp (s) of the first packet of the first video or audio stream, or null when there is none. */
export async function firstPacketSeconds(file: string, kind: "v" | "a"): Promise<number | null> {
  const ffmpeg = requireFfmpeg();
  const res = await run(ffmpeg, ["-v", "error", "-nostdin", "-i", file, "-map", `0:${kind}:0`, "-c", "copy", "-frames:" + kind, "1", "-f", "framemd5", "pipe:1"], {
    timeoutMs: 30000
  });
  if (res.code !== 0) return null;
  const txt = res.stdout.toString();
  const tb = /#tb \d+: (\d+)\/(\d+)/.exec(txt);
  const line = txt.split(/\r?\n/).find((l) => /^\s*\d+,/.test(l));
  if (!tb || !line) return null;
  const pts = Number(line.split(",")[2]); // #stream, dts, pts, ...
  return Number.isFinite(pts) ? (pts * Number(tb[1])) / Number(tb[2]) : null;
}

/**
 * Seconds of audio that come before the first video frame (positive) or after it (negative). Premiere, After
 * Effects and every editor count clip time from the first video frame; ffmpeg's audio decode counts from the first
 * audio sample. Phone recordings often start the audio first (0,34 s on 22/11/2026): without this correction every
 * cut planned from the audio landed 0,34 s late and the first syllable of the next phrase was lost.
 */
export async function audioLeadSeconds(file: string): Promise<number> {
  if (/\.(wav|mp3|aac|m4a|flac|ogg|aif|aiff)$/i.test(file)) return 0;
  const v = await firstPacketSeconds(file, "v");
  const a = await firstPacketSeconds(file, "a");
  if (v === null || a === null) return 0;
  const lead = v - a;
  return Math.abs(lead) < 0.0005 ? 0 : lead;
}

/**
 * Decodes any audio/video file to mono Float32 PCM at sampleRate (optionally only a time range). For video files
 * the samples are aligned to the first video frame (time 0 = what the editors call 0), see audioLeadSeconds.
 */
export async function decodeToPcm(
  file: string,
  sampleRate = 16000,
  range?: { start?: number; duration?: number },
  opts: { alignToVideo?: boolean } = {}
): Promise<Float32Array> {
  if (!fs.existsSync(file)) throw new MediaToolError("FILE_NOT_FOUND", `File not found: ${file}`);
  const ffmpeg = requireFfmpeg();
  const lead = opts.alignToVideo === false ? 0 : await audioLeadSeconds(file);
  const args = ["-v", "error", "-nostdin"];
  if (range?.start) args.push("-ss", String(Math.max(0, range.start + lead)));
  args.push("-i", file);
  if (range?.duration) args.push("-t", String(range.duration));
  args.push("-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "pipe:1");
  const res = await run(ffmpeg, args, { timeoutMs: 10 * 60 * 1000 });
  if (res.code !== 0) throw new MediaToolError("MEDIA_DECODE_FAILED", `ffmpeg could not decode ${file}: ${res.stderr.trim().slice(0, 400)}`);
  const buf = res.stdout;
  const out = new Float32Array(Math.floor(buf.length / 4));
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  if (range?.start || lead === 0) return out;
  // Whole file: drop the audio that plays before the first frame, or pad silence when the audio starts later.
  const n = Math.round(Math.abs(lead) * sampleRate);
  if (lead > 0) return out.subarray(Math.min(n, out.length));
  const padded = new Float32Array(out.length + n);
  padded.set(out, n);
  return padded;
}

/** Writes a 16-bit PCM mono WAV (for tools that want a file). */
export function writeWav(file: string, samples: Float32Array, sampleRate: number): void {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

/** Reads a PCM WAV (8/16/24/32-bit int or 32-bit float) as mono Float32 — no ffmpeg needed. */
export function readWav(file: string): { samples: Float32Array; sampleRate: number } {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new MediaToolError("MEDIA_DECODE_FAILED", `${file} is not a WAV file.`);
  }
  let pos = 12;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") {
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
      if (fmt.format === 0xfffe && size >= 26) fmt.format = buf.readUInt16LE(body + 24);
    } else if (id === "data" && fmt) {
      const bytes = fmt.bits / 8;
      const frames = Math.floor(Math.min(size, buf.length - body) / (bytes * fmt.channels));
      const out = new Float32Array(frames);
      for (let f = 0; f < frames; f++) {
        let acc = 0;
        for (let c = 0; c < fmt.channels; c++) {
          const o = body + (f * fmt.channels + c) * bytes;
          let v: number;
          if (fmt.format === 3 && fmt.bits === 32) v = buf.readFloatLE(o);
          else if (fmt.bits === 16) v = buf.readInt16LE(o) / 32768;
          else if (fmt.bits === 24) v = buf.readIntLE(o, 3) / 8388608;
          else if (fmt.bits === 32) v = buf.readInt32LE(o) / 2147483648;
          else v = (buf.readUInt8(o) - 128) / 128;
          acc += v;
        }
        out[f] = acc / fmt.channels;
      }
      return { samples: out, sampleRate: fmt.rate };
    }
    pos = body + size + (size % 2);
  }
  throw new MediaToolError("MEDIA_DECODE_FAILED", `${file}: no PCM data chunk.`);
}

/** Linear resampling (analysis only: speech recognition gets ffmpeg's resampler). */
export function resampleLinear(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const n = Math.floor((samples.length * to) / from);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * from) / to;
    const i0 = Math.floor(x);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    out[i] = samples[i0] + (samples[i1] - samples[i0]) * (x - i0);
  }
  return out;
}

/** WAV files are read directly; everything else goes through ffmpeg. */
export async function loadAudio(file: string, sampleRate = 16000): Promise<Float32Array> {
  if (/\.wav$/i.test(file)) {
    try {
      const w = readWav(file);
      return resampleLinear(w.samples, w.sampleRate, sampleRate);
    } catch (e) {
      if (!findFfmpeg()) throw e;
    }
  }
  return decodeToPcm(file, sampleRate);
}

/**
 * Decodes one picture (image file, or a video frame at `atSeconds`) to 8-bit RGB scaled to `width` px wide
 * (height keeps the aspect, rounded to even). Used for contact sheets; any format ffmpeg reads works.
 */
export async function decodeImageRgb(file: string, width: number, atSeconds?: number): Promise<{ width: number; height: number; data: Uint8Array }> {
  if (!fs.existsSync(file)) throw new MediaToolError("FILE_NOT_FOUND", `File not found: ${file}`);
  const ffmpeg = requireFfmpeg();
  const args = ["-v", "error", "-nostdin"];
  if (typeof atSeconds === "number") args.push("-ss", String(atSeconds));
  args.push("-i", file, "-frames:v", "1", "-vf", `scale=${width}:-2:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1");
  const res = await run(ffmpeg, args, { timeoutMs: 60000 });
  if (res.code !== 0 || !res.stdout.length) throw new MediaToolError("MEDIA_DECODE_FAILED", `ffmpeg could not read ${file}: ${res.stderr.trim().slice(0, 300)}`);
  const height = Math.round(res.stdout.length / (width * 3));
  if (height * width * 3 !== res.stdout.length) throw new MediaToolError("MEDIA_DECODE_FAILED", `Unexpected frame size for ${file}.`);
  return { width, height, data: new Uint8Array(res.stdout) };
}
