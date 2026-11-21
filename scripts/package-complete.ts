/**
 * One download with every installer: release/JuniorRocha-MCP-<version>-complete.zip
 *
 *   JuniorRocha-MCP-<version>/
 *     INSTALL.txt
 *     1-server/        the .mcpb (Claude Desktop extension)
 *     2-plugins/       the Photoshop, Premiere Pro and InDesign .ccx files
 *     3-bridges-kit/   the bridges kit, already unzipped (INSTALL-BRIDGES.bat / .command)
 *
 * Run after package-plugins and package-mcpb (SETUP does): npm run package-complete
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { collectFiles, writeZip } from "../src/core/zip.js";

type Entry = { name: string; data: Buffer };

function findOne(releaseDir: string, pattern: RegExp, what: string): string {
  const hits = fs.readdirSync(releaseDir).filter((f) => pattern.test(f));
  if (hits.length !== 1) {
    throw new Error(`package-complete: expected one ${what} in ${releaseDir}, found ${hits.length} (${hits.join(", ") || "none"}). Run package-plugins and package-mcpb first.`);
  }
  return path.join(releaseDir, hits[0]);
}

export function buildCompleteZip(opts: { repoRoot: string; releaseDir: string; version: string }): string {
  const { repoRoot, releaseDir, version } = opts;
  const esc = version.replace(/\./g, "\\.");
  const top = `JuniorRocha-MCP-${version}`;
  const server = findOne(releaseDir, new RegExp(`^jr-adb-mcp-bridge-${esc}\\.mcpb$`), `server package (.mcpb ${version})`);
  const plugins = ["photoshop", "premiere", "indesign"].map((app) =>
    findOne(releaseDir, new RegExp(`^jr-adb-mcp-bridge-${app}-uxp-[\\d.]+\\.ccx$`), `${app} plug-in (.ccx)`)
  );

  const file = (p: string, name: string): Entry => ({ name: `${top}/${name}`, data: fs.readFileSync(p) });
  const install = fs.readFileSync(path.join(repoRoot, "scripts", "standalone", "INSTALL-COMPLETE.txt"), "utf8").replace(/\{\{VERSION\}\}/g, version);
  const kit = `${top}/3-bridges-kit`;
  const entries: Entry[] = [
    { name: `${top}/INSTALL.txt`, data: Buffer.from(install.replace(/\r?\n/g, "\r\n"), "utf8") },
    file(server, `1-server/${path.basename(server)}`),
    ...plugins.map((p) => file(p, `2-plugins/${path.basename(p)}`)),
    // The bridges kit is placed unzipped (same contents as the kit zip from package-plugins), so there is
    // no zip inside the zip.
    ...collectFiles(path.join(repoRoot, "bridges", "cep-universal-bridge"), `${kit}/com.jradbmcp.universal`),
    ...collectFiles(path.join(repoRoot, "bridges", "lightroom-classic", "JrAdbMcpBridge.lrplugin"), `${kit}/JrAdbMcpBridge.lrplugin`),
    ...["INSTALL-BRIDGES.bat", "INSTALL-BRIDGES.command", "README.txt"].map((f) => ({
      name: `${kit}/${f}`,
      data: fs.readFileSync(path.join(repoRoot, "scripts", "standalone", f))
    }))
  ];

  const out = path.join(releaseDir, `${top}-complete.zip`);
  for (const f of fs.readdirSync(releaseDir)) {
    if (/^JuniorRocha-MCP-.*-complete\.zip$/.test(f) && f !== path.basename(out)) fs.rmSync(path.join(releaseDir, f), { force: true });
  }
  writeZip(out, entries);
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version as string;
  const out = buildCompleteZip({ repoRoot, releaseDir: path.join(repoRoot, "release"), version });
  console.log(`=== Complete download === ${path.basename(out)} (${fs.statSync(out).size} bytes) -> ${out}`);
}
