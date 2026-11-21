import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("regression suite: every campaign plan is valid against the current tools", () => {
  it("validates the 10 fictitious campaigns with jradb_campaign_run 'plan' (no app calls)", async () => {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { createAdobeMcpServer } = await import("../../src/server.js");
    const rt = createAdobeMcpServer({ enableOsFallback: false });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await rt.server.connect(a);
    const client = new Client({ name: "t", version: "1" });
    await client.connect(b);
    const root = path.resolve(__dirname, "../../bench/regressao");
    const dirs = fs.readdirSync(root).filter((d) => /^\d\d-/.test(d));
    expect(dirs.length).toBe(10);
    for (const d of dirs) {
      const res = (await client.callTool({ name: "jradb_campaign_run", arguments: { campaignFolder: path.join(root, d), operation: "plan" } })) as { content: Array<{ text: string }> };
      const r = JSON.parse(res.content[0].text);
      // only the human-supplied photo may be missing
      const real = (r.problems as string[]).filter((p) => !/01_fotos[\\/]produto\.jpg/.test(p));
      expect(real, d).toEqual([]);
      expect(r.pieces, d).toBe(8);
    }
    await client.close();
  }, 30000);
});
