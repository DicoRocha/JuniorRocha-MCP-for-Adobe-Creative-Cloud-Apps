import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolCatalog } from "../../src/core/tool-catalog.js";
import { applyTimeoutFloor, runWithTimeoutFloor } from "../../src/core/timeouts.js";
import { runScript } from "../../src/tools/code/index.js";

process.env.JRADB_MCP_USAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "floor-"));

describe("timeout floor for background scripts", () => {
  it("leaves timeouts alone outside a background job", () => {
    expect(applyTimeoutFloor(60_000)).toBe(60_000);
  });

  it("raises a bridge timeout to the time left in the job", async () => {
    const now = Date.now();
    const got = await runWithTimeoutFloor(now + 600_000, async () => applyTimeoutFloor(60_000, now));
    expect(got).toBe(600_000);
  });

  it("never lowers a longer timeout", async () => {
    const now = Date.now();
    const got = await runWithTimeoutFloor(now + 10_000, async () => applyTimeoutFloor(120_000, now));
    expect(got).toBe(120_000);
  });

  it("reaches tool handlers called from a script (so a long render step does not abort the next ones)", async () => {
    const catalog = new ToolCatalog();
    const server = catalog.wrap(new McpServer({ name: "t", version: "1" }));
    server.tool("ae_probe_timeout", "Returns the bridge timeout it would use.", {}, async () => ({
      content: [{ type: "text", text: JSON.stringify({ timeoutMs: applyTimeoutFloor(60_000) }) }]
    }));
    const until = Date.now() + 900_000;
    const run = await runWithTimeoutFloor(until, () => runScript(catalog, `return (await tools.ae_probe_timeout()).timeoutMs;`, { timeoutMs: 5000 }));
    expect(run.ok).toBe(true);
    expect(run.result as number).toBeGreaterThan(800_000);
  });
});
