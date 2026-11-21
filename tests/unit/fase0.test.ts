import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vm from "node:vm";
import { resolveTimeoutMs, TIMEOUTS } from "../../src/core/timeouts.js";
import { BridgeRouter, PING_ACTION } from "../../src/core/bridge-router.js";
import { AdobeBridgeError, BridgeCommandPacket, BridgeResponsePacket } from "../../src/core/types.js";
import { formatErrorResponse, waitForStableFile } from "../../src/core/image-helper.js";
import { getErrorHint } from "../../src/core/error-hints.js";
import { listSkills, parseFrontmatter, registerSkillTools } from "../../src/tools/shared/skills.js";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

// ---------------------------------------------------------------------------------------------
describe("timeouts by kind of action", () => {
  it("gives file I/O and renders the long timeout, scripts and previews the medium one, reads the short one", () => {
    expect(resolveTimeoutMs("ps.doc.save")).toBe(TIMEOUTS.heavy);
    expect(resolveTimeoutMs("ps.doc.open")).toBe(TIMEOUTS.heavy);
    expect(resolveTimeoutMs("id.export")).toBe(TIMEOUTS.heavy);
    expect(resolveTimeoutMs("ae.render.queue")).toBe(TIMEOUTS.heavy);
    expect(resolveTimeoutMs("adobe.checkpoint")).toBe(TIMEOUTS.heavy);
    expect(resolveTimeoutMs("ae.project.manage", undefined, { operation: "save" })).toBe(TIMEOUTS.heavy);
    expect(resolveTimeoutMs("ai.doc.manage", undefined, { operation: "open" })).toBe(TIMEOUTS.heavy);
    expect(resolveTimeoutMs("ps.raw.executeExtendScript")).toBe(TIMEOUTS.medium);
    expect(resolveTimeoutMs("ae.comp.getFramePreview")).toBe(TIMEOUTS.medium);
    expect(resolveTimeoutMs("lr.develop.snapshot")).toBe(TIMEOUTS.medium);
    expect(resolveTimeoutMs("ps.layer.create")).toBe(TIMEOUTS.read);
    expect(resolveTimeoutMs("ae.project.manage", undefined, { operation: "import" })).toBe(TIMEOUTS.heavy);
    expect(resolveTimeoutMs("ps.doc.save", 999)).toBe(999);
  });
});

