import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

class FakeSocket {
  static all: FakeSocket[] = [];
  public sent: string[] = [];
  public closed = false;
  public onopen: null | (() => void) = null;
  public onmessage: null | ((ev: { data: string }) => void) = null;
  public onclose: null | (() => void) = null;
  public onerror: null | (() => void) = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(s: string) {
    this.sent.push(s);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    // Real sockets fire onclose asynchronously after close()
    const cb = this.onclose;
    if (cb) cb();
  }
  open() {
    if (this.onopen) this.onopen();
  }
}

interface TimerRec {
  fn: () => void;
  ms: number;
  cleared: boolean;
}

function makeTimers() {
  const timers: TimerRec[] = [];
  return {
    timers,
    setTimeout: (fn: () => void, ms: number) => {
      const rec = { fn, ms, cleared: false };
      timers.push(rec);
      return rec;
    },
    clearTimeout: (rec: TimerRec | null) => {
      if (rec) rec.cleared = true;
    },
    runPending: () => {
      const due = timers.filter((t) => !t.cleared);
      timers.length = 0;
      for (const t of due) t.fn();
    }
  };
}

function makeElement() {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    textContent: "",
    className: "",
    listeners,
    addEventListener: (name: string, fn: () => void) => {
      (listeners[name] = listeners[name] || []).push(fn);
    }
  };
}

