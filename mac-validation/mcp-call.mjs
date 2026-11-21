// Mac validation helper (20/11/2026): calls the MCP server's tools over stdio without an AI client.
// Usage: node mac-validation/mcp-call.mjs <tool> '<json args>' [<tool> '<json args>' ...]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const root = new URL("..", import.meta.url).pathname;
const transport = new StdioClientTransport({ command: process.execPath, args: [root + "dist/index.js", "--apps", "all"], cwd: root, stderr: "ignore" });
const client = new Client({ name: "mac-validation", version: "1.0.0" });
await client.connect(transport);
const wait = Number(process.env.WAIT_MS || 0);
if (wait) await new Promise((r) => setTimeout(r, wait));
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const name = argv[i];
  const args = argv[i + 1] ? JSON.parse(argv[i + 1]) : {};
  const t = Date.now();
  try {
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 180000 });
    console.log(`### ${name} (${Date.now() - t} ms)${res.isError ? " ERROR" : ""}`);
    for (const c of res.content || []) {
      if (c.type === "text") console.log(c.text);
      else if (c.type === "image") console.log(`[image ${c.mimeType}, ${Math.round((c.data || "").length * 0.75 / 1024)} KB]`);
      else console.log(`[${c.type}]`);
    }
  } catch (e) {
    console.log(`### ${name} THREW: ${e && e.message ? e.message : e}`);
  }
}
await client.close();
