import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BridgeRouter, captureDispatches } from "../../src/core/bridge-router.js";
import { ToolCatalog } from "../../src/core/tool-catalog.js";
import { prepareBatchOperations } from "../../src/tools/batch/index.js";
import { createAdobeMcpServer } from "../../src/server.js";
import { BridgeResponsePacket } from "../../src/core/types.js";
import { WsHub } from "../../src/core/ws-hub.js";

const RUNTIME = fs.readFileSync(path.resolve(__dirname, "../../src/extendscript/es3-runtime.jsx"), "utf8");

function es3Sandbox(extra = ""): vm.Context {
  const sandbox: Record<string, unknown> = { JSON: undefined };
  vm.createContext(sandbox);
  vm.runInContext(RUNTIME, sandbox);
  vm.runInContext(
    `function __mcpDispatch(action, params) {
       if (action === "ae.ok" || action === "ps.ok") { return { echo: params.v }; }
       if (action === "ae.fail" || action === "ps.fail") { throw new Error("boom " + params.v); }
       throw new Error("unexpected " + action);
     }
     ${extra}`,
    sandbox
  );
  return sandbox;
}

function runBatch(ctx: vm.Context, params: unknown, prefix: string): Record<string, unknown> {
  const json = vm.runInContext(
    `JSON.stringify(__mcpBatch(${JSON.stringify(params)}, ${JSON.stringify(prefix)}))`,
    ctx
  ) as string;
  return JSON.parse(json);
}

function fakeHub(): WsHub {
  return {
    sendCommand: vi.fn(async () => {
      throw new Error("sendCommand must not be called while capturing");
    })
  } as unknown as WsHub;
}

describe("ES3 __mcpBatch", () => {
  it("runs every operation and reports each result", () => {
    const out = runBatch(
      es3Sandbox(),
      { operations: [{ action: "ae.ok", params: { v: 1 } }, { action: "ae.ok", params: { v: 2 } }] },
      "ae"
    );
    expect(out.total).toBe(2);
    expect(out.succeeded).toBe(2);
    expect(out.singleHistoryState).toBe(true);
    expect((out.results as Array<{ data: { echo: number } }>).map((r) => r.data.echo)).toEqual([1, 2]);
  });

  it("stops at the first failure by default and continues when stopOnError=false", () => {
    const ops = [
      { action: "ae.ok", params: { v: 1 } },
      { action: "ae.fail", params: { v: 2 } },
      { action: "ae.ok", params: { v: 3 } }
    ];
    const stopped = runBatch(es3Sandbox(), { operations: ops }, "ae");
    expect(stopped.executed).toBe(2);
    expect(stopped.stoppedEarly).toBe(true);
    expect((stopped.results as Array<{ error?: { message: string } }>)[1].error?.message).toContain("boom 2");

    const all = runBatch(es3Sandbox(), { operations: ops, stopOnError: false }, "ae");
    expect(all.executed).toBe(3);
    expect(all.failed).toBe(1);
  });

  it("rejects other-app, nested and UXP-only operations before running anything", () => {
    const ctx = es3Sandbox();
    expect(() => runBatch(ctx, { operations: [{ action: "ps.ok" }] }, "ae")).toThrow(/another app/);
    expect(() => runBatch(ctx, { operations: [{ action: "ae.batch" }] }, "ae")).toThrow(/nesting/);
    let code = "";
    try {
      runBatch(ctx, { operations: [{ action: "ps.ok" }, { action: "ps.raw.executeUxp" }] }, "ps");
    } catch (e) {
      code = (e as Error).name;
    }
    expect(code).toBe("ACTION_NOT_SUPPORTED");
  });

  it("groups a Photoshop batch into one history state with suspendHistory", () => {
    const ctx = es3Sandbox(
      `var historyNames = [];
       var app = { documents: { length: 1 }, activeDocument: { suspendHistory: function (name, code) { historyNames.push(name); eval(code); } } };
       var $ = { global: this };`
    );
    const out = runBatch(ctx, { operations: [{ action: "ps.ok", params: { v: 7 } }], undoName: "Meu lote" }, "ps");
    expect(out.singleHistoryState).toBe(true);
    expect((out.results as Array<{ data: { echo: number } }>)[0].data.echo).toBe(7);
    expect(vm.runInContext("historyNames.join(',')", ctx)).toBe("Meu lote");
  });
});

