import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  AdobeAppId,
  AdobeBridgeError,
  BridgeCommandPacket,
  BridgeResponsePacket
} from "./types.js";
import { detectInstalledAdobeApps, MAC_APP_PATTERNS } from "./adobe-detector.js";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getExtendScriptDir(): string {
  // Works both in src/core and dist/core
  const srcCandidate = path.resolve(__dirname, "..", "extendscript");
  if (fs.existsSync(srcCandidate)) {
    return srcCandidate;
  }
  return path.resolve(__dirname, "..", "..", "src", "extendscript");
}

export function loadExtendScriptBundle(app: AdobeAppId): string {
  const esDir = getExtendScriptDir();
  const runtimePath = path.join(esDir, "es3-runtime.jsx");
  const runtimeCode = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, "utf8") : "";

  const handlerFileMap: Record<AdobeAppId, string> = {
    photoshop: "ps-handlers.jsx",
    "after-effects": "ae-handlers.jsx",
    premiere: "pr-handlers.jsx",
    illustrator: "ai-handlers.jsx",
    indesign: "id-handlers.jsx",
    lightroom: ""
  };

  const handlerPath = path.join(esDir, handlerFileMap[app]);
  const handlerCode = fs.existsSync(handlerPath) ? fs.readFileSync(handlerPath, "utf8") : "";

  return `${runtimeCode}\n${handlerCode}\n`;
}

/**
 * Builds a complete self-contained ES3 script that invokes __mcpDispatch(action, params, options)
 * and returns a JSON string envelope.
 */
function buildDispatchCallExpression(packet: BridgeCommandPacket): string {
  const actionJson = JSON.stringify(packet.action);
  const paramsJson = JSON.stringify(packet.params || {});
  const optionsJson = JSON.stringify(packet.options || {});
  const appJson = JSON.stringify(packet.app);
  const undoJson = JSON.stringify(packet.options?.undoGroup || `MCP: ${packet.action}`);

  return `(function() {
  return __mcpExecuteWithUndo(${appJson}, ${undoJson}, function() {
    if (typeof __mcpDispatch !== "function") {
      throw new Error("ExtendScript handler __mcpDispatch is not defined for " + ${appJson});
    }
    return __mcpDispatch(${actionJson}, ${paramsJson}, ${optionsJson});
  });
})()`;
}

export function buildExtendScriptDispatchPayload(packet: BridgeCommandPacket): string {
  const bundle = loadExtendScriptBundle(packet.app);
  return `${bundle}\n${buildDispatchCallExpression(packet)};`.trim();
}

/**
 * Script for `AfterFX.exe -r`: that entry point returns nothing to the caller, so the JSON envelope
 * is written to `outFilePath`. The runtime bundle is a list of statements, so it must come BEFORE the
 * assignment (it cannot be the right-hand side of `var x = ...`).
 */
export function buildAfterEffectsCliScript(packet: BridgeCommandPacket, outFilePath: string): string {
  const bundle = loadExtendScriptBundle(packet.app);
  return `
${bundle}
var __mcpOut = ${buildDispatchCallExpression(packet)};
var __mcpOutFile = new File(${JSON.stringify(outFilePath.replace(/\\/g, "/"))});
__mcpOutFile.encoding = "UTF-8";
if (__mcpOutFile.open("w")) {
  __mcpOutFile.write(String(__mcpOut));
  __mcpOutFile.close();
}
`.trim();
}

type ExecFileLike = (
  file: string,
  args: string[],
  options: { timeout?: number; maxBuffer?: number }
) => Promise<{ stdout: string; stderr: string }>;

/**
 * Runs a PowerShell script, preferring PowerShell 7 (`pwsh`) and falling back to the Windows PowerShell
 * that ships with every Windows install (`powershell.exe`) when pwsh is not on PATH.
 */
