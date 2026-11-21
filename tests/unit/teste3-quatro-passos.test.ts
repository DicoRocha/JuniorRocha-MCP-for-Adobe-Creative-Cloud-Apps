/**
 * Regressions from the third campaign test (13/11/2026, "Aligner in 4 Schritten"): an After Effects
 * render that raised "Undo group mismatch", Premiere bins and Dynamic Link names, InDesign text with
 * literal "\r", Photoshop layer styles without the UXP panel and edits landing in the wrong document,
 * a 78 KB Lumetri readback, and the Lightroom placeholder preview (Lua side runs in tests/lua).
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { spawnSync } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../src/core/bridge-router.js";
import { registerPhotoshopTools, PS_DOCUMENT_TOOLS } from "../../src/tools/photoshop/index.js";
import { compactEffectReadback } from "../../src/tools/premiere/index.js";
import { getErrorHint } from "../../src/core/error-hints.js";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

function sandbox(files: string[], extra: Record<string, unknown>) {
  const ctx: Record<string, unknown> = { Units: { PIXELS: "PIXELS" }, DialogModes: { NO: "NO" }, ...extra };
  vm.createContext(ctx);
  vm.runInContext(files.map((f) => read(`src/extendscript/${f}`)).join("\n"), ctx);
  return ctx;
}

describe("After Effects undo groups", () => {
  it("a handler can close the command's undo group early without a second endUndoGroup", () => {
    const calls: string[] = [];
    const ctx = sandbox(["es3-runtime.jsx"], {
      app: { beginUndoGroup: () => calls.push("begin"), endUndoGroup: () => calls.push("end") }
    });
    const out = JSON.parse(
      vm.runInContext(`__mcpExecuteWithUndo("after-effects", "t", function () { __mcpCloseUndoGroup(); return 1; })`, ctx) as string
    );
    expect(out.ok).toBe(true);
    expect(calls).toEqual(["begin", "end"]);
  });

  it("still closes the group once when the command fails", () => {
    const calls: string[] = [];
    const ctx = sandbox(["es3-runtime.jsx"], {
      app: { beginUndoGroup: () => calls.push("begin"), endUndoGroup: () => calls.push("end") }
    });
    const out = JSON.parse(
      vm.runInContext(`__mcpExecuteWithUndo("after-effects", "t", function () { throw new Error("x"); })`, ctx) as string
    );
    expect(out.ok).toBe(false);
    expect(calls).toEqual(["begin", "end"]);
  });

  it("render queue and project switches close the undo group before running", () => {
    const ae = read("src/extendscript/ae-handlers.jsx");
    const close = ae.indexOf("__mcpCloseUndoGroup();", ae.indexOf('action === "ae.render.queue"'));
    expect(close).toBeGreaterThan(0);
    expect(close).toBeLessThan(ae.indexOf("rq.queueInAME(", ae.indexOf('action === "ae.render.queue"')));
    expect(ae.indexOf("__mcpCloseUndoGroup") ).toBeLessThan(ae.indexOf("app.newProject();"));
  });
});

describe("After Effects user code never leaves undo groups unbalanced (18/11/2026)", () => {
  const run = (code: string) => {
    const calls: string[] = [];
    const ctx = sandbox(["es3-runtime.jsx"], {
      app: { beginUndoGroup: () => calls.push("begin"), endUndoGroup: () => calls.push("end"), project: { save: () => calls.push("save") } }
    });
    (ctx as Record<string, unknown>).__code = code;
    const out = JSON.parse(
      vm.runInContext(`__mcpExecuteWithUndo("after-effects", "t", function () { return __mcpEvalAeUserCode(__code); })`, ctx) as string
    );
    return { out, calls };
  };

  it("a script with its own group and a save runs the save outside any group", () => {
    const { out, calls } = run('app.beginUndoGroup("x"); var a = 1; app.endUndoGroup(); app.project.save(); a;');
    expect(out.ok).toBe(true);
    expect(calls).toEqual(["begin", "end", "begin", "end", "save"]);
  });

  it("a script that forgets endUndoGroup is closed by the MCP", () => {
    const { calls } = run('app.beginUndoGroup("x"); 1;');
    expect(calls).toEqual(["begin", "end", "begin", "end"]);
  });

  it("nested groups become one and an extra end is ignored", () => {
    const { calls } = run('app.beginUndoGroup("a"); app.beginUndoGroup("b"); app.endUndoGroup(); app.endUndoGroup(); app.endUndoGroup(); 1;');
    expect(calls).toEqual(["begin", "end", "begin", "end"]);
  });

  it("a script that throws still ends balanced", () => {
    const { out, calls } = run('app.beginUndoGroup("x"); throw new Error("boom");');
    expect(out.ok).toBe(false);
    expect(calls.filter((c) => c === "begin").length).toBe(calls.filter((c) => c === "end").length);
  });

  it("plain code keeps the single wrapper group", () => {
    const { calls } = run("1 + 1;");
    expect(calls).toEqual(["begin", "end"]);
  });
});

describe("Illustrator commands never show alerts (18/11/2026)", () => {
  it("suppresses alerts during the command and restores the level, even on failure", () => {
    const seen: string[] = [];
    const app: Record<string, unknown> = { userInteractionLevel: "DISPLAYALERTS" };
    const ctx = sandbox(["es3-runtime.jsx"], { app, UserInteractionLevel: { DONTDISPLAYALERTS: "DONTDISPLAYALERTS", DISPLAYALERTS: "DISPLAYALERTS" }, __seen: seen });
    vm.runInContext(`__mcpExecuteWithUndo("illustrator", "t", function () { __seen.push(String(app.userInteractionLevel)); return 1; })`, ctx);
    expect(seen).toEqual(["DONTDISPLAYALERTS"]);
    expect(app.userInteractionLevel).toBe("DISPLAYALERTS");
    vm.runInContext(`__mcpExecuteWithUndo("illustrator", "t", function () { throw new Error("x"); })`, ctx);
    expect(app.userInteractionLevel).toBe("DISPLAYALERTS");
  });
});

describe("Premiere project items", () => {
  const bin = (name: string, children: unknown[]) => ({ name, type: 2, children: Object.assign(children, { numItems: children.length }) });
  const clip = (name: string, media: string) => ({ name, type: 1, getMediaPath: () => media });
  const aep = "D:/x/4S_Motion.aep";

  it("finds a Dynamic Link comp by its comp name, not the first item sharing the .aep path", () => {
    const root = bin("root", [
      bin("AE Dynamic Link", [clip("4S_Story_Schritt_1/4S_Motion.aep", aep), clip("4S_Story_Schritt_2/4S_Motion.aep", aep)])
    ]);
    const ctx = sandbox(["es3-runtime.jsx", "pr-handlers.jsx"], { ProjectItemType: { BIN: 2 }, app: {} });
    const find = ctx.__prFindProjectItemByNameOrPath as (b: unknown, n: string) => { name: string } | null;
    expect(find(root, "4S_Story_Schritt_2")?.name).toBe("4S_Story_Schritt_2/4S_Motion.aep");
    expect(find(root, "4S_Story_Schritt_1/4S_Motion.aep")?.name).toBe("4S_Story_Schritt_1/4S_Motion.aep");
    expect(find(root, aep)?.name).toBe("4S_Story_Schritt_1/4S_Motion.aep");
    expect(find(root, "nope")).toBeNull();
  });

  it("keeps big effect readbacks small (Lumetri x 4 clips was 78 KB)", () => {
    const props = Array.from({ length: 117 }, (_, i) => ({ index: i, displayName: i === 40 ? "Saturation" : `P${i}`, value: i }));
    const data = {
      clips: [0, 1, 2, 3].map((i) => ({ clipIndex: i, component: { displayName: "Lumetri Color", properties: props } }))
    };
    const out = compactEffectReadback(data, ["Saturation"]) as { clips: Array<{ component: { properties: unknown[]; propertiesTotal: number } }> };
    expect(out.clips[0].component.properties).toHaveLength(1);
    expect(out.clips[0].component.propertiesTotal).toBe(117);
    expect(out.clips[3].component.properties).toHaveLength(0);
    expect(JSON.stringify(out).length).toBeLessThan(2000);
    const small = { clips: [{ component: { properties: props.slice(0, 5) } }] };
    expect((compactEffectReadback(small, []) as typeof small).clips[0].component.properties).toHaveLength(5);
  });
});

describe("InDesign text", () => {
  it("turns literal \\r, \\n and \\t into real characters", () => {
    const ctx = sandbox(["es3-runtime.jsx", "id-handlers.jsx"], { app: {} });
    const un = ctx.__idUnescapeText as (s: unknown) => string;
    expect(un("Aligner\\rIhr Weg\\nzu\\tgeraden")).toBe("Aligner\rIhr Weg\nzu\tgeraden");
    expect(un("schon\rrichtig")).toBe("schon\rrichtig");
    expect(un(undefined)).toBe("");
  });

  it("find/change reads its samples before changing", () => {
    const id = read("src/extendscript/id-handlers.jsx");
    const block = id.slice(id.indexOf('action === "id.text.findChange"'));
    expect(block.indexOf("samples.push")).toBeLessThan(block.indexOf("changeGrep()"));
  });
});

describe("Photoshop", () => {
  it("builds layer styles in ExtendScript too (no UXP panel needed)", () => {
    const ctx = sandbox(["es3-runtime.jsx", "ps-handlers.jsx"], { app: {} });
    const style = ctx.__psLayerStyle as (t: string, s: Record<string, unknown>) => { key: string; value: Record<string, any> };
    expect(style("dropShadow", { color: "#000000", size: 12 }).value.blur._value).toBe(12);
    const g = style("gradientOverlay", { from: "#0A0B0D", to: "#E3C38F", toOpacity: 0 });
    expect(g.key).toBe("gradientFill");
    expect(g.value.gradient.colors[1].color.red).toBe(227);
    expect(g.value.gradient.transparency[1].opacity._value).toBe(0);
    expect(style("colorOverlay", { color: "#ffffff" }).key).toBe("solidFill");
    expect(() => style("bevel", {})).toThrow(/not built in/);
  });

  it("document tools accept documentName and bring that document to the front first", async () => {
    const calls: Array<{ action: string; params: any }> = [];
    const router = {
      dispatch: async (_app: string, action: string, params: any) => {
        calls.push({ action, params });
        return { data: { results: [{}] }, bridgeType: "cep" };
      }
    } as unknown as BridgeRouter;
    const tools: Record<string, { schema: Record<string, unknown>; handler: (p: any, e: any) => Promise<any> }> = {};
    const server = {
      tool: (name: string, _d: string, schema: Record<string, unknown>, handler: (p: any, e: any) => Promise<any>) => {
        tools[name] = { schema, handler };
      }
    } as unknown as McpServer;
    registerPhotoshopTools(server, router);
    for (const name of PS_DOCUMENT_TOOLS) {
      expect(tools[name], name).toBeDefined();
      expect(tools[name].schema).toHaveProperty("documentName");
    }
    expect(tools.ps_create_document.schema).not.toHaveProperty("documentName");
    await tools.ps_save_document.handler({ documentName: "4S_Karussell_06_CTA", format: "png", filePath: "D:/a.png" }, {});
    expect(calls[0].action).toBe("ps.raw.batchPlay");
    expect(calls[0].params.descriptors[0]).toEqual({ _obj: "select", _target: [{ _ref: "document", _name: "4S_Karussell_06_CTA" }] });
    expect(calls[1].action).toBe("ps.doc.save");
    expect(calls[1].params).not.toHaveProperty("documentName");
    expect(getErrorHint("DOCUMENT_NOT_FOUND")?.nextTools).toContain("ps_list_documents");
  });

  it("fonts and file placement exist on both Photoshop bridges", () => {
    const uxp = read("bridges/uxp-photoshop/main.js");
    const es = read("src/extendscript/ps-handlers.jsx");
    for (const a of ["ps.fonts.list", "ps.layer.place"]) {
      expect(uxp).toContain(`"${a}"`);
      expect(es).toContain(`"${a}"`);
    }
  });
});

describe("Lightroom plug-in against the SDK mock", () => {
  const hasLupa = spawnSync("python3", ["-c", "import lupa"], { encoding: "utf8" }).status === 0;
  it.skipIf(!hasLupa)("tests/lua/run-mock.py passes (placeholder preview, Lua scope, export names)", () => {
    const r = spawnSync("python3", [path.resolve(__dirname, "../lua/run-mock.py")], { encoding: "utf8" });
    expect(r.stdout).toContain("failures: 0");
  });
});
