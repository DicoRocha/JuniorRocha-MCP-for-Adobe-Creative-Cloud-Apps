import { describe, expect, it } from "vitest";
import { detectMacApps, MAC_APP_PATTERNS } from "../../src/core/adobe-detector.js";
import { buildMacAppleScript, MAC_SCRIPT_VERB } from "../../src/core/com-runner.js";

/** macOS support was written without a Mac (19/11/2026): these tests only pin the logic, not the real behaviour. */
describe("macOS support (logic only)", () => {
  const tree: Record<string, string[]> = {
    "/Applications": ["Adobe Photoshop 2026", "Adobe Photoshop 2027", "Adobe Illustrator 2027", "Adobe Lightroom Classic", "Safari.app", "Adobe Premiere Pro 2027.app"],
    "/Applications/Adobe Photoshop 2026": ["Adobe Photoshop 2026.app"],
    "/Applications/Adobe Photoshop 2027": ["Adobe Photoshop 2027.app", "Plug-ins"],
    "/Applications/Adobe Illustrator 2027": ["Adobe Illustrator.app"],
    "/Applications/Adobe Lightroom Classic": ["Adobe Lightroom Classic.app"]
  };
  const list = (d: string) => tree[d] ?? [];

  it("finds the newest .app bundle of each installed app", () => {
    const apps = detectMacApps(tree["/Applications"], list, null);
    const by = Object.fromEntries(apps.map((a) => [a.app, a]));
    expect(by.photoshop.executablePath).toBe("/Applications/Adobe Photoshop 2027/Adobe Photoshop 2027.app");
    expect(by.illustrator.executablePath).toBe("/Applications/Adobe Illustrator 2027/Adobe Illustrator.app");
    expect(by.lightroom.installed).toBe(true);
    expect(by.premiere.executablePath).toBe("/Applications/Adobe Premiere Pro 2027.app");
    expect(by["after-effects"].installed).toBe(false);
    expect(by.photoshop.running).toBeNull();
  });

  it("tells which apps are running from the process paths", () => {
    const running = [
      "/Applications/Adobe Photoshop 2027/Adobe Photoshop 2027.app/Contents/MacOS/Adobe Photoshop 2027",
      "/System/Applications/Safari.app/Contents/MacOS/Safari"
    ];
    const by = Object.fromEntries(detectMacApps(tree["/Applications"], list, running).map((a) => [a.app, a]));
    expect(by.photoshop.running).toBe(true);
    expect(by.illustrator.running).toBe(false);
  });

  it("builds an AppleScript per app that reads the script from a file", () => {
    for (const app of ["photoshop", "illustrator", "indesign", "after-effects"] as const) {
      const lines = buildMacAppleScript(app, '/tmp/a "b"/cmd.jsx', 30);
      expect(lines[0]).toContain('POSIX file "/tmp/a \\"b\\"/cmd.jsx"');
      expect(lines.join("\n")).toContain(`application id "${MAC_APP_PATTERNS[app].bundleId}"`);
      expect(lines.join("\n")).toContain(MAC_SCRIPT_VERB[app] as string);
      expect(lines.join("\n")).toContain("with timeout of 30 seconds");
    }
    expect(() => buildMacAppleScript("premiere", "/tmp/x.jsx", 10)).toThrow();
    const byPath = buildMacAppleScript("after-effects", "/tmp/x.jsx", 10, '/Applications/Adobe After Effects 2027/A "q".app').join("\n");
    expect(byPath).toContain('tell application "/Applications/Adobe After Effects 2027/A \\"q\\".app" to set res to DoScript js');
  });
});
