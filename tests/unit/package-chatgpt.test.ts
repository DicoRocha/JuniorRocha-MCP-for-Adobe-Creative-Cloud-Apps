import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readZip, writeZip } from "../../src/core/zip.js";
import { buildDownloads } from "../../scripts/package-complete.js";
// @ts-expect-error plain JavaScript installer shipped in the ChatGPT zip
import { upsertServerBlock, serverBlock, install } from "../../scripts/standalone/chatgpt/install-chatgpt.mjs";

const repoRoot = path.resolve(__dirname, "..", "..");

function fakeRelease(dir: string, version: string): void {
  fs.mkdirSync(dir, { recursive: true });
  writeZip(path.join(dir, `jr-adb-mcp-bridge-${version}.mcpb`), [
    { name: "manifest.json", data: Buffer.from("{}") },
    { name: "dist/index.js", data: Buffer.from("console.log('server')") },
    { name: "node_modules/zod/package.json", data: Buffer.from('{"version":"4.6.7"}') },
    { name: "skills/index.md", data: Buffer.from("# skills") }
  ]);
  for (const f of ["jr-adb-mcp-bridge-photoshop-uxp-1.4.11.ccx", "jr-adb-mcp-bridge-premiere-uxp-1.4.1.ccx", "jr-adb-mcp-bridge-indesign-uxp-1.0.4.ccx"]) {
    fs.writeFileSync(path.join(dir, f), f);
  }
}

describe("zip reader", () => {
  it("reads back what writeZip wrote", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jr-zip-")), "a.zip");
    const big = Buffer.alloc(50000, "abc");
    writeZip(f, [
      { name: "x/y.txt", data: Buffer.from("olá") },
      { name: "big.bin", data: big }
    ]);
    const back = readZip(f);
    expect(back.map((e) => e.name)).toEqual(["x/y.txt", "big.bin"]);
    expect(back[0].data.toString("utf8")).toBe("olá");
    expect(back[1].data.equals(big)).toBe(true);
  });
});

describe("downloads: one zip for Claude, one for ChatGPT", () => {
  it("the ChatGPT zip has the server unpacked, the installers, the plug-ins and the bridges kit", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jr-dl-"));
    fakeRelease(tmp, "9.9.9");
    const { claude, chatgpt } = buildDownloads({ repoRoot, releaseDir: tmp, version: "9.9.9" });
    expect(path.basename(claude)).toBe("JuniorRocha-MCP-9.9.9-claude.zip");
    expect(path.basename(chatgpt)).toBe("JuniorRocha-MCP-9.9.9-chatgpt.zip");
    const names = readZip(chatgpt).map((e) => e.name);
    const top = "JuniorRocha-MCP-9.9.9-ChatGPT/";
    for (const f of [
      "INSTALL.txt",
      "1-server/INSTALL-CHATGPT.bat",
      "1-server/INSTALL-CHATGPT.command",
      "1-server/install-chatgpt.mjs",
      "1-server/server/dist/index.js",
      "1-server/server/node_modules/zod/package.json",
      "1-server/server/skills/index.md",
      "2-plugins/jr-adb-mcp-bridge-photoshop-uxp-1.4.11.ccx",
      "3-bridges-kit/INSTALL-BRIDGES.bat"
    ]) {
      expect(names, f).toContain(top + f);
    }
    expect(names.some((n) => n.endsWith(".mcpb"))).toBe(false);
    const claudeNames = readZip(claude).map((e) => e.name);
    expect(claudeNames).toContain("JuniorRocha-MCP-9.9.9/1-server/jr-adb-mcp-bridge-9.9.9.mcpb");
  });

  it("removes downloads of other versions and the old -complete name", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jr-dl-"));
    fakeRelease(tmp, "9.9.9");
    for (const f of ["JuniorRocha-MCP-9.9.8-claude.zip", "JuniorRocha-MCP-9.9.8-chatgpt.zip", "JuniorRocha-MCP-9.9.9-complete.zip"]) fs.writeFileSync(path.join(tmp, f), "old");
    buildDownloads({ repoRoot, releaseDir: tmp, version: "9.9.9" });
    expect(fs.readdirSync(tmp).filter((f) => f.startsWith("JuniorRocha-MCP-")).sort()).toEqual(["JuniorRocha-MCP-9.9.9-chatgpt.zip", "JuniorRocha-MCP-9.9.9-claude.zip"]);
  });
});

