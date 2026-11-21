import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function createForwardSlashZip(sourceDir: string, outFile: string): void {
  if (fs.existsSync(outFile)) {
    fs.unlinkSync(outFile);
  }

  if (process.platform !== "win32") {
    // macOS / Linux: the system zip already writes forward slashes; -D leaves out directory entries.
    execFileSync("zip", ["-qrD", "-X", outFile, "."], { cwd: sourceDir });
    return;
  }

  // Create a ZIP with POSIX forward-slash entry paths (required by Adobe CCX/ZXP validators)
  const psScript = `
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = [System.IO.Path]::GetFullPath('${sourceDir.replace(/'/g, "''")}')
$dest = [System.IO.Path]::GetFullPath('${outFile.replace(/'/g, "''")}')
if (Test-Path $dest) { Remove-Item $dest -Force }
$zip = [System.IO.Compression.ZipFile]::Open($dest, 'Create')
try {
  Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length).TrimStart('\\', '/').Replace('\\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $zip.Dispose()
}
`;
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", psScript];
  try {
    execFileSync("pwsh", args);
  } catch (err: unknown) {
    if ((err as { code?: string }).code !== "ENOENT") {
      throw err;
    }
    // PowerShell 7 is optional; every Windows ships Windows PowerShell.
    execFileSync("powershell.exe", args);
  }
}

/** Version of each package comes from its own manifest: no number is repeated by hand here. */
function uxpVersion(dir: string): string {
  return String(JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")).version);
}

function cepVersion(dir: string): string {
  const xml = fs.readFileSync(path.join(dir, "CSXS", "manifest.xml"), "utf8");
  const m = xml.match(/ExtensionBundleVersion="([^"]+)"/);
  if (!m) throw new Error("ExtensionBundleVersion not found in the CEP manifest.");
  return m[1];
}

/**
 * Adobe's ZXPSignCmd, if the user has it. It is not shipped with this project: download it from Adobe's
 * CEP-Resources repository and either put it in tools/ (tools/ZXPSignCmd.exe on Windows, tools/ZXPSignCmd on macOS),
 * set JRADB_ZXPSIGNCMD to its full path, or have it on PATH.
 */
function findZxpSignCmd(): string | null {
  const exe = process.platform === "win32" ? "ZXPSignCmd.exe" : "ZXPSignCmd";
  const candidates = [process.env.JRADB_ZXPSIGNCMD, path.join(repoRoot, "tools", exe)].filter((p): p is string => !!p);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  try {
    const found = execFileSync(process.platform === "win32" ? "where" : "which", [exe], { encoding: "utf8" }).split(/\r?\n/)[0].trim();
    if (found && fs.existsSync(found)) return found;
  } catch {
    // not on PATH
  }
  return null;
}

/** Signs the CEP folder into a .zxp with a self-signed certificate kept in build/cert. False when it cannot. */
function signCepAsZxp(cepDir: string, outFile: string): boolean {
  const signer = findZxpSignCmd();
  if (!signer) {
    console.log("CEP: ZXPSignCmd not found (tools/, JRADB_ZXPSIGNCMD or PATH), so the package is a plain .zip. An unsigned .zxp would be refused by installers.");
    return false;
  }
  try {
    const certDir = path.join(repoRoot, "build", "cert");
    fs.mkdirSync(certDir, { recursive: true });
    const cert = path.join(certDir, "jr-mcp-selfsigned.p12");
    const pwFile = path.join(certDir, "password.txt");
    if (!fs.existsSync(cert) || !fs.existsSync(pwFile)) {
      const pw = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      fs.writeFileSync(pwFile, pw, "utf8");
      fs.rmSync(cert, { force: true });
      execFileSync(signer, ["-selfSignedCert", "BR", "SC", "Junior Rocha", "Junior Rocha MCP", pw, cert], { stdio: "pipe" });
    }
    const password = fs.readFileSync(pwFile, "utf8").trim();
    fs.rmSync(outFile, { force: true });
    try {
      execFileSync(signer, ["-sign", cepDir, outFile, cert, password, "-tsa", "http://timestamp.digicert.com"], { stdio: "pipe", timeout: 120000 });
    } catch {
      // no network or the timestamp server refused: sign without a timestamp
      fs.rmSync(outFile, { force: true });
      execFileSync(signer, ["-sign", cepDir, outFile, cert, password], { stdio: "pipe", timeout: 120000 });
    }
    execFileSync(signer, ["-verify", outFile], { stdio: "pipe", timeout: 60000 });
    console.log(`CEP: signed with a self-signed certificate -> ${path.basename(outFile)}`);
    return true;
  } catch (err) {
    console.log(`CEP: signing failed (${err instanceof Error ? err.message.split("\n")[0] : String(err)}); writing a plain .zip instead.`);
    fs.rmSync(outFile, { force: true });
    return false;
  }
}

