/**
 * Local speech-to-text: Silero VAD cuts the audio into spoken parts, Whisper (sherpa-onnx, int8, CPU)
 * transcribes each one. No cloud. Models come from the sherpa-onnx GitHub releases on first use and
 * are cached (JRADB_MCP_MODELS or %LOCALAPPDATA%/jr-adb-mcp-bridge/models).
 *
 * ExtendScript cannot start Premiere's own Speech to Text (UXP can since 26.5: Transcript.transcribeClipProjectItem,
 * not wired yet, item B26), so the MCP brings its own engine.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { MediaToolError, run, loadAudio } from "./ffmpeg.js";
import { Transcript, TranscriptSegment, Word } from "./captions.js";
import { round } from "./audio-analysis.js";

const require = createRequire(import.meta.url);

export type WhisperSize = "tiny" | "base" | "small" | "medium";

const RELEASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models";

export function modelsDir(): string {
  if (process.env.JRADB_MCP_MODELS) return process.env.JRADB_MCP_MODELS;
  const base = process.platform === "win32" ? process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local") : path.join(os.homedir(), ".cache");
  const dir = path.join(base, "jr-adb-mcp-bridge", "models");
  // Models downloaded by versions that used the old folder name are moved once, instead of downloaded again.
  const legacy = path.join(base, "adobe-" + "unified-mcp");
  try {
    if (!fs.existsSync(dir) && fs.existsSync(path.join(legacy, "models"))) {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      fs.renameSync(path.join(legacy, "models"), dir);
      fs.rmSync(legacy, { recursive: true, force: true });
    }
  } catch {
    // if the move fails the models are simply downloaded again
  }
  return dir;
}

export interface WhisperFiles {
  encoder: string;
  decoder: string;
  tokens: string;
  vad: string;
}

export function whisperFiles(size: WhisperSize, dir = modelsDir()): WhisperFiles {
  const d = path.join(dir, `sherpa-onnx-whisper-${size}`);
  return {
    encoder: path.join(d, `${size}-encoder.int8.onnx`),
    decoder: path.join(d, `${size}-decoder.int8.onnx`),
    tokens: path.join(d, `${size}-tokens.txt`),
    vad: path.join(dir, "silero_vad.onnx")
  };
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new MediaToolError("MODEL_DOWNLOAD_FAILED", `Download failed (${res.status}) for ${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  const out = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!out.write(Buffer.from(value))) await new Promise<void>((r) => out.once("drain", () => r()));
  }
  await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())));
  fs.renameSync(tmp, dest);
}

/** Downloads (once) the VAD and the Whisper model of the given size; returns the file paths. */
export async function ensureWhisperModel(size: WhisperSize, dir = modelsDir()): Promise<WhisperFiles & { downloaded: string[] }> {
  const files = whisperFiles(size, dir);
  const downloaded: string[] = [];
  if (!fs.existsSync(files.vad)) {
    await download(`${RELEASE}/silero_vad.onnx`, files.vad);
    downloaded.push("silero_vad.onnx");
  }
  if (![files.encoder, files.decoder, files.tokens].every((f) => fs.existsSync(f))) {
    const archive = path.join(dir, `sherpa-onnx-whisper-${size}.tar.bz2`);
    if (!fs.existsSync(archive)) await download(`${RELEASE}/sherpa-onnx-whisper-${size}.tar.bz2`, archive);
    // Windows 10+ ships bsdtar (tar.exe), which reads bzip2. Only the int8 models and tokens are extracted.
    const members = [`${size}-encoder.int8.onnx`, `${size}-decoder.int8.onnx`, `${size}-tokens.txt`].map((f) => `sherpa-onnx-whisper-${size}/${f}`);
    const r = await run("tar", ["-xjf", archive, "-C", dir, ...members], { timeoutMs: 10 * 60 * 1000 });
    if (r.code !== 0) throw new MediaToolError("MODEL_DOWNLOAD_FAILED", `Could not unpack ${archive}: ${r.stderr.slice(0, 300)}`);
    try {
      fs.unlinkSync(archive);
    } catch {
      /* keep it */
    }
    downloaded.push(`whisper-${size}`);
  }
  return { ...files, downloaded };
}

export interface ParakeetFiles {
  encoder: string;
  decoder: string;
  joiner: string;
  tokens: string;
  vad: string;
}

const PARAKEET = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8";

export function parakeetFiles(dir = modelsDir()): ParakeetFiles {
  const d = path.join(dir, PARAKEET);
  return {
    encoder: path.join(d, "encoder.int8.onnx"),
    decoder: path.join(d, "decoder.int8.onnx"),
    joiner: path.join(d, "joiner.int8.onnx"),
    tokens: path.join(d, "tokens.txt"),
    vad: path.join(dir, "silero_vad.onnx")
  };
}

