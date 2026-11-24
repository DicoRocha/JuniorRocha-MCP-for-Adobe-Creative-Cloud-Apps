import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

// Valid 23x23 dark blue/indigo PNG icon (base64) for UXP plugin panels
const ICON_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABcAAAAXCAYAAADgKtSgAAAAc0lEQVR4XmNkQAL+bk//I/PJARt3STPC9IEZ1DAUHYAsYSLHdcQCRlq4GgZo6nIWbF7csFMKmzBeEOD+DEMeq+EggE0xLoDLMTQNllHDsYLRYBkNFuIBzuxPTvmCDoZukcuEXOdRE9C+mkN2LTWqPOSQAAAvPBuzWXJLAgAAAABJRU5ErkJggg==";
const ICON_2X_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAC4AAAAuCAYAAABXuSs3AAAAy0lEQVR4Xu2ZQQ6CMBREreEUch9Z4lF1ifeRa0BqgqkN/vgbHTpk3raQTl+HRWk4GPTnx2SN/5vbvQ2f5lgd2DpwztoC3oLXFthawHEZrD10JM34Cs7GMziD7bwZtMYDk+0UWuMKjqbxTHgdTp7H3Vy68et3VBU0rqqkeLbVorR+qgoaGUcj42hkHI2Mo5FxNDKORsbR0BovPgGVnlx+Ba1x2uD6d4iGtiq8wa0ruVqJmXmNR6tM1pes3MZZrKfN2MeVeM7WN3LWtzcD7iQz30exutUAAAAASUVORK5CYII=";

function ensureUxpIcons(pluginDir: string): void {
  const iconsDir = path.join(pluginDir, "icons");
  fs.mkdirSync(iconsDir, { recursive: true });
  const buf1x = Buffer.from(ICON_PNG_BASE64, "base64");
  const buf2x = Buffer.from(ICON_2X_PNG_BASE64, "base64");
  const iconNames = [
    "icon.png",
    "icon@1x.png",
    "icon@2x.png",
    "dark@1x.png",
    "dark@2x.png",
    "light@1x.png",
    "light@2x.png"
  ];
  for (const name of iconNames) {
    fs.writeFileSync(path.join(iconsDir, name), name.indexOf("@2x") >= 0 ? buf2x : buf1x);
  }
}

function enablePlayerDebugModeWindows(): void {
  const csxsVersions = ["9", "10", "11", "12", "13", "14"];
  for (const v of csxsVersions) {
    try {
      execFileSync("reg", [
        "add",
        `HKCU\\Software\\Adobe\\CSXS.${v}`,
        "/v",
        "PlayerDebugMode",
        "/t",
        "REG_SZ",
        "/d",
        "1",
        "/f"
      ]);
    } catch {
      // ignore if registry write is restricted
    }
  }
}

function copyDirectoryRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function tryCopyDirectory(src: string, dest: string): boolean {
  try {
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    copyDirectoryRecursive(src, dest);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes what earlier versions installed under the old identifiers (com.adobemcp.*, AdobeUnifiedMCP), so the apps
 * do not load two copies of the bridge. Only these exact, known folders are touched; a folder that cannot be
 * removed (in use, no permission) is reported and left alone.
 */
function removeLegacyInstalls(): { removed: string[]; failed: string[] } {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const mac = process.platform !== "win32";
  const support = path.join(home, "Library", "Application Support", "Adobe");
  const cepUser = mac ? path.join(support, "CEP", "extensions") : path.join(appData, "Adobe", "CEP", "extensions");
  const uxpUser = mac ? path.join(support, "UXP", "Plugins", "External") : path.join(appData, "Adobe", "UXP", "Plugins", "External");
  const lrModules = mac ? path.join(support, "Lightroom", "Modules") : path.join(appData, "Adobe", "Lightroom", "Modules");
  const old = "com." + "adobemcp";
  const candidates = [
    path.join(cepUser, `${old}.universal`),
    path.join(uxpUser, `${old}.photoshop.uxp`),
    path.join(uxpUser, `${old}.premiere.uxp`),
    path.join(lrModules, "AdobeUnified" + "MCP.lrplugin"),
    path.join(home, ".adobe-" + "unified-mcp"),
    path.join(repoRoot, "releases")
  ];
  if (!mac) {
    candidates.push(
      `C:\\Program Files\\Common Files\\Adobe\\CEP\\extensions\\${old}.universal`,
      `C:\\Program Files (x86)\\Common Files\\Adobe\\CEP\\extensions\\${old}.universal`,
      `C:\\Program Files\\Common Files\\Adobe\\UXP\\extensions\\${old}.photoshop.uxp`,
      `C:\\Program Files\\Adobe\\Adobe Premiere Pro 2027\\UXP\\plugins\\${old}.premiere.uxp`
    );
  }
  const releaseDir = path.join(repoRoot, "release");
  if (fs.existsSync(releaseDir)) {
    for (const f of fs.readdirSync(releaseDir)) if (/^adobe-/i.test(f)) candidates.push(path.join(releaseDir, f));
  }
  const removed: string[] = [];
  const failed: string[] = [];
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    try {
      fs.rmSync(c, { recursive: true, force: true });
      removed.push(c);
    } catch {
      failed.push(c);
    }
  }
  return { removed, failed };
}

function installCepUniversalBridge(): string[] {
  const cepSource = path.join(repoRoot, "bridges", "cep-universal-bridge");
  const esSource = path.join(repoRoot, "src", "extendscript");
  const localJsxDest = path.join(cepSource, "jsx");

  // Stage a copy of src/extendscript/*.jsx inside bridges/cep-universal-bridge/jsx
  copyDirectoryRecursive(esSource, localJsxDest);
  // The Photoshop UXP panel runs the same handlers itself (hybrid mode): ship them inside the plugin.
  const uxpPsJsx = path.join(repoRoot, "bridges", "uxp-photoshop", "jsx");
  fs.mkdirSync(uxpPsJsx, { recursive: true });
  for (const f of ["es3-runtime.jsx", "ps-handlers.jsx"]) fs.copyFileSync(path.join(esSource, f), path.join(uxpPsJsx, f));
  // The InDesign UXP plugin is hybrid by design: every command runs through these handlers.
  const uxpIdJsx = path.join(repoRoot, "bridges", "uxp-indesign", "jsx");
  fs.mkdirSync(uxpIdJsx, { recursive: true });
  for (const f of ["es3-runtime.jsx", "id-handlers.jsx"]) fs.copyFileSync(path.join(esSource, f), path.join(uxpIdJsx, f));

  const installedPaths: string[] = [];
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const userCepExtensionsDir =
    process.platform === "win32"
      ? path.join(appData, "Adobe", "CEP", "extensions")
      : path.join(os.homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions");

  const userTargetDir = path.join(userCepExtensionsDir, "com.jradbmcp.universal");
  if (tryCopyDirectory(cepSource, userTargetDir)) {
    installedPaths.push(userTargetDir);
  }

  if (process.platform === "win32") {
    const systemCandidates = [
      "C:\\Program Files\\Common Files\\Adobe\\CEP\\extensions\\com.jradbmcp.universal",
      "C:\\Program Files (x86)\\Common Files\\Adobe\\CEP\\extensions\\com.jradbmcp.universal"
    ];
    for (const candidate of systemCandidates) {
      if (tryCopyDirectory(cepSource, candidate)) {
        installedPaths.push(candidate);
      }
    }
  }

  return installedPaths;
}

function installUxpPlugins(): {
  externalDirs: string[];
  systemDirs: string[];
  udtWorkspacePath: string | null;
} {
  const uxpPsDir = path.join(repoRoot, "bridges", "uxp-photoshop");
  const uxpPrDir = path.join(repoRoot, "bridges", "uxp-premiere");
  const uxpIdDir = path.join(repoRoot, "bridges", "uxp-indesign");

  ensureUxpIcons(uxpPsDir);
  ensureUxpIcons(uxpPrDir);
  ensureUxpIcons(uxpIdDir);

  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const externalDirs: string[] = [];
  const systemDirs: string[] = [];

  // 1. Install into Adobe UXP User External Fallback Folder (scanned automatically by Photoshop/Premiere upic)
  const userUxpExternalBase =
    process.platform === "win32"
      ? path.join(appData, "Adobe", "UXP", "Plugins", "External")
      : path.join(os.homedir(), "Library", "Application Support", "Adobe", "UXP", "Plugins", "External");

  const psExternalTarget = path.join(userUxpExternalBase, "com.jradbmcp.photoshop.uxp");
  const prExternalTarget = path.join(userUxpExternalBase, "com.jradbmcp.premiere.uxp");

  if (tryCopyDirectory(uxpPsDir, psExternalTarget)) {
    externalDirs.push(psExternalTarget);
  }
  if (tryCopyDirectory(uxpPrDir, prExternalTarget)) {
    externalDirs.push(prExternalTarget);
  }
  const idExternalTarget = path.join(userUxpExternalBase, "com.jradbmcp.indesign.uxp");
  if (tryCopyDirectory(uxpIdDir, idExternalTarget)) {
    externalDirs.push(idExternalTarget);
  }

  // 1b. Photoshop may load a versioned copy (<id>_<version>, left by the Creative Cloud installer) instead of the
  // plain folder: a fix shipped without a version bump never reached it (23/11/2026). Refresh those copies too.
  try {
    for (const entry of fs.readdirSync(userUxpExternalBase)) {
      const m = /^(com\.jradbmcp\.(photoshop|premiere|indesign)\.uxp)_[\d.]+$/.exec(entry);
      if (!m) continue;
      const src = m[2] === "photoshop" ? uxpPsDir : m[2] === "premiere" ? uxpPrDir : uxpIdDir;
      const target = path.join(userUxpExternalBase, entry);
      if (tryCopyDirectory(src, target)) externalDirs.push(target);
    }
  } catch {
    /* no external folder yet */
  }

  // 2. Also attempt System Common Files / Application UXP folders if writable
  if (process.platform === "win32") {
    const psSystemTarget = "C:\\Program Files\\Common Files\\Adobe\\UXP\\extensions\\com.jradbmcp.photoshop.uxp";
    if (tryCopyDirectory(uxpPsDir, psSystemTarget)) {
      systemDirs.push(psSystemTarget);
    }
    const prSystemTarget = "C:\\Program Files\\Adobe\\Adobe Premiere Pro 2027\\UXP\\plugins\\com.jradbmcp.premiere.uxp";
    if (fs.existsSync("C:\\Program Files\\Adobe\\Adobe Premiere Pro 2027\\UXP\\plugins")) {
      if (tryCopyDirectory(uxpPrDir, prSystemTarget)) {
        systemDirs.push(prSystemTarget);
      }
    }
  }

  // 3. Register in Adobe UXP Developer Tool (plugins_workspace.json)
  let udtWorkspacePath: string | null = null;
  const udtDir =
    process.platform === "win32"
      ? path.join(appData, "Adobe", "Adobe UXP Developer Tool")
      : path.join(os.homedir(), "Library", "Application Support", "Adobe", "Adobe UXP Developer Tool");

  try {
    fs.mkdirSync(udtDir, { recursive: true });
    const wsFile = path.join(udtDir, "plugins_workspace.json");
    let wsData: {
      version: number;
      plugins: Array<{
        manifestPath: string;
        pluginOptions: { breakOnStart: boolean };
        hostParam: string;
      }>;
    } = { version: 1, plugins: [] };

    if (fs.existsSync(wsFile)) {
      const parsed = JSON.parse(fs.readFileSync(wsFile, "utf-8"));
      if (parsed && Array.isArray(parsed.plugins)) {
        wsData = parsed;
      }
    }

    const entriesToEnsure = [
      {
        manifestPath: path.join(uxpPsDir, "manifest.json"),
        pluginOptions: { breakOnStart: false },
        hostParam: "PS"
      },
      {
        manifestPath: path.join(uxpPrDir, "manifest.json"),
        pluginOptions: { breakOnStart: false },
        hostParam: "PPRO"
      },
      {
        manifestPath: path.join(uxpIdDir, "manifest.json"),
        pluginOptions: { breakOnStart: false },
        hostParam: "ID"
      }
    ];

    for (const entry of entriesToEnsure) {
      const exists = wsData.plugins.some(
        (p) => path.resolve(p.manifestPath).toLowerCase() === path.resolve(entry.manifestPath).toLowerCase()
      );
      if (!exists) {
        wsData.plugins.push(entry);
      }
    }

    fs.writeFileSync(wsFile, JSON.stringify(wsData, null, 2), "utf-8");
    udtWorkspacePath = wsFile;
  } catch {
    // ignore if UDT workspace cannot be written
  }

  return { externalDirs, systemDirs, udtWorkspacePath };
}

/** Lightroom Classic loads every plug-in found in its Modules folder at start-up (no Plug-in Manager step needed). */
function installLightroomPlugin(): string | null {
  const src = path.join(repoRoot, "bridges", "lightroom-classic", "JrAdbMcpBridge.lrplugin");
  if (!fs.existsSync(src)) return null;
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const modulesDir =
    process.platform === "win32"
      ? path.join(appData, "Adobe", "Lightroom", "Modules")
      : path.join(os.homedir(), "Library", "Application Support", "Adobe", "Lightroom", "Modules");
  const dest = path.join(modulesDir, "JrAdbMcpBridge.lrplugin");
  return tryCopyDirectory(src, dest) ? dest : null;
}

function main() {
  console.log("=== Junior Rocha MCP - Direct Application Bridge Installer ===");

  if (process.platform === "win32") {
    enablePlayerDebugModeWindows();
    console.log("[OK] Enabled CSXS.9..14 PlayerDebugMode=1 in HKCU registry.");
  } else if (process.platform === "darwin") {
    // macOS (written 19/11/2026, NOT validated on a Mac yet): unsigned CEP panels load only with debug mode on.
    let done = 0;
    for (let v = 9; v <= 14; v++) {
      try {
        execFileSync("defaults", ["write", `com.adobe.CSXS.${v}`, "PlayerDebugMode", "1"], { stdio: "ignore" });
        done++;
      } catch {
        // keep going: a missing domain is created by `defaults write`
      }
    }
    try {
      execFileSync("killall", ["-u", os.userInfo().username, "cfprefsd"], { stdio: "ignore" });
    } catch {
      // preferences daemon reloads by itself later
    }
    console.log(`[OK] Enabled PlayerDebugMode=1 for ${done} CSXS versions (defaults write com.adobe.CSXS.N).`);
  }

  const legacy = removeLegacyInstalls();
  for (const p of legacy.removed) console.log(`[OK] Removed old version:\n     ${p}`);
  for (const p of legacy.failed) console.log(`[AVISO] Could not remove the old version (close the Adobe apps and run again):\n     ${p}`);

  const cepPaths = installCepUniversalBridge();
  for (const p of cepPaths) {
    console.log(`[OK] Installed Universal CEP Bridge (AE + PPro + AI + PS) at:\n     ${p}`);
  }

  const uxpResult = installUxpPlugins();
  for (const p of uxpResult.externalDirs) {
    console.log(`[OK] Installed UXP Plugin in Adobe UXP External Plugins folder:\n     ${p}`);
  }
  for (const p of uxpResult.systemDirs) {
    console.log(`[OK] Installed UXP Plugin in System UXP folder:\n     ${p}`);
  }
  if (uxpResult.udtWorkspacePath) {
    console.log(`[OK] Registered Photoshop, Premiere & InDesign UXP plugins in Adobe UXP Developer Tool:\n     ${uxpResult.udtWorkspacePath}`);
  }

  const lrPath = installLightroomPlugin();
  if (lrPath) {
    console.log(`[OK] Installed Lightroom Classic plug-in (loads automatically on the next Lightroom start):\n     ${lrPath}`);
  }

  console.log("\n=== How to Open Inside Adobe 2027 Applications ===");
  console.log("1. After Effects / Premiere Pro / Illustrator / Photoshop (CEP Panel):");
  console.log("   Menu: Window > Extensions > Junior Rocha MCP");
  console.log("2. Photoshop 2027 / Premiere Pro 2027 (Native UXP Panel):");
  console.log("   Menu: Plugins > Junior Rocha MCP (or click 'Load' in Adobe UXP Developer Tool)");
  console.log("3. InDesign: Window > Extensions > Junior Rocha MCP (or COM fallback with the panel closed)");
  console.log("4. Lightroom Classic: restart Lightroom; the bridge starts by itself.");
  console.log("   Library > Plug-in Extras > Iniciar/Status da ponte MCP (Biblioteca > Extras do plug-in)");
}

main();
