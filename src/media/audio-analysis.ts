/**
 * Audio analysis on mono PCM (Float32, -1..1): loudness, silence/speech ranges, cut plans and beats.
 * Pure functions, no I/O: decoding lives in ffmpeg.ts. Times are seconds.
 */

export interface Range {
  start: number;
  end: number;
}

export interface FrameEnvelope {
  hop: number; // seconds between frames
  db: Float32Array; // RMS level of each frame in dBFS
}

export const DB_FLOOR = -120;

export function toDb(rms: number): number {
  return rms > 0 ? Math.max(DB_FLOOR, 20 * Math.log10(rms)) : DB_FLOOR;
}

/** RMS envelope with a sliding window (frameSec) every hopSec. */
export function rmsEnvelope(samples: Float32Array, sampleRate: number, frameSec = 0.03, hopSec = 0.01): FrameEnvelope {
  const frame = Math.max(1, Math.round(frameSec * sampleRate));
  const hop = Math.max(1, Math.round(hopSec * sampleRate));
  const count = samples.length < frame ? (samples.length > 0 ? 1 : 0) : Math.floor((samples.length - frame) / hop) + 1;
  const db = new Float32Array(count);
  for (let f = 0; f < count; f++) {
    const start = f * hop;
    const end = Math.min(samples.length, start + frame);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    db[f] = toDb(Math.sqrt(sum / Math.max(1, end - start)));
  }
  return { hop: hop / sampleRate, db };
}

export interface LoudnessReport {
  duration: number;
  peakDb: number;
  rmsDb: number;
  /** Gated loudness estimate (dBFS of frames above -50 dB): close to LUFS for speech, not a certified meter. */
  gatedDb: number;
  /** Level of the quietest 10 % of frames: the noise floor between words. */
  noiseFloorDb: number;
}

export function measureLoudness(samples: Float32Array, sampleRate: number): LoudnessReport {
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
    sum += samples[i] * samples[i];
  }
  const env = rmsEnvelope(samples, sampleRate, 0.4, 0.1);
  const loud = Array.from(env.db).filter((d) => d > -50);
  const gatedPow = loud.length ? loud.reduce((acc, d) => acc + Math.pow(10, d / 10), 0) / loud.length : 0;
  const sorted = Array.from(env.db).sort((a, b) => a - b);
  const floor = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : DB_FLOOR;
  return {
    duration: samples.length / sampleRate,
    peakDb: round(toDb(peak), 1),
    rmsDb: round(toDb(Math.sqrt(sum / Math.max(1, samples.length))), 1),
    gatedDb: round(gatedPow > 0 ? 10 * Math.log10(gatedPow) : DB_FLOOR, 1),
    noiseFloorDb: round(floor, 1)
  };
}

export interface SilenceOptions {
  /** Absolute threshold in dBFS. Default: noise floor + 12 dB, clamped to [-55, -30]. */
  thresholdDb?: number;
  /** Shortest pause that counts as silence (seconds). */
  minSilence?: number;
}

/** Silent ranges: frames below the threshold for at least minSilence seconds. */
export function detectSilences(samples: Float32Array, sampleRate: number, opts: SilenceOptions = {}): { thresholdDb: number; silences: Range[] } {
  const env = rmsEnvelope(samples, sampleRate);
  const minSilence = opts.minSilence ?? 0.4;
  let threshold = opts.thresholdDb;
  const sorted = Array.from(env.db).sort((a, b) => a - b);
  const floor = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : -60;
  if (threshold === undefined) threshold = Math.min(-30, Math.max(-55, floor + 12));
  // Soft edge (22/11/2026): word onsets such as "ex-", "s", "f" sit well below the speech threshold. A pause ends
  // where the level first rises above floor + 5 dB, not where it crosses the threshold, so the cut keeps them.
  const soft = Math.min(threshold - 3, floor + 5);
  const silences: Range[] = [];
  let runStart = -1;
  for (let f = 0; f <= env.db.length; f++) {
    const quiet = f < env.db.length && env.db[f] < threshold;
    if (quiet && runStart < 0) runStart = f;
    if (!quiet && runStart >= 0) {
      let a0 = runStart, a1 = f;
      while (a1 > a0 && a1 < env.db.length && env.db[a1 - 1] >= soft) a1--;
      while (a0 < a1 && a0 > 0 && env.db[a0] >= soft) a0++;
      const start = a0 * env.hop;
      const end = f === env.db.length ? samples.length / sampleRate : a1 * env.hop;
      if (end - start >= minSilence) silences.push({ start: round(start, 3), end: round(end, 3) });
      runStart = -1;
    }
  }
  return { thresholdDb: round(threshold, 1), silences };
}

