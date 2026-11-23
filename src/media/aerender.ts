/**
 * Renders an After Effects comp with aerender, a separate After Effects process without UI, so the open app stays
 * free while the video is written. Rendering inside the app blocks it for the whole render: on 22/11/2026 a 2.5 min
 * render made the app look frozen, one froze for real and had to be restarted.
 *
 * aerender reads the project from disk, so it only renders what is saved: the tool uses it only for a saved,
 * clean project and never saves the user's project for them.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";

export type RenderEngine = "auto" | "app" | "aerender";

/** aerender sits next to AfterFX.exe in "Support Files" on Windows, and beside the .app bundle on macOS. */
export function aerenderPath(appPackage: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") return path.win32.join(appPackage, "aerender.exe");
  return path.posix.join(path.posix.dirname(appPackage.replace(/\/+$/, "")), "aerender");
}

export function buildAerenderArgs(o: {
  projectPath: string;
  compName: string;
  outputPath: string;
  renderSettingsTemplate?: string;
  outputModuleTemplate?: string;
}): string[] {
  const args = ["-project", o.projectPath, "-comp", o.compName, "-output", o.outputPath];
  if (o.renderSettingsTemplate) args.push("-RStemplate", o.renderSettingsTemplate);
  if (o.outputModuleTemplate) args.push("-OMtemplate", o.outputModuleTemplate);
  args.push("-sound", "ON");
  return args;
}

export function chooseRenderEngine(o: {
  engine: RenderEngine;
  wantsRun: boolean;
  queueInAME: boolean;
  projectPath: string | null;
  dirty: boolean;
  aerenderExists: boolean;
}): { engine: "app" | "aerender"; reason?: string } {
  if (o.engine === "app") return { engine: "app" };
  const why = !o.wantsRun
    ? "nothing to render yet (startRenderImmediately is false)"
    : o.queueInAME
      ? "queueInAME asks for Media Encoder"
      : !o.projectPath
        ? "the project was never saved"
        : o.dirty
          ? "the project has unsaved changes (aerender renders the saved file; save it first)"
          : !o.aerenderExists
            ? "aerender was not found next to After Effects"
            : null;
  if (!why) return { engine: "aerender" };
  if (o.engine === "aerender") throw Object.assign(new Error(`Cannot render with aerender: ${why}.`), { code: "AERENDER_UNAVAILABLE" });
  return { engine: "app", reason: why };
}

export interface AerenderResult {
  outputPath: string;
  bytes: number;
  mb: number;
  seconds: number;
  logPath: string;
}

/** Runs aerender to the end. stdout/stderr go to logPath; a failure carries the last lines of the log. */
export function runAerender(o: { exe: string; args: string[]; outputPath: string; logPath: string }): Promise<AerenderResult> {
  const t0 = Date.now();
  fs.mkdirSync(path.dirname(o.logPath), { recursive: true });
  const log = fs.createWriteStream(o.logPath, { flags: "w" });
  return new Promise((resolve, reject) => {
    const child = spawn(o.exe, o.args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on("error", (err) => {
      log.end();
      reject(Object.assign(new Error(`aerender did not start: ${err.message}`), { code: "AERENDER_FAILED" }));
    });
    child.on("close", (code) => {
      log.end(() => {
        const tail = readTail(o.logPath, 1500);
        let bytes = -1;
        try {
          bytes = fs.statSync(o.outputPath).size;
        } catch {
          bytes = -1;
        }
        if (code !== 0 || bytes <= 0 || /aerender ERROR/i.test(tail)) {
          reject(Object.assign(new Error(`aerender ended with code ${code}${bytes <= 0 ? " and no output file" : ""}. Log end:\n${tail}`), { code: "AERENDER_FAILED" }));
          return;
        }
        resolve({ outputPath: o.outputPath, bytes, mb: Math.round((bytes / 1048576) * 10) / 10, seconds: Math.round((Date.now() - t0) / 1000), logPath: o.logPath });
      });
    });
  });
}

function readTail(file: string, chars: number): string {
  try {
    const s = fs.readFileSync(file, "utf8");
    return s.slice(-chars).trim();
  } catch {
    return "";
  }
}