describe("ChatGPT installer", () => {
  const block = serverBlock({ node: "C:\\Program Files\\nodejs\\node.exe", entry: "C:\\Users\\Ana\\AppData\\Local\\JuniorRocha-MCP\\server\\dist\\index.js" });

  it("writes a valid TOML table with escaped Windows paths and a long tool timeout", () => {
    expect(block).toContain("[mcp_servers.junior-rocha-mcp]");
    expect(block).toContain('command = "C:\\\\Program Files\\\\nodejs\\\\node.exe"');
    expect(block).toMatch(/tool_timeout_sec = 900/);
    expect(block).toMatch(/startup_timeout_sec = \d+/);
  });

  it("adds the table and keeps everything else in the file", () => {
    const before = 'model = "gpt-5"\n\n[mcp_servers.figma]\ncommand = "npx"\nargs = ["figma"]\n';
    const after = upsertServerBlock(before, block);
    expect(after.startsWith(before.trimEnd())).toBe(true);
    expect(after).toContain("[mcp_servers.junior-rocha-mcp]");
  });

  it("replaces its own table (and sub-tables) on a second run, leaving the tables after it alone", () => {
    const old =
      'model = "gpt-5"\n\n[mcp_servers.junior-rocha-mcp]\ncommand = "old"\n\n[mcp_servers.junior-rocha-mcp.env]\nX = "1"\n\n[mcp_servers.figma]\ncommand = "npx"\n';
    const after = upsertServerBlock(old, block);
    expect(after.match(/\[mcp_servers\.junior-rocha-mcp\]/g)?.length).toBe(1);
    expect(after).not.toContain('command = "old"');
    expect(after).not.toContain("junior-rocha-mcp.env");
    expect(after).toContain('[mcp_servers.figma]\ncommand = "npx"');
    expect(after).toContain('model = "gpt-5"');
  });

  it("installs into a folder, backs up the settings and is safe to run twice", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jr-gpt-"));
    const src = path.join(tmp, "pkg", "server");
    fs.mkdirSync(path.join(src, "dist"), { recursive: true });
    fs.writeFileSync(path.join(src, "dist", "index.js"), "x");
    const codexHome = path.join(tmp, "codex");
    fs.mkdirSync(codexHome);
    fs.writeFileSync(path.join(codexHome, "config.toml"), 'model = "gpt-5"\n');
    const dest = path.join(tmp, "installed");
    const r1 = install({ serverSrc: src, dest, codexHome, node: "/usr/bin/node", log: () => {} });
    const r2 = install({ serverSrc: src, dest, codexHome, node: "/usr/bin/node", log: () => {} });
    expect(fs.existsSync(path.join(dest, "dist", "index.js"))).toBe(true);
    const cfg = fs.readFileSync(path.join(codexHome, "config.toml"), "utf8");
    expect(cfg.match(/\[mcp_servers\.junior-rocha-mcp\]/g)?.length).toBe(1);
    expect(cfg).toContain('model = "gpt-5"');
    expect(fs.existsSync(r1.backup!)).toBe(true);
    expect(r2.configPath).toBe(path.join(codexHome, "config.toml"));
  });

  it("creates the settings file when there is none", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jr-gpt-"));
    const src = path.join(tmp, "server");
    fs.mkdirSync(path.join(src, "dist"), { recursive: true });
    fs.writeFileSync(path.join(src, "dist", "index.js"), "x");
    const codexHome = path.join(tmp, "codex-new");
    const r = install({ serverSrc: src, dest: path.join(tmp, "inst"), codexHome, node: "/usr/bin/node", log: () => {} });
    expect(r.backup).toBeNull();
    expect(fs.readFileSync(path.join(codexHome, "config.toml"), "utf8")).toContain("[mcp_servers.junior-rocha-mcp]");
  });

  it("points out an older entry that runs this server under another name", () => {
    const text = '[mcp_servers.adobe]\ncommand = "node"\nargs = ["D:/MCPS ADOBE/dist/index.js"]\n';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jr-gpt-"));
    const src = path.join(tmp, "server");
    fs.mkdirSync(path.join(src, "dist"), { recursive: true });
    fs.writeFileSync(path.join(src, "dist", "index.js"), "x");
    const codexHome = path.join(tmp, "codex");
    fs.mkdirSync(codexHome);
    fs.writeFileSync(path.join(codexHome, "config.toml"), text);
    const lines: string[] = [];
    const r = install({ serverSrc: src, dest: path.join(tmp, "inst"), codexHome, node: "/usr/bin/node", log: (s: string) => lines.push(s) });
    expect(r.otherEntries).toEqual(["adobe"]);
    expect(lines.join("\n")).toMatch(/adobe/);
  });
});

describe("SETUP and README", () => {
  it("README offers both downloads", () => {
    const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
    expect(readme).toMatch(/-claude\.zip/);
    expect(readme).toMatch(/-chatgpt\.zip/);
  });
});
