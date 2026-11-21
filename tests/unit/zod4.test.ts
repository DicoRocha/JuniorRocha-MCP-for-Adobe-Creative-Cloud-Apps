import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAdobeMcpServer } from "../../src/server.js";

async function client(): Promise<Client> {
  const rt = createAdobeMcpServer({ enableOsFallback: false, toolMode: "full" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await rt.server.connect(a);
  const c = new Client({ name: "t", version: "1" });
  await c.connect(b);
  return c;
}

async function codeError(c: Client, body: string): Promise<string> {
  const r = await c.callTool({ name: "jradb_code", arguments: { code: body, timeoutSeconds: 10 } });
  return (r.content as Array<{ text?: string }>).map((x) => x.text ?? "").join("\n");
}

describe("zod 4 migration", () => {
  it("lr_color: any subset of HSL colours is valid (a zod 4 record with enum keys would require all eight)", async () => {
    const c = await client();
    const out = await codeError(c, "await tools.lr_color({ hsl: { orange: { saturation: -10 } } }); return 1;");
    expect(out).not.toMatch(/invalid arguments/);
    const bad = await codeError(c, "await tools.lr_color({ hsl: { pink: { saturation: -10 } } }); return 1;");
    expect(bad).toMatch(/invalid arguments/);
    await c.close();
  });

  it("a property or keyframe without a value is refused before reaching the app", async () => {
    const c = await client();
    const out = await codeError(c, "await tools.ae_set_property({ propertyPath: ['Opacity'] }); return 1;");
    expect(out).toMatch(/invalid arguments.*value/);
    await c.close();
  });

  it("jradb_api signatures keep their format (int bounds, defaults, enums)", async () => {
    const c = await client();
    const r = await c.callTool({ name: "jradb_api", arguments: { tools: ["id_get_page_preview", "lr_color"] } });
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("resolution?: number/*int 24–300*/ // default 72");
    expect(text).toContain('hsl?: Record<string, { hue?: number/*-100–100*/');
    await c.close();
  });
});
