import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { aerenderPath, buildAerenderArgs, chooseRenderEngine, runAerender } from "../../src/media/aerender.js";

describe("aerender", () => {
  it("finds aerender next to AfterFX on Windows and beside the .app on macOS", () => {
    expect(aerenderPath("C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files", "win32")).toBe(
      path.win32.join("C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files", "aerender.exe")
    );
    expect(aerenderPath("/Applications/Adobe After Effects 2026/Adobe After Effects 2026.app", "darwin")).toBe(
      "/Applications/Adobe After Effects 2026/aerender"
    );
  });

  it("builds the command line (templates only when given)", () => {
    expect(buildAerenderArgs({ projectPath: "D:/p/a.aep", compName: "Main", outputPath: "D:/o/a.mp4" })).toEqual([
      "-project", "D:/p/a.aep", "-comp", "Main", "-output", "D:/o/a.mp4", "-sound", "ON"
    ]);
    const a = buildAerenderArgs({ projectPath: "a.aep", compName: "C", outputPath: "o.mov", renderSettingsTemplate: "Best Settings", outputModuleTemplate: "High Quality" });
    expect(a).toContain("-RStemplate");
    expect(a[a.indexOf("-OMtemplate") + 1]).toBe("High Quality");
  });

  it("renders outside the app only when it can: saved, clean project, aerender present, no AME", () => {
    const ok = { engine: "auto" as const, wantsRun: true, queueInAME: false, projectPath: "a.aep", dirty: false, aerenderExists: true };
    expect(chooseRenderEngine(ok).engine).toBe("aerender");
    expect(chooseRenderEngine({ ...ok, dirty: true }).engine).toBe("app");
    expect(chooseRenderEngine({ ...ok, dirty: true }).reason).toMatch(/unsaved/);
    expect(chooseRenderEngine({ ...ok, projectPath: null }).engine).toBe("app");
    expect(chooseRenderEngine({ ...ok, aerenderExists: false }).engine).toBe("app");
    expect(chooseRenderEngine({ ...ok, queueInAME: true }).engine).toBe("app");
    expect(chooseRenderEngine({ ...ok, wantsRun: false }).engine).toBe("app");
    expect(chooseRenderEngine({ ...ok, engine: "app" }).engine).toBe("app");
    expect(() => chooseRenderEngine({ ...ok, engine: "aerender", dirty: true })).toThrow(/unsaved/);
  });

  it("runs the process, keeps a log and reports the file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aer-"));
    const out = path.join(dir, "out.mp4");
    const script = `require("fs").writeFileSync(${JSON.stringify(out)}, "x".repeat(2048)); console.log("PROGRESS: done");`;
    const r = await runAerender({ exe: process.execPath, args: ["-e", script], outputPath: out, logPath: path.join(dir, "log.txt") });
    expect(r.bytes).toBe(2048);
    expect(fs.readFileSync(path.join(dir, "log.txt"), "utf8")).toContain("PROGRESS: done");
  });

  it("fails with the end of the log when aerender exits with an error", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aer-"));
    await expect(
      runAerender({ exe: process.execPath, args: ["-e", `console.log("aerender ERROR: No comp was found with the given name."); process.exit(1)`], outputPath: path.join(dir, "x.mp4"), logPath: path.join(dir, "l.txt") })
    ).rejects.toThrow(/No comp was found/);
  });
});