function main() {
  // Same folder the installers are handed out from (it used to write to /releases with a fixed v1.1.0 name).
  const releasesDir = path.join(repoRoot, "release");
  fs.mkdirSync(releasesDir, { recursive: true });

  // 1. Package Photoshop UXP Plugin (.ccx)
  const uxpPsDir = path.join(repoRoot, "bridges", "uxp-photoshop");
  const psCcxPath = path.join(releasesDir, `jr-adb-mcp-bridge-photoshop-uxp-${uxpVersion(uxpPsDir)}.ccx`);
  createForwardSlashZip(uxpPsDir, psCcxPath);

  // 2. Package Premiere Pro UXP Plugin (.ccx)
  const uxpPrDir = path.join(repoRoot, "bridges", "uxp-premiere");
  const prCcxPath = path.join(releasesDir, `jr-adb-mcp-bridge-premiere-uxp-${uxpVersion(uxpPrDir)}.ccx`);
  createForwardSlashZip(uxpPrDir, prCcxPath);

  // 2b. Package InDesign UXP Plugin (.ccx)
  const uxpIdDir = path.join(repoRoot, "bridges", "uxp-indesign");
  const idCcxPath = path.join(releasesDir, `jr-adb-mcp-bridge-indesign-uxp-${uxpVersion(uxpIdDir)}.ccx`);
  createForwardSlashZip(uxpIdDir, idCcxPath);

  // 3. Universal CEP extension. A .zxp is refused by every installer unless it is signed, so a renamed .zip is
  //    never written. When Adobe's ZXPSignCmd is available (see findZxpSignCmd) the folder is signed with a
  //    self-signed certificate and the .zxp is the package; otherwise it is a plain .zip. Either way SETUP installs
  //    the panel by copying the folder (npm run install-bridges).
  const cepDir = path.join(repoRoot, "bridges", "cep-universal-bridge");
  const cepZipPath = path.join(releasesDir, `jr-adb-mcp-bridge-cep-${cepVersion(cepDir)}.zip`);
  const cepZxpPath = path.join(releasesDir, `jr-adb-mcp-bridge-cep-${cepVersion(cepDir)}.zxp`);
  const signed = signCepAsZxp(cepDir, cepZxpPath);
  const cepPackage = signed ? cepZxpPath : cepZipPath;
  if (!signed) createForwardSlashZip(cepDir, cepZipPath);

  // 4. Bridges kit: the CEP panel, the Lightroom plug-in and a double-click installer that needs no Node.js, for
  //    people who install from the release downloads instead of the source.
  const kitPath = path.join(releasesDir, `jr-adb-mcp-bridge-bridges-kit-${cepVersion(cepDir)}.zip`);
  const kitStage = path.join(repoRoot, "build", "bridges-kit");
  fs.rmSync(kitStage, { recursive: true, force: true });
  fs.mkdirSync(kitStage, { recursive: true });
  fs.cpSync(cepDir, path.join(kitStage, "com.jradbmcp.universal"), { recursive: true });
  fs.cpSync(path.join(repoRoot, "bridges", "lightroom-classic", "JrAdbMcpBridge.lrplugin"), path.join(kitStage, "JrAdbMcpBridge.lrplugin"), { recursive: true });
  for (const f of ["INSTALL-BRIDGES.bat", "INSTALL-BRIDGES.command", "README.txt"]) {
    fs.copyFileSync(path.join(repoRoot, "scripts", "standalone", f), path.join(kitStage, f));
  }
  try {
    fs.chmodSync(path.join(kitStage, "INSTALL-BRIDGES.command"), 0o755);
  } catch {
    // Windows: no execute bit; the README says to run chmod on macOS
  }
  createForwardSlashZip(kitStage, kitPath);

  // Leftovers: packages of other versions, anything under the old name, and a .zxp that was not signed in this run.
  const keep = new Set([psCcxPath, prCcxPath, idCcxPath, cepPackage, kitPath].map((p) => path.basename(p)));
  for (const f of fs.readdirSync(releasesDir)) {
    const stale =
      /^adobe-/i.test(f) ||
      (/\.zxp$/i.test(f) && !keep.has(f)) ||
      (/^jr-adb-mcp-bridge-(photoshop-uxp|premiere-uxp|indesign-uxp|cep|bridges-kit)-/.test(f) && !keep.has(f));
    // recursive: on macOS a double-clicked .zip is extracted next to itself (Archive Utility), leaving a folder here.
    if (stale) fs.rmSync(path.join(releasesDir, f), { force: true, recursive: true });
  }

  console.log("=== Packaged Installable Plugins in /release ===");
  for (const f of fs.readdirSync(releasesDir)) {
    const full = path.join(releasesDir, f);
    const stat = fs.statSync(full);
    console.log(`- ${f} (${stat.size} bytes) -> ${full}`);
  }
}

main();