/** Complement of ranges inside [0, duration]. */
export function invertRanges(ranges: Range[], duration: number): Range[] {
  const out: Range[] = [];
  let t = 0;
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    if (r.start > t) out.push({ start: t, end: r.start });
    t = Math.max(t, r.end);
  }
  if (t < duration) out.push({ start: t, end: duration });
  return out.map((r) => ({ start: round(r.start, 3), end: round(r.end, 3) })).filter((r) => r.end - r.start > 0.001);
}

export interface CutPlanOptions {
  /** Breath kept before and after each spoken part (seconds). */
  padding?: number;
  /** Pauses shorter than this stay in (the cut would feel jumpy). */
  minGap?: number;
  /** Spoken parts shorter than this are dropped (clicks, "hm"). */
  minKeep?: number;
}

export interface CutPlan {
  keep: Range[];
  remove: Range[];
  originalDuration: number;
  newDuration: number;
}

/** Turns speech ranges into the parts to keep and to remove from a clip. */
export function buildCutPlan(speech: Range[], duration: number, opts: CutPlanOptions = {}): CutPlan {
  const padding = opts.padding ?? 0.12;
  const minGap = opts.minGap ?? 0.35;
  const minKeep = opts.minKeep ?? 0.2;
  const padded = speech
    .filter((r) => r.end - r.start >= minKeep)
    .map((r) => ({ start: Math.max(0, r.start - padding), end: Math.min(duration, r.end + padding) }))
    .sort((a, b) => a.start - b.start);
  const keep: Range[] = [];
  for (const r of padded) {
    const last = keep[keep.length - 1];
    if (last && r.start - last.end < minGap) last.end = Math.max(last.end, r.end);
    else keep.push({ ...r });
  }
  const rounded = keep.map((r) => ({ start: round(r.start, 3), end: round(r.end, 3) }));
  const remove = invertRanges(rounded, duration);
  const newDuration = rounded.reduce((acc, r) => acc + (r.end - r.start), 0);
  return { keep: rounded, remove, originalDuration: round(duration, 3), newDuration: round(newDuration, 3) };
}

/** Maps a time of the original clip to the timeline after the cut plan (null when it was cut out). */
export function mapTimeThroughCuts(t: number, keep: Range[]): number | null {
  let acc = 0;
  for (const r of keep) {
    if (t < r.start) return null;
    if (t <= r.end) return round(acc + (t - r.start), 3);
    acc += r.end - r.start;
  }
  return null;
}

export interface BeatReport {
  bpm: number | null;
  beats: number[];
  onsets: number[];
  confidence: number;
}

/**
 * Onsets from the positive energy flux of a smoothed envelope; tempo from the autocorrelation of
 * that flux (60–180 BPM); beats placed on the strongest onset phase. Good enough to cut music videos
 * on the beat, not a DJ beat tracker.
 */
export function detectBeats(samples: Float32Array, sampleRate: number): BeatReport {
  const env = rmsEnvelope(samples, sampleRate, 0.046, 0.01);
  const n = env.db.length;
  if (n < 200) return { bpm: null, beats: [], onsets: [], confidence: 0 };
  const lin = Float32Array.from(env.db, (d) => Math.pow(10, d / 20));
  const flux = new Float32Array(n);
  for (let i = 1; i < n; i++) flux[i] = Math.max(0, lin[i] - lin[i - 1]);
  // Onsets: local maxima above an adaptive threshold (mean + 1.5 sd over ±0.5 s).
  const w = Math.round(0.5 / env.hop);
  const onsets: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (flux[i] <= flux[i - 1] || flux[i] < flux[i + 1]) continue;
    let s = 0;
    let s2 = 0;
    let c = 0;
    for (let j = Math.max(0, i - w); j < Math.min(n, i + w); j++) {
      s += flux[j];
      s2 += flux[j] * flux[j];
      c++;
    }
    const mean = s / c;
    const sd = Math.sqrt(Math.max(0, s2 / c - mean * mean));
    if (flux[i] > mean + 1.5 * sd && flux[i] > 1e-4) {
      if (!onsets.length || i * env.hop - onsets[onsets.length - 1] > 0.1) onsets.push(round(i * env.hop, 3));
    }
  }
  // Tempo by autocorrelation of the flux.
  const minLag = Math.round(60 / 180 / env.hop);
  const maxLag = Math.round(60 / 60 / env.hop);
  let bestLag = 0;
  let best = 0;
  let total = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = lag; i < n; i++) acc += flux[i] * flux[i - lag];
    total += acc;
    if (acc > best) {
      best = acc;
      bestLag = lag;
    }
  }
  if (!bestLag || best <= 0) return { bpm: null, beats: [], onsets, confidence: 0 };
  const period = bestLag * env.hop;
  const bpm = 60 / period;
  // Phase: the offset in [0, period) that collects the most flux.
  let bestPhase = 0;
  let bestScore = -1;
  for (let p = 0; p < bestLag; p++) {
    let score = 0;
    for (let i = p; i < n; i += bestLag) score += flux[i];
    if (score > bestScore) {
      bestScore = score;
      bestPhase = p;
    }
  }
  const beats: number[] = [];
  for (let i = bestPhase; i < n; i += bestLag) beats.push(round(i * env.hop, 3));
  const meanAcc = total / (maxLag - minLag + 1);
  return { bpm: round(bpm, 1), beats, onsets, confidence: round(Math.min(1, meanAcc > 0 ? (best / meanAcc - 1) / 3 : 0), 2) };
}