export async function runPowerShell(
  script: string,
  options: { timeout?: number; maxBuffer?: number },
  exec: ExecFileLike = execFileAsync as unknown as ExecFileLike
): Promise<string> {
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script];
  try {
    const { stdout } = await exec("pwsh", args, options);
    return stdout;
  } catch (err: unknown) {
    if ((err as { code?: string }).code !== "ENOENT") {
      throw err;
    }
  }
  const { stdout } = await exec("powershell.exe", args, options);
  return stdout;
}

/**
 * B41 (18/11/2026): with the panel disconnected a long script (40-60 s) ran to the end through COM but
 * its answer was lost, and the bare "COM fallback failed" invited a repeat that duplicated the work.
 * A killed / timed-out PowerShell is now told apart from a real COM failure.
 */
export function classifyComError(err: unknown, timeoutMs: number): { code: string; timedOut: boolean; message: string } {
  const e = (err || {}) as { killed?: boolean; signal?: string | null; code?: string | number; message?: string };
  const message = err instanceof Error ? err.message : String(err);
  const timedOut =
    e.killed === true || e.signal === "SIGTERM" || e.code === "ETIMEDOUT" || (timeoutMs > 0 && /timed? ?out|ETIMEDOUT/i.test(message));
  return { code: timedOut ? "COM_TIMEOUT_PANEL_DISCONNECTED" : "COM_EXECUTION_FAILED", timedOut, message };
}

/**
 * Executes an ExtendScript command directly via Windows COM (Photoshop.Application or Illustrator.Application)
 * or macOS osascript, or AfterFX.exe -r file bridge when no WebSocket plugin is connected.
 */
export async function executeDirectOsFallback(
  packet: BridgeCommandPacket,
  timeoutMs: number = 25000
): Promise<BridgeResponsePacket> {
  const start = Date.now();

  if (process.platform === "win32" && (packet.app === "photoshop" || packet.app === "illustrator" || packet.app === "indesign")) {
    return executeWindowsComDoJavaScript(packet, buildExtendScriptDispatchPayload(packet), timeoutMs, start);
  }

  if (process.platform === "darwin" && MAC_SCRIPT_VERB[packet.app]) {
    return executeMacAppleScript(packet, buildExtendScriptDispatchPayload(packet), timeoutMs, start);
  }

  if (packet.app === "after-effects") {
    return executeAfterEffectsCliBridge(packet, timeoutMs, start);
  }

  if (packet.app === "lightroom") {
    throw new AdobeBridgeError(
      packet.app,
      "BRIDGE_NOT_CONNECTED",
      "Lightroom Classic is not connected. Open Lightroom Classic with the 'Junior Rocha MCP' plug-in enabled " +
        "(File > Plug-in Manager); it connects by itself, or use Library > Plug-in Extras > Iniciar ponte MCP."
    );
  }

  throw new AdobeBridgeError(
    packet.app,
    "NO_FALLBACK_AVAILABLE",
    `No active WebSocket bridge (UXP/CEP) is connected for ${packet.app}, and direct OS fallback is not supported for this host.`
  );
}

/**
 * macOS (written 19/11/2026, NOT validated on a Mac yet): the same ExtendScript payload goes through AppleScript.
 * Each app has its own verb; the script is read from a temp file so quoting never breaks it.
 */
export const MAC_SCRIPT_VERB: Partial<Record<AdobeAppId, string>> = {
  photoshop: "do javascript js",
  illustrator: "do javascript js",
  indesign: "do script js language javascript",
  "after-effects": "DoScript js"
};

