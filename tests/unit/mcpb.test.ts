import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { crc32, writeZip } from "../../src/core/zip.js";
import { buildMcpbManifest } from "../../src/core/mcpb.js";

describe("phase 4 packaging (.mcpb)", () => {
  it("computes CRC-32", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("writes a ZIP whose entries read back (local headers, deflate, central directory)", () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "zip-")), "a.zip");
    const big = Buffer.from("abc ".repeat(5000));
    writeZip(out, [
      { name: "manifest.json", data: Buffer.from('{"a":1}') },
      { name: "dir\\sub\\b.txt", data: big }
    ]);
    const z = fs.readFileSync(out);
    const end = z.length - 22;
    expect(z.readUInt32LE(end)).toBe(0x06054b50);
    expect(z.readUInt16LE(end + 10)).toBe(2);
    // second entry: find its local header through the central directory
    let p = z.readUInt32LE(end + 16);
    const names: string[] = [];
    for (let i = 0; i < 2; i++) {
      const nameLen = z.readUInt16LE(p + 28);
      const local = z.readUInt32LE(p + 42);
      names.push(z.subarray(p + 46, p + 46 + nameLen).toString());
      const method = z.readUInt16LE(local + 8);
      const csize = z.readUInt32LE(local + 18);
      const lnl = z.readUInt16LE(local + 26);
      const body = z.subarray(local + 30 + lnl, local + 30 + lnl + csize);
      const data = method === 8 ? zlib.inflateRawSync(body) : body;
      expect(crc32(data)).toBe(z.readUInt32LE(p + 16));
      p += 46 + nameLen;
    }
    expect(names).toEqual(["manifest.json", "dir/sub/b.txt"]);
  });

  it("builds a 0.3 manifest with user settings wired to the CLI", () => {
    const m = buildMcpbManifest({ version: "9.9.9", tools: [{ name: "jradb_code", description: "Run code. More text here." }] }) as Record<string, any>;
    expect(m.manifest_version).toBe("0.3");
    expect(m.version).toBe("9.9.9");
    expect(m.server.mcp_config.args).toContain("${user_config.tool_mode}");
    expect(m.server.mcp_config.env.JRADB_MCP_APPS).toBe("${user_config.apps}");
    expect(m.tools).toEqual([{ name: "jradb_code", description: "Run code." }]);
    expect(Object.keys(m.user_config).sort()).toEqual(["apps", "port", "tool_mode"]);
  });
});
