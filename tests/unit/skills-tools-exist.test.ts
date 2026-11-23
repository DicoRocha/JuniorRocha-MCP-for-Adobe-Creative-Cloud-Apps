import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAdobeMcpServer } from "../../src/server.js";
import { ALL_ADOBE_APPS } from "../../src/core/types.js";

function skillFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? skillFiles(p) : d.name.endsWith(".md") ? [p] : [];
  });
}

describe("skills cite only tools that exist", () => {
  it("every `ps_…`, `ae_…`, `jradb_…` (etc.) named in a skill is a registered tool", async () => {
    const runtime = createAdobeMcpServer({ enabledApps: ALL_ADOBE_APPS, wsPort: 0, enableOsFallback: false });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "skills-tools", version: "1.0.0" });
    await Promise.all([runtime.server.connect(st), client.connect(ct)]);
    let names: Set<string>;
    try {
      names = new Set((await client.listTools()).tools.map((t) => t.name));
    } finally {
      await client.close();
    }
    const missing: string[] = [];
    for (const f of skillFiles("skills")) {
      const text = fs.readFileSync(f, "utf8");
      for (const m of text.matchAll(/`((?:ps|ae|pr|ai|id|lr|media|jradb|adobe)_[a-z0-9_]+)\b/g)) {
        if (!names.has(m[1])) missing.push(`${path.relative("skills", f)}: ${m[1]}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  }, 30000);
});
