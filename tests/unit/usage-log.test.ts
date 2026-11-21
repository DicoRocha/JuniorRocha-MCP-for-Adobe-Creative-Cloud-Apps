import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("usage telemetry", () => {
  it("measures text and images and writes one line per call", async () => {
    process.env.JRADB_MCP_USAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "usage-"));
    const u = await import("../../src/core/usage-log.js");
    // 1x1 PNG
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    expect(u.imageSize(png)).toEqual({ w: 1, h: 1 });
    expect(u.imageTokens(1568, 1568)).toBeLessThanOrEqual(1534);
    u.setUsageRun("t1");
    u.logUsage("ps_x", { a: 1 }, { content: [{ type: "text", text: "x".repeat(350) }, { type: "image", data: png, mimeType: "image/png" }] }, 12);
    u.logUsage("ps_y", {}, { content: [{ type: "text", text: "erro" }], isError: true }, 3);
    const recs = u.readUsage({ run: "t1" });
    expect(recs).toHaveLength(2);
    expect(recs[0].estTokensOut).toBe(100 + 1);
    const s = u.summarizeUsage(recs);
    expect(s.total.calls).toBe(2);
    expect(s.total.errors).toBe(1);
  });
});
