import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AdobeAppId, ALL_ADOBE_APPS } from "./types.js";

const execFileAsync = promisify(execFile);

export interface InstalledAdobeApp {
  app: AdobeAppId;
  installed: boolean;
  executablePath: string | null;
  versionDir: string | null;
  /** null when the process list was not checked. */
  running: boolean | null;
}

const WINDOWS_APP_PATTERNS: Record<AdobeAppId, { folderPrefix: string; exeRelative: string[]; processNames: string[] }> = {
  photoshop: {
    folderPrefix: "Adobe Photoshop",
    exeRelative: ["Photoshop.exe"],
    processNames: ["Photoshop.exe"]
  },
  "after-effects": {
    folderPrefix: "Adobe After Effects",
    exeRelative: [path.join("Support Files", "AfterFX.exe"), "AfterFX.exe"],
    processNames: ["AfterFX.exe"]
  },
  premiere: {
    folderPrefix: "Adobe Premiere Pro",
    exeRelative: ["Adobe Premiere Pro.exe"],
    processNames: ["Adobe Premiere Pro.exe"]
  },
  illustrator: {
    folderPrefix: "Adobe Illustrator",
    exeRelative: [path.join("Support Files", "Contents", "Windows", "Illustrator.exe"), "Illustrator.exe"],
    processNames: ["Illustrator.exe"]
  },
  indesign: {
    folderPrefix: "Adobe InDesign",
    exeRelative: ["InDesign.exe"],
    processNames: ["InDesign.exe"]
  },
  lightroom: {
    folderPrefix: "Adobe Lightroom Classic",
    exeRelative: ["Lightroom.exe"],
    processNames: ["Lightroom.exe"]
  }
};

/**
 * macOS (written 19/11/2026, NOT validated on a Mac yet): each app lives in /Applications/<folder>/<name>.app
 * and its process path contains "<name>.app/Contents/MacOS/". `executablePath` is the .app bundle (launched with
 * `open -a`). Bundle ids are what AppleScript addresses (`tell application id ...`).
 */
export const MAC_APP_PATTERNS: Record<AdobeAppId, { folderPrefix: string; appPrefix: string; bundleId: string }> = {
  photoshop: { folderPrefix: "Adobe Photoshop", appPrefix: "Adobe Photoshop", bundleId: "com.adobe.Photoshop" },
  "after-effects": { folderPrefix: "Adobe After Effects", appPrefix: "Adobe After Effects", bundleId: "com.adobe.AfterEffects.application" },
  premiere: { folderPrefix: "Adobe Premiere Pro", appPrefix: "Adobe Premiere Pro", bundleId: "com.adobe.PremierePro" },
  illustrator: { folderPrefix: "Adobe Illustrator", appPrefix: "Adobe Illustrator", bundleId: "com.adobe.illustrator" },
  indesign: { folderPrefix: "Adobe InDesign", appPrefix: "Adobe InDesign", bundleId: "com.adobe.InDesign" },
  lightroom: { folderPrefix: "Adobe Lightroom Classic", appPrefix: "Adobe Lightroom Classic", bundleId: "com.adobe.LightroomClassicCC7" }
};

