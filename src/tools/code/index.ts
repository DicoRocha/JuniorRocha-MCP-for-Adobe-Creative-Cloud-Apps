/**
 * Code mode: the model writes one short async JavaScript that calls the MCP tools, and only what the script
 * returns comes back. Intermediate results (layer trees, photo lists, audits, previews) stay out of the context,
 * and one call replaces a chain of round trips. Tools run exactly as when called directly (same validation,
 * same handlers, from the ToolCatalog).
 *
 * The script runs in a node:vm context with only the helpers below (no require, process or network). This keeps
 * accidents out; it is not a security boundary against hostile code — the MCP is a local tool driven by the user.
 */
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolCatalog, editDistance } from "../../core/tool-catalog.js";
import { logUsage, usageDir } from "../../core/usage-log.js";
import { firstSentence, shapeToTs } from "../../core/schema-sig.js";
import { runWithTimeoutFloor } from "../../core/timeouts.js";

type Content = { type: string; text?: string; data?: string; mimeType?: string };
export type ToolResult = { content?: Content[]; isError?: boolean };
type Img = { data: string; mimeType: string; from: string };

export class ScriptToolError extends Error {
  constructor(
    public tool: string,
    message: string
  ) {
    super(`${tool}: ${message}`);
  }
}

/** Text parts parsed as JSON when they are JSON; one part → the value itself. */
export function unpackResult(res: ToolResult): { data: unknown; images: Img[]; isError: boolean; text: string } {
  const texts: unknown[] = [];
  const images: Img[] = [];
  let raw = "";
  for (const c of res?.content ?? []) {
    if (c.type === "text" && typeof c.text === "string") {
      raw += (raw ? "\n" : "") + c.text;
      try {
        texts.push(JSON.parse(c.text));
      } catch {
        texts.push(c.text);
      }
    } else if (c.type === "image" && c.data) images.push({ data: c.data, mimeType: c.mimeType ?? "image/png", from: "" });
  }
  return { data: texts.length === 1 ? texts[0] : texts, images, isError: !!res?.isError, text: raw };
}

function jobsDir(): string {
  return path.join(path.dirname(usageDir()), "code-jobs");
}

export interface ScriptRun {
  ok: boolean;
  result?: unknown;
  error?: string;
  calls: Array<{ tool: string; ms: number; ok: boolean }>;
  logs: string[];
  images: Img[];
  ms: number;
}

