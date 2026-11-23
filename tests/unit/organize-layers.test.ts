import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BridgeRouter } from "../../src/core/bridge-router.js";
import { registerPhotoshopTools } from "../../src/tools/photoshop/index.js";

const layers = [
  { id: 11, name: "Edita no Photoshop", typename: "ArtLayer", kind: "LayerKind.TEXT", text: "Edita no Photoshop", bounds: [160, 500, 700, 540] },
  { id: 12, name: "icone 1", typename: "ArtLayer", kind: "LayerKind.SOLIDFILL", bounds: [100, 500, 140, 540] },
  { id: 13, name: "Anima no After", typename: "ArtLayer", kind: "LayerKind.TEXT", text: "Anima no After", bounds: [160, 580, 640, 620] },
  { id: 14, name: "icone 2", typename: "ArtLayer", kind: "LayerKind.SOLIDFILL", bounds: [100, 580, 140, 620] },
  { id: 20, name: "logo", typename: "ArtLayer", kind: "LayerKind.SMARTOBJECT", bounds: [440, 80, 640, 200] },
  { id: 30, name: "fundo", typename: "ArtLayer", kind: "LayerKind.NORMAL", bounds: [0, 0, 1080, 1350] }
];

function setup() {
  const calls: Array<{ action: string; params: Record<string, unknown> }> = [];
  const router = {
    dispatch: async (_app: string, action: string, params: Record<string, unknown>) => {
      calls.push({ action, params });
      if (action === "ps.layers.layoutInfo") return { data: { documentName: "post.psd", width: 1080, height: 1350, layers } };
      return { data: { created: [{ name: "x", id: 99 }], failed: [] } };
    }
  } as unknown as BridgeRouter;
  const tools: Record<string, (p: unknown, e: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>> = {};
  const server = { tool: (name: string, ...rest: unknown[]) => (tools[name] = rest[rest.length - 1] as never) } as unknown as McpServer;
  registerPhotoshopTools(server, router);
  return { calls, run: tools.ps_organize_layers };
}

describe("ps_organize_layers", () => {
  it("only reports the plan by default", async () => {
    const { calls, run } = setup();
    const d = JSON.parse((await run({ apply: false, language: "pt" }, {})).content[0].text);
    expect(calls.map((c) => c.action)).toEqual(["ps.layers.layoutInfo"]);
    expect(d.groups).toEqual([{ container: "(top)", name: "Lista (2 itens)", children: ["Item – Edita no Photoshop", "Item – Anima no After"], layers: 4 }]);
  });

  it("apply: true sends the nested plan with layer ids", async () => {
    const { calls, run } = setup();
    await run({ apply: true, language: "pt" }, {});
    const plan = calls[1].params.groups as Array<{ children: Array<{ members: number[] }> }>;
    expect(calls[1].action).toBe("ps.layers.groupPlan");
    expect(plan[0].children.map((c) => c.members.sort())).toEqual([[11, 12], [13, 14]]);
  });
});
