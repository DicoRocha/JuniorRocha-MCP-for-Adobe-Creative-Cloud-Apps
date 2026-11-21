/**
 * Transcript → caption cues → SRT. Pure functions.
 *
 * A transcript is a list of segments (start/end in seconds, text) with optional word timings. Cues
 * follow social-video rules: short lines, a minimum time on screen, no cue over a cut, glossary
 * corrections applied first (speech engines misspell brand and product names).
 */
import { Range, mapTimeThroughCuts, round } from "./audio-analysis.js";

export interface Word {
  start: number;
  end: number;
  word: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: Word[];
}

export interface Transcript {
  language?: string;
  duration?: number;
  segments: TranscriptSegment[];
}

export interface Cue {
  index: number;
  start: number;
  end: number;
  text: string;
}

export interface CueOptions {
  /** Characters per line (reels: 24–32; widescreen: 42). */
  maxChars?: number;
  /** Lines per cue (reels: 1–2). */
  maxLines?: number;
  minDuration?: number;
  maxDuration?: number;
  /** Upper-case everything (common style for burned-in reels captions). */
  uppercase?: boolean;
  /** Remove trailing periods/commas from each cue. */
  stripPunctuation?: boolean;
}

export type Glossary = Record<string, string>;

/** Applies "wrong → right" corrections, case-insensitive, on word boundaries (accent aware). */
export function applyGlossary(text: string, glossary: Glossary = {}): string {
  let out = text;
  const entries = Object.entries(glossary).sort((a, b) => b[0].length - a[0].length);
  for (const [wrong, right] of entries) {
    if (!wrong) continue;
    const escaped = wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, (_m, pre: string) => `${pre}${right}`);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

const fold = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/**
 * Fixes names and brands the speech engine heard slightly wrong (B10): every run of 1–3 words whose letters are
 * close to a known term (≥ 80 % similar, terms of 5+ letters) becomes the term, keeping the punctuation after it.
 * "leva tio" / "Levátio" → "Levatio", "chat gpt" → "ChatGPT". Exact glossary pairs stay in applyGlossary.
 */
export function applyTerms(text: string, terms: string[] = [], minSimilarity = 0.8): string {
  const list = terms.map((t) => ({ term: t, key: fold(t), words: t.trim().split(/\s+/).length })).filter((t) => t.key.length >= 5);
  if (!list.length || !text) return text;
  const tokens = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    let best: { len: number; term: string; score: number } | null = null;
    for (const t of list) {
      for (let k = Math.max(1, t.words - 1); k <= Math.min(3, t.words + 1) && i + k <= tokens.length; k++) {
        const key = fold(tokens.slice(i, i + k).join(""));
        if (!key) continue;
        const score = 1 - lev(key, t.key) / Math.max(key.length, t.key.length);
        if (score >= minSimilarity && (!best || score > best.score || (score === best.score && k > best.len))) best = { len: k, term: t.term, score };
      }
    }
    if (best) {
      const last = tokens[i + best.len - 1];
      const tail = last.match(/[^\p{L}\p{N}]+$/u)?.[0] ?? "";
      const head = tokens[i].match(/^[^\p{L}\p{N}]+/u)?.[0] ?? "";
      out.push(`${head}${best.term}${tail}`);
      i += best.len;
    } else {
      out.push(tokens[i]);
      i++;
    }
  }
  return out.join(" ");
}

