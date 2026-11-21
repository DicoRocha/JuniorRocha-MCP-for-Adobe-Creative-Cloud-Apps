/**
 * Balanced line breaking for titles and short support text (rule of 18/11/2026):
 * no single word alone on the last line, lines of similar width, no line ending in a connector.
 * Width is estimated by character count (good enough to choose breaks; the app sets the real width).
 */
export interface BalanceOptions {
  /** Maximum characters per line (the box width in characters). */
  maxChars?: number;
  /** Force this number of lines (otherwise the fewest that fit maxChars). */
  lines?: number;
}

export interface BalanceResult {
  lines: string[];
  widths: number[];
  /** shortest / longest line (1 = perfectly even). */
  evenness: number;
  orphan: boolean;
  text: string;
}

const CONNECTORS = new Set([
  "a", "o", "e", "as", "os", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "um", "uma", "ao", "à", "que", "com", "por", "para", "pra", "ou", "se",
  "the", "of", "to", "in", "on", "an", "and", "or", "for", "with", "at", "by"
]);

function cost(lines: string[][]): number {
  const widths = lines.map((l) => l.join(" ").length);
  const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
  let c = widths.reduce((a, w) => a + (w - avg) * (w - avg), 0);
  const last = lines[lines.length - 1];
  if (lines.length > 1 && last.length === 1) c += 10000; // orphan word
  for (let i = 0; i < lines.length - 1; i++) {
    const end = lines[i][lines[i].length - 1].toLowerCase().replace(/[^\p{L}]/gu, "");
    if (CONNECTORS.has(end)) c += 400; // do not leave "de", "o", "em" hanging at the end of a line
  }
  return c;
}

function partitions(words: string[], n: number, maxChars: number): string[][][] {
  const out: string[][][] = [];
  const walk = (start: number, left: number, acc: string[][]) => {
    if (left === 1) {
      const rest = words.slice(start);
      if (rest.length && rest.join(" ").length <= maxChars) out.push([...acc, rest]);
      return;
    }
    for (let end = start + 1; end <= words.length - (left - 1); end++) {
      const line = words.slice(start, end);
      if (line.join(" ").length > maxChars) break;
      walk(end, left - 1, [...acc, line]);
    }
  };
  walk(0, n, []);
  return out;
}

export function balanceLines(text: string, opts: BalanceOptions = {}): BalanceResult {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return { lines: [], widths: [], evenness: 1, orphan: false, text: "" };
  const total = words.join(" ").length;
  const longest = Math.max(...words.map((w) => w.length));
  let maxChars = Math.max(opts.maxChars ?? total, longest);
  let best: string[][] | null = null;
  const tryN = (n: number): string[][] | null => {
    const cands = partitions(words, n, maxChars);
    if (!cands.length) return null;
    return cands.reduce((a, b) => (cost(b) < cost(a) ? b : a));
  };
  if (opts.lines && opts.lines > 0) {
    const n = Math.min(opts.lines, words.length);
    best = tryN(n);
    while (!best) {
      maxChars += 1; // the forced line count needs a wider box
      best = tryN(n);
    }
  } else {
    for (let n = 1; n <= words.length && !best; n++) best = tryN(n);
    // one more line is better than an orphan that cannot be avoided otherwise
    if (best && best.length > 1 && best[best.length - 1].length === 1 && words.length > best.length + 1) {
      const more = tryN(best.length + 1);
      if (more && more[more.length - 1].length > 1) best = more;
    }
  }
  const lines = (best as string[][]).map((l) => l.join(" "));
  const widths = lines.map((l) => l.length);
  return {
    lines,
    widths,
    evenness: Math.round((Math.min(...widths) / Math.max(...widths)) * 100) / 100,
    orphan: lines.length > 1 && (best as string[][])[lines.length - 1].length === 1,
    text: lines.join("\n")
  };
}
