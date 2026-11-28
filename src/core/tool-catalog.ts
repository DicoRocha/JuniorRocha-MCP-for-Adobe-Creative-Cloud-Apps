import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logUsage } from "./usage-log.js";
import { rewritePsdInputs } from "./prefer-psd.js";
import { checkSkillGate, skillGateNotice } from "./skill-gate.js";
import { formatErrorResponse } from "./image-helper.js";
import { documentNameSchema, runWithDocument, wantsDocumentParam } from "./doc-target.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CatalogToolHandler = (args: any, extra?: any) => Promise<unknown> | unknown;

export interface CatalogEntry {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  handler: CatalogToolHandler;
  /** false when the tool is hidden from the client (code mode) and reachable only through jradb_code. */
  exposed: boolean;
}

/**
 * Records every tool registered through a wrapped McpServer (name, zod shape and handler),
 * so other tools — jradb_batch — can validate arguments and replay a tool's parameter mapping.
 */
export class ToolCatalog {
  private readonly entries = new Map<string, CatalogEntry>();
  private expose: (name: string) => boolean = () => true;

  /** Decide which tools the client sees; the others stay callable from jradb_code / jradb_batch. */
  public setExposure(fn: (name: string) => boolean): void {
    this.expose = fn;
  }

  /** Returns a McpServer whose .tool(...) calls are recorded here and forwarded unchanged. */
  public wrap(server: McpServer): McpServer {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const catalog = this;
    return new Proxy(server, {
      get(target, prop, receiver) {
        if (prop === "tool") {
          return (...args: unknown[]) => {
            // Skills first: the gate wraps the handler itself, so the direct call, jradb_code and jradb_batch all pass it.
            const gatedName = String(args[0]);
            // Target document: every Photoshop/Illustrator/InDesign tool takes documentName (core/doc-target.ts).
            if (wantsDocumentParam(gatedName)) addDocumentParam(args);
            const original = args[args.length - 1];
            if (typeof original === "function") args[args.length - 1] = gateHandler(gatedName, original as CatalogToolHandler);
            catalog.record(args);
            // what reaches the model is measured here (jradb_batch replays the recorded, unwrapped handlers)
            const name = String(args[0]);
            if (!catalog.expose(name)) return undefined; // recorded only: reachable through jradb_code
            const handler = args[args.length - 1];
            if (typeof handler === "function") {
              args[args.length - 1] = async (input: unknown, extra: unknown) => {
                const t0 = Date.now();
                const result = await (handler as CatalogToolHandler)(input, extra);
                logUsage(name, input, result, Date.now() - t0);
                return result;
              };
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (target.tool as any).apply(target, args);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  }

  public record(args: unknown[]): void {
    const name = args[0];
    const handler = args[args.length - 1];
    if (typeof name !== "string" || typeof handler !== "function") {
      return;
    }
    let shape: z.ZodRawShape = {};
    const description = typeof args[1] === "string" ? (args[1] as string) : "";
    for (let i = 1; i < args.length - 1; i++) {
      const candidate = args[i];
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        shape = candidate as z.ZodRawShape;
        break;
      }
    }
    this.entries.set(name, { name, description, shape, handler: handler as CatalogToolHandler, exposed: this.expose(name) });
  }

  public get(name: string): CatalogEntry | undefined {
    return this.entries.get(name);
  }

  public all(): CatalogEntry[] {
    return [...this.entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  public names(prefix?: string): string[] {
    const all = [...this.entries.keys()];
    return (prefix ? all.filter((n) => n.startsWith(prefix)) : all).sort();
  }

  /** Up to `limit` registered names closest to `name` (shared prefix, then edit distance). */
  public suggest(name: string, prefix?: string, limit = 3): string[] {
    const scored = this.names(prefix).map((candidate) => ({ candidate, score: editDistance(name, candidate) }));
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, limit).map((s) => s.candidate);
  }
}

/** Wraps a tool handler with the skills-first gate (see core/skill-gate.ts). */
export function gateHandler(name: string, handler: CatalogToolHandler): CatalogToolHandler {
  return async (input: unknown, extra?: unknown) => {
    const blocked = checkSkillGate(name);
    if (blocked) return formatErrorResponse(blocked);
    const notice = skillGateNotice(name);
    // The PSD is the master: an image with a PSD of the same name goes in as the PSD (core/prefer-psd.ts).
    const psd = rewritePsdInputs(name, input);
    const docName = psd.input && typeof psd.input === "object" ? (psd.input as { documentName?: unknown }).documentName : undefined;
    const result = await runWithDocument(docName, () => handler(psd.input, extra));
    const notes: string[] = [];
    if (notice) notes.push(notice);
    if (psd.swaps.length) {
      notes.push(
        `PSD first: placed ${psd.swaps.map((s) => s.to).join(", ")} instead of ${psd.swaps.map((s) => s.from).join(", ")} (a later edit in Photoshop updates this file too; JRADB_MCP_PREFER_PSD=off to keep the export).`
      );
    }
    if (notes.length && result && typeof result === "object" && Array.isArray((result as { content?: unknown }).content)) {
      for (const text of notes) (result as { content: Array<{ type: string; text?: string }> }).content.push({ type: "text", text });
    }
    return result;
  };
}

/** Adds an optional documentName to a tool's zod shape (inserting a shape when the tool had none). */
function addDocumentParam(args: unknown[]): void {
  for (let i = 1; i < args.length - 1; i++) {
    const candidate = args[i];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const shape = candidate as z.ZodRawShape;
      if (!("documentName" in shape)) args[i] = { ...shape, documentName: documentNameSchema() };
      return;
    }
  }
  // no shape: name, [description], handler -> name, [description], { documentName }, handler
  args.splice(args.length - 1, 0, { documentName: documentNameSchema() });
}

export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[] = new Array(rows * cols).fill(0);
  for (let i = 0; i < rows; i++) d[i * cols] = i;
  for (let j = 0; j < cols; j++) d[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i * cols + j] = Math.min(d[(i - 1) * cols + j] + 1, d[i * cols + j - 1] + 1, d[(i - 1) * cols + j - 1] + cost);
    }
  }
  return d[rows * cols - 1];
}