export async function runScript(catalog: ToolCatalog, code: string, opts: { timeoutMs: number; extra?: unknown }): Promise<ScriptRun> {
  const t0 = Date.now();
  const calls: ScriptRun["calls"] = [];
  const logs: string[] = [];
  const shown: Img[] = [];
  let lastImages: Img[] = [];

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    if (name === "jradb_code" || name === "jradb_batch") throw new ScriptToolError(name, "cannot be called from a script.");
    const entry = catalog.get(name);
    if (!entry) {
      const near = catalog
        .names()
        .map((n) => ({ n, d: editDistance(name, n) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .map((x) => x.n);
      throw new ScriptToolError(name, `unknown tool. Did you mean ${near.join(", ")}?`);
    }
    const parsed = z.object(entry.shape).safeParse(args ?? {});
    if (!parsed.success) {
      throw new ScriptToolError(name, `invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(args)"}: ${i.message}`).join("; ")}`);
    }
    const s0 = Date.now();
    const res = (await entry.handler(parsed.data, opts.extra)) as ToolResult;
    const ms = Date.now() - s0;
    logUsage(name, args, res, ms, true);
    const u = unpackResult(res);
    calls.push({ tool: name, ms, ok: !u.isError });
    lastImages = u.images.map((i) => ({ ...i, from: name }));
    if (u.isError) throw new ScriptToolError(name, u.text.slice(0, 1500));
    return u.data;
  };

  const tools = new Proxy({}, { get: (_t, prop) => (typeof prop === "string" ? (args?: Record<string, unknown>) => call(prop, args) : undefined) });
  const fmt = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  const sandbox = {
    tools,
    call,
    log: (...a: unknown[]) => {
      if (logs.length < 200) logs.push(a.map(fmt).join(" ").slice(0, 2000));
    },
    /** Add the images of the last tool call (or a given index of them) to the final answer. */
    show: (index?: number) => {
      const pick = typeof index === "number" ? [lastImages[index]].filter(Boolean) : lastImages;
      for (const i of pick) if (shown.length < 6) shown.push(i);
      return pick.length;
    },
    sleep: (ms: number) => new Promise((r) => setTimeout(r, Math.min(ms, 120000))),
    readText: (p: string) => fs.readFileSync(p, "utf8"),
    readJson: (p: string) => JSON.parse(fs.readFileSync(p, "utf8")),
    writeText: (p: string, text: string) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, text, "utf8");
      return p;
    },
    exists: (p: string) => fs.existsSync(p),
    mkdir: (p: string) => (fs.mkdirSync(p, { recursive: true }), p),
    listDir: (p: string) =>
      fs.readdirSync(p, { withFileTypes: true }).map((d) => ({ name: d.name, dir: d.isDirectory(), path: path.join(p, d.name) })),
    path: { join: path.join, dirname: path.dirname, basename: path.basename, extname: path.extname },
    console: { log: (...a: unknown[]) => logs.push(a.map(fmt).join(" ")) },
    JSON,
    Math,
    Date,
    Promise,
    setTimeout
  };
  const context = vm.createContext(sandbox);
  try {
    const fn = vm.runInContext(`(async () => {\n${code}\n})`, context, { filename: "jradb_code.js", timeout: 5000 }) as () => Promise<unknown>;
    let timer: NodeJS.Timeout | undefined;
    const result = await Promise.race([
      fn(),
      new Promise((_r, rej) => {
        timer = setTimeout(() => rej(new Error(`script passed ${Math.round(opts.timeoutMs / 1000)} s (calls already sent keep running in the apps)`)), opts.timeoutMs);
      })
    ]);
    if (timer) clearTimeout(timer);
    return { ok: true, result, calls, logs, images: shown, ms: Date.now() - t0 };
  } catch (e) {
    const err = e as Error;
    return { ok: false, error: err.message, calls, logs, images: shown, ms: Date.now() - t0 };
  }
}

function toResponse(run: ScriptRun & { jobId?: string }, maxChars: number) {
  let resultText = run.result === undefined ? "" : JSON.stringify(run.result, null, 1) ?? "";
  let truncated = false;
  if (resultText.length > maxChars) {
    resultText = `${resultText.slice(0, maxChars)}…`;
    truncated = true;
  }
  const summary: Record<string, unknown> = {
    ok: run.ok,
    ...(run.jobId ? { jobId: run.jobId } : {}),
    seconds: Math.round(run.ms / 100) / 10,
    calls: run.calls.map((c) => `${c.tool}${c.ok ? "" : " ✗"} ${Math.round(c.ms / 100) / 10}s`)
  };
  if (run.error) summary.error = run.error;
  if (run.logs.length) summary.logs = run.logs;
  if (truncated) summary.truncated = `result cut at ${maxChars} characters: return less, or raise maxResultChars`;
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
    { type: "text", text: JSON.stringify(summary, null, 1) }
  ];
  if (resultText) content.push({ type: "text", text: resultText });
  for (const i of run.images) content.push({ type: "image", data: i.data, mimeType: i.mimeType });
  return { content, ...(run.ok ? {} : { isError: true }) };
}

export function registerCodeTools(server: McpServer, catalog: ToolCatalog): void {
  server.tool(
    "jradb_code",
    "Code mode: run an async JavaScript body that calls this MCP's tools and return only what you need. " +
      "`await tools.<tool_name>(args)` calls any tool (args as in jradb_api; returns the parsed JSON). Helpers: " +
      "log(...), show(i?) adds the last call's images to the answer, sleep(ms), readText/readJson/writeText/exists/" +
      "mkdir/listDir(path), path.join/dirname/basename. End with `return {...}` (keep it small). Independent apps can " +
      "run in parallel with Promise.all. A failed tool throws (catch it to continue). Long work: background: true " +
      "returns a jobId at once; poll with { jobId }. Inside a background job an app call waits as long as the job allows " +
      "(no 60 s bridge timeout), so a long build followed by a render runs to the end. Read jradb_api first for signatures.",
    {
      code: z.string().optional().describe("Body of an async function. Example: const d = await tools.ps_audit_document({}); return d.verdict;"),
      background: z.boolean().optional().describe("Return a jobId at once and run in the background (for work over ~60 s)."),
      jobId: z.string().optional().describe("Poll a background script: its result, or 'running'."),
      timeoutSeconds: z.number().int().min(5).max(3600).optional().default(900),
      maxResultChars: z.number().int().min(200).max(60000).optional().default(6000)
    },
    async ({ code, background, jobId, timeoutSeconds, maxResultChars }, extra) => {
      if (jobId) {
        const file = path.join(jobsDir(), `${jobId.replace(/[^\w-]/g, "")}.json`);
        if (!fs.existsSync(file)) return { content: [{ type: "text" as const, text: JSON.stringify({ jobId, status: "unknown job" }) }], isError: true };
        const saved = JSON.parse(fs.readFileSync(file, "utf8")) as ScriptRun & { status: string; started: number; jobId: string };
        if (saved.status === "running") {
          return { content: [{ type: "text" as const, text: JSON.stringify({ jobId, status: "running", seconds: Math.round((Date.now() - saved.started) / 1000) }) }] };
        }
        return toResponse({ ...saved, jobId }, maxResultChars);
      }
      if (!code) return { content: [{ type: "text" as const, text: "Pass code (or jobId to poll a background script)." }], isError: true };
      const timeoutMs = timeoutSeconds * 1000;
      if (background) {
        const id = randomUUID().slice(0, 8);
        const dir = jobsDir();
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${id}.json`);
        fs.writeFileSync(file, JSON.stringify({ status: "running", started: Date.now(), jobId: id }));
        // Bridge calls inside a background job may wait for the time the job has left (see runWithTimeoutFloor).
        void runWithTimeoutFloor(Date.now() + timeoutMs - 5000, () => runScript(catalog, code, { timeoutMs, extra })).then((run) =>
          fs.writeFileSync(file, JSON.stringify({ ...run, status: "done", jobId: id }))
        );
        return { content: [{ type: "text" as const, text: JSON.stringify({ jobId: id, status: "running", poll: "jradb_code { jobId }" }) }] };
      }
      const run = await runScript(catalog, code, { timeoutMs, extra });
      return toResponse(run, maxResultChars);
    }
  );

  server.tool(
    "jradb_api",
    "Signatures for jradb_code: with `tools`, each tool's arguments as TypeScript (with defaults and one-line notes); " +
      "with `search` or `prefix` (ps_, ae_, pr_, ai_, id_, lr_, media_, jradb_), matching names with one line each.",
    {
      tools: z.array(z.string()).optional().describe("Exact names to describe in full."),
      search: z.string().optional().describe("Words to look for in names and descriptions."),
      prefix: z.string().optional()
    },
    async ({ tools: names, search, prefix }) => {
      const lines: string[] = [];
      if (names?.length) {
        for (const n of names) {
          const e = catalog.get(n);
          if (!e) {
            lines.push(`// ${n}: unknown tool`);
            continue;
          }
          lines.push(`// ${firstSentence(e.description, 300)}\n${n}(args: ${shapeToTs(e.shape)})`);
        }
      } else {
        const words = (search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
        for (const e of catalog.all()) {
          if (e.name === "jradb_code" || e.name === "jradb_api") continue;
          if (prefix && !e.name.startsWith(prefix)) continue;
          const hay = `${e.name} ${e.description}`.toLowerCase();
          if (words.length && !words.every((w) => hay.includes(w))) continue;
          lines.push(`${e.name} — ${firstSentence(e.description, 110)}`);
        }
        if (!lines.length) lines.push("No tool matches. Try a prefix (ps_, ae_, pr_, ai_, id_, lr_) or fewer words.");
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );
}
