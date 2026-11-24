import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore luaparse ships no types
import luaparse from "luaparse";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerLightroomTools } from "../../src/tools/lightroom/index.js";
import { BridgeRouter } from "../../src/core/bridge-router.js";

const PLUGIN = join(process.cwd(), "bridges", "lightroom-classic", "JrAdbMcpBridge.lrplugin");

describe("Lightroom Classic plug-in", () => {
  it("every Lua file parses as Lua 5.1", () => {
    const files = readdirSync(PLUGIN).filter((f) => f.endsWith(".lua"));
    expect(files).toEqual(expect.arrayContaining(["Info.lua", "Init.lua", "Bridge.lua", "Handlers.lua", "json.lua"]));
    for (const f of files) {
      expect(() => luaparse.parse(readFileSync(join(PLUGIN, f), "utf8"), { luaVersion: "5.1" }), f).not.toThrow();
    }
  });

  it("Info.lua declares the toolkit id, init script and menu items", () => {
    const info = readFileSync(join(PLUGIN, "Info.lua"), "utf8");
    expect(info).toContain('LrToolkitIdentifier = "com.jradbmcp.lightroom"');
    expect(info).toContain("LrForceInitPlugin = true");
    expect(info).toContain('file = "StartBridge.lua"');
  });

  it("every lr.* action used by the tools has a Lua handler", () => {
    const actions = new Set<string>();
    const fakeRouter = {
      dispatch: async (_app: string, action: string) => {
        actions.add(action);
        return { data: {} };
      }
    } as unknown as BridgeRouter;
    const handlers: Array<(p: Record<string, unknown>) => Promise<unknown>> = [];
    const fakeServer = {
      tool: (...args: unknown[]) => handlers.push(args[args.length - 1] as (p: Record<string, unknown>) => Promise<unknown>)
    } as unknown as McpServer;
    registerLightroomTools(fakeServer, fakeRouter);
    expect(handlers.length).toBe(23);
    return Promise.all(handlers.map((h) => h({}))).then(() => {
      const lua = readFileSync(join(PLUGIN, "Handlers.lua"), "utf8");
      for (const a of actions) {
        expect(lua, a).toContain(`handlers["${a}"]`);
      }
      expect(lua).toContain('handlers["lr.batch"]');
    });
  });
});
