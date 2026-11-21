/**
 * Packages the unified MCP as a Claude Desktop extension (.mcpb): manifest + dist + production node_modules +
 * skills + templates + ExtendScript handlers (COM fallback) + app panels (bridges). Phase 4, item 6.
 *
 *   npm run build && npx tsx scripts/package-mcpb.ts [--no-install]   → release/jr-adb-mcp-bridge-<version>.mcpb
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildMcpbManifest } from "../src/core/mcpb.js";
import { collectFiles, writeZip } from "../src/core/zip.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function toolList(): Promise<Array<{ name: string; description: string }>> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const { createAdobeMcpServer } = await import("../src/server.js");
  const rt = createAdobeMcpServer({ enableOsFallback: false, toolMode: "full" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await rt.server.connect(a);
  const c = new Client({ name: "pack", version: "1" });
  await c.connect(b);
  const tools = (await c.listTools()).tools.map((t) => ({ name: t.name, description: t.description ?? "" }));
  await c.close();
  return tools;
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (!fs.existsSync(path.join(root, "dist", "index.js"))) throw new Error("dist/index.js missing: run npm run build first.");
  const stage = path.join(root, "build", "mcpb");
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const manifest = buildMcpbManifest({ version: pkg.version, tools: await toolList() });
  fs.writeFileSync(path.join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));
  const prodPkg = { name: pkg.name, version: pkg.version, type: "module", main: "dist/index.js", dependencies: pkg.dependencies };
  fs.writeFileSync(path.join(stage, "package.json"), JSON.stringify(prodPkg, null, 2));
  if (!process.argv.includes("--no-install")) {
    execSync("npm install --omit=dev --omit=optional --no-audit --no-fund --ignore-scripts", { cwd: stage, stdio: "inherit" });
  }
  const skipMaps = /\.(map|d\.ts)$/;
  const entries = [
    { name: "manifest.json", data: fs.readFileSync(path.join(stage, "manifest.json")) },
    { name: "package.json", data: fs.readFileSync(path.join(stage, "package.json")) },
    ...collectFiles(path.join(root, "dist"), "dist", skipMaps),
    ...collectFiles(path.join(root, "src", "extendscript"), "src/extendscript"),
    ...collectFiles(path.join(root, "skills"), "skills"),
    ...collectFiles(path.join(root, "bridges"), "bridges", /(^|\/)(node_modules|\.git)(\/|$)/),
    { name: "templates/README.md", data: fs.readFileSync(path.join(root, "templates", "README.md")) },
    ...collectFiles(path.join(root, "templates", "legendas"), "templates/legendas", /\.aep$/),
    ...collectFiles(path.join(stage, "node_modules"), "node_modules", /(^|\/)(\.bin|test|tests|docs)(\/|$)|\.(md|map|d\.ts)$/)
  ];
  const out = path.join(root, "release", `${pkg.name}-${pkg.version}.mcpb`);
  fs.mkdirSync(path.join(root, "release"), { recursive: true });
  // Only the current package stays in release/: older versions and the ones under the old name are removed.
  for (const f of fs.readdirSync(path.join(root, "release"))) {
    if (/\.mcpb$/i.test(f) && f !== path.basename(out)) fs.rmSync(path.join(root, "release", f), { force: true });
  }
  writeZip(out, entries);
  const mb = (fs.statSync(out).size / 1048576).toFixed(1);
  console.log(`${out} — ${entries.length} files, ${mb} MB, ${(manifest.tools as unknown[]).length} tools`);
  console.log("Install: double-click the .mcpb (Claude Desktop → Settings → Extensions). Then install the app panels once.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
