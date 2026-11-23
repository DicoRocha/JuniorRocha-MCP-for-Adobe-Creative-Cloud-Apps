import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { compareVersions, UpdateChecker, type FetchLike } from "../../src/core/update-check.js";

// vitest.config turns the check off for every other test file.
delete process.env.JRADB_MCP_UPDATE_CHECK;

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "upd-")), "update-check.json");
const gh = (tag: string, extra: Record<string, unknown> = {}): FetchLike => async () => ({ ok: true, json: async () => ({ tag_name: tag, html_url: `https://github.com/x/releases/tag/${tag}`, ...extra }) });

describe("GitHub release notice", () => {
  it("compares versions", () => {
    expect(compareVersions("v1.11.0", "1.10.9")).toBeGreaterThan(0);
    expect(compareVersions("1.10.0", "1.10.0")).toBe(0);
    expect(compareVersions("1.9.4", "1.10.0")).toBeLessThan(0);
  });

  it("reports a newer release once as an announcement, then quietly", async () => {
    const c = new UpdateChecker("1.10.0", tmp(), gh("v1.11.0"));
    await c.refresh();
    expect(c.status()).toMatchObject({ latest: "1.11.0", announce: true });
    expect(c.status()).toMatchObject({ announce: false });
    expect(c.panelNotice()).toContain("1.11.0");
  });

  it("says nothing when up to date, for prereleases, or offline", async () => {
    const a = new UpdateChecker("1.11.0", tmp(), gh("v1.11.0"));
    await a.refresh();
    expect(a.status()).toBeNull();
    const b = new UpdateChecker("1.10.0", tmp(), gh("v2.0.0", { prerelease: true }));
    await b.refresh();
    expect(b.status()).toBeNull();
    const off = new UpdateChecker("1.10.0", tmp(), async () => {
      throw new Error("ENOTFOUND");
    });
    await expect(off.refresh()).resolves.toBeUndefined();
    expect(off.status()).toBeNull();
  });

  it("asks GitHub at most once a day", async () => {
    const file = tmp();
    let calls = 0;
    const f: FetchLike = async (u, i) => (calls++, gh("v1.12.0")(u, i));
    await new UpdateChecker("1.10.0", file, f).refresh();
    const second = new UpdateChecker("1.10.0", file, f);
    await second.refresh();
    expect(calls).toBe(1);
    expect(second.status()?.latest).toBe("1.12.0");
    let t = Date.now() + 25 * 3600 * 1000;
    await new UpdateChecker("1.10.0", file, f, () => t).refresh();
    expect(calls).toBe(2);
    t++;
  });

  it("can be turned off", async () => {
    process.env.JRADB_MCP_UPDATE_CHECK = "off";
    try {
      let calls = 0;
      const c = new UpdateChecker("1.10.0", tmp(), async (u, i) => (calls++, gh("v9.0.0")(u, i)));
      await c.refresh();
      expect(calls).toBe(0);
      expect(c.status()).toBeNull();
    } finally {
      delete process.env.JRADB_MCP_UPDATE_CHECK;
    }
  });
});
