import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";

const root = path.resolve(__dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf-8");

/** Runs bridges/uxp-indesign/main.js against a fake InDesign: doScript answers what `answer` returns. */
function loadPlugin(answer: (script: string) => unknown) {
  const sockets: Array<Record<string, unknown> & { sent: string[] }> = [];
  class FakeSocket {
    sent: string[] = [];
    readyState = 1;
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => unknown) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public url: string) {
      sockets.push(this as unknown as Record<string, unknown> & { sent: string[] });
    }
    send(s: string) {
      this.sent.push(s);
    }
    close() {}
  }
  const scripts: Array<{ script: string; undoMode: unknown; undoName: unknown }> = [];
  const indesign = {
    app: {
      version: "22.0.0.104",
      doScript: (script: string, _lang: unknown, _args: unknown, undoMode: unknown, undoName: unknown) => {
        scripts.push({ script, undoMode, undoName });
        return answer(script);
      }
    },
    ScriptLanguage: { JAVASCRIPT: "es" },
    UndoModes: { SCRIPT_REQUEST: "request", ENTIRE_SCRIPT: "entire" }
  };
  let setup: { plugin: { create: () => void }; panels: Record<string, { show: () => void }> } | null = null;
  const uxp = {
    entrypoints: { setup: (cfg: typeof setup) => (setup = cfg) },
    storage: {
      localFileSystem: {
        getPluginFolder: async () => ({ getEntry: async (name: string) => ({ read: async () => `/* ${name} */` }) })
      }
    }
  };
  const elements: Record<string, { textContent: string; className: string; addEventListener: () => void }> = {};
  const sandbox: Record<string, unknown> = {
    require: (name: string) => {
      if (name === "indesign") return indesign;
      if (name === "uxp") return uxp;
      throw new Error("module not available in this test: " + name);
    },
    document: { getElementById: (id: string) => (elements[id] = elements[id] || { textContent: "", className: "", addEventListener: () => {} }) },
    WebSocket: FakeSocket,
    setTimeout: () => 0,
    clearTimeout: () => {},
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(read("bridges/uxp-indesign/main.js"), sandbox);
  return { setup: () => setup!, sockets, scripts };
}

async function command(p: ReturnType<typeof loadPlugin>, action: string, params: unknown) {
  p.setup().plugin.create();
  const socket = p.sockets[p.sockets.length - 1] as unknown as { onopen: () => void; onmessage: (e: { data: string }) => Promise<void>; sent: string[] };
  socket.onopen();
  await socket.onmessage({ data: JSON.stringify({ type: "command", id: "c1", action, params, options: {} }) });
  return { hello: JSON.parse(socket.sent[0]), response: JSON.parse(socket.sent[socket.sent.length - 1]) };
}

describe("InDesign UXP plugin (hybrid)", () => {
  it("connects when the app loads the plugin, before any panel is opened", async () => {
    const p = loadPlugin(() => JSON.stringify({ ok: true, data: {} }));
    const { hello } = await command(p, "id.document.getInfo", {});
    expect(hello).toMatchObject({ type: "hello", app: "indesign", bridgeType: "uxp" });
    expect(String((p.sockets[0] as unknown as { url: string }).url)).toMatch(/^ws:\/\/(127\.0\.0\.1|localhost):31001\/plugin$/);
  });

  it("runs the command through the shipped ExtendScript handlers and returns their data", async () => {
    const p = loadPlugin(() => JSON.stringify({ ok: true, data: { pages: 4 } }));
    const { response } = await command(p, "id.document.getInfo", { withPages: true });
    expect(response).toMatchObject({ type: "response", id: "c1", app: "indesign", bridgeType: "uxp", ok: true, data: { pages: 4 } });
    const s = p.scripts[0];
    expect(s.script).toContain("/* jsx/es3-runtime.jsx */");
    expect(s.script).toContain("/* jsx/id-handlers.jsx */");
    expect(s.script).toContain('__mcpExecuteWithUndo("indesign", "MCP: id.document.getInfo"');
    expect(s.script).toContain('__mcpDispatch("id.document.getInfo", {"withPages":true}, {})');
    // The runtime makes the single undo step itself; the outer call must not add a second one.
    expect(s.undoMode).toBe("request");
  });

  it("passes a handler error on with its code, and never reports success for it", async () => {
    const p = loadPlugin(() => JSON.stringify({ ok: false, error: { code: "NO_DOCUMENT", message: "No document open." } }));
    const { response } = await command(p, "id.page.preview", {});
    expect(response.ok).toBe(false);
    expect(response.error).toMatchObject({ code: "NO_DOCUMENT", message: "No document open." });
  });

  it("an empty or unreadable answer is an error, not a silent success", async () => {
    const empty = await command(loadPlugin(() => undefined), "id.document.getInfo", {});
    expect(empty.response.error.code).toBe("EXTENDSCRIPT_NO_RESULT");
    const bad = await command(loadPlugin(() => "EvalScript error."), "id.document.getInfo", {});
    expect(bad.response.error.code).toBe("EXTENDSCRIPT_BAD_RESULT");
  });

  it("the manifest targets InDesign 18.5+ and asks for the permissions the bridge needs", () => {
    const m = JSON.parse(read("bridges/uxp-indesign/manifest.json"));
    expect(m.host).toEqual({ app: "ID", minVersion: "18.5.0" });
    expect(m.id).toBe("com.jradbmcp.indesign.uxp");
    expect(m.entrypoints[0].id).toBe("com.jradbmcp.indesign.panel");
    expect(read("bridges/uxp-indesign/main.js")).toContain('"com.jradbmcp.indesign.panel"');
    expect(m.requiredPermissions.network.domains).toBe("all");
    expect(m.requiredPermissions.localFileSystem).toBe("fullAccess");
  });
});