export function buildMacAppleScript(app: AdobeAppId, jsxFile: string, timeoutSeconds: number, appBundlePath?: string | null): string[] {
  const verb = MAC_SCRIPT_VERB[app];
  if (!verb) throw new Error(`No AppleScript route for ${app}.`);
  const quote = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const posix = quote(jsxFile);
  // Validated on macOS 27.2 (20/11/2026): bundle ids change between apps and versions (After Effects 2027 is
  // com.adobe.AfterEffects.application, Premiere 2027 com.adobe.PremierePro.27), so the detected .app path is
  // the target when known; the bundle id stays as the fallback.
  const target = appBundlePath ? `application "${quote(appBundlePath)}"` : `application id "${MAC_APP_PATTERNS[app].bundleId}"`;
  return [
    `set js to read (POSIX file "${posix}") as «class utf8»`,
    `with timeout of ${Math.max(5, Math.round(timeoutSeconds))} seconds`,
    `tell ${target} to set res to ${verb}`,
    "end timeout",
    "return res"
  ];
}

async function executeMacAppleScript(
  packet: BridgeCommandPacket,
  jsxCode: string,
  timeoutMs: number,
  startMs: number
): Promise<BridgeResponsePacket> {
  const detected = await detectInstalledAdobeApps(true);
  const info = detected.find((a) => a.app === packet.app);
  if (info && info.running === false) {
    // AppleScript would launch the app and wait for it: refuse instead, like the Windows After Effects route.
    throw new AdobeBridgeError(packet.app, "APP_NOT_RUNNING", `${packet.app} is not running. Open it (jradb_launch_app) and try again.`);
  }
  const tempDir = path.join(os.tmpdir(), "jr-adb-mcp-bridge");
  fs.mkdirSync(tempDir, { recursive: true });
  const jsxFile = path.join(tempDir, `cmd_${packet.id}.jsx`);
  // Validated 20/11/2026 (macOS 27.2, After Effects 27.0): AE's AppleScript `DoScript` runs the script but always
  // returns "0", so the answer goes through a file, exactly like the Windows `AfterFX.exe -r` route.
  const aeOutFile = packet.app === "after-effects" ? path.join(tempDir, `ae_out_${packet.id}.json`) : null;
  fs.writeFileSync(jsxFile, aeOutFile ? buildAfterEffectsCliScript(packet, aeOutFile) : jsxCode, "utf8");
  const lines = buildMacAppleScript(packet.app, jsxFile, timeoutMs / 1000, info ? info.executablePath : null);
  const args: string[] = [];
  for (const l of lines) args.push("-e", l);
  try {
    const { stdout } = await execFileAsync("osascript", args, { timeout: timeoutMs + 2000, maxBuffer: 25 * 1024 * 1024 });
    if (aeOutFile) {
      const raw = fs.existsSync(aeOutFile) ? fs.readFileSync(aeOutFile, "utf8").trim() : "";
      try {
        fs.unlinkSync(aeOutFile);
      } catch {
        // ignore cleanup error
      }
      if (!raw) {
        throw new Error(
          "After Effects ran the script but wrote no result. Enable Settings > Scripting & Expressions > " +
            "'Allow Scripts to Write Files and Access Network', and dismiss any open dialog."
        );
      }
      return parseExtendScriptOutput(packet, "com", raw, Date.now() - startMs);
    }
    return parseExtendScriptOutput(packet, "com", String(stdout).trim(), Date.now() - startMs);
  } catch (err: unknown) {
    const c = classifyComError(err, timeoutMs);
    throw new AdobeBridgeError(
      packet.app,
      c.code,
      c.timedOut
        ? `The ${packet.app} panel is not connected, so '${packet.action}' ran through AppleScript and did not answer within ` +
          `${Math.round(timeoutMs / 1000)} s. The script may still be running or may have finished: its answer is lost. ` +
          `Do NOT repeat the command; read the document state first, then reconnect the panel.`
        : `AppleScript fallback failed: ${c.message}. On macOS allow the automation prompt ` +
          `(System Settings > Privacy & Security > Automation) for the app that runs this server.`
    );
  } finally {
    try {
      if (fs.existsSync(jsxFile)) fs.unlinkSync(jsxFile);
    } catch {
      // ignore cleanup error
    }
  }
}

