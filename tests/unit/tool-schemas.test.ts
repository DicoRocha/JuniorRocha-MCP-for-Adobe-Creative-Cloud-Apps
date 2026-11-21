import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAdobeMcpServer } from "../../src/server.js";
import { ALL_ADOBE_APPS } from "../../src/core/types.js";

function findTupleSchemas(node: unknown, path: string, hits: string[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, i) => findTupleSchemas(child, `${path}[${i}]`, hits));
    return;
  }
  const obj = node as Record<string, unknown>;
  // Tuple-form schemas ("items": [...], "prefixItems") are rejected by the Anthropic API,
  // and Claude then drops the whole tool.
  if (Array.isArray(obj.items)) hits.push(`${path}.items`);
  if ("prefixItems" in obj) hits.push(`${path}.prefixItems`);
  for (const [k, v] of Object.entries(obj)) findTupleSchemas(v, `${path}.${k}`, hits);
}

describe("MCP tool input schemas", () => {
  it("exposes all 181 tools with schemas Claude accepts (no tuple-form arrays)", async () => {
    const runtime = createAdobeMcpServer({ enabledApps: ALL_ADOBE_APPS, wsPort: 0, enableOsFallback: false });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "schema-test", version: "1.0.0" });
    await Promise.all([runtime.server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const { tools } = await client.listTools();
      expect(tools.length).toBe(220);
      const hits: string[] = [];
      for (const tool of tools) findTupleSchemas(tool.inputSchema, tool.name, hits);
      expect(hits).toEqual([]);
    } finally {
      await client.close();
    }
  });
});
