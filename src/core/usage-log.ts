/**
 * Per-call usage telemetry: what each MCP tool call puts into the model's context.
 * One JSONL line per call (sizes only, never the content) in <repo>/logs/usage/usage-YYYY-MM-DD.jsonl.
 * Token figures are estimates (text ≈ chars / 3.5; images ≈ width × height / 750 after Claude's resize);
 * Sizes only, so a report can recount tokens later without storing any content.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface UsageRecord {
  ts: string;
  run: string | null;
  tool: string;
  ms: number;
  ok: boolean;
  inChars: number;
  outTextChars: number;
  images: number;
  imageTokens: number;
  estTokensIn: number;
  estTokensOut: number;
  /** Call made by an jradb_code script: never seen by the model, excluded from totals. */
  inner?: boolean;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let currentRun: string | null = process.env.JRADB_MCP_USAGE_RUN || null;
const disabled = process.env.JRADB_MCP_USAGE === "0";

export function usageDir(): string {
  return process.env.JRADB_MCP_USAGE_DIR || path.join(repoRoot, "logs", "usage");
}

// Claude Desktop may run several server processes: the label lives in a file all of them read.
function runFile(): string {
  return path.join(usageDir(), "current-run.txt");
}

export function setUsageRun(label: string | null): void {
  currentRun = label;
  try {
    fs.mkdirSync(usageDir(), { recursive: true });
    if (label) fs.writeFileSync(runFile(), label, "utf8");
    else if (fs.existsSync(runFile())) fs.writeFileSync(runFile(), "", "utf8");
  } catch {
    /* label stays in memory only */
  }
}

export function getUsageRun(): string | null {
  try {
    if (fs.existsSync(runFile())) return fs.readFileSync(runFile(), "utf8").trim() || null;
  } catch {
    /* fall back to memory */
  }
  return currentRun;
}

/** Image size from a PNG/JPEG/WebP header (base64), or null. */
export function imageSize(b64: string): { w: number; h: number } | null {
  const buf = Buffer.from(b64.slice(0, 64 * 1024), "base64");
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  }
  return null;
}

/** Claude's image cost: resized to fit 1568 px long edge (and ~1.15 MP), then w*h/750 tokens. */
export function imageTokens(w: number, h: number): number {
  let s = Math.min(1, 1568 / Math.max(w, h));
  const mp = (w * s) * (h * s);
  if (mp > 1_150_000) s *= Math.sqrt(1_150_000 / mp);
  return Math.ceil((w * s * h * s) / 750);
}

export function measureResult(result: unknown): { outTextChars: number; images: number; imageTokens: number; ok: boolean } {
  let outTextChars = 0;
  let images = 0;
  let imgTok = 0;
  const r = result as { content?: Array<{ type: string; text?: string; data?: string }>; isError?: boolean };
  for (const c of r?.content ?? []) {
    if (c.type === "text" && typeof c.text === "string") outTextChars += c.text.length;
    else if (c.type === "image" && typeof c.data === "string") {
      images++;
      const sz = imageSize(c.data);
      imgTok += sz ? imageTokens(sz.w, sz.h) : 1600;
    }
  }
  return { outTextChars, images, imageTokens: imgTok, ok: !r?.isError };
}

export function logUsage(tool: string, args: unknown, result: unknown, ms: number, inner = false): UsageRecord | null {
  if (disabled) return null;
  try {
    const inChars = JSON.stringify(args ?? {}).length + tool.length;
    const m = measureResult(result);
    const rec: UsageRecord = {
      ts: new Date().toISOString(),
      run: getUsageRun(),
      tool,
      ms: Math.round(ms),
      ok: m.ok,
      inChars,
      outTextChars: m.outTextChars,
      images: m.images,
      imageTokens: m.imageTokens,
      estTokensIn: Math.ceil(inChars / 3.5),
      estTokensOut: Math.ceil(m.outTextChars / 3.5) + m.imageTokens,
      ...(inner ? { inner: true } : {})
    };
    const dir = usageDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `usage-${rec.ts.slice(0, 10)}.jsonl`), JSON.stringify(rec) + "\n");
    return rec;
  } catch {
    return null;
  }
}

export function readUsage(opts: { run?: string; since?: string } = {}): UsageRecord[] {
  const dir = usageDir();
  if (!fs.existsSync(dir)) return [];
  const out: UsageRecord[] = [];
  for (const f of fs.readdirSync(dir).filter((n) => /^usage-.*\.jsonl$/.test(n)).sort()) {
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as UsageRecord;
        if (opts.run && r.run !== opts.run) continue;
        if (opts.since && r.ts < opts.since) continue;
        out.push(r);
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

export function summarizeUsage(recs: UsageRecord[]) {
  const byTool: Record<string, { calls: number; tokensIn: number; tokensOut: number; images: number; ms: number; errors: number }> = {};
  const tot = { calls: 0, tokensIn: 0, tokensOut: 0, imageTokens: 0, images: 0, ms: 0, errors: 0 };
  for (const r of recs) {
    if (r.inner) continue;
    const t = (byTool[r.tool] ??= { calls: 0, tokensIn: 0, tokensOut: 0, images: 0, ms: 0, errors: 0 });
    t.calls++; t.tokensIn += r.estTokensIn; t.tokensOut += r.estTokensOut; t.images += r.images; t.ms += r.ms; if (!r.ok) t.errors++;
    tot.calls++; tot.tokensIn += r.estTokensIn; tot.tokensOut += r.estTokensOut; tot.imageTokens += r.imageTokens; tot.images += r.images; tot.ms += r.ms; if (!r.ok) tot.errors++;
  }
  const top = Object.entries(byTool).sort((a, b) => b[1].tokensIn + b[1].tokensOut - (a[1].tokensIn + a[1].tokensOut)).slice(0, 15);
  return { total: { ...tot, tokens: tot.tokensIn + tot.tokensOut }, byTool: Object.fromEntries(top) };
}