/** Downloads (once, ~480 MB compressed) the multilingual Parakeet TDT v3 model, which returns a time for every token. */
export async function ensureParakeetModel(dir = modelsDir()): Promise<ParakeetFiles & { downloaded: string[] }> {
  const files = parakeetFiles(dir);
  const downloaded: string[] = [];
  if (!fs.existsSync(files.vad)) {
    await download(`${RELEASE}/silero_vad.onnx`, files.vad);
    downloaded.push("silero_vad.onnx");
  }
  if (![files.encoder, files.decoder, files.joiner, files.tokens].every((f) => fs.existsSync(f))) {
    const archive = path.join(dir, `${PARAKEET}.tar.bz2`);
    if (!fs.existsSync(archive)) await download(`${RELEASE}/${PARAKEET}.tar.bz2`, archive);
    const members = ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"].map((f) => `${PARAKEET}/${f}`);
    const r = await run("tar", ["-xjf", archive, "-C", dir, ...members], { timeoutMs: 20 * 60 * 1000 });
    if (r.code !== 0) throw new MediaToolError("MODEL_DOWNLOAD_FAILED", `Could not unpack ${archive}: ${r.stderr.slice(0, 300)}`);
    try {
      fs.unlinkSync(archive);
    } catch {
      /* keep it */
    }
    downloaded.push("parakeet-tdt-0.6b-v3");
  }
  return { ...files, downloaded };
}

/**
 * Joins model tokens into words with times. A token that starts with a space (or the SentencePiece "▁") opens a word;
 * punctuation stays with the word before it. A word ends where the next one starts (at most maxWord seconds).
 */
export function tokensToWords(tokens: string[], timestamps: number[], offset: number, segmentEnd: number, maxWord = 1.2): Word[] {
  const words: Word[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i] ?? "";
    const opens = /^[\s\u2581]/.test(raw);
    const piece = raw.replace(/^[\s\u2581]+/, "");
    if (!piece) continue;
    const t = offset + (timestamps[i] ?? 0);
    const isPunct = /^[.,;:!?…»”)\]]+$/.test(piece);
    if ((opens && !isPunct) || words.length === 0) words.push({ start: round(t, 3), end: round(t, 3), word: piece });
    else words[words.length - 1].word += piece;
  }
  for (let i = 0; i < words.length; i++) {
    const next = i + 1 < words.length ? words[i + 1].start : segmentEnd;
    words[i].end = round(Math.max(words[i].start + 0.06, Math.min(next, words[i].start + maxWord)), 3);
  }
  return words;
}

interface SherpaModule {
  OfflineRecognizer: new (config: unknown) => {
    createStream(): { acceptWaveform(o: { samples: Float32Array; sampleRate: number }): void };
    decode(stream: unknown): void;
    getResult(stream: unknown): { text: string; lang?: string; tokens?: string[]; timestamps?: number[] };
  };
  Vad: new (config: unknown, bufferSizeInSeconds: number) => {
    acceptWaveform(samples: Float32Array): void;
    isEmpty(): boolean;
    front(): { samples: Float32Array; start: number };
    pop(): void;
    flush(): void;
  };
}

export function loadSherpa(): SherpaModule {
  try {
    return require("sherpa-onnx-node") as SherpaModule;
  } catch (e) {
    throw new MediaToolError(
      "TRANSCRIBER_NOT_INSTALLED",
      "The speech engine (sherpa-onnx-node) is not installed. Run npm install in the MCP folder " +
        `(SETUP.bat does it) and restart the server. (${e instanceof Error ? e.message : String(e)})`
    );
  }
}

export interface TranscribeOptions {
  language?: string; // ISO code ("pt", "de", "en"); "" = auto
  model?: WhisperSize;
  numThreads?: number;
  /** VAD: pause that ends a spoken part (s) and longest part sent to Whisper (s, ≤ 28). */
  minSilence?: number;
  maxSegment?: number;
  /** Real time of every word (Parakeet TDT v3 token timestamps) — for word-by-word animated captions. */
  wordTimestamps?: boolean;
}

