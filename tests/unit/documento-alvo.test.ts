/**
 * Target document (rule 27/11/2026): every Photoshop / Illustrator / InDesign command goes to a named document,
 * never to "whatever is in front" — the person may be working in another file of the same app at the same time.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolCatalog } from "../../src/core/tool-catalog.js";
import { runWithDocument, withTargetDocument, wantsDocumentParam } from "../../src/core/doc-target.js";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const RUNTIME = read("src/extendscript/es3-runtime.jsx");

function sandboxWith(names: string[], activeIndex: number) {
  const docs = names.map((name) => ({ name, fullName: { fsName: "D:/trabalho/" + name } }));
  const log: string[] = [];
  const appObj = {
    documents: Object.assign(docs, {}),
    _active: docs[activeIndex],
    get activeDocument() {
      return this._active;
    },
    set activeDocument(d: { name: string }) {
      log.push("front:" + d.name);
      this._active = d;
    }
  };
  const sandbox: Record<string, unknown> = { app: appObj };
  vm.createContext(sandbox);
  vm.runInContext(RUNTIME, sandbox);
  return { sandbox, appObj, log };
}

describe("documento alvo: lado do app (es3-runtime)", () => {
  it("refuses a command without documentName when several documents are open", () => {
    const { sandbox } = sandboxWith(["Meu.psd", "Do usuario.psd"], 1);
    expect(() => vm.runInContext(`__mcpEnterDocument("ps.layer.create", {})`, sandbox)).toThrow(/documentName/);
  });

  it("brings the named document to front for the command and puts the person's document back afterwards", () => {
    const { sandbox, appObj, log } = sandboxWith(["Meu.psd", "Do usuario.psd"], 1);
    (sandbox as { P: unknown }).P = { documentName: "Meu" }; // without extension
    const st = vm.runInContext(`__mcpEnterDocument("ps.layer.create", P)`, sandbox);
    expect(appObj._active.name).toBe("Meu.psd");
    expect((sandbox.P as { documentName: string }).documentName).toBe("Meu.psd"); // exact name for the handler
    (sandbox as { S: unknown }).S = st;
    vm.runInContext(`__mcpLeaveDocument(S)`, sandbox);
    expect(appObj._active.name).toBe("Do usuario.psd");
    expect(log).toEqual(["front:Meu.psd", "front:Do usuario.psd"]);
  });

  it("finds an unsaved document named with an extension it does not have", () => {
    const { sandbox, appObj } = sandboxWith(["Sem titulo", "Do usuario.psd"], 1);
    vm.runInContext(`__mcpEnterDocument("ps.layer.create", { documentName: "Sem titulo.psd" })`, sandbox);
    expect(appObj._active.name).toBe("Sem titulo");
  });

  it("does not switch anything when the named document is already in front", () => {
    const { sandbox, log } = sandboxWith(["Meu.psd", "Do usuario.psd"], 0);
    const st = vm.runInContext(`__mcpEnterDocument("ps.layer.create", { documentName: "Meu.psd" })`, sandbox);
    (sandbox as { S: unknown }).S = st;
    vm.runInContext(`__mcpLeaveDocument(S)`, sandbox);
    expect(log).toEqual([]);
  });

  it("names the open documents when the name is wrong", () => {
    const { sandbox } = sandboxWith(["Meu.psd", "Do usuario.psd"], 1);
    expect(() => vm.runInContext(`__mcpEnterDocument("ps.layer.create", { documentName: "Outro.psd" })`, sandbox)).toThrow(
      /Meu\.psd \| Do usuario\.psd/
    );
  });

  it("lets create, open and list run without a target, and a single open document is unambiguous", () => {
    const two = sandboxWith(["A.psd", "B.psd"], 0);
    for (const a of ["ps.doc.create", "ps.doc.open", "ps.doc.list", "adobe.ping"]) {
      expect(() => vm.runInContext(`__mcpEnterDocument("${a}", {})`, two.sandbox), a).not.toThrow();
    }
    expect(() => vm.runInContext(`__mcpEnterDocument("ai.doc.manage", { operation: "open" })`, two.sandbox)).not.toThrow();
    expect(() => vm.runInContext(`__mcpEnterDocument("ai.doc.manage", { operation: "save" })`, two.sandbox)).toThrow(/documentName/);
    const one = sandboxWith(["A.psd"], 0);
    expect(() => vm.runInContext(`__mcpEnterDocument("ps.layer.create", {})`, one.sandbox)).not.toThrow();
  });

  it("raw scripts: refused only when they rely on app.activeDocument with several documents open", () => {
    const { sandbox } = sandboxWith(["A.psd", "B.psd"], 0);
    const run = (code: string) => vm.runInContext(`__mcpEnterDocument("ps.raw.executeExtendScript", { code: ${JSON.stringify(code)} })`, sandbox);
    expect(() => run("app.activeDocument.activeLayer.name")).toThrow(/activeDocument/);
    expect(() => run('var d = app.documents.getByName("A.psd"); app.activeDocument = d; d.name')).not.toThrow();
    expect(() => run("app.version")).not.toThrow();
  });

  it("a batch hands its documentName to the steps that do not name one", () => {
    const src = read("src/extendscript/es3-runtime.jsx");
    expect(src).toMatch(/if \(!ops\[di\]\.params\.documentName\) ops\[di\]\.params\.documentName = params\.documentName;/);
  });

  it("every app's dispatcher enters and leaves the target document", () => {
    for (const f of ["ps-handlers.jsx", "ai-handlers.jsx", "id-handlers.jsx"]) {
      const src = read("src/extendscript/" + f);
      expect(src, f).toMatch(/function __mcpDispatch[\s\S]{0,900}__mcpEnterDocument\(action, params\)[\s\S]{0,400}__mcpLeaveDocument\(/);
    }
    const uxp = read("bridges/uxp-photoshop/main.js");
    expect(uxp).toMatch(/const docState = await enterDocument\(msg\.action, params\);[\s\S]{0,700}await leaveDocument\(docState\);/);
  });
});

describe("documento alvo: servidor", () => {
  it("every Photoshop, Illustrator and InDesign tool that works on a document takes documentName", () => {
    const catalog = new ToolCatalog();
    const server = catalog.wrap(new McpServer({ name: "t", version: "0" }));
    server.tool("ai_create_shape", "x", { kind: z.string() }, async () => ({ content: [] }));
    server.tool("id_preflight", "x", async () => ({ content: [] }));
    server.tool("ps_create_document", "x", { name: z.string() }, async () => ({ content: [] }));
    server.tool("ae_list_compositions", "x", {}, async () => ({ content: [] }));
    expect(catalog.get("ai_create_shape")!.shape).toHaveProperty("documentName");
    expect(catalog.get("id_preflight")!.shape).toHaveProperty("documentName");
    expect(catalog.get("ps_create_document")!.shape).not.toHaveProperty("documentName");
    expect(catalog.get("ae_list_compositions")!.shape).not.toHaveProperty("documentName");
    expect(wantsDocumentParam("ps_list_documents")).toBe(false);
  });

  it("the tool call's documentName reaches every command it sends to a document app", () => {
    runWithDocument("Post.psd", () => {
      expect(withTargetDocument("photoshop", { a: 1 })).toEqual({ a: 1, documentName: "Post.psd" });
      expect(withTargetDocument("illustrator", { documentName: "Outro.ai" })).toEqual({ documentName: "Outro.ai" });
      expect(withTargetDocument("after-effects", { a: 1 })).toEqual({ a: 1 });
    });
    expect(withTargetDocument("photoshop", { a: 1 })).toEqual({ a: 1 });
  });
});
