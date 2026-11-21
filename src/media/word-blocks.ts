/**
 * Groups timed words into short caption blocks for word-by-word animated captions (rule of 18/11/2026):
 * 1–4 words per block, a block ends at sentence punctuation, at a pause, or when it gets too wide.
 */
import { Word } from "./captions.js";

export interface WordBlock {
  start: number;
  end: number;
  text: string;
  words: { t: string; s: number; e: number }[];
}

export interface BlockOptions {
  maxWords?: number; // default 3
  maxChars?: number; // default 18
  maxGap?: number; // pause that closes a block (s), default 0.45
  hold?: number; // time the block stays after its last word when nothing follows (s), default 0.25
  upperCase?: boolean;
  offsetSeconds?: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function groupWords(words: Word[], opts: BlockOptions = {}): WordBlock[] {
  const maxWords = opts.maxWords ?? 3;
  const maxChars = opts.maxChars ?? 18;
  const maxGap = opts.maxGap ?? 0.45;
  const hold = opts.hold ?? 0.25;
  const off = opts.offsetSeconds ?? 0;
  const clean = words.filter((w) => w.word && w.word.trim()).map((w) => ({ t: opts.upperCase ? w.word.trim().toUpperCase() : w.word.trim(), s: w.start + off, e: w.end + off }));
  const blocks: WordBlock[] = [];
  let cur: { t: string; s: number; e: number }[] = [];
  const flush = () => {
    if (!cur.length) return;
    blocks.push({ start: r3(cur[0].s), end: r3(cur[cur.length - 1].e), text: cur.map((w) => w.t).join(" "), words: cur.map((w) => ({ t: w.t, s: r3(w.s), e: r3(w.e) })) });
    cur = [];
  };
  for (const w of clean) {
    if (cur.length) {
      const last = cur[cur.length - 1];
      const width = cur.map((x) => x.t).join(" ").length + 1 + w.t.length;
      const sentenceEnd = /[.!?…]$/.test(last.t);
      if (cur.length >= maxWords || width > maxChars || w.s - last.e > maxGap || sentenceEnd) flush();
    }
    cur.push(w);
  }
  flush();
  // a block stays until the next one starts (no flicker), or `hold` after its last word
  for (let i = 0; i < blocks.length; i++) {
    const next = i + 1 < blocks.length ? blocks[i + 1].start : Infinity;
    const lastEnd = blocks[i].words[blocks[i].words.length - 1].e;
    blocks[i].end = r3(Math.min(next, Math.max(lastEnd + hold, blocks[i].start + 0.3)));
  }
  return blocks;
}
