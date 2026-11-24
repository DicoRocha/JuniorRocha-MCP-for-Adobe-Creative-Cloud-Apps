import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildDownloads } from "../../scripts/package-complete.js";
import { writeZip } from "../../src/core/zip.js";

const repoRoot = path.resolve(__dirname, "..", "..");

function fakeRelease(dir: string, version: string): void {
  fs.mkdirSync(dir, { recursive: true });
  writeZip(path.join(dir, `jr-adb-mcp-bridge-${version}.mcpb`), [{ name: "dist/index.js", data: Buffer.from("x") }]);
  for (const f of [
    "jr-adb-mcp-bridge-photoshop-uxp-1.4.16.ccx",
    "jr-adb-mcp-bridge-premiere-uxp-1.4.2.ccx",
    "jr-adb-mcp-bridge-indesign-uxp-1.0.6.ccx",
    "jr-adb-mcp-bridge-bridges-kit-1.4.9.zip",
    "jr-adb-mcp-bridge-cep-1.4.9.zip",
    "jr-adb-mcp-bridge-1.0.0.mcpb"
  ]) {
    fs.writeFileSync(path.join(dir, f), f);
  }
}

/** Entry names from the zip's central directory (no external tool: python printed \r\n on Windows). */
function zipNames(file: string): string[] {
  const buf = fs.readFileSync(file);
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.toString("utf8", p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

describe("complete download (one zip with every installer)", () => {
  it("puts the server, the three plug-ins, the unzipped bridges kit and INSTALL.txt in one folder", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jr-complete-"));
    fakeRelease(tmp, "9.9.9");
    const out = buildDownloads({ repoRoot, releaseDir: tmp, version: "9.9.9" }).claude;
    expect(path.basename(out)).toBe("JuniorRocha-MCP-9.9.9-claude.zip");
    const names = zipNames(out);
    const top = "JuniorRocha-MCP-9.9.9/";
    expect(names.every((n) => n.startsWith(top))).toBe(true);
    for (const f of [
      "INSTALL.txt",
      "1-server/jr-adb-mcp-bridge-9.9.9.mcpb",
      "2-plugins/jr-adb-mcp-bridge-photoshop-uxp-1.4.16.ccx",
      "2-plugins/jr-adb-mcp-bridge-premiere-uxp-1.4.2.ccx",
      "2-plugins/jr-adb-mcp-bridge-indesign-uxp-1.0.6.ccx",
      "3-bridges-kit/INSTALL-BRIDGES.bat",
      "3-bridges-kit/INSTALL-BRIDGES.command",
      "3-bridges-kit/com.jradbmcp.universal/CSXS/manifest.xml",
      "3-bridges-kit/JrAdbMcpBridge.lrplugin/Info.lua"
    ]) {
      expect(names, f).toContain(top + f);
    }
    // the separate CEP zip and other versions stay out
    expect(names.some((n) => /cep-1\.4\.9\.zip|1\.0\.0\.mcpb|bridges-kit-1\.4\.9\.zip/.test(n))).toBe(false);
  });

  it("refuses to build when an installer is missing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jr-complete-"));
    fakeRelease(tmp, "9.9.9");
    fs.rmSync(path.join(tmp, "jr-adb-mcp-bridge-indesign-uxp-1.0.6.ccx"));
    expect(() => buildDownloads({ repoRoot, releaseDir: tmp, version: "9.9.9" }).claude).toThrow(/indesign/);
  });

  it("removes downloads of other versions", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jr-complete-"));
    fakeRelease(tmp, "9.9.9");
    fs.writeFileSync(path.join(tmp, "JuniorRocha-MCP-9.9.8-claude.zip"), "old");
    buildDownloads({ repoRoot, releaseDir: tmp, version: "9.9.9" });
    expect(fs.existsSync(path.join(tmp, "JuniorRocha-MCP-9.9.8-claude.zip"))).toBe(false);
  });

  it("SETUP builds it on Windows and macOS", () => {
    expect(fs.readFileSync(path.join(repoRoot, "SETUP.bat"), "utf8")).toMatch(/npm run package-complete/);
    expect(fs.readFileSync(path.join(repoRoot, "SETUP.command"), "utf8")).toMatch(/npm run package-complete/);
  });
});