export interface DuckKey {
  time: number;
  db: number;
}

/**
 * Volume keyframes (relative dB) that lower a music bed under speech: down by `duckDb` from
 * `attack` before each spoken part until `release` after it; parts closer than `merge` are joined.
 */
export function duckingKeyframes(speech: Range[], opts: { duckDb?: number; attack?: number; release?: number; merge?: number; baseDb?: number } = {}): DuckKey[] {
  const duck = -(Math.abs(opts.duckDb ?? 14));
  const base = opts.baseDb ?? 0;
  const attack = opts.attack ?? 0.25;
  const release = opts.release ?? 0.5;
  const merge = opts.merge ?? 1.2;
  const blocks: Range[] = [];
  for (const r of [...speech].sort((a, b) => a.start - b.start)) {
    const last = blocks[blocks.length - 1];
    if (last && r.start - last.end < merge) last.end = Math.max(last.end, r.end);
    else blocks.push({ ...r });
  }
  const keys: DuckKey[] = [];
  for (const b of blocks) {
    const t0 = Math.max(0, b.start - attack);
    keys.push({ time: round(t0, 3), db: base });
    keys.push({ time: round(b.start, 3), db: base + duck });
    keys.push({ time: round(b.end, 3), db: base + duck });
    keys.push({ time: round(b.end + release, 3), db: base });
  }
  // Drop keys that overlap the previous block's release.
  return keys.filter((k, i) => i === 0 || k.time >= keys[i - 1].time);
}

/**
 * Full music-bed automation: fade in from silence, duck under speech, fade out to silence at endSeconds.
 * Keys are sorted, de-duplicated and never louder than baseDb.
 */
export function musicBedKeys(
  speech: Range[],
  opts: { baseDb?: number; duckDb?: number; attack?: number; release?: number; merge?: number; fadeIn?: number; fadeOut?: number; endSeconds?: number; startSeconds?: number } = {}
): DuckKey[] {
  const base = opts.baseDb ?? -6;
  const duck = Math.abs(opts.duckDb ?? 14);
  const start = opts.startSeconds ?? 0;
  const fadeIn = opts.fadeIn ?? 0.6;
  const fadeOut = opts.fadeOut ?? 1.5;
  const silent = -60;
  const levelAt = (t: number): number => {
    // Level the ducking curve would have at time t (piecewise linear).
    const keys = duckingKeyframes(speech, { duckDb: duck, attack: opts.attack, release: opts.release, merge: opts.merge, baseDb: base });
    if (!keys.length || t <= keys[0].time) return base;
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i].time) {
        const a = keys[i - 1];
        const b = keys[i];
        const f = b.time === a.time ? 1 : (t - a.time) / (b.time - a.time);
        return a.db + (b.db - a.db) * f;
      }
    }
    return keys[keys.length - 1].db;
  };
  let keys = duckingKeyframes(speech, { duckDb: duck, attack: opts.attack, release: opts.release, merge: opts.merge, baseDb: base });
  const inEnd = start + fadeIn;
  const outStart = opts.endSeconds !== undefined ? Math.max(inEnd, opts.endSeconds - fadeOut) : Infinity;
  keys = keys.filter((k) => k.time > inEnd && k.time < outStart);
  if (fadeIn > 0) keys.unshift({ time: round(start, 3), db: silent }, { time: round(inEnd, 3), db: round(levelAt(inEnd), 2) });
  else keys.unshift({ time: round(start, 3), db: round(levelAt(start), 2) });
  if (opts.endSeconds !== undefined) {
    keys.push({ time: round(outStart, 3), db: round(levelAt(outStart), 2) });
    keys.push({ time: round(opts.endSeconds, 3), db: silent });
  }
  const out: DuckKey[] = [];
  for (const k of keys.sort((a, b) => a.time - b.time)) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.time - k.time) < 0.005) last.db = k.db;
    else out.push({ time: k.time, db: Math.min(base, k.db) });
  }
  return out;
}

/**
 * Premiere's Volume > Level parameter (ExtendScript getValue/setValue) is linear with a +15 dB offset:
 * 0 dB = 0.17783, +15 dB = 1. Converts dB to that value.
 */
export function dbToPremiereLevel(db: number): number {
  return round(Math.pow(10, (db - 15) / 20), 6);
}

export function premiereLevelToDb(level: number): number {
  return level > 0 ? round(20 * Math.log10(level) + 15, 2) : DB_FLOOR;
}

export function round(v: number, digits = 3): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}