// ---------------------------------------------------------------------------------------------
describe("router: busy detection after a timeout", () => {
  function fakeHub(behaviour: (p: BridgeCommandPacket) => Promise<BridgeResponsePacket>) {
    const sent: BridgeCommandPacket[] = [];
    const hub = {
      sendCommand: vi.fn(async (p: BridgeCommandPacket) => {
        sent.push(p);
        return behaviour(p);
      }),
      getConnectedBridges: vi.fn(async () => [])
    };
    return { hub, sent };
  }
  const ok = (p: BridgeCommandPacket): BridgeResponsePacket => ({
    type: "response",
    id: p.id,
    app: p.app,
    bridgeType: "cep",
    ok: true,
    data: { action: p.action }
  });
  const timeout = (p: BridgeCommandPacket) => new AdobeBridgeError(p.app, "BRIDGE_TIMEOUT", `timed out (${p.action})`);

  it("probes the app before the next command, fails fast with APP_BUSY while it is stuck, then recovers", async () => {
    let stuck = true;
    const { hub, sent } = fakeHub(async (p) => {
      if (p.action === "ae.render.queue") throw timeout(p);
      if (p.action === PING_ACTION && stuck) throw timeout(p);
      return ok(p);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const router = new BridgeRouter({ wsHub: hub as any, enableOsFallback: false, probeTimeoutMs: 50 });

    await expect(router.dispatch("after-effects", "ae.render.queue")).rejects.toMatchObject({ code: "BRIDGE_TIMEOUT" });
    expect(router.getAppStates(["after-effects"])[0].suspectBusySince).not.toBeNull();

    await expect(router.dispatch("after-effects", "ae.layer.create")).rejects.toMatchObject({ code: "APP_BUSY" });
    // The real command was never sent while the app was stuck: only the probe.
    expect(sent.map((p) => p.action)).toEqual(["ae.render.queue", PING_ACTION]);
    expect(sent[1].options?.timeoutMs).toBe(50);

    stuck = false;
    const res = await router.dispatch("after-effects", "ae.layer.create");
    expect(res.ok).toBe(true);
    expect(sent.map((p) => p.action).slice(-2)).toEqual([PING_ACTION, "ae.layer.create"]);
    const st = router.getAppStates(["after-effects"])[0];
    expect(st.suspectBusySince).toBeNull();
    expect(st.lastSuccess?.action).toBe("ae.layer.create");
    expect(st.lastError?.code).toBe("APP_BUSY");
    expect(st.inFlight).toBeNull();
    expect(st.queued).toBe(0);
  });

  it("treats any answer to the probe, even ACTION_NOT_SUPPORTED from an old plugin, as alive", async () => {
    let first = true;
    const { hub } = fakeHub(async (p) => {
      if (first) {
        first = false;
        throw timeout(p);
      }
      if (p.action === PING_ACTION) {
        return { ...ok(p), ok: false, error: { code: "ACTION_NOT_SUPPORTED", message: "Unknown action" } };
      }
      return ok(p);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const router = new BridgeRouter({ wsHub: hub as any, enableOsFallback: false });
    await expect(router.dispatch("photoshop", "ps.doc.save")).rejects.toMatchObject({ code: "BRIDGE_TIMEOUT" });
    await expect(router.dispatch("photoshop", "ps.layer.create")).resolves.toMatchObject({ ok: true });
  });

  it("sends each command with the timeout of its kind", async () => {
    const { hub, sent } = fakeHub(async (p) => ok(p));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const router = new BridgeRouter({ wsHub: hub as any, enableOsFallback: false });
    await router.dispatch("indesign", "id.export");
    await router.dispatch("indesign", "id.doc.getInfo");
    await router.dispatch("indesign", "id.doc.manage", { operation: "save" });
    expect(sent.map((p) => p.options?.timeoutMs)).toEqual([TIMEOUTS.heavy, TIMEOUTS.read, TIMEOUTS.heavy]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("structured errors", () => {
  const parse = (r: { content: Array<{ text?: string }> }) => JSON.parse(r.content[0].text as string);

  it("adds recoverable, hint and next tools by code", () => {
    const e = parse(formatErrorResponse(new AdobeBridgeError("photoshop", "BRIDGE_TIMEOUT", "timed out")));
    expect(e.error.app).toBe("photoshop");
    expect(e.error.recoverable).toBe(true);
    expect(e.error.nextTools).toContain("jradb_get_status");
    expect(parse(formatErrorResponse(new AdobeBridgeError("indesign", "SCRIPT_PARSE_ERROR", "x"))).error.recoverable).toBe(false);
  });

  it("uses the host's code when the wrapper's is generic, and spots outdated bridges by message", () => {
    const err = new AdobeBridgeError("after-effects", "HOST_ACTION_FAILED", "Bad thing", { code: "SyntaxError", message: "x", line: 3 });
    expect(parse(formatErrorResponse(err)).error.nextTools).toEqual(["jradb_inspect_dom"]);
    expect(getErrorHint("LR_ERROR", "attempt to call global 'getfenv' (a nil value)")?.hint).toMatch(/install-bridges/);
    expect(getErrorHint("SOMETHING_NEW", "x")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
/** Minimal ExtendScript File/Folder world: paths are strings, a Set holds what exists. */
function fileWorld(existing: string[] = []) {
  const exists = new Set(existing);
  const log: string[] = [];
  class F {
    fsName: string;
    name: string;
    constructor(p: string) {
      this.fsName = p.replace(/\\/g, "/");
      this.name = this.fsName.split("/").pop() || "";
    }
    get exists() {
      return exists.has(this.fsName);
    }
    get parent() {
      return new Fo(this.fsName.split("/").slice(0, -1).join("/"));
    }
    copy(dest: string) {
      log.push(`copy ${this.fsName} -> ${dest}`);
      exists.add(dest);
      return true;
    }
  }
  class Fo extends F {
    static myDocuments = new Fo("C:/Users/u/Documents");
    create() {
      exists.add(this.fsName);
      log.push(`mkdir ${this.fsName}`);
      return true;
    }
  }
  return { File: F, Folder: Fo, exists, log };
}

function runtimeWith(handler: string, globals: Record<string, unknown>): vm.Context {
  const ctx: Record<string, unknown> = { JSON: undefined, ...globals };
  vm.createContext(ctx);
  vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read(`src/extendscript/${handler}`)}`, ctx);
  return ctx;
}

describe("adobe.checkpoint in the hosts", () => {
  it("builds a clean, timestamped name in _checkpoints next to the original, or in Documents for a new file", () => {
    const w = fileWorld();
    const ctx = runtimeWith("ps-handlers.jsx", { File: w.File, Folder: w.Folder });
    const next = vm.runInContext(
      `__mcpCheckpointFile("Post Final.psd", "psd", "antes da / animação", null, new File("D:/cli/Post Final.psd")).fsName`,
      ctx
    ) as string;
    expect(next).toMatch(/^D:\/cli\/_checkpoints\/Post_Final__antes_da_-_animação__\d{8}-\d{6}\.psd$/);
    const fresh = vm.runInContext(`__mcpCheckpointFile("Sem título-1", "ai", "", null, null).fsName`, ctx) as string;
    expect(fresh).toMatch(/^C:\/Users\/u\/Documents\/MCP-checkpoints\/Sem_título-1__\d{8}-\d{6}\.ai$/);
    expect(w.log.some((l) => l.startsWith("mkdir D:/cli/_checkpoints"))).toBe(true);
  });

  it("Photoshop saves a layered PSD copy and never touches the open document's path", () => {
    const w = fileWorld();
    const saves: unknown[][] = [];
    const doc = {
      name: "imagem (4).png",
      get fullName() {
        throw new Error("never saved");
      },
      saveAs: (...a: unknown[]) => saves.push(a)
    };
    const ctx = runtimeWith("ps-handlers.jsx", {
      File: w.File,
      Folder: w.Folder,
      PhotoshopSaveOptions: function () {},
      Extension: { LOWERCASE: "lower" },
      app: { documents: { length: 1 }, activeDocument: doc, version: "28.0" }
    });
    const res = vm.runInContext(`__psDispatch("adobe.checkpoint", { label: "v1" }, {})`, ctx) as Record<string, unknown>;
    expect(saves.length).toBe(1);
    expect(saves[0][2]).toBe(true); // asCopy
    expect(String(res.checkpointPath)).toMatch(/MCP-checkpoints\/imagem_\(4\)__v1__/);
    expect(res.documentPathChanged).toBe(false);
    const ping = vm.runInContext(`__psDispatch("adobe.ping", {}, {})`, ctx) as Record<string, unknown>;
    expect(ping.pong).toBe(true);
  });

  it("InDesign uses saveACopy", () => {
    const w = fileWorld(["D:/job/flyer.indd"]);
    const copies: string[] = [];
    const ctx = runtimeWith("id-handlers.jsx", {
      File: w.File,
      Folder: w.Folder,
      app: {
        documents: { length: 1 },
        activeDocument: { name: "flyer.indd", fullName: new w.File("D:/job/flyer.indd"), saveACopy: (f: { fsName: string }) => copies.push(f.fsName) }
      }
    });
    const res = vm.runInContext(`__idDispatch("adobe.checkpoint", { label: "pre-pdf" }, {})`, ctx) as Record<string, unknown>;
    expect(copies[0]).toMatch(/^D:\/job\/_checkpoints\/flyer__pre-pdf__/);
    expect(res.method).toBe("saveACopy");
  });

  it("After Effects saves then copies a saved project, and saves a never-saved one as the checkpoint", () => {
    const w = fileWorld(["D:/job/story.aep"]);
    const calls: string[] = [];
    const project = {
      file: new w.File("D:/job/story.aep") as unknown,
      dirty: true,
      save: (f?: { fsName: string }) => calls.push(f ? `saveAs ${f.fsName}` : "save")
    };
    const ctx = runtimeWith("ae-handlers.jsx", { File: w.File, Folder: w.Folder, app: { project, version: "27.0" } });
    const saved = vm.runInContext(`__mcpDispatch("adobe.checkpoint", { label: "x" }, {})`, ctx) as Record<string, unknown>;
    expect(calls).toEqual(["save"]);
    expect(w.log.some((l) => /^copy D:\/job\/story\.aep -> D:\/job\/_checkpoints\/story__x__/.test(l))).toBe(true);
    expect(saved.documentPathChanged).toBe(false);

    project.file = null;
    const fresh = vm.runInContext(`__mcpDispatch("adobe.checkpoint", {}, {})`, ctx) as Record<string, unknown>;
    expect(calls[1]).toMatch(/^saveAs C:\/Users\/u\/Documents\/MCP-checkpoints\/untitled-project__/);
    expect(fresh.documentPathChanged).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe("InDesign type sizes are always points", () => {
  it("turns numeric size and leading into pt strings and keeps explicit units", () => {
    const ctx = runtimeWith("id-handlers.jsx", {});
    const props = vm.runInContext(`__idStyleProps({}, "paragraph", { size: 16, leading: 19 })`, ctx) as Record<string, unknown>;
    expect(props.pointSize).toBe("16pt");
    expect(props.leading).toBe("19pt");
    expect(vm.runInContext(`__idPt("4mm")`, ctx)).toBe("4mm");
  });
});

// ---------------------------------------------------------------------------------------------
describe("After Effects preview does not wait inside the host", () => {
  it("returns right after saveFrameToPng when noWait is set (no $.sleep on the main thread)", () => {
    const w = fileWorld();
    const sleep = vi.fn();
    const ctx = runtimeWith("ae-handlers.jsx", {
      File: w.File,
      Folder: Object.assign(w.Folder, { temp: new w.Folder("C:/tmp") }),
      $: { sleep },
      app: { project: {} }
    });
    vm.runInContext(`__aeFindComp = function () { return { name: "Story", time: 0, saveFrameToPng: function () {} }; };`, ctx);
    const res = vm.runInContext(`__mcpDispatch("ae.comp.getFramePreview", { time: 3, noWait: true, outputPath: "C:/tmp/f.png" }, {})`, ctx) as Record<string, unknown>;
    expect(res.pending).toBe(true);
    expect(res.outputPath).toBe("C:/tmp/f.png");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("waitForStableFile resolves when the file exists and stops growing, false on timeout", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-wait-"));
    const f = path.join(dir, "p.png");
    setTimeout(() => fs.writeFileSync(f, "png-bytes"), 60);
    await expect(waitForStableFile(f, 3000, 30)).resolves.toBe(true);
    await expect(waitForStableFile(path.join(dir, "never.png"), 120, 30)).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe("jradb_get_skill", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  function makeSkills() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-skills-"));
    dirs.push(root);
    fs.writeFileSync(path.join(root, "index.md"), "# Roteador\nComece por aqui.");
    const sk = path.join(root, "social", "social-post");
    fs.mkdirSync(path.join(sk, "references"), { recursive: true });
    fs.writeFileSync(
      path.join(sk, "SKILL.md"),
      "---\nname: social-post\ndescription: >-\n  Post estático\n  para feed.\n---\n# Social post\nCorpo."
    );
    fs.writeFileSync(path.join(sk, "references", "formatos.md"), "1080x1350");
    return root;
  }

  function toolFor(root: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let handler: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const server: any = { tool: (...args: unknown[]) => (handler = args[args.length - 1]) };
    registerSkillTools(server, root);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (args: any) => {
      const r = await handler({ list: false, ...args });
      return { error: Boolean(r.isError), text: r.content[0].text as string };
    };
  }

  it("parses folded frontmatter and lists skills with their area and references", () => {
    const root = makeSkills();
    expect(parseFrontmatter("---\nname: a\ndescription: >-\n  um\n  dois\n---\n").description).toBe("um dois");
    const list = listSkills(root);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "social-post", area: "social", description: "Post estático para feed.", references: ["formatos.md"] });
  });

  it("returns the router with the catalogue, a skill with its references, and one reference", async () => {
    const call = toolFor(makeSkills());
    const router = await call({});
    expect(router.text).toContain("# Roteador");
    expect(router.text).toContain("`social-post` (social) — Post estático para feed.");
    const skill = await call({ name: "social-post" });
    expect(skill.text).toContain("# Social post");
    expect(skill.text).toContain("formatos.md");
    expect((await call({ name: "social-post", reference: "formatos.md" })).text).toBe("1080x1350");
  });

  it("rejects unknown skills and path traversal", async () => {
    const call = toolFor(makeSkills());
    const unknown = await call({ name: "social" });
    expect(unknown.error).toBe(true);
    expect(unknown.text).toContain("social-post");
    expect((await call({ name: "social-post", reference: "../SKILL.md" })).error).toBe(true);
  });

  it("serves the real project skills folder", async () => {
    const real = path.resolve(__dirname, "../../skills");
    const list = listSkills(real);
    expect(fs.existsSync(path.join(real, "index.md"))).toBe(true);
    for (const s of list) {
      expect(s.name, `${s.dir} needs a name`).toMatch(/^[a-z0-9-]+$/);
      expect(s.description.length, `${s.name} needs a description`).toBeGreaterThan(30);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("skills only cite tools that exist", () => {
  /** Tools the skills mention on purpose as not built yet . */
  const PLANNED = new Set(["pr_apply_cut_plan"]);

  it("every jradb_/ps_/ai_/id_/ae_/pr_/lr_ name in skills/ is a registered tool", async () => {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { createAdobeMcpServer } = await import("../../src/server.js");
    const rt = createAdobeMcpServer({ enableOsFallback: false });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await rt.server.connect(a);
    const client = new Client({ name: "t", version: "1" });
    await client.connect(b);
    const registered = new Set((await client.listTools()).tools.map((t) => t.name));
    await client.close();

    const root = path.resolve(__dirname, "../../skills");
    const files: string[] = [];
    const walk = (d: string) =>
      fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".md") && files.push(path.join(d, e.name))));
    walk(root);
    const missing: string[] = [];
    for (const f of files) {
      for (const m of fs.readFileSync(f, "utf8").matchAll(/\b(?:jradb|ps|ai|id|ae|pr|lr)_[a-z_]+\b/g)) {
        if (!registered.has(m[0]) && !PLANNED.has(m[0])) missing.push(`${path.relative(root, f)}: ${m[0]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