async function executeWindowsComDoJavaScript(
  packet: BridgeCommandPacket,
  jsxCode: string,
  timeoutMs: number,
  startMs: number
): Promise<BridgeResponsePacket> {
  const tempDir = path.join(os.tmpdir(), "jr-adb-mcp-bridge");
  fs.mkdirSync(tempDir, { recursive: true });
  const jsxFile = path.join(tempDir, `cmd_${packet.id}.jsx`);
  fs.writeFileSync(jsxFile, jsxCode, "utf8");

  const progIdPrefix =
    packet.app === "photoshop" ? "Photoshop.Application" : packet.app === "indesign" ? "InDesign.Application" : "Illustrator.Application";
  // InDesign runs JavaScript through DoScript(code, ScriptLanguage.JAVASCRIPT = 1246973031).
  const invokeLine =
    packet.app === "indesign"
      ? `$res = [System.__ComObject].InvokeMember("DoScript", [System.Reflection.BindingFlags]::InvokeMethod, $null, $app, @($code, 1246973031))`
      : `$res = [System.__ComObject].InvokeMember("DoJavaScript", [System.Reflection.BindingFlags]::InvokeMethod, $null, $app, @($code))`;
  const psScript = `
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$prefix = "${progIdPrefix}"
$candidates = New-Object System.Collections.Generic.List[string]
$regLines = & reg.exe query HKCR /f "$prefix" /k 2>$null
foreach ($line in $regLines) {
  if ($line -match "^HKEY_CLASSES_ROOT\\\\(.+)$") {
    $prog = $Matches[1].Trim()
    if ($prog -ne $prefix) {
      $candidates.Add($prog)
    }
  }
}
$sorted = $candidates | Sort-Object -Descending
# The plain ProgID points at the installed version; numbered ProgIDs can belong to older or partial
# registrations whose object has no DoJavaScript. Try the plain one first, then the others, and call
# DoJavaScript through IDispatch (InvokeMember) because pwsh's late binding can miss the method.
$allProgIds = @($prefix) + @($sorted)
$code = [System.IO.File]::ReadAllText('${jsxFile.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8)
$errors = New-Object System.Collections.Generic.List[string]
$res = $null
$done = $false
foreach ($progId in $allProgIds) {
  try {
    $app = New-Object -ComObject $progId
    if ($null -eq $app) { continue }
    ${invokeLine}
    $done = $true
    break
  } catch {
    $errors.Add("$($progId): $($_.Exception.Message)")
  }
}
if (-not $done) {
  throw "Script execution failed on every COM ProgID matching $prefix. $($errors -join ' | ')"
}
Write-Output $res
`.trim();

  try {
    const stdout = await runPowerShell(psScript, { timeout: timeoutMs, maxBuffer: 25 * 1024 * 1024 });

    return parseExtendScriptOutput(packet, "com", stdout.trim(), Date.now() - startMs);
  } catch (err: unknown) {
    const c = classifyComError(err, timeoutMs);
    throw new AdobeBridgeError(
      packet.app,
      c.code,
      c.timedOut
        ? `The ${packet.app} panel is not connected, so '${packet.action}' ran through Windows COM (${progIdPrefix}) and did not answer within ` +
          `${Math.round(timeoutMs / 1000)} s. The script may still be running or may have finished: its answer is lost. ` +
          `Do NOT repeat the command; read the document state first, then reconnect the panel.`
        : `Windows COM (${progIdPrefix}) fallback failed: ${c.message}`
    );
  } finally {
    try {
      if (fs.existsSync(jsxFile)) fs.unlinkSync(jsxFile);
    } catch {
      // ignore cleanup error
    }
  }
}