function loadPhotoshopUxp() {
  FakeSocket.all = [];
  const t = makeTimers();
  const batchPlayCalls: unknown[][] = [];
  let batchPlayResult: (descs: unknown[]) => unknown[] = (descs) => descs.map(() => ({}));
  const elements: Record<string, ReturnType<typeof makeElement>> = {};
  let panels: Record<string, { show: () => void }> = {};

  const activeDocument = {
    id: 7,
    name: "Doc",
    width: 2000,
    height: 1000,
    layers: [
      { id: 11, name: "Title", kind: "text", layers: null },
      { id: 12, name: "Photo", kind: "pixel", layers: null }
    ],
    activeLayers: [{ id: 12, name: "Photo" }]
  };

  const photoshop = {
    app: { version: "27.0.0", documents: [activeDocument], activeDocument },
    core: {
      executeAsModal: async (fn: (ctx: unknown) => Promise<unknown>) => fn({ hostControl: null })
    },
    action: {
      batchPlay: async (descs: unknown[]) => {
        batchPlayCalls.push(descs);
        return batchPlayResult(descs);
      }
    },
    constants: {},
    imaging: undefined
  };
  const uxp = {
    entrypoints: {
      setup: (cfg: { panels: Record<string, { show: () => void }> }) => {
        panels = cfg.panels;
      }
    },
    storage: { localFileSystem: {}, formats: { binary: "binary" } },
    host: { version: "27.0.0" }
  };

  const sandbox: Record<string, unknown> = {
    require: (name: string) => (name === "photoshop" ? photoshop : uxp),
    document: { getElementById: (id: string) => (elements[id] = elements[id] || makeElement()) },
    WebSocket: FakeSocket,
    setTimeout: t.setTimeout,
    clearTimeout: t.clearTimeout,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(read("bridges/uxp-photoshop/main.js"), sandbox);
  return {
    sandbox,
    t,
    batchPlayCalls,
    setBatchPlayResult: (fn: typeof batchPlayResult) => (batchPlayResult = fn),
    show: () => Object.values(panels)[0].show(),
    dispatch: sandbox.dispatchPhotoshopCommand as (a: string, p: unknown, o: unknown) => Promise<Record<string, unknown>>
  };
}

function liveSockets() {
  return FakeSocket.all.filter((s) => !s.closed);
}

describe("Photoshop UXP bridge", () => {
  it("keeps exactly one live socket when the panel is shown repeatedly, without a reconnect loop", () => {
    const ps = loadPhotoshopUxp();
    ps.show();
    liveSockets().forEach((s) => s.open());
    ps.show();
    ps.show();
    liveSockets().forEach((s) => s.open());
    // let any reconnect timers fire several times
    for (let i = 0; i < 5; i++) ps.t.runPending();
    expect(liveSockets().length).toBe(1);
    expect(ps.t.timers.filter((x) => !x.cleared).length).toBe(0);
  });

  it("reconnects once after the hub really drops the connection", () => {
    const ps = loadPhotoshopUxp();
    ps.show();
    const first = liveSockets()[0];
    first.open();
    first.close(); // hub went away
    expect(liveSockets().length).toBe(0);
    ps.t.runPending();
    expect(liveSockets().length).toBe(1);
  });

  it("answers ACTION_NOT_SUPPORTED for actions it does not implement", async () => {
    const ps = loadPhotoshopUxp();
    await expect(ps.dispatch("ps.raw.executeExtendScript", { code: "1" }, {})).rejects.toMatchObject({
      code: "ACTION_NOT_SUPPORTED"
    });
  });

  it("builds a polygon selection instead of silently reporting success", async () => {
    const ps = loadPhotoshopUxp();
    const res = await ps.dispatch(
      "ps.selection.operate",
      { operation: "polygon", points: [[0, 0], [100, 0], [50, 80]], feather: 0 },
      {}
    );
    expect(res.completed).toBe(true);
    const flat = JSON.stringify(ps.batchPlayCalls);
    expect(flat).toContain('"polygon"');
    expect(flat).toContain('"_value":80');
  });

  it("throws for an operation it does not know and for batchPlay error results", async () => {
    const ps = loadPhotoshopUxp();
    await expect(ps.dispatch("ps.selection.operate", { operation: "lasso" }, {})).rejects.toThrow(/lasso/);

    ps.setBatchPlayResult(() => [{ _obj: "error", message: "The command is not currently available", result: -128 }]);
    await expect(ps.dispatch("ps.selection.operate", { operation: "selectAll" }, {})).rejects.toThrow(
      /not currently available/
    );
  });

  it("refuses to edit the active layer when the requested layer does not exist", async () => {
    const ps = loadPhotoshopUxp();
    await expect(
      ps.dispatch("ps.layer.manage", { operation: "delete", layerName: "Does not exist" }, {})
    ).rejects.toThrow(/not found/i);
  });

  it("implements every Photoshop action the MCP tools dispatch, except the ExtendScript escape hatch", () => {
    const tools = read("src/tools/photoshop/index.ts");
    const actions = [...tools.matchAll(/"(ps\.[a-zA-Z.]+)"/g)].map((m) => m[1]);
    const main = read("bridges/uxp-photoshop/main.js");
    const missing = [...new Set(actions)].filter((a) => !main.includes(`"${a}"`));
    // These run in the ExtendScript handlers; the UXP panel answers ACTION_NOT_SUPPORTED and its hybrid mode runs them.
    expect(missing.sort()).toEqual(["ps.cameraRaw", "ps.guides", "ps.layers.groupPlan", "ps.layers.layoutInfo", "ps.luminosityMasks", "ps.raw.executeExtendScript", "ps.recipe.carouselSetup", "ps.recipe.carouselSplit", "ps.recipe.filmGrain", "ps.recipe.frequencySeparation", "ps.recipe.look", "ps.recipe.zoneDodgeBurn"]);
    const es = read("src/extendscript/ps-handlers.jsx");
    for (const a of ["ps.cameraRaw", "ps.guides", "ps.layers.groupPlan", "ps.layers.layoutInfo"]) expect(es).toContain(`action === "${a}"`);
  });
});

describe("Universal CEP bridge", () => {
  function loadCep(
    dirnameValue: string,
    existing: string[],
    evalImpl?: (code: string, cb: (r: string) => void) => void
  ) {
    FakeSocket.all = [];
    const t = makeTimers();
    const elements: Record<string, ReturnType<typeof makeElement>> = {};
    const norm = (p: string) => p.replace(/\\/g, "/");
    const evalCalls: string[] = [];
    const sandbox: Record<string, unknown> = {
      require: (name: string) =>
        name === "fs"
          ? {
              existsSync: (p: string) => existing.includes(norm(p)),
              readFileSync: (p: string) => `/*${norm(p)}*/`
            }
          : path.posix,
      __dirname: dirnameValue,
      window: {
        __adobe_cep__: {
          getHostEnvironment: () => JSON.stringify({ appId: "AEFT", appVersion: "26.0" }),
          getSystemPath: () => "/ext",
          evalScript: (code: string, cb: (r: string) => void) => {
            evalCalls.push(code);
            if (evalImpl) {
              evalImpl(code, cb);
              return;
            }
            cb(JSON.stringify({ ok: true, data: { fine: true } }));
          }
        }
      },
      document: { getElementById: (id: string) => (elements[id] = elements[id] || makeElement()) },
      WebSocket: FakeSocket,
      setTimeout: t.setTimeout,
      clearTimeout: t.clearTimeout,
      console
    };
    vm.createContext(sandbox);
    vm.runInContext(read("bridges/cep-universal-bridge/js/main.js"), sandbox);
    return { t, elements, evalCalls };
  }

  it("does not enter a reconnect loop after a manual Reconnect click", () => {
    const cep = loadCep("/ext", ["/ext/jsx/es3-runtime.jsx", "/ext/jsx/ae-handlers.jsx"]);
    liveSockets().forEach((s) => s.open());
    cep.elements.btnReconnect.listeners.click[0]();
    liveSockets().forEach((s) => s.open());
    for (let i = 0; i < 5; i++) cep.t.runPending();
    expect(liveSockets().length).toBe(1);
    expect(cep.t.timers.filter((x) => !x.cleared).length).toBe(0);
  });

  it.each([
    ["__dirname is the extension root", "/ext"],
    ["__dirname is the js folder", "/ext/js"]
  ])("finds the bundled .jsx handlers when %s", async (_label, dirnameValue) => {
    const cep = loadCep(dirnameValue, ["/ext/jsx/es3-runtime.jsx", "/ext/jsx/ae-handlers.jsx"]);
    const sock = liveSockets()[0];
    sock.open();
    sock.onmessage!({ data: JSON.stringify({ type: "command", id: "c1", action: "ae.comp.list", params: {} }) });
    await new Promise((r) => setImmediate(r));
    expect(cep.evalCalls.length).toBe(1);
    expect(cep.evalCalls[0]).toContain("/ext/jsx/es3-runtime.jsx");
    expect(cep.evalCalls[0]).toContain("/ext/jsx/ae-handlers.jsx");
    const reply = JSON.parse(sock.sent[sock.sent.length - 1]);
    expect(reply.ok).toBe(true);
  });

  it("tells a handler syntax error (the probe runs) from a blocked host (the probe never answers)", async () => {
    const files = ["/ext/jsx/es3-runtime.jsx", "/ext/jsx/ae-handlers.jsx"];
    // 1) The bundle fails to parse but a one-line probe runs: bridge bug, not a dialog.
    const parse = loadCep("/ext", files, (code, cb) => cb(code === "'__mcp_probe_ok__'" ? "__mcp_probe_ok__" : "EvalScript error."));
    const s1 = liveSockets()[liveSockets().length - 1];
    s1.open();
    s1.onmessage!({ data: JSON.stringify({ type: "command", id: "p1", action: "ae.comp.list", params: {} }) });
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    const r1 = JSON.parse(s1.sent[s1.sent.length - 1]);
    expect(r1.ok).toBe(false);
    expect(r1.error.code).toBe("SCRIPT_PARSE_ERROR");
    expect(parse.evalCalls).toContain("'__mcp_probe_ok__'");

    // 2) Nothing runs, the probe never calls back: the host is blocked (modal dialog).
    const blocked = loadCep("/ext", files, (code, cb) => {
      if (code !== "'__mcp_probe_ok__'") cb("EvalScript error.");
    });
    const s2 = liveSockets()[liveSockets().length - 1];
    s2.open();
    s2.onmessage!({ data: JSON.stringify({ type: "command", id: "p2", action: "ae.comp.list", params: {} }) });
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    const probeTimer = blocked.t.timers.find((x) => x.ms === 3000 && !x.cleared);
    expect(probeTimer).toBeTruthy();
    probeTimer!.fn();
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    const r2 = JSON.parse(s2.sent[s2.sent.length - 1]);
    expect(r2.error.code).toBe("HOST_BLOCKED");
  });

  it("reports a clear error instead of running an empty script when the handlers are missing", async () => {
    const cep = loadCep("/ext", []);
    const sock = liveSockets()[0];
    sock.open();
    sock.onmessage!({ data: JSON.stringify({ type: "command", id: "c2", action: "ae.comp.list", params: {} }) });
    await new Promise((r) => setImmediate(r));
    expect(cep.evalCalls.length).toBe(0);
    const reply = JSON.parse(sock.sent[sock.sent.length - 1]);
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe("CEP_HANDLERS_NOT_FOUND");
  });
});

describe("Photoshop ExtendScript handlers", () => {
  function loadPsJsx() {
    const calls: string[] = [];
    const unit = (v: number) => v;
    const textItem: Record<string, unknown> = { contents: "Old", size: 10 };
    const titleLayer = {
      id: 11,
      name: "Title",
      typename: "ArtLayer",
      kind: "TEXT",
      textItem,
      visible: true,
      opacity: 100,
      blendMode: "NORMAL"
    };
    const doc = {
      name: "Doc",
      width: 2000,
      height: 1000,
      layers: [titleLayer],
      activeLayer: titleLayer,
      crop: (b: number[]) => calls.push(`crop:${b.join(",")}`),
      resizeImage: (w: number, h: number) => calls.push(`resizeImage:${w}x${h}`),
      flatten: () => calls.push("flatten")
    };
    const sandbox: Record<string, unknown> = {
      app: {
        documents: [doc],
        activeDocument: doc,
        preferences: { rulerUnits: "CM" },
        displayDialogs: "ALL"
      },
      UnitValue: unit,
      Units: { PIXELS: "PIXELS" },
      DialogModes: { NO: "NO" },
      LayerKind: { TEXT: "TEXT" },
      Justification: { LEFT: "L", CENTER: "C", RIGHT: "R", FULLYJUSTIFIED: "J" },
      ResampleMethod: { BICUBIC: "BICUBIC" },
      SolidColor: function (this: Record<string, unknown>) {
        this.rgb = { red: 0, green: 0, blue: 0 };
      }
    };
    vm.createContext(sandbox);
    vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read("src/extendscript/ps-handlers.jsx")}`, sandbox);
    const run = (action: string, params: unknown) =>
      JSON.parse(
        vm.runInContext(
          `__mcpExecuteWithUndo("photoshop", "t", function() { return __mcpDispatch(${JSON.stringify(action)}, ${JSON.stringify(params)}, {}); })`,
          sandbox
        ) as string
      );
    return { run, calls, textItem, sandbox };
  }

  it("crops, resizes proportionally and flattens via ps.doc.modifyCanvas", () => {
    const ps = loadPsJsx();
    expect(ps.run("ps.doc.modifyCanvas", { operation: "crop", bounds: { left: 1, top: 2, right: 30, bottom: 40 } }).ok).toBe(true);
    expect(ps.run("ps.doc.modifyCanvas", { operation: "resizeImage", width: 1000 }).ok).toBe(true);
    expect(ps.run("ps.doc.modifyCanvas", { operation: "flatten" }).ok).toBe(true);
    expect(ps.calls).toEqual(["crop:1,2,30,40", "resizeImage:1000x500", "flatten"]);
  });

  it("edits a text layer and restores the user's ruler units and dialog mode", () => {
    const ps = loadPsJsx();
    const res = ps.run("ps.layer.editText", { layerName: "Title", text: "Novo\ntítulo", fontSize: 72, alignment: "center" });
    expect(res.ok).toBe(true);
    expect(ps.textItem.contents).toBe("Novo\rtítulo");
    expect(ps.textItem.size).toBe(72);
    expect(ps.textItem.justification).toBe("C");
    const app = ps.sandbox.app as { preferences: { rulerUnits: string }; displayDialogs: string };
    expect(app.preferences.rulerUnits).toBe("CM");
    expect(app.displayDialogs).toBe("ALL");
  });

  it("fails loudly when the requested layer does not exist", () => {
    const ps = loadPsJsx();
    const res = ps.run("ps.layer.editText", { layerName: "Nope", text: "x" });
    expect(res.ok).toBe(false);
    expect(res.error.message).toMatch(/not found/i);
  });

  it.each([
    ["ps-handlers.jsx", "ps.raw.executeUxp"],
    ["ae-handlers.jsx", "ae.nope"],
    ["pr-handlers.jsx", "pr.raw.executeUxp"],
    ["ai-handlers.jsx", "ai.nope"],
    ["id-handlers.jsx", "id.nope"]
  ])("%s reports unknown actions with code ACTION_NOT_SUPPORTED", (file, action) => {
    const sandbox: Record<string, unknown> = {
      app: { documents: [], preferences: {}, project: {} },
      Units: { PIXELS: "PIXELS" },
      DialogModes: { NO: "NO" }
    };
    vm.createContext(sandbox);
    vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read(`src/extendscript/${file}`)}`, sandbox);
    const res = JSON.parse(
      vm.runInContext(
        `__mcpExecuteWithUndo("x", "t", function() { return __mcpDispatch(${JSON.stringify(action)}, {}, {}); })`,
        sandbox
      ) as string
    );
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("ACTION_NOT_SUPPORTED");
  });
});

