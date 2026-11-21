/**
 * The two downloads, each with every installer:
 *
 *   release/JuniorRocha-MCP-<version>-claude.zip
 *     JuniorRocha-MCP-<version>/
 *       INSTALL.txt
 *       1-server/        the .mcpb (Claude Desktop extension)
 *       2-plugins/       the Photoshop, Premiere Pro and InDesign .ccx files
 *       3-bridges-kit/   the bridges kit, already unzipped (INSTALL-BRIDGES.bat / .command)
 *
 *   release/JuniorRocha-MCP-<version>-chatgpt.zip
 *     JuniorRocha-MCP-<version>-ChatGPT/
 *       INSTALL.txt
 *       1-server/        server/ (the .mcpb contents, unpacked) + INSTALL-CHATGPT.bat / .command / install-chatgpt.mjs
 *       2-plugins/, 3-bridges-kit/   as above
 *
 * Run after package-plugins and package-mcpb (SETUP does): npm run package-complete
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { collectFiles, readZip, writeZip } from "../src/core/zip.js";

type Entry = { name: string; data: Buffer };

function findOne(releaseDir: string, pattern: RegExp, what: string): string {
  const hits = fs.readdirSync(releaseDir).filter((f) => pattern.test(f));
  if (hits.length !== 1) {
    throw new Error(`package-complete: expected one ${what} in ${releaseDir}, found ${hits.length} (${hits.join(", ") || "none"}). Run package-plugins and package-mcpb first.`);
  }
  return path.join(releaseDir, hits[0]);
}

const crlf = (s: string) => Buffer.from(s.replace(/\r?\n/g, "\r\n"), "utf8");

export function buildDownloads(opts: { repoRoot: string; releaseDir: string; version: string }): { claude: string; chatgpt: string } {
  const { repoRoot, releaseDir, version } = opts;
  const esc = version.replace(/\./g, "\\.");
  const server = findOne(releaseDir, new RegExp(`^jr-adb-mcp-bridge-${esc}\\.mcpb$`), `server package (.mcpb ${version})`);
  const plugins = ["photoshop", "premiere", "indesign"].map((app) =>
    findOne(releaseDir, new RegExp(`^jr-adb-mcp-bridge-${app}-uxp-[\\d.]+\\.ccx$`), `${app} plug-in (.ccx)`)
  );
  const standalone = path.join(repoRoot, "scripts", "standalone");
  const text = (f: string) => fs.readFileSync(path.join(standalone, f), "utf8").replace(/\{\{VERSION\}\}/g, version);

  // Shared parts: the three plug-ins and the bridges kit, unzipped (same contents as the kit zip of package-plugins).
  const shared = (top: string): Entry[] => {
    const kit = `${top}/3-bridges-kit`;
    return [
      ...plugins.map((p) => ({ name: `${top}/2-plugins/${path.basename(p)}`, data: fs.readFileSync(p) })),
      ...collectFiles(path.join(repoRoot, "bridges", "cep-universal-bridge"), `${kit}/com.jradbmcp.universal`),
      ...collectFiles(path.join(repoRoot, "bridges", "lightroom-classic", "JrAdbMcpBridge.lrplugin"), `${kit}/JrAdbMcpBridge.lrplugin`),
      ...["INSTALL-BRIDGES.bat", "INSTALL-BRIDGES.command", "README.txt"].map((f) => ({
        name: `${kit}/${f}`,
        data: fs.readFileSync(path.join(standalone, f))
      }))
    ];
  };

  const claudeTop = `JuniorRocha-MCP-${version}`;
  const claudeEntries: Entry[] = [
    { name: `${claudeTop}/INSTALL.txt`, data: crlf(text("INSTALL-COMPLETE.txt")) },
    { name: `${claudeTop}/1-server/${path.basename(server)}`, data: fs.readFileSync(server) },
    ...shared(claudeTop)
  ];

  // ChatGPT runs the server as a local command, so it gets the .mcpb contents unpacked plus an installer.
  const gptTop = `JuniorRocha-MCP-${version}-ChatGPT`;
  const gptDir = path.join(standalone, "chatgpt");
  const gptEntries: Entry[] = [
    { name: `${gptTop}/INSTALL.txt`, data: crlf(text("chatgpt/INSTALL-CHATGPT.txt")) },
    ...["INSTALL-CHATGPT.bat", "INSTALL-CHATGPT.command", "install-chatgpt.mjs"].map((f) => ({
      name: `${gptTop}/1-server/${f}`,
      data: fs.readFileSync(path.join(gptDir, f))
    })),
    ...readZip(server).map((e) => ({ name: `${gptTop}/1-server/server/${e.name}`, data: e.data })),
    ...shared(gptTop)
  ];

  const claude = path.join(releaseDir, `${claudeTop}-claude.zip`);
  const chatgpt = path.join(releaseDir, `JuniorRocha-MCP-${version}-chatgpt.zip`);
  const keep = new Set([path.basename(claude), path.basename(chatgpt)]);
  for (const f of fs.readdirSync(releaseDir)) {
    if (/^JuniorRocha-MCP-.*-(complete|claude|chatgpt)\.zip$/.test(f) && !keep.has(f)) fs.rmSync(path.join(releaseDir, f), { force: true });
  }
  writeZip(claude, claudeEntries);
  writeZip(chatgpt, gptEntries);
  return { claude, chatgpt };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version as string;
  const out = buildDownloads({ repoRoot, releaseDir: path.join(repoRoot, "release"), version });
  for (const f of [out.claude, out.chatgpt]) console.log(`=== Download === ${path.basename(f)} (${fs.statSync(f).size} bytes) -> ${f}`);
}
