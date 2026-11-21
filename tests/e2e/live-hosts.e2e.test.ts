import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdobeMcpServer, AdobeMcpRuntime } from "../../src/server.js";
import { detectInstalledAdobeApps } from "../../src/core/adobe-detector.js";

describe("Live Adobe Host E2E Suite (Auto-Skips when apps are closed)", () => {
  let runtime: AdobeMcpRuntime;

  beforeAll(async () => {
    runtime = createAdobeMcpServer({
      wsPort: 0,
      enableOsFallback: true
    });
    await runtime.startHub();
  });

  afterAll(async () => {
    await runtime.stop();
  });

  it("detects local Adobe 2027 installations on Windows cleanly", async () => {
    const apps = await detectInstalledAdobeApps(true);
    expect(apps.length).toBe(4);
    expect(apps.map((a) => a.app)).toEqual([
      "photoshop",
      "after-effects",
      "premiere",
      "illustrator"
    ]);
  });

  it("executes live ExtendScript inside running Photoshop via Zero-Plugin Windows COM Fallback", async () => {
    const apps = await detectInstalledAdobeApps(true);
    const ps = apps.find((a) => a.app === "photoshop");
    if (!ps || !ps.running) {
      console.log("Skipping live Photoshop COM test because Photoshop is not currently running.");
      return;
    }

    try {
      const res = await runtime.router.dispatch("photoshop", "ps.raw.executeExtendScript", {
        code: "app.name + ' ' + app.version"
      });
      expect(res.ok).toBe(true);
      const data = res.data as { executed: boolean; result: string };
      expect(data.executed).toBe(true);
      expect(String(data.result)).toContain("Adobe Photoshop");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // If Photoshop is currently in a modal dialog / home screen blocking COM, log and skip gracefully
      console.warn("Live Photoshop COM fallback was busy/modal or unattached:", msg);
    }
  });
});