describe("ExtendScript escape hatches and safety checks", () => {
  function sandboxFor(file: string, extra: Record<string, unknown>) {
    const sandbox: Record<string, unknown> = { Units: { PIXELS: "PIXELS" }, DialogModes: { NO: "NO" }, ...extra };
    vm.createContext(sandbox);
    vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read(`src/extendscript/${file}`)}`, sandbox);
    return (action: string, params: unknown) =>
      JSON.parse(
        vm.runInContext(
          `__mcpExecuteWithUndo("x", "t", function() { return __mcpDispatch(${JSON.stringify(action)}, ${JSON.stringify(params)}, {}); })`,
          sandbox
        ) as string
      );
  }

  it.each([
    ["ae-handlers.jsx", "ae.raw.executeExtendScript"],
    ["ai-handlers.jsx", "ai.raw.executeExtendScript"],
    ["pr-handlers.jsx", "pr.raw.executeExtendScript"],
    ["ps-handlers.jsx", "ps.raw.executeExtendScript"]
  ])("%s accepts both a trailing expression and an explicit return", (file, action) => {
    const run = sandboxFor(file, { app: { documents: [], preferences: {}, project: {} } });
    expect(run(action, { code: "var a = 2; a * 21;" }).data.result).toBe(42);
    expect(run(action, { code: "var a = 2; return a * 21;" }).data.result).toBe(42);
    const bad = run(action, { code: "var = ;" });
    expect(bad.ok).toBe(false);
  });

  it("creates a missing Premiere bin and imports into it instead of failing", () => {
    const imported: unknown[][] = [];
    const created = { name: "Footage", type: 2, children: { numItems: 0 } };
    const run = sandboxFor("pr-handlers.jsx", {
      ProjectItemType: { BIN: 2 },
      app: {
        project: {
          rootItem: { children: { numItems: 0 }, createBin: (name: string) => ({ ...created, name }) },
          importFiles: (...args: unknown[]) => {
            imported.push(args);
            return true;
          }
        }
      }
    });
    const res = run("pr.media.import", { filePaths: ["C:/a.mp4"], targetBinName: "Footage" });
    expect(res.ok).toBe(true);
    expect(imported.length).toBe(1);
    expect((imported[0][2] as { name: string }).name).toBe("Footage");
  });
});
