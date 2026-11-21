import { FORMATS_REVIEWED, formatsReviewAge } from "../../core/formats.js";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spawn } from "node:child_process";
import { BridgeRouter } from "../../core/bridge-router.js";
import { detectInstalledAdobeApps } from "../../core/adobe-detector.js";
import { AdobeAppId } from "../../core/types.js";
import { buildImageToolResponse, formatErrorResponse, formatSuccessResponse } from "../../core/image-helper.js";
import { contactSheet, encodePng } from "../../core/png.js";
import { decodeImageRgb } from "../../media/ffmpeg.js";
import * as fs from "node:fs";
import * as path from "node:path";

const SHEET_EXT = /\.(png|jpe?g|webp|tiff?|gif|bmp|mp4|mov|m4v|webm)$/i;

/** Files of a folder for the contact sheet, in natural order (01, 02, …, 10), optionally recursive. */
export function sheetFiles(folder: string, recursive = false, filter?: string): string[] {
  const out: string[] = [];
  const re = filter ? new RegExp(filter, "i") : null;
  const walk = (dir: string, depth: number) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (recursive && depth < 4 && !e.name.startsWith("_") && !e.name.startsWith(".")) walk(p, depth + 1);
      } else if (SHEET_EXT.test(e.name) && !e.name.startsWith("_") && (!re || re.test(e.name))) out.push(p);
    }
  };
  walk(folder, 0);
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

/** Tool that opens a file inside an app that is already running. */
export const OPEN_TOOL: Record<string, string> = {
  photoshop: "ps_open_document",
  "after-effects": "ae_manage_project (operation 'open')",
  premiere: "pr_manage_project (operation 'open')",
  illustrator: "ai_manage_document (operation 'open')",
  indesign: "id_manage_document (operation 'open')",
  lightroom: "lr_import_photos"
};

