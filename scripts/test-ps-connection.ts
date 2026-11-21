import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

async function main() {
  console.log("1. Connecting to Junior Rocha MCP server via stdio...");
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(repoRoot, "dist", "index.js"), "--apps", "all"]
  });

  const client = new Client(
    { name: "mcp-connection-tester", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("[OK] Connected to MCP Server!\n");

  const toolsList = await client.listTools();
  console.log(`[OK] Total tools exposed by MCP Server: ${toolsList.tools.length}`);

  console.log("\n2. Calling tool `jradb_get_status`...");
  const statusRes = await client.callTool({
    name: "jradb_get_status",
    arguments: { refreshInstallations: true }
  });
  console.log(statusRes.content?.[0]?.type === "text" ? statusRes.content[0].text : JSON.stringify(statusRes));

  console.log("\n3. Calling tool `ps_list_documents` on live Photoshop...");
  const psDocsRes = await client.callTool({
    name: "ps_list_documents",
    arguments: {}
  });
  console.log(psDocsRes.content?.[0]?.type === "text" ? psDocsRes.content[0].text : JSON.stringify(psDocsRes));

  console.log("\n4. Calling tool `ps_execute_extendscript` to read live Photoshop runtime info...");
  const psInfoRes = await client.callTool({
    name: "ps_execute_extendscript",
    arguments: {
      script: "return { appName: app.name, version: app.version, locale: app.locale, freeMemory: app.freeMemory, documentsCount: app.documents.length };"
    }
  });
  console.log(psInfoRes.content?.[0]?.type === "text" ? psInfoRes.content[0].text : JSON.stringify(psInfoRes));

  await client.close();
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
