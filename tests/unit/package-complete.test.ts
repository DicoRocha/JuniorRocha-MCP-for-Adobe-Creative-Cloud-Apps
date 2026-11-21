import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { buildCompleteZip } from "../../scripts/package-complete.js";

const repoRoot = path.resolve(__dirname, "..", "..");

function fakeRelease(dir: string, version: string): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of [
    `jr-adb-mcp-bridge-${version}.mcpb`,
    "jr-adb-mcp-bridge-photoshop-uxp-1.4.11.ccx",
    "jr-adb-mcp-bridge-premiere-uxp-1.4.1.ccx",
    "jr-adb-mcp-bridge-indesign-uxp-1.0.4.ccx",
    "jr-adb-mcp-bridge-bridges-kit-1.4.9.zip",
    "jr-adb-mcp-bridge-cep-1.4.9.zip",
    "jr-adb-mcp-bridge-1.0.0.mcpb"
  ]) {
    fs.writeFileSync(path.join(dir, f), f);
  }
}

function zipNames(file: string): string[] {
  const out = execFileSync("python3", ["-c", "import sys,zipfile;print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))", file]);
  return out.toString().trim().split("\n");
}

describe("complete download (one zip with every installer)", () => {
  it("puts the server, the three plug-ins, the unzipped bridges kit and INSTALL.txt in one folder", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jr-complete-"));
    fakeRelease(tmp, "9.9.9");
    const out = buildCompleteZip({ repoRoot, releaseDir: tmp, version: "9.9.9" });
    expect(path.basename(out)).toBe("JuniorRocha-MCP-9.9.9-complete.zip");
    const names = zipNames(out);
    const top = "JuniorRocha-MCP-9.9.9/";
    expect(names.every((n) => n.startsWith(top))).toBe(true);
    for (const f of [
      "INSTALL.txt",
      "1-server/jr-adb-mcp-bridge-9.9.9.mcpb",
      "2-plugins/jr-adb-mcp-bridge-photoshop-uxp-1.4.11.ccx",
      "2-plugins/jr-adb-mcp-bridge-premiere-uxp-1.4.1.ccx",
      "2-plugins/jr-adb-mcp-bridge-indesign-uxp-1.0.4.ccx",
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
    fs.rmSync(path.join(tmp, "jr-adb-mcp-bridge-indesign-uxp-1.0.4.ccx"));
    expect(() => buildCompleteZip({ repoRoot, releaseDir: tmp, version: "9.9.9" })).toThrow(/indesign/);
  });

  it("removes complete zips of other versions", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jr-complete-"));
    fakeRelease(tmp, "9.9.9");
    fs.writeFileSync(path.join(tmp, "JuniorRocha-MCP-9.9.8-complete.zip"), "old");
    buildCompleteZip({ repoRoot, releaseDir: tmp, version: "9.9.9" });
    expect(fs.existsSync(path.join(tmp, "JuniorRocha-MCP-9.9.8-complete.zip"))).toBe(false);
  });

  it("SETUP builds it on Windows and macOS", () => {
    expect(fs.readFileSync(path.join(repoRoot, "SETUP.bat"), "utf8")).toMatch(/npm run package-complete/);
    expect(fs.readFileSync(path.join(repoRoot, "SETUP.command"), "utf8")).toMatch(/npm run package-complete/);
  });
});
