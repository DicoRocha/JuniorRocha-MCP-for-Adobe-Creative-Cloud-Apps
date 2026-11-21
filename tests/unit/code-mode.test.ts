import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolCatalog } from "../../src/core/tool-catalog.js";
import { runScript, unpackResult } from "../../src/tools/code/index.js";
import { shapeToTs } from "../../src/core/schema-sig.js";

process.env.JRADB_MCP_USAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "code-"));

function fakeCatalog(): ToolCatalog {
  const catalog = new ToolCatalog();
  const server = catalog.wrap(new McpServer({ name: "t", version: "1" }));
  server.tool("ps_audit_document", "Audit.", { documentName: z.string().optional(), format: z.enum(["feed4x5", "story9x16"]).optional() }, async (a) => ({
    content: [{ type: "text", text: JSON.stringify({ verdict: "ok", doc: a.documentName ?? "active", findings: new Array(50).fill({ code: "X" }) }) }]
  }));
  server.tool("lr_find_photos", "Find.", { limit: z.number().int().min(1).max(5000).optional().default(200) }, async (a) => ({
    content: [{ type: "text", text: JSON.stringify({ photos: Array.from({ length: a.limit }, (_, i) => ({ id: i, path: `H:/x/${i}.jpg` })) }) }, { type: "image", data: "aGVsbG8=", mimeType: "image/png" }]
  }));
  server.tool("pr_fail", "Fails.", {}, async () => ({ content: [{ type: "text", text: "boom" }], isError: true }));
  return catalog;
}

describe("code mode", () => {
  it("calls tools, keeps intermediate data out and returns only the result", async () => {
    const run = await runScript(fakeCatalog(), `
      const a = await tools.ps_audit_document({ documentName: "k.psd" });
      const p = await tools.lr_find_photos({ limit: 40 });
      show();
      log("fotos", p.photos.length);
      return { verdict: a.verdict, ids: p.photos.slice(0, 3).map(x => x.id) };`, { timeoutMs: 5000 });
    expect(run.ok).toBe(true);
    expect(run.result).toEqual({ verdict: "ok", ids: [0, 1, 2] });
    expect(run.calls.map((c) => c.tool)).toEqual(["ps_audit_document", "lr_find_photos"]);
    expect(run.logs).toEqual(["fotos 40"]);
    expect(run.images).toHaveLength(1);
  });

  it("validates arguments and reports tool errors and unknown names", async () => {
    const cat = fakeCatalog();
    const bad = await runScript(cat, `await tools.ps_audit_document({ format: "a4" });`, { timeoutMs: 5000 });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/invalid arguments: format/);
    const fail = await runScript(cat, `try { await tools.pr_fail(); } catch (e) { return "pego: " + e.message; }`, { timeoutMs: 5000 });
    expect(fail.result).toBe("pego: pr_fail: boom");
    const typo = await runScript(cat, `await tools.ps_audit_documnt({});`, { timeoutMs: 5000 });
    expect(typo.error).toMatch(/Did you mean ps_audit_document/);
  });

  it("has no require/process and stops at the timeout", async () => {
    const cat = fakeCatalog();
    const r = await runScript(cat, `return [typeof require, typeof process];`, { timeoutMs: 5000 });
    expect(r.result).toEqual(["undefined", "undefined"]);
    const slow = await runScript(cat, `await sleep(2000); return 1;`, { timeoutMs: 300 });
    expect(slow.ok).toBe(false);
    expect(slow.error).toMatch(/script passed/);
  });

  it("unpacks JSON text and images", () => {
    const u = unpackResult({ content: [{ type: "text", text: '{"a":1}' }, { type: "image", data: "x", mimeType: "image/png" }] });
    expect(u.data).toEqual({ a: 1 });
    expect(u.images).toHaveLength(1);
  });

  it("writes compact signatures", () => {
    const sig = shapeToTs({ documentName: z.string().optional().describe("Doc name. More."), quality: z.number().int().min(1).max(100).optional(), formats: z.array(z.enum(["a", "b"])).default(["a"]) });
    expect(sig).toContain("documentName?: string // Doc name.");
    expect(sig).toContain("quality?: number/*int 1–100*/");
    expect(sig).toContain('formats?: ("a" | "b")[] // default ["a"]');
  });

  it("code mode hides tools from the client but keeps them callable", async () => {
    const catalog = new ToolCatalog();
    catalog.setExposure((n) => n === "jradb_code");
    const server = new McpServer({ name: "t", version: "1" });
    const wrapped = catalog.wrap(server);
    wrapped.tool("ps_x", "X.", {}, async () => ({ content: [{ type: "text", text: '"ok"' }] }));
    expect(catalog.get("ps_x")?.exposed).toBe(false);
    const r = await runScript(catalog, `return await tools.ps_x();`, { timeoutMs: 2000 });
    expect(r.result).toBe("ok");
  });
});

describe("firstSentence", async () => {
  const { firstSentence } = await import("../../src/core/schema-sig.js");
  it("does not stop at abbreviations or numbers", () => {
    expect(firstSentence("Tool names, e.g. 'ps_open_document'. Second sentence.")).toBe("Tool names, e.g. 'ps_open_document'.");
    expect(firstSentence("Scale 1.5 x the size. Next.")).toBe("Scale 1.5 x the size.");
    expect(firstSentence("Use ex. this one. Then that.")).toBe("Use ex. this one.");
    expect(firstSentence("No end")).toBe("No end");
  });
});
