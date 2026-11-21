import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logUsage } from "./usage-log.js";

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