/** Transcribes mono 16 kHz samples. Segment times come from the VAD; text from Whisper. */
export function transcribeSamples(sherpa: SherpaModule, files: WhisperFiles | ParakeetFiles, samples: Float32Array, opts: TranscribeOptions = {}): Transcript {
  const sampleRate = 16000;
  const numThreads = opts.numThreads ?? Math.max(1, Math.min(4, os.cpus().length - 1));
  const withWords = "joiner" in files;
  const recognizer = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate, featureDim: 80 },
    modelConfig: withWords
      ? {
          transducer: { encoder: files.encoder, decoder: files.decoder, joiner: (files as ParakeetFiles).joiner },
          tokens: files.tokens,
          modelType: "nemo_transducer",
          numThreads,
          provider: "cpu",
          debug: 0
        }
      : {
          whisper: { encoder: files.encoder, decoder: files.decoder, language: opts.language ?? "", task: "transcribe", tailPaddings: -1 },
          tokens: files.tokens,
          numThreads,
          provider: "cpu",
          debug: 0
        }
  });
  const vad = new sherpa.Vad(
    {
      sileroVad: {
        model: files.vad,
        threshold: 0.5,
        minSpeechDuration: 0.25,
        minSilenceDuration: opts.minSilence ?? 0.35,
        maxSpeechDuration: Math.min(28, opts.maxSegment ?? 12),
        windowSize: 512
      },
      sampleRate,
      debug: false,
      numThreads: 1
    },
    Math.ceil(samples.length / sampleRate) + 30
  );
  const segments: TranscriptSegment[] = [];
  let language: string | undefined;
  const drain = () => {
    while (!vad.isEmpty()) {
      const seg = vad.front();
      const stream = recognizer.createStream();
      stream.acceptWaveform({ samples: seg.samples, sampleRate });
      recognizer.decode(stream);
      const r = recognizer.getResult(stream);
      if (r.lang && !language) language = r.lang.replace(/[<>|]/g, "");
      const text = (r.text || "").trim();
      const start = seg.start / sampleRate;
      const end = start + seg.samples.length / sampleRate;
      if (text) {
        const segment: TranscriptSegment = { start: round(start, 3), end: round(end, 3), text };
        if (withWords && r.tokens && r.timestamps) segment.words = tokensToWords(r.tokens, r.timestamps, start, end);
        segments.push(segment);
      }
      vad.pop();
    }
  };
  const w = 512;
  for (let i = 0; i < samples.length; i += w) {
    vad.acceptWaveform(samples.subarray(i, Math.min(samples.length, i + w)));
    drain();
  }
  vad.flush();
  drain();
  return { language: opts.language || language, duration: round(samples.length / sampleRate, 3), segments };
}

/**
 * True when this process is Electron's Node (Claude Desktop's built-in runtime). Its V8 memory cage refuses the
 * external buffers sherpa-onnx creates ("External buffers are not allowed"), so transcription runs in a child
 * process on the system Node instead.
 */
export function needsSystemNode(): boolean {
  if (process.env.JRADB_MCP_TRANSCRIBE_CHILD) return false;
  return !!(process.versions as Record<string, string | undefined>).electron || process.env.JRADB_MCP_TRANSCRIBE_IN_CHILD === "1";
}

async function transcribeInChild(file: string, opts: TranscribeOptions): Promise<Transcript & { model: string; downloaded: string[] }> {
  const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), "transcribe-worker.js");
  const nodeBin = process.env.JRADB_MCP_NODE || (process.platform === "win32" ? "node.exe" : "node");
  const env: NodeJS.ProcessEnv = { ...process.env, JRADB_MCP_TRANSCRIBE_CHILD: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const res = await run(nodeBin, [worker, JSON.stringify({ file, opts })], { timeoutMs: 60 * 60 * 1000, env });
  const out = res.stdout.toString("utf8").trim();
  const last = out.split(/\r?\n/).filter(Boolean).pop() ?? "";
  let parsed: { ok?: boolean; result?: Transcript & { model: string; downloaded: string[] }; error?: { code?: string; message?: string } } = {};
  try {
    parsed = JSON.parse(last);
  } catch {
    throw new MediaToolError(
      "TRANSCRIBE_CHILD_FAILED",
      `Transcription runs on the system Node (Claude Desktop's built-in runtime cannot load the speech engine), but '${nodeBin}' ` +
        `did not answer (exit ${res.code}): ${res.stderr.trim().slice(0, 300) || "no output"}. Install Node.js or set JRADB_MCP_NODE to node.exe.`
    );
  }
  if (!parsed.ok || !parsed.result) throw new MediaToolError(parsed.error?.code ?? "TRANSCRIBE_FAILED", parsed.error?.message ?? "Transcription failed.");
  return parsed.result;
}

export async function transcribeFile(file: string, opts: TranscribeOptions = {}): Promise<Transcript & { model: string; downloaded: string[] }> {
  if (needsSystemNode()) return transcribeInChild(file, opts);
  try {
    return await transcribeDirect(file, opts);
  } catch (e) {
    if (e instanceof Error && /External buffers are not allowed/i.test(e.message) && !process.env.JRADB_MCP_TRANSCRIBE_CHILD) return transcribeInChild(file, opts);
    throw e;
  }
}

async function transcribeDirect(file: string, opts: TranscribeOptions = {}): Promise<Transcript & { model: string; downloaded: string[] }> {
  const size = opts.model ?? "small";
  const sherpa = loadSherpa();
  if (opts.wordTimestamps) {
    const pk = await ensureParakeetModel();
    const audio = await loadAudio(file, 16000);
    const tw = transcribeSamples(sherpa, pk, audio, opts);
    return { ...tw, model: "parakeet-tdt-0.6b-v3 (int8, sherpa-onnx, word timestamps)", downloaded: pk.downloaded };
  }
  const files = await ensureWhisperModel(size);
  const samples = await loadAudio(file, 16000);
  const t = transcribeSamples(sherpa, files, samples, opts);
  return { ...t, model: `whisper-${size} (int8, sherpa-onnx)`, downloaded: files.downloaded };
}