async function executeAfterEffectsCliBridge(
  packet: BridgeCommandPacket,
  timeoutMs: number,
  startMs: number
): Promise<BridgeResponsePacket> {
  const detected = await detectInstalledAdobeApps(true);
  const aeInfo = detected.find((a) => a.app === "after-effects");
  if (!aeInfo || !aeInfo.executablePath) {
    throw new AdobeBridgeError(
      "after-effects",
      "AE_NOT_INSTALLED",
      "After Effects is not connected via CEP WebSocket and AfterFX.exe was not found in Program Files."
    );
  }

  if (!aeInfo.running) {
    // `AfterFX.exe -r` on a closed After Effects would launch the whole app and never return in time.
    throw new AdobeBridgeError(
      "after-effects",
      "AE_NOT_RUNNING",
      "After Effects is not running. Open After Effects (ideally with Window > Extensions > Junior Rocha MCP) and try again."
    );
  }

  const tempDir = path.join(os.tmpdir(), "jr-adb-mcp-bridge");
  fs.mkdirSync(tempDir, { recursive: true });
  const jsxFile = path.join(tempDir, `ae_cmd_${packet.id}.jsx`);
  const outFile = path.join(tempDir, `ae_out_${packet.id}.json`);

  fs.writeFileSync(jsxFile, buildAfterEffectsCliScript(packet, outFile), "utf8");

  try {
    // Hand the script to the running instance. Do not tie the result to this helper process:
    // the answer arrives through the output file. No kill-on-timeout, so After Effects is never terminated.
    const child = execFile(aeInfo.executablePath, ["-r", jsxFile], () => undefined);
    child.unref();

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (fs.existsSync(outFile)) {
        const raw = fs.readFileSync(outFile, "utf8").trim();
        if (raw.length > 0) {
          return parseExtendScriptOutput(packet, "cli", raw, Date.now() - startMs);
        }
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    throw new Error(
      "Timed out waiting for the script result. In After Effects enable Settings > Scripting & Expressions > " +
        "'Allow Scripts to Write Files and Access Network', and dismiss any open dialog."
    );
  } catch (err: unknown) {
    throw new AdobeBridgeError(
      "after-effects",
      "AE_CLI_FALLBACK_FAILED",
      `After Effects CLI fallback failed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    try {
      if (fs.existsSync(jsxFile)) fs.unlinkSync(jsxFile);
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    } catch {
      // ignore
    }
  }
}

export function parseExtendScriptOutput(
  packet: BridgeCommandPacket,
  bridgeType: "com" | "cli" | "cep",
  rawText: string,
  durationMs: number
): BridgeResponsePacket {
  try {
    const parsed = JSON.parse(rawText) as {
      ok?: boolean;
      data?: unknown;
      context?: Record<string, unknown>;
      previewBase64?: string;
      previewMimeType?: string;
      error?: { code?: string; message?: string; line?: number; fileName?: string };
    };

    if (parsed && typeof parsed === "object" && "ok" in parsed) {
      if (parsed.ok) {
        const dataObj = parsed.data as Record<string, unknown> | undefined;
        return {
          type: "response",
          id: packet.id,
          app: packet.app,
          bridgeType,
          ok: true,
          durationMs,
          data: parsed.data,
          context: parsed.context,
          previewBase64: parsed.previewBase64 || (dataObj && typeof dataObj.previewBase64 === "string" ? dataObj.previewBase64 : undefined),
          previewMimeType: parsed.previewMimeType || (dataObj && typeof dataObj.previewMimeType === "string" ? dataObj.previewMimeType : undefined)
        };
      }

      return {
        type: "response",
        id: packet.id,
        app: packet.app,
        bridgeType,
        ok: false,
        durationMs,
        error: {
          code: parsed.error?.code || "EXTENDSCRIPT_ERROR",
          message: parsed.error?.message || "ExtendScript execution returned ok=false",
          line: parsed.error?.line ?? null,
          fileName: parsed.error?.fileName ?? null
        }
      };
    }

    return {
      type: "response",
      id: packet.id,
      app: packet.app,
      bridgeType,
      ok: true,
      durationMs,
      data: parsed
    };
  } catch {
    return {
      type: "response",
      id: packet.id,
      app: packet.app,
      bridgeType,
      ok: true,
      durationMs,
      data: { rawOutput: rawText }
    };
  }
}
