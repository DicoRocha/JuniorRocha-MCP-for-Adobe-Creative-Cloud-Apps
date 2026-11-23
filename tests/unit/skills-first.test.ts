/**
 * 21/11/2026: skills first (no task in the apps without the craft skills), the After Effects render that
 * stopped on "already exists. Overwrite?", leftovers of a failed After Effects command, and the Photoshop
 * recipe preview after closeAfter.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vm from "node:vm";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../src/core/bridge-router.js";
import {
  checkSkillGate,
  isGatedTool,
  markSkillsConsulted,
  resetSkillGate,
  skillGateNotice,
  skillGateState
} from "../../src/core/skill-gate.js";
import { gateHandler } from "../../src/core/tool-catalog.js";
import { findSkills, registerSkillTools, skillTerms } from "../../src/tools/shared/skills.js";
import { CODE_MODE_TOOLS, SERVER_INSTRUCTIONS } from "../../src/server.js";
import { registerAfterEffectsTools } from "../../src/tools/after-effects/index.js";

const repo = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(repo, p), "utf8");

describe("skills gate", () => {
  const saved = process.env.JRADB_MCP_SKILLS_GATE;
  beforeEach(() => resetSkillGate());
  afterEach(() => {
    process.env.JRADB_MCP_SKILLS_GATE = saved;
    resetSkillGate();
  });

  it("classifies tools: reading, looking and session tools pass, creating or changing tools are gated", () => {
    for (const n of [
      "jradb_get_status",
      "jradb_get_skill",
      "jradb_find_skills",
      "jradb_code",
      "ps_list_documents",
      "ps_get_canvas_snapshot",
      "ai_get_artboard_preview",
      "ae_get_comp_frame_preview",
      "ae_audit_motion",
      "id_get_document_info",
      "lr_find_photos",
      "pr_get_sequence_state",
      "media_job_status"
    ]) {
      expect(isGatedTool(n), n).toBe(false);
    }
    for (const n of ["ps_create_document", "ae_set_keyframes", "ae_render_queue", "ai_create_text", "id_export", "lr_apply_develop_settings", "pr_place_clip_on_timeline", "ps_execute_extendscript"]) {
      expect(isGatedTool(n), n).toBe(true);
    }
  });

  it("strict (default) blocks a gated tool until a skill was looked up", async () => {
    delete process.env.JRADB_MCP_SKILLS_GATE;
    let ran = 0;
    const h = gateHandler("ps_create_document", async () => {
      ran++;
      return { content: [{ type: "text", text: "{}" }] };
    });
    const blocked = (await h({})) as { isError?: boolean; content: Array<{ text: string }> };
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0].text).toContain("SKILLS_REQUIRED");
    expect(blocked.content[0].text).toContain("jradb_find_skills");
    expect(ran).toBe(0);
    expect(checkSkillGate("ps_list_documents")).toBeNull();

    markSkillsConsulted({ skill: "social-post" });
    await h({});
    expect(ran).toBe(1);
    expect(skillGateState()).toMatchObject({ mode: "strict", consulted: true, loaded: ["social-post"] });
  });

  it("notice mode runs the tool and appends the reminder; off disables the gate", async () => {
    process.env.JRADB_MCP_SKILLS_GATE = "notice";
    const h = gateHandler("ai_create_text", async () => ({ content: [{ type: "text", text: "ok" }] }));
    const r = (await h({})) as { content: Array<{ text: string }> };
    expect(r.content[0].text).toBe("ok");
    expect(r.content[1].text).toMatch(/^Notice: ai_create_text ran before any skill/);
    process.env.JRADB_MCP_SKILLS_GATE = "off";
    expect(checkSkillGate("ai_create_text")).toBeNull();
    expect(skillGateNotice("ai_create_text")).toBeNull();
  });

  it("the server tells every client the rule, and code mode exposes the search tool", () => {
    expect(SERVER_INSTRUCTIONS).toContain("Skills first");
    expect(SERVER_INSTRUCTIONS).toContain("jradb_find_skills");
    expect(SERVER_INSTRUCTIONS).toContain("ask once");
    expect(CODE_MODE_TOOLS).toContain("jradb_find_skills");
    expect(read("src/server.ts")).toContain("{ instructions: SERVER_INSTRUCTIONS }");
    expect(read("skills/index.md")).toContain("**Skills primeiro (obrigatório):**");
  });
});

describe("jradb_find_skills", () => {
  const root = path.join(repo, "skills");
  beforeEach(() => resetSkillGate());

  it("normalises accents and drops stop words", () => {
    expect(skillTerms("Animação do logo para o Reels")).toEqual(["animacao", "logo", "reels"]);
  });

  it("ranks the real skills for plain requests", () => {
    const top = (task: string) => findSkills(root, task, 6).map((m) => m.name);
    expect(top("animação de logo, vinheta")).toContain("motion-logo-e-vinheta");
    expect(top("carrossel para instagram")).toContain("social-carrossel");
    expect(top("tratar fotos de produto para e-commerce")).toContain("foto-produto");
    expect(top("flyer cartaz impresso")).toContain("print-flyer-cartaz");
    expect(findSkills(root, "a e o", 6)).toEqual([]);
  });

  it("marks the session as consulted and adds the exit gate skills", async () => {
    const handlers: Record<string, (a: unknown) => Promise<{ content: Array<{ text: string }> }>> = {};
    const server = { tool: (name: string, ...rest: unknown[]) => (handlers[name] = rest[rest.length - 1] as never) } as unknown as McpServer;
    registerSkillTools(server, root);
    const r = await handlers.jradb_find_skills({ task: "legenda animada palavra por palavra no reels", limit: 5 });
    const data = JSON.parse(r.content[0].text);
    expect(data.matches.length).toBeGreaterThan(0);
    expect(data.alsoLoad).toContain("qa-revisao-visual");
    expect(data.next).toContain("ask whether to go ahead");
    expect(skillGateState().consulted).toBe(true);
  });
});

describe("ae_render_queue never stops on the Overwrite dialog", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  function setup(dispatchImpl: (action: string, params: Record<string, unknown>) => unknown) {
    const calls: Array<{ action: string; params: Record<string, unknown> }> = [];
    const router = {
      dispatch: async (_app: string, action: string, params: Record<string, unknown>) => {
        calls.push({ action, params });
        const out = await dispatchImpl(action, params);
        return { data: out, bridgeType: "cep" };
      }
    } as unknown as BridgeRouter;
    const tools: Record<string, (p: unknown, e: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>> = {};
    const server = { tool: (name: string, ...rest: unknown[]) => (tools[name] = rest[rest.length - 1] as never) } as unknown as McpServer;
    registerAfterEffectsTools(server, router);
    return { calls, run: tools.ae_render_queue };
  }

  function existing() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-render-"));
    dirs.push(dir);
    const f = path.join(dir, "previa.mp4");
    fs.writeFileSync(f, "old render");
    return f;
  }

  it("queues first, removes the existing file, then starts the render", async () => {
    const f = existing();
    const { calls, run } = setup((action) =>
      action === "ae.render.queue" ? { outputPath: f, renderQueueIndex: 2 } : { started: true, status: "DONE" }
    );
    const r = await run({ compName: "Video", outputPath: f, startRenderImmediately: true, queueInAME: false, overwrite: true }, {});
    const d = JSON.parse(r.content[0].text);
    // ae.render.info answers without a saved project here, so the render stays in the app.
    expect(calls.map((c) => c.action)).toEqual(["ae.render.info", "ae.render.queue", "ae.render.start"]);
    expect(calls[1].params).toMatchObject({ startRenderImmediately: false, queueInAME: false });
    expect(calls[2].params).toMatchObject({ renderQueueIndex: 2 });
    expect(d).toMatchObject({ replacedExisting: true, rendered: true });
    expect(fs.existsSync(f)).toBe(false);
  });

  it("a saved, clean project renders with aerender and leaves the app free", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-aer-"));
    dirs.push(dir);
    const pkg = path.join(dir, "Adobe After Effects.app");
    fs.mkdirSync(pkg);
    const exe = path.join(dir, "aerender");
    fs.writeFileSync(exe, '#!/bin/sh\nwhile [ "$1" != "-output" ]; do shift; done\nprintf "video" > "$2"\necho "PROGRESS: Finished composition"\n');
    fs.chmodSync(exe, 0o755);
    const out = path.join(dir, "out", "final.mp4");
    const { calls, run } = setup(() => ({ compName: "Video", projectPath: path.join(dir, "p.aep"), dirty: false, appPackage: pkg }));
    const r = await run({ compName: "Video", outputPath: out, startRenderImmediately: true, queueInAME: false, overwrite: true, engine: "auto" }, {});
    const d = JSON.parse(r.content[0].text);
    expect(calls.map((c) => c.action)).toEqual(["ae.render.info"]);
    expect(d).toMatchObject({ engine: "aerender", rendering: true });
    const { getJob } = await import("../../src/media/jobs.js");
    for (let i = 0; i < 50 && getJob(d.renderJobId)?.status === "running"; i++) await new Promise((res) => setTimeout(res, 50));
    expect(getJob(d.renderJobId)?.status).toBe("done");
    expect(fs.readFileSync(out, "utf8")).toBe("video");
  });

  it("unsaved changes keep the render in the app and say why", async () => {
    const f = existing();
    const { calls, run } = setup((action) =>
      action === "ae.render.info" ? { compName: "Video", projectPath: "D:/p.aep", dirty: true, appPackage: "/x/AE.app" } : action === "ae.render.queue" ? { outputPath: f } : { status: "DONE" }
    );
    const r = await run({ compName: "Video", outputPath: f, startRenderImmediately: true, engine: "auto" }, {});
    const d = JSON.parse(r.content[0].text);
    expect(calls.map((c) => c.action)).toEqual(["ae.render.info", "ae.render.queue", "ae.render.start"]);
    expect(d.engine).toBe("app");
    expect(d.engineNote).toMatch(/unsaved/);
  });

  it("overwrite: false refuses with OUTPUT_EXISTS and sends nothing to the app", async () => {
    const f = existing();
    const { calls, run } = setup(() => ({ outputPath: f }));
    const r = await run({ compName: "Video", outputPath: f, startRenderImmediately: true, overwrite: false }, {});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("OUTPUT_EXISTS");
    expect(calls).toHaveLength(0);
    expect(fs.readFileSync(f, "utf8")).toBe("old render");
  });

  it("a render longer than the bridge timeout becomes a job to poll, not an error", async () => {
    const f = existing();
    const { run } = setup((action) => {
      if (action === "ae.render.start") throw Object.assign(new Error("timeout"), { code: "BRIDGE_TIMEOUT" });
      return { outputPath: f };
    });
    const r = await run({ compName: "Video", outputPath: f, startRenderImmediately: true }, {});
    const d = JSON.parse(r.content[0].text);
    expect(r.isError).toBeFalsy();
    expect(d.rendering).toBe(true);
    expect(d.renderJobId).toBeTruthy();
    expect(d.next).toContain("media_job_status");
  });

  it("the start handler exists in the panel copies of the After Effects handlers", () => {
    for (const p of ["src/extendscript/ae-handlers.jsx", "bridges/cep-universal-bridge/jsx/ae-handlers.jsx"]) {
      expect(read(p), p).toContain('action === "ae.render.start"');
      expect(read(p), p).toContain('action === "ae.render.info"');
    }
  });
});

describe("After Effects: a failed command leaves no project items behind", () => {
  it("removes items created by the failed command and reports them", () => {
    const items: Array<{ id: number; name: string; remove: () => void }> = [];
    const add = (id: number, name: string) => {
      const it = { id, name, remove: () => items.splice(items.indexOf(it), 1) };
      items.push(it);
    };
    add(1, "Minha comp");
    const app = {
      beginUndoGroup: () => undefined,
      endUndoGroup: () => undefined,
      executeCommand: () => undefined, // undo reverts only part of it (imports split the group)
      project: {
        get numItems() {
          return items.length;
        },
        item: (i: number) => items[i - 1],
        items: { addFolder: () => undefined }
      }
    };
    const ctx: Record<string, unknown> = { app, $: { global: {} } };
    vm.createContext(ctx);
    vm.runInContext(read("src/extendscript/es3-runtime.jsx"), ctx);
    (ctx as Record<string, unknown>).__addLeft = () => {
      add(7, "Video 1 (parcial)");
      add(8, "narracao.mp3");
    };
    const out = JSON.parse(
      vm.runInContext(`__mcpExecuteWithUndo("after-effects", "t", function () { __addLeft(); throw new Error("boom"); })`, ctx) as string
    );
    expect(out.ok).toBe(false);
    expect(out.leftoversRemoved.sort()).toEqual(["Video 1 (parcial)", "narracao.mp3"]);
    expect(items.map((i) => i.name)).toEqual(["Minha comp"]);
    expect(out.error.message).toContain("rolled back");
  });
});

describe("Photoshop recipe preview after closeAfter", () => {
  it("the recipes preview the written file instead of the closed document", () => {
    const src = read("src/tools/photoshop/recipes.ts");
    expect(src).toContain("export async function recipePreview");
    expect((src.match(/await recipePreview\(router, data\)/g) || []).length).toBe(3);
    for (const p of ["bridges/uxp-photoshop/main.js"]) expect(read(p)).toContain("params.documentName");
    for (const p of ["src/extendscript/ps-handlers.jsx", "bridges/uxp-photoshop/jsx/ps-handlers.jsx"]) {
      expect(read(p), p).toContain("getByName(params.documentName)");
    }
  });
});