/** Pure part of the macOS detection, so it can be unit-tested without a Mac. */
export function detectMacApps(
  applicationsEntries: string[],
  listDir: (dir: string) => string[],
  runningCommands: string[] | null,
  applicationsDir: string = "/Applications"
): InstalledAdobeApp[] {
  const results: InstalledAdobeApp[] = [];
  for (const appId of ALL_ADOBE_APPS) {
    const spec = MAC_APP_PATTERNS[appId];
    const dirs = applicationsEntries
      .filter((d) => d.toLowerCase().startsWith(spec.folderPrefix.toLowerCase()) && !/\.app$/i.test(d))
      .sort()
      .reverse();
    let bundle: string | null = null;
    let versionDir: string | null = null;
    for (const d of dirs) {
      const full = `${applicationsDir}/${d}`;
      const app = listDir(full).find((e) => /\.app$/i.test(e) && e.toLowerCase().startsWith(spec.appPrefix.toLowerCase()));
      if (app) {
        bundle = `${full}/${app}`;
        versionDir = full;
        break;
      }
    }
    if (!bundle) {
      // Some installs put the bundle straight in /Applications.
      const direct = applicationsEntries
        .filter((e) => /\.app$/i.test(e) && e.toLowerCase().startsWith(spec.appPrefix.toLowerCase()))
        .sort()
        .reverse()[0];
      if (direct) {
        bundle = `${applicationsDir}/${direct}`;
        versionDir = applicationsDir;
      }
    }
    const marker = `/${spec.appPrefix.toLowerCase()}`;
    const running = runningCommands
      ? runningCommands.some((c) => {
          const lc = c.toLowerCase();
          const i = lc.indexOf(marker);
          return i >= 0 && lc.indexOf(".app/contents/macos/", i) >= 0;
        })
      : null;
    results.push({ app: appId, installed: bundle !== null, executablePath: bundle, versionDir, running });
  }
  return results;
}

async function getMacRunningCommands(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("ps", ["-A", "-o", "comm="], { timeout: 4000, maxBuffer: 8 * 1024 * 1024 });
    return stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function detectInstalledAdobeApps(checkRunning: boolean = true): Promise<InstalledAdobeApp[]> {
  if (process.platform === "darwin") {
    const safeList = (dir: string): string[] => {
      try {
        return fs.readdirSync(dir);
      } catch {
        return [];
      }
    };
    return detectMacApps(safeList("/Applications"), safeList, checkRunning ? await getMacRunningCommands() : null);
  }
  const isWin = process.platform === "win32";
  const runningList = checkRunning ? await getRunningProcessNames() : new Set<string>();

  const results: InstalledAdobeApp[] = [];
  const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
  const adobeBaseDir = isWin ? path.join(programFiles, "Adobe") : "/Applications";

  let dirEntries: string[] = [];
  if (fs.existsSync(adobeBaseDir)) {
    try {
      dirEntries = fs.readdirSync(adobeBaseDir);
    } catch {
      dirEntries = [];
    }
  }

  for (const appId of ALL_ADOBE_APPS) {
    const spec = WINDOWS_APP_PATTERNS[appId];
    const matchingDirs = dirEntries
      .filter((d) => d.toLowerCase().startsWith(spec.folderPrefix.toLowerCase()))
      .sort()
      .reverse(); // Prefer newest year (e.g. 2026 > 2025 > 2024)

    let foundExe: string | null = null;
    let foundDir: string | null = null;

    for (const dirName of matchingDirs) {
      const fullDir = path.join(adobeBaseDir, dirName);
      for (const rel of spec.exeRelative) {
        const candidate = path.join(fullDir, rel);
        if (fs.existsSync(candidate)) {
          foundExe = candidate;
          foundDir = fullDir;
          break;
        }
      }
      if (foundExe) break;
    }

    const isRunning = spec.processNames.some((p) => runningList.has(p.toLowerCase()));

    results.push({
      app: appId,
      installed: foundExe !== null,
      executablePath: foundExe,
      versionDir: foundDir,
      running: checkRunning ? isRunning : null
    });
  }

  return results;
}

async function getRunningProcessNames(): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("tasklist", ["/FO", "CSV", "/NH"], { timeout: 4000 });
      for (const line of stdout.split(/\r?\n/)) {
        const match = line.match(/^"([^"]+)"/);
        if (match) {
          set.add(match[1].toLowerCase());
        }
      }
    } else {
      const { stdout } = await execFileAsync("ps", ["-A", "-o", "comm="], { timeout: 4000 });
      for (const line of stdout.split(/\r?\n/)) {
        const base = path.basename(line.trim()).toLowerCase();
        if (base) set.add(base);
      }
    }
  } catch {
    // ignore process listing errors in restricted environments
  }
  return set;
}