describe("dispatch capture", () => {
  it("records dispatches without reaching any bridge", async () => {
    const hub = fakeHub();
    const router = new BridgeRouter({ wsHub: hub, enableOsFallback: false });
    const captured = await captureDispatches(async () => {
      await router.dispatch("after-effects", "ae.layer.modify", { layerIndex: 1 }, { undoGroup: "x" });
    });
    expect(captured).toEqual([
      { app: "after-effects", action: "ae.layer.modify", params: { layerIndex: 1 }, options: { undoGroup: "x" } }
    ]);
    expect(hub.sendCommand).not.toHaveBeenCalled();
  });
});

describe("prepareBatchOperations", () => {
  function catalogWithTools(router: BridgeRouter): ToolCatalog {
    const catalog = new ToolCatalog();
    catalog.record([
      "ae_modify_layer",
      "desc",
      { layerIndex: z.number().int().positive(), opacity: z.number().optional().default(100) },
      async (p: Record<string, unknown>) => router.dispatch("after-effects", "ae.layer.modify", p)
    ]);
    catalog.record([
      "ae_two_calls",
      "desc",
      {},
      async () => {
        await router.dispatch("after-effects", "ae.a", {});
        await router.dispatch("after-effects", "ae.b", {});
      }
    ]);
    return catalog;
  }

  it("maps tools to the exact action and params they send, defaults included", async () => {
    const router = new BridgeRouter({ wsHub: fakeHub(), enableOsFallback: false });
    const res = await prepareBatchOperations(catalogWithTools(router), "after-effects", [
      { tool: "ae_modify_layer", args: { layerIndex: 2 } }
    ]);
    expect(res.errors).toEqual([]);
    expect(res.operations).toEqual([
      { tool: "ae_modify_layer", action: "ae.layer.modify", params: { layerIndex: 2, opacity: 100 } }
    ]);
  });

  it("collects every problem before anything runs", async () => {
    const router = new BridgeRouter({ wsHub: fakeHub(), enableOsFallback: false });
    const res = await prepareBatchOperations(catalogWithTools(router), "after-effects", [
      { tool: "ae_modify_layr", args: {} },
      { tool: "ae_modify_layer", args: { layerIndex: -1 } },
      { tool: "ae_two_calls" },
      { tool: "ps_create_layer" },
      { tool: "ae_get_comp_frame_preview" }
    ]);
    expect(res.operations).toEqual([]);
    expect(res.errors).toHaveLength(5);
    expect(res.errors[0]).toMatch(/Did you mean: ae_modify_layer/);
    expect(res.errors[1]).toMatch(/invalid args — layerIndex/);
    expect(res.errors[2]).toMatch(/2 bridge calls/);
    expect(res.errors[3]).toMatch(/only ae_\* tools/);
    expect(res.errors[4]).toMatch(/image/);
  });
});

describe("jradb_batch tool", () => {
  it("sends one <prefix>.batch command built from real tool schemas", async () => {
    const runtime = createAdobeMcpServer({ wsPort: 0, enableOsFallback: false });
    const original = runtime.router.dispatch.bind(runtime.router);
    const sent: Array<{ action: string; params: Record<string, unknown> }> = [];
    vi.spyOn(runtime.router, "dispatch").mockImplementation(async (app, action, params, options) => {
      if (!action.endsWith(".batch")) {
        return original(app, action, params, options);
      }
      sent.push({ action, params: params as Record<string, unknown> });
      const ops = (params as { operations: unknown[] }).operations;
      const reply: BridgeResponsePacket = {
        type: "response",
        id: "t",
        app,
        bridgeType: "cep",
        ok: true,
        data: { total: ops.length, results: ops.map((_o, i) => ({ index: i, ok: true })) }
      };
      return reply;
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "batch-test", version: "1.0.0" });
    await Promise.all([runtime.server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const result = await client.callTool({
        name: "jradb_batch",
        arguments: {
          app: "after-effects",
          undoName: "Animar logo",
          operations: [
            { tool: "ae_list_compositions" },
            { tool: "ae_execute_menu_command", args: { commandName: "Select All" } }
          ]
        }
      });
      expect(result.isError).toBeFalsy();
      expect(sent).toHaveLength(1);
      expect(sent[0].action).toBe("ae.batch");
      expect(sent[0].params.undoName).toBe("Animar logo");
      const ops = sent[0].params.operations as Array<{ action: string }>;
      expect(ops.map((o) => o.action)).toEqual(["ae.comp.list", "ae.raw.executeMenuCommand"]);
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(text).toContain("ae_execute_menu_command");
    } finally {
      await client.close();
    }
  });
});