export function registerSharedTools(server: McpServer, router: BridgeRouter, enabledApps: AdobeAppId[]): void {
  server.tool(
    "jradb_get_status",
    "Check installed Adobe apps, running processes, live WebSocket/COM bridges and each app's command queue " +
      "(command in flight and for how long, queued commands, suspected busy after a timeout, last error, last success). " +
      "Call it first, and whenever a command times out or returns APP_BUSY.",
    {
      checkRunningProcesses: z.boolean().optional().default(true).describe("Whether to check OS process list for running Adobe apps.")
    },
    async ({ checkRunningProcesses }) => {
      try {
        const installed = await detectInstalledAdobeApps(checkRunningProcesses);
        const connectedBridges = await router.getConnectedBridges();
        const hub = router.getHub();

        const leader = hub.getLeaderHealth();
        const hints: string[] = [];
        if (leader.state === "unresponsive") {
          hints.push(
            "The leader MCP process (another Claude window or a stale server) holds the port but did not answer: the bridge list may be incomplete. Close old Claude Desktop windows/processes or restart Claude."
          );
        }
        const age = formatsReviewAge();
        if (age > 92) hints.push(`The platform format table (sizes, safe zones) was last reviewed ${age} days ago (${FORMATS_REVIEWED}): review craft-formatos and src/core/formats.ts.`);
        if (leader.state === "disconnected") hints.push("Lost the link to the leader MCP process; it is reconnecting. Call jradb_get_status again in a few seconds.");
        return formatSuccessResponse({
          hub: {
            role: hub.getRole(),
            error: hub.getLastError(),
            port: hub.getPort(),
            leader,
            enabledApps
          },
          ...(hints.length ? { hints } : {}),
          connectedBridges,
          queues: router.getAppStates(enabledApps),
          applications: installed.map((appInfo) => ({
            ...appInfo,
            wsConnected: connectedBridges.some((b) => b.app === appInfo.app),
            comFallbackAvailable:
              (process.platform === "win32" && (appInfo.app === "photoshop" || appInfo.app === "illustrator" || appInfo.app === "indesign")) ||
              (process.platform === "darwin" && appInfo.app !== "premiere" && appInfo.app !== "lightroom")
          }))
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "jradb_launch_app",
    "Launch an installed Adobe Creative Cloud application on the local machine, optionally opening a file with it " +
      "(.prproj, .aep, .psd, .ai, .indd…) so it does not stop on the start screen. If the app is already running, " +
      "the reply names the tool that opens the file inside it.",
    {
      app: z.enum(["photoshop", "after-effects", "premiere", "illustrator", "indesign", "lightroom"]).describe("Target Adobe application to launch."),
      filePath: z.string().optional().describe("Project or document to open on launch (Premiere: a .prproj avoids the start screen).")
    },
    async ({ app, filePath }) => {
      try {
        if (filePath && !fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
        const apps = await detectInstalledAdobeApps(true);
        const target = apps.find((a) => a.app === app);
        if (!target || !target.executablePath) {
          throw new Error(`Application '${app}' was not found in standard Adobe installation directories.`);
        }
        if (target.running) {
          return formatSuccessResponse({
            app,
            alreadyRunning: true,
            executablePath: target.executablePath,
            ...(filePath ? { openWith: OPEN_TOOL[app], note: `Already running: open the file with ${OPEN_TOOL[app]}.` } : {})
          });
        }

        // macOS: executablePath is the .app bundle, opened with `open -a` (not validated on a Mac yet).
        const isMac = process.platform === "darwin";
        const child = spawn(
          isMac ? "open" : target.executablePath,
          isMac ? ["-a", target.executablePath, ...(filePath ? [filePath] : [])] : filePath ? [filePath] : [],
          { detached: true, stdio: "ignore" }
        );
        child.unref();

        return formatSuccessResponse({
          app,
          launched: true,
          pid: child.pid,
          executablePath: target.executablePath,
          ...(filePath ? { opening: filePath } : {}),
          note: "The app takes 10–60 s to start; its panel connects after that. Check with jradb_get_status."
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "jradb_inspect_dom",
    "API discovery: dynamically inspect any runtime object, property list, and method signatures inside Photoshop, After Effects, Premiere Pro, or Illustrator (e.g. 'app', 'app.project', 'app.activeDocument').",
    {
      app: z.enum(["photoshop", "after-effects", "premiere", "illustrator", "indesign"]).describe("Target Adobe host application."),
      targetExpression: z.string().default("app").describe("JavaScript/ExtendScript expression to inspect (e.g. 'app.project.activeItem' or 'app.activeDocument')."),
      maxProperties: z.number().int().min(10).max(500).optional().default(150).describe("Maximum number of properties/methods to return.")
    },
    async ({ app, targetExpression, maxProperties }) => {
      try {
        const res = await router.dispatch(app, "adobe.inspectDom", {
          targetExpression,
          maxProperties
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "jradb_bridge_transfer",
    "Cross-application pipeline: export the active document of a source app (Illustrator or Photoshop) to exchangeFilePath and import that file into After Effects or Premiere Pro. Supported: Illustrator -> png; Photoshop -> png or psd. (After Effects and Premiere Pro do not import SVG; for layered Illustrator art save the .ai with ai_manage_document and import it with ae_manage_project.)",
    {
      sourceApp: z.enum(["illustrator", "photoshop"]).describe("Source application holding the active artwork/document."),
      targetApp: z.enum(["after-effects", "premiere"]).describe("Destination video/motion application."),
      exchangeFilePath: z.string().describe("Absolute path for the intermediate exported asset (e.g. 'C:/temp/transferred_asset.png')."),
      format: z.enum(["png", "psd", "svg"]).optional().default("png").describe("Intermediate file format."),
      importAsComp: z.boolean().optional().default(false).describe("When importing PSD/AI into After Effects, import as layered composition.")
    },
    async ({ sourceApp, targetApp, exchangeFilePath, format, importAsComp }) => {
      try {
        const allowedFormats = sourceApp === "illustrator" ? ["png"] : ["png", "psd"];
        if (!allowedFormats.includes(format)) {
          throw new Error(
            `format '${format}' is not supported for ${sourceApp} -> ${targetApp}. Use: ${allowedFormats.join(" or ")}.`
          );
        }
        // Step 1: Export from source app
        const exportRes =
          sourceApp === "illustrator"
            ? await router.dispatch("illustrator", "ai.export.file", {
                filePath: exchangeFilePath,
                format
              })
            : await router.dispatch("photoshop", "ps.doc.save", {
                filePath: exchangeFilePath,
                format
              });

        // Step 2: Import into target app
        const importRes =
          targetApp === "after-effects"
            ? await router.dispatch("after-effects", "ae.project.manage", {
                operation: "import",
                filePath: exchangeFilePath,
                importAs: importAsComp ? "compCroppedLayers" : "footage"
              })
            : await router.dispatch("premiere", "pr.media.import", {
                filePaths: [exchangeFilePath]
              });

        return formatSuccessResponse({
          transferred: true,
          sourceApp,
          targetApp,
          exchangeFilePath,
          exportResult: exportRes.data,
          importResult: importRes.data
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "jradb_checkpoint",
    "Save a named, timestamped iteration of the active document/project BEFORE a structural change, a long render, a heavy " +
      "preview or anything that could hang the app. Photoshop: layered PSD copy; InDesign: saveACopy; Illustrator, After " +
      "Effects, Premiere: save, then copy the file (a never-saved document is saved as the checkpoint, reported as " +
      "documentPathChanged); Lightroom: a Develop snapshot on the target photos. Default folder: '_checkpoints' next to " +
      "the original file, or Documents/MCP-checkpoints.",
    {
      app: z.enum(["photoshop", "illustrator", "indesign", "after-effects", "premiere", "lightroom"]),
      label: z.string().max(60).optional().describe("Short name for the iteration, e.g. 'antes-da-animacao'."),
      folder: z.string().optional().describe("Absolute folder for the copy. Ignored for Lightroom.")
    },
    async ({ app, label, folder }) => {
      try {
        if (!enabledApps.includes(app)) {
          throw new Error(`${app} is not enabled in this server (--apps).`);
        }
        if (app === "lightroom") {
          const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
          const name = `MCP checkpoint${label ? ` ${label}` : ""} ${stamp}`;
          const res = await router.dispatch("lightroom", "lr.develop.snapshot", { name }, { undoGroup: "MCP: checkpoint" });
          return formatSuccessResponse({ app, method: "develop snapshot on the target photos", snapshotName: name, result: res.data });
        }
        const res = await router.dispatch(app, "adobe.checkpoint", { label, folder }, { undoGroup: "MCP: checkpoint" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "jradb_contact_sheet",
    "Contact sheet of delivered pieces: every image (png, jpg, webp, tiff) and video (one frame) in a folder, in name " +
      "order, laid out in one PNG grid — review a whole campaign, carousel or variant batch in a single look before " +
      "delivery. Folders starting with '_' are skipped. Needs ffmpeg (installed with the MCP's optional packages).",
    {
      folder: z.string().describe("Absolute folder with the pieces."),
      recursive: z.boolean().optional().default(false),
      filter: z.string().optional().describe("Regular expression on file names, e.g. '4x5|9x16'."),
      columns: z.number().int().min(1).max(12).optional(),
      cellWidth: z.number().int().min(64).max(800).optional().describe("Width of each piece, px (default 240)."),
      videoAtSeconds: z.number().min(0).optional().default(1),
      maxFiles: z.number().int().min(1).max(120).optional().default(60),
      outputPath: z.string().optional().describe("Default: <folder>/_folha-de-contato.png."),
      includeImageContent: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        const files = sheetFiles(params.folder, params.recursive, params.filter).slice(0, params.maxFiles ?? 60);
        if (!files.length) throw new Error(`No images or videos in ${params.folder}.`);
        const cell = params.cellWidth ?? 240;
        const frames = [];
        const skipped: string[] = [];
        for (const f of files) {
          try {
            const isVideo = /\.(mp4|mov|m4v|webm)$/i.test(f);
            frames.push(await decodeImageRgb(f, cell * 2, isVideo ? params.videoAtSeconds : undefined));
          } catch (e) {
            skipped.push(`${path.basename(f)}: ${(e as Error).message.slice(0, 120)}`);
          }
        }
        if (!frames.length) throw new Error(`None of the files could be read. ${skipped.slice(0, 3).join(" | ")}`);
        const columns = params.columns ?? Math.min(8, Math.max(2, Math.ceil(Math.sqrt(frames.length * 1.6))));
        const sheet = contactSheet(frames, { columns, cellWidth: cell, gap: 10, background: [40, 40, 40] });
        const outPath = params.outputPath ?? path.join(params.folder, "_folha-de-contato.png");
        const png = encodePng(sheet);
        fs.writeFileSync(outPath, png);
        return buildImageToolResponse(
          { pieces: frames.length, columns, order: files.map((f) => path.relative(params.folder, f)), skipped, outputPath: outPath, width: sheet.width, height: sheet.height },
          { filePath: outPath, base64Data: png.toString("base64"), includeImageContent: params.includeImageContent }
        );
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}