/** Spreads segment time over its words by character count (when the engine gave no word timings). */
export function estimateWords(seg: TranscriptSegment): Word[] {
  const tokens = seg.text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const weights = tokens.map((t) => t.length + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const dur = Math.max(0.01, seg.end - seg.start);
  let t = seg.start;
  return tokens.map((word, i) => {
    const d = (weights[i] / total) * dur;
    const w = { start: round(t, 3), end: round(t + d, 3), word };
    t += d;
    return w;
  });
}

/** Splits words into lines of at most maxChars, balanced (the break nearest the middle). */
export function balanceLines(words: string[], maxLines: number, maxChars: number): string[] {
  const text = words.join(" ");
  if (maxLines <= 1 || text.length <= maxChars) return [text];
  let best = -1;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const over = Math.max(0, a.length - maxChars) + Math.max(0, b.length - maxChars);
    // Prefer breaking after punctuation and keeping the first line a little shorter.
    const punct = /[,;:–-]$/.test(words[i - 1]) ? -4 : 0;
    const score = over * 100 + Math.abs(a.length - b.length) + (a.length > b.length ? 2 : 0) + punct;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/**
 * Breaks one segment into cues: first into phrases at sentence ends (and at commas when long), then
 * each phrase into the fewest cues that fit maxChars × maxLines and maxDuration, with the words spread
 * evenly so there are no one-word leftovers, then each cue into balanced lines.
 */
export function segmentToCues(seg: TranscriptSegment, opts: CueOptions = {}): Array<{ start: number; end: number; text: string }> {
  const maxChars = opts.maxChars ?? 32;
  const maxLines = opts.maxLines ?? 2;
  const maxDuration = opts.maxDuration ?? 4;
  const capacity = maxChars * maxLines;
  const words = (seg.words && seg.words.length ? seg.words.map((w) => ({ ...w, word: w.word.trim() })) : estimateWords(seg)).filter((w) => w.word);
  const phrases: Word[][] = [];
  let cur: Word[] = [];
  const len = (ws: Word[]) => ws.map((w) => w.word).join(" ").length;
  for (const w of words) {
    cur.push(w);
    const sentenceEnd = /[.!?…]["»”]?$/.test(w.word);
    const softBreak = /[,;:–]$/.test(w.word) && len(cur) >= capacity * 0.6;
    if (sentenceEnd || softBreak) {
      phrases.push(cur);
      cur = [];
    }
  }
  if (cur.length) phrases.push(cur);
  // A phrase of one or two short words joins its neighbour when the result still fits.
  for (let i = phrases.length - 1; i > 0; i--) {
    if (phrases[i].length <= 2 && len(phrases[i - 1]) + 1 + len(phrases[i]) <= capacity) {
      phrases[i - 1] = phrases[i - 1].concat(phrases[i]);
      phrases.splice(i, 1);
    }
  }
  const cues: Array<{ start: number; end: number; text: string }> = [];
  for (const ph of phrases) {
    const total = len(ph);
    const dur = ph[ph.length - 1].end - ph[0].start;
    let k = Math.max(1, Math.ceil(total / capacity), Math.ceil(dur / maxDuration));
    k = Math.min(k, ph.length);
    // Spread words over k chunks by character count.
    const target = total / k;
    const chunks: Word[][] = [];
    let chunk: Word[] = [];
    let acc = 0;
    for (let i = 0; i < ph.length; i++) {
      const w = ph[i];
      const wl = w.word.length + (chunk.length ? 1 : 0);
      const remainingWords = ph.length - i;
      const remainingChunks = k - chunks.length;
      if (chunk.length && chunks.length < k - 1 && (acc + wl / 2 > target || remainingWords < remainingChunks)) {
        chunks.push(chunk);
        chunk = [];
        acc = 0;
      }
      chunk.push(w);
      acc += w.word.length + (chunk.length > 1 ? 1 : 0);
    }
    if (chunk.length) chunks.push(chunk);
    for (const c of chunks) {
      const lines = balanceLines(c.map((w) => w.word), maxLines, maxChars);
      cues.push({ start: c[0].start, end: c[c.length - 1].end, text: lines.join("\n") });
    }
  }
  return cues;
}

/**
 * Full pipeline: glossary → cues → min duration (borrowing time from the gap after) → optional
 * re-timing through a cut plan (cues inside removed parts disappear; cues are clipped at cuts).
 */
export function buildCues(transcript: Transcript, opts: CueOptions & { glossary?: Glossary; terms?: string[]; keep?: Range[] } = {}): Cue[] {
  const minDuration = opts.minDuration ?? 0.8;
  const raw: Array<{ start: number; end: number; text: string }> = [];
  for (const seg of transcript.segments) {
    const glossed = applyGlossary(seg.text, opts.glossary);
    const text = applyTerms(glossed, opts.terms);
    if (!text) continue;
    // a fuzzy term fix can join words: word timings no longer map one to one, so estimate them
    const words = seg.words?.length && text === glossed
      ? seg.words.map((w) => ({ ...w, word: applyGlossary(w.word, opts.glossary) })).filter((w) => w.word)
      : undefined;
    // When the glossary changed the word count, word timings no longer line up: estimate instead.
    const useWords = words && words.map((w) => w.word).join(" ").split(/\s+/).length === text.split(/\s+/).length ? words : undefined;
    raw.push(...segmentToCues({ start: seg.start, end: seg.end, text, words: useWords }, opts));
  }
  let cues = raw;
  if (opts.keep && opts.keep.length) {
    const mapped: Array<{ start: number; end: number; text: string }> = [];
    for (const c of cues) {
      // Clip the cue to the kept part that holds most of it, then map to the new timeline.
      let best: Range | null = null;
      let bestOverlap = 0;
      for (const k of opts.keep) {
        const ov = Math.min(c.end, k.end) - Math.max(c.start, k.start);
        if (ov > bestOverlap) {
          bestOverlap = ov;
          best = k;
        }
      }
      if (!best || bestOverlap < 0.15) continue;
      const s = mapTimeThroughCuts(Math.max(c.start, best.start), opts.keep);
      const e = mapTimeThroughCuts(Math.min(c.end, best.end), opts.keep);
      if (s === null || e === null) continue;
      mapped.push({ start: s, end: e, text: c.text });
    }
    cues = mapped;
  }
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    if (cues[i].end - cues[i].start < minDuration) {
      const limit = next ? next.start : cues[i].start + minDuration;
      cues[i].end = Math.min(cues[i].start + minDuration, Math.max(cues[i].end, limit));
    }
    if (next && cues[i].end > next.start) cues[i].end = next.start;
  }
  return cues
    .filter((c) => c.end > c.start)
    .map((c, i) => {
      let text = c.text;
      if (opts.stripPunctuation) text = text.replace(/[.,;:]+(?=\n|$)/g, "");
      if (opts.uppercase) text = text.toLocaleUpperCase();
      return { index: i + 1, start: round(c.start, 3), end: round(c.end, 3), text };
    });
}

export function srtTime(t: number): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n");
}

export function parseSrtTime(s: string): number {
  const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s.trim());
  if (!m) throw new Error(`Bad SRT time: ${s}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0").slice(0, 3)) / 1000;
}

export function parseSrt(text: string): Cue[] {
  const blocks = text.replace(/\r/g, "").replace(/^﻿/, "").split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const b of blocks) {
    const lines = b.split("\n").filter((l) => l.trim() !== "");
    const timeIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeIdx < 0) continue;
    const [a, z] = lines[timeIdx].split("-->");
    cues.push({ index: cues.length + 1, start: parseSrtTime(a), end: parseSrtTime(z), text: lines.slice(timeIdx + 1).join("\n") });
  }
  return cues;
}
