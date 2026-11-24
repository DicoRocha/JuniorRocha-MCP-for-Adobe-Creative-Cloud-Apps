import { watchRender } from "../../media/render-watch.js";
import { aerenderPath, buildAerenderArgs, chooseRenderEngine, runAerender } from "../../media/aerender.js";
import { startJob } from "../../media/jobs.js";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../core/bridge-router.js";
import {
  buildImageToolResponse,
  formatErrorResponse,
  formatSuccessResponse,
  waitForStableFile
} from "../../core/image-helper.js";
import { AdobeBridgeError } from "../../core/types.js";
import { CatalogCache, EffectEntry, normalizeText, queryEffects, suggestEffects } from "../../core/effect-catalog.js";
import { contactSheet, decodePng, encodePng } from "../../core/png.js";
import { auditAfterEffects, summarize, type AeAuditData } from "../../core/audit.js";
import { hexToAe, resolveKit } from "../../core/brand-kit.js";
import { FORMATS } from "../../core/formats.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const NormalizedColorSchema = z
  .array(z.number().min(0).max(1))
  .length(3)
  .describe("Normalized RGB array [r, g, b] where each channel is between 0.0 and 1.0.");

const LayerTarget = {
  compName: z.string().optional().describe("Composition name (defaults to the active composition)."),
  compIndex: z.number().int().positive().optional().describe("1-based project item index of the composition."),
  layerIndex: z.number().int().positive().optional().describe("1-based layer index."),
  layerName: z.string().optional().describe("Layer name (when layerIndex is omitted).")
};

const aeEffectCache = new CatalogCache<EffectEntry[]>();

async function loadAeEffects(router: BridgeRouter, refresh = false): Promise<EffectEntry[]> {
  return aeEffectCache.get(
    "after-effects",
    async () => {
      const res = await router.dispatch("after-effects", "ae.effect.list", {}, { timeoutMs: 60000 });
      return ((res.data as { effects?: EffectEntry[] }).effects || []) as EffectEntry[];
    },
    refresh
  );
}

/** Adds the closest installed effects to an EFFECT_NOT_FOUND error. */
async function withEffectSuggestions(router: BridgeRouter, err: unknown, wanted: string): Promise<unknown> {
  if (!(err instanceof AdobeBridgeError) || err.code !== "EFFECT_NOT_FOUND") {
    return err;
  }
  try {
    const near = suggestEffects(await loadAeEffects(router), wanted, 5);
    const list = near.map((e) => `${e.displayName} (${e.matchName})`).join("; ");
    return new AdobeBridgeError(err.app, err.code, `${err.message} Closest installed effects: ${list}.`, err.details);
  } catch {
    return err;
  }
}

const BlendModeSchema = z.enum([
  "normal", "darken", "multiply", "colorBurn", "linearBurn", "darkerColor", "lighten", "screen", "colorDodge", "linearDodge",
  "lighterColor", "overlay", "softLight", "hardLight", "linearLight", "vividLight", "pinLight", "hardMix", "difference",
  "exclusion", "subtract", "divide", "hue", "saturation", "color", "luminosity"
]);

export function registerAfterEffectsTools(server: McpServer, router: BridgeRouter): void {
  server.tool(
    "ae_get_project_info",
    "Get After Effects project metadata, file path, color depth, item counts, all compositions, and render queue summary.",
    {},
    async () => {
      try {
        const res = await router.dispatch("after-effects", "ae.project.getInfo", {});
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_manage_project",
    "Create a new project, open/save an .aep project, import footage/audio/image sequences or layered PSD/AI files, create folders, " +
      "purge caches, or change project settings (bitsPerChannel: 16 removes banding in soft gradients) in After Effects.",
    {
      operation: z.enum(["new", "open", "save", "import", "createFolder", "purge", "settings"]),
      bitsPerChannel: z
        .union([z.literal(8), z.literal(16), z.literal(32)])
        .optional()
        .describe("new / settings: project colour depth."),
      filePath: z.string().optional().describe("Absolute path for open, save, or import."),
      importAs: z
        .enum(["footage", "comp", "compCroppedLayers"])
        .optional()
        .default("footage")
        .describe("How to import multi-layer PSD/AI files."),
      sequence: z.boolean().optional().default(false).describe("Import numbered images as an image sequence."),
      folderName: z.string().optional().describe("Folder name when operation='createFolder'."),
      discardChanges: z
        .boolean()
        .optional()
        .describe("new/open: close the current project without saving when it has unsaved changes (otherwise PROJECT_DIRTY).")
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.project.manage", params, {
          undoGroup: `MCP: AE Project ${params.operation}`
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_list_compositions",
    "List all compositions in the active After Effects project with resolution, duration, frame rate, and layer count.",
    {},
    async () => {
      try {
        const res = await router.dispatch("after-effects", "ae.comp.list", {});
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_create_composition",
    "Create a new composition in Adobe After Effects and optionally open it in the viewer.",
    {
      name: z.string().default("Main Comp").describe("Name of the composition."),
      width: z.number().int().positive().default(1920),
      height: z.number().int().positive().default(1080),
      pixelAspect: z.number().positive().optional().default(1.0),
      duration: z.number().positive().default(10.0).describe("Duration in seconds."),
      frameRate: z.number().positive().default(30.0).describe("Frames per second."),
      bgColor: NormalizedColorSchema.optional().default([0.05, 0.05, 0.05]),
      openInViewer: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.comp.create", params, {
          undoGroup: `MCP: Create Comp ${params.name}`
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_modify_composition",
    "Modify composition settings (dimensions, duration, fps, background color, work area, motion blur) or precompose layers.",
    {
      compName: z.string().optional().describe("Target composition name (defaults to active composition)."),
      compIndex: z.number().int().positive().optional().describe("1-based item index in project."),
      newName: z.string().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      duration: z.number().positive().optional(),
      frameRate: z.number().positive().optional(),
      bgColor: NormalizedColorSchema.optional(),
      workAreaStart: z.number().min(0).optional(),
      workAreaDuration: z.number().positive().optional(),
      motionBlur: z.boolean().optional(),
      precomposeLayerIndices: z
        .array(z.number().int().positive())
        .optional()
        .describe("1-based layer indices to precompose into a nested composition."),
      precomposeLayerNames: z.array(z.string()).optional().describe("Layer names to precompose (instead of indices)."),
      precompName: z.string().optional(),
      moveAllAttributes: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.comp.modify", params, {
          undoGroup: "MCP: Modify Composition"
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_get_comp_frame_preview",
    "Multimodal Visual Feedback: Render a specific frame of an After Effects composition to PNG (`saveFrameToPng`) and return it as inline base64 ImageContent.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      time: z.number().min(0).optional().describe("Time in seconds to sample (defaults to current playhead time)."),
      outputPath: z.string().optional().describe("Optional custom output path for the PNG."),
      includeImageContent: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        // After Effects writes the PNG asynchronously on its main thread; waiting inside the host
        // blocks that thread (the app hung in the campaign test). Ask it not to wait and wait here.
        const res = await router.dispatch("after-effects", "ae.comp.getFramePreview", { ...params, noWait: true }, {
          timeoutMs: 30000
        });
        const dataObj = (res.data || {}) as Record<string, unknown>;
        if (dataObj.pending && typeof dataObj.outputPath === "string") {
          const written = await waitForStableFile(dataObj.outputPath, 30000);
          if (!written) {
            throw new Error(
              `After Effects did not finish writing the preview within 30 s: ${dataObj.outputPath}. ` +
                "Heavy comps render slowly; try a lower comp resolution or ae_render_queue."
            );
          }
          delete dataObj.pending;
        }
        return buildImageToolResponse(dataObj, {
          filePath: typeof dataObj.outputPath === "string" ? dataObj.outputPath : params.outputPath,
          base64Data: res.previewBase64 || (typeof dataObj.previewBase64 === "string" ? dataObj.previewBase64 : undefined),
          includeImageContent: params.includeImageContent
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_set_easing",
    "Ease keyframes that already exist: presets easyEase (33/33, F9), gentle (45), smooth (60), strong (85, expo-like), " +
      "snappy (95 in / 20 out), linear, hold, or custom influenceIn/influenceOut (0.1–100) and speed. Targets every " +
      "animated property of the given layers (names or indices; default: selected layers, else all) or one propertyPath, " +
      "optionally only keys in fromTime–toTime or keyIndices; side 'in'/'out' keeps the other side as it is.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      layerNames: z.array(z.string()).optional(),
      layerIndices: z.array(z.number().int().positive()).optional(),
      propertyPath: z.array(z.union([z.string(), z.number()])).optional().describe("e.g. ['Transform','Position']; default: all animated properties."),
      preset: z.enum(["easyEase", "gentle", "smooth", "strong", "snappy", "linear", "hold", "custom"]).default("easyEase"),
      influenceIn: z.number().min(0.1).max(100).optional(),
      influenceOut: z.number().min(0.1).max(100).optional(),
      speed: z.number().optional().describe("Speed at the key (default 0 = comes to rest)."),
      side: z.enum(["both", "in", "out"]).optional().default("both"),
      fromTime: z.number().min(0).optional(),
      toTime: z.number().min(0).optional(),
      keyIndices: z.array(z.number().int().positive()).optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.anim.ease", params, { undoGroup: "MCP: Easing" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_manage_markers",
    "Composition or layer markers: list, add (time, comment, duration, chapter, url, label colour 0–16) or remove (by " +
      "time, or all). Use them for beats, script blocks, cut points and handoff notes; layer markers when a layer is given.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      layerName: z.string().optional(),
      layerIndex: z.number().int().positive().optional(),
      operation: z.enum(["list", "add", "remove"]).default("list"),
      markers: z
        .array(
          z.object({
            time: z.number().min(0),
            comment: z.string().optional(),
            duration: z.number().min(0).optional(),
            chapter: z.string().optional(),
            url: z.string().optional(),
            label: z.number().int().min(0).max(16).optional()
          })
        )
        .optional(),
      times: z.array(z.number().min(0)).optional().describe("remove: markers at these times."),
      all: z.boolean().optional().describe("remove: every marker.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.marker.manage", params, { undoGroup: "MCP: Markers" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_contact_sheet",
    "Contact sheet of a composition: renders frames (given times, or `count` frames spread over the work area) and lays " +
      "them out in one PNG grid — see the whole animation at once (timing, layout, legibility) in a single look. " +
      "Returns the image and the times in reading order.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      times: z.array(z.number().min(0)).optional(),
      aroundSeconds: z.number().min(0).optional().describe("Filmstrip of consecutive frames centred on this time (a cut, a word landing): `count` frames, `stepSeconds` apart."),
      stepSeconds: z.number().positive().optional().describe("With aroundSeconds: time between frames (default 1/60 s)."),
      count: z.number().int().min(2).max(36).optional().default(12),
      columns: z.number().int().min(1).max(12).optional(),
      cellWidth: z.number().int().min(64).max(1200).optional().describe("Width of each frame in the sheet, px (default 320)."),
      outputPath: z.string().optional(),
      includeImageContent: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        let times = params.times;
        if ((!times || !times.length) && typeof params.aroundSeconds === "number") {
          const n = params.count ?? 12;
          const step = params.stepSeconds ?? 1 / 60;
          const first = params.aroundSeconds - Math.floor(n / 2) * step;
          times = Array.from({ length: n }, (_, i) => Math.max(0, Math.round((first + i * step) * 10000) / 10000));
        }
        if (!times || !times.length) {
          const list = await router.dispatch("after-effects", "ae.comp.list", {});
          const comps = ((list.data as { compositions?: Array<Record<string, unknown>> })?.compositions ?? []) as Array<Record<string, number | string | boolean>>;
          const comp =
            comps.find((c) => (params.compName ? c.name === params.compName : false)) ??
            comps.find((c) => (params.compIndex ? c.index === params.compIndex : false)) ??
            comps.find((c) => c.active === true) ??
            comps[0];
          if (!comp) throw new Error("No composition in the project.");
          const start = Number(comp.workAreaStart ?? 0);
          const dur = Number(comp.workAreaDuration ?? comp.duration);
          const fr = Number(comp.frameRate) || 30;
          const n = params.count ?? 12;
          const last = start + dur - 1 / fr;
          times = Array.from({ length: n }, (_, i) => Math.round((start + ((last - start) * i) / (n - 1)) * 1000) / 1000);
          if (!params.compName) params.compName = String(comp.name);
        }
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ae_sheet_"));
        const frames = [];
        for (let i = 0; i < times.length; i++) {
          const out = path.join(dir, `f${String(i).padStart(2, "0")}.png`);
          const res = await router.dispatch(
            "after-effects",
            "ae.comp.getFramePreview",
            { compName: params.compName, compIndex: params.compIndex, time: times[i], outputPath: out, noWait: true },
            { timeoutMs: 30000 }
          );
          const file = String(((res.data || {}) as Record<string, unknown>).outputPath || out);
          if (!(await waitForStableFile(file, 30000))) throw new Error(`After Effects did not write frame ${i + 1} (${times[i]} s) within 30 s.`);
          frames.push(decodePng(fs.readFileSync(file)));
        }
        const columns = params.columns ?? Math.min(6, Math.ceil(Math.sqrt(times.length * (frames[0].height > frames[0].width ? 2 : 1))));
        const sheet = contactSheet(frames, { columns, cellWidth: params.cellWidth ?? (frames[0].height > frames[0].width ? 220 : 320) });
        const outPath = params.outputPath || path.join(dir, "contact_sheet.png");
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        const png = encodePng(sheet);
        fs.writeFileSync(outPath, png);
        return buildImageToolResponse(
          { compName: params.compName ?? null, frames: times.length, times, columns, width: sheet.width, height: sheet.height, outputPath: outPath },
          { filePath: outPath, base64Data: png.toString("base64"), includeImageContent: params.includeImageContent }
        );
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_import_vector_as_shapes",
    "Bring Illustrator artwork into After Effects as editable shape layers: imports the .ai (or PDF/EPS) as a comp with " +
      "one layer per Illustrator layer, runs Create Shapes from Vector Layer on each and removes the footage originals. " +
      "Name the Illustrator layers first (one per part that will move). Then animate with Trim Paths, ae_set_keyframes, ae_set_easing.",
    {
      filePath: z.string().describe("Absolute path of the .ai / .pdf / .eps."),
      compName: z.string().optional(),
      deleteOriginals: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.vector.importAsShapes", params, { timeoutMs: 180000, undoGroup: "MCP: Vector to shapes" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_audit_motion",
    "Check a composition before rendering: expressions with errors, missing footage, linear keyframes on motion " +
      "properties (position, scale, anchor, paths, text animators — opacity is fine linear), text layers on screen for " +
      "less than ~0.3 s per word + 0.5 s, and gradients in an 8-bpc project. Returns findings by severity.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      secondsPerWord: z.number().positive().optional(),
      holdSeconds: z.number().min(0).optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.audit", { compName: params.compName, compIndex: params.compIndex }, { timeoutMs: 60000 });
        const data = res.data as AeAuditData;
        const findings = auditAfterEffects(data, { secondsPerWord: params.secondsPerWord, holdSeconds: params.holdSeconds });
        // Same shape drawn twice (fill layer + outline layer): one layer with both paints is enough.
        try {
          const rr = await router.dispatch("after-effects", "ae.shapes.redundant", { compName: params.compName, compIndex: params.compIndex }, { timeoutMs: 30000 });
          const pairs = ((rr.data || {}) as { pairs?: string[][] }).pairs ?? [];
          for (const [a, b] of pairs.slice(0, 10)) {
            findings.push({
              severity: "warn",
              code: "SPLIT_FILL_STROKE",
              message: `"${a}" and "${b}" draw the same shape, one with the fill and one with the stroke: make it one shape layer with both (ae_create_shape_layer fillColor + strokeColor).`,
              target: a
            });
          }
        } catch {
          /* older panel without ae.shapes.redundant */
        }
        return formatSuccessResponse({ compName: data.compName, ...summarize(findings), findings, layers: data.layers.length });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  // ---------- recipes (phase 3): one call → editable comp in the brand's colours and fonts, audited ----------
  const KitShape = {
    kitPath: z.string().optional().describe("00_briefing/kit-de-marca.json (cores por uso, tipos titulo/corpo/rotulo)."),
    colors: z
      .object({ fundo: z.string(), superficie: z.string(), texto: z.string(), textoSecundario: z.string(), destaque: z.string() })
      .partial()
      .optional()
      .describe("'#RRGGBB' per role; overrides the kit."),
    fonts: z.object({ titulo: z.string(), corpo: z.string(), rotulo: z.string() }).partial().optional().describe("PostScript names (ps_list_fonts)."),
    format: z.enum(Object.keys(FORMATS) as [string, ...string[]]).optional().describe("Canvas from the format table (default 1920×1080)."),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    duration: z.number().positive().optional(),
    frameRate: z.number().positive().optional(),
    compName: z.string().optional(),
    mogrtPath: z.string().optional().describe("Also export a .mogrt with the text fields exposed (save the project first)."),
    allowLocalFonts: z
      .boolean()
      .optional()
      .describe("Export the .mogrt even with fonts not from Adobe Fonts: After Effects then asks for an OK click."),
    preview: z.boolean().optional().default(true)
  };

  async function runRecipe(action: string, params: Record<string, unknown>, extra: Record<string, unknown>, previewAt: number) {
    const kit = resolveKit({ kitPath: params.kitPath as string | undefined, colors: params.colors as never, fonts: params.fonts as never });
    const f = params.format ? FORMATS[params.format as string] : null;
    const payload = {
      ...extra,
      compName: params.compName,
      width: (params.width as number | undefined) ?? f?.width,
      height: (params.height as number | undefined) ?? f?.height,
      duration: params.duration,
      frameRate: params.frameRate,
      colors: Object.fromEntries(Object.entries(kit.colors).map(([k, v]) => [k, hexToAe(v)])),
      fonts: kit.fonts
    };
    const built = (await router.dispatch("after-effects", action, payload, { timeoutMs: 120000, undoGroup: `MCP: ${action}` })).data as Record<string, unknown>;
    const audit = (await router.dispatch("after-effects", "ae.audit", { compName: built.compName }, { timeoutMs: 60000 })).data as AeAuditData;
    const findings = auditAfterEffects(audit);
    const out: Record<string, unknown> = { ...built, kit: kit.source, colors: kit.colors, ...summarize(findings), findings };
    const wantedFonts = Object.values(kit.fonts);
    const applied = Object.values((built.fonts as Record<string, string>) ?? {});
    const missing = applied.filter((a) => a && !wantedFonts.includes(a));
    if (applied.some((a) => !a) || missing.length) out.fontWarning = "Some fonts were not applied as asked (not installed?): check with ps_list_fonts and pass PostScript names.";
    if (params.mogrtPath) {
      try {
        const mg = await router.dispatch(
          "after-effects",
          "ae.mogrt.export",
          { compName: built.compName, outputPath: params.mogrtPath, templateName: built.compName, properties: built.mogrtFields, allowLocalFonts: params.allowLocalFonts },
          { timeoutMs: 180000 }
        );
        out.mogrt = mg.data;
      } catch (e) {
        out.mogrtError = (e as Error).message;
      }
    }
    delete out.mogrtFields;
    if (params.preview === false) return formatSuccessResponse(out);
    const prevRes = await router.dispatch(
      "after-effects",
      "ae.comp.getFramePreview",
      { compName: built.compName, time: previewAt, noWait: true },
      { timeoutMs: 30000 }
    );
    const file = String(((prevRes.data || {}) as Record<string, unknown>).outputPath || "");
    if (file && (await waitForStableFile(file, 30000))) {
      return buildImageToolResponse({ ...out, previewTime: previewAt, previewPath: file }, { filePath: file, includeImageContent: true });
    }
    return formatSuccessResponse(out);
  }

  server.tool(
    "ae_camera_transition",
    "Camera-style transition over a cut inside a comp (the fast, blurred looks of short-form video): whip (whip pan with directional blur), " +
      "zoom (zoom blur in/out), spin (180° spin blur), shake (impact shake that decays, no keyframes on position), glitch (digital tear: " +
      "horizontal jumps + square wave warp that peak on the cut) or flash (white/colour flash). " +
      "Non-destructive: one adjustment layer across the cut with Motion Tile + Transform + blur, an 'Intensidade' slider to tune the strength in " +
      "Effect Controls, extreme eases (90 % influence). The two clips stay untouched below.",
    {
      compName: z.string().optional(),
      compIndex: z.coerce.number().int().optional(),
      cutSeconds: z.number().min(0).describe("Time of the cut between the two clips, in comp seconds."),
      style: z.enum(["whip", "zoom", "spin", "shake", "glitch", "flash"]).optional().default("whip"),
      direction: z.enum(["left", "right", "up", "down", "in", "out"]).optional().describe("whip: left/right/up/down; zoom: in/out; spin: left/right."),
      durationSeconds: z.number().min(0.15).max(2).optional().describe("Whole move, centred on the cut (default 0.5 s; shake: starts at the cut, default 0.6 s)."),
      intensity: z.number().min(0).max(200).optional().describe("Starting value of the Intensidade slider (default 100)."),
      color: z.string().optional().describe("flash: '#RRGGBB' (default white).")
    },
    async (p) => {
      try {
        const { hexToAe } = await import("../../core/brand-kit.js");
        const params = { ...p, color: p.color ? hexToAe(p.color) : undefined };
        const res = await router.dispatch("after-effects", "ae.transition.camera", params, { undoGroup: "MCP: Camera transition" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_paper_transition",
    "Paper tear or burn between a layer and whatever is below it, built inside After Effects (no matte footage): the " +
      "outgoing layer gets Motion Tile + Linear Wipe + Roughen Edges, and a paper-coloured strip (tear, with shadow) or a " +
      "glowing ember strip (burn) follows the edge. The frame stays intact before the transition. Tune 'MCP Borda' " +
      "(Border, Scale) and the wipe angle in Effect Controls. The burn adds a charred band and a glowing ember along a straight front (not an organic fire).",
    {
      compName: z.string().optional(),
      compIndex: z.coerce.number().int().optional(),
      layerName: z.string().optional().describe("The outgoing layer (on top of the next scene)."),
      layerIndex: z.coerce.number().int().positive().optional(),
      startSeconds: z.number().min(0),
      durationSeconds: z.number().min(0.2).max(4).optional().describe("Default 0.8 s."),
      style: z.enum(["tear", "burn"]).optional().default("tear"),
      angle: z.number().optional().describe("Wipe angle in degrees (default 90; 0 = vertical travel)."),
      edgeColor: z.string().optional().describe("'#RRGGBB' of the paper / ember strip (default off-white / orange)."),
      roughness: z.number().min(0).max(120).optional().describe("Roughen Edges border in px (default 16 tear, 30 burn)."),
      seed: z.number().int().optional(),
      trimLayer: z.boolean().optional().describe("Trim the outgoing layer at the end of the transition (default true).")
    },
    async (p) => {
      try {
        const { hexToAe } = await import("../../core/brand-kit.js");
        const params = { ...p, edgeColor: p.edgeColor ? hexToAe(p.edgeColor) : undefined };
        const res = await router.dispatch("after-effects", "ae.transition.paper", params, { undoGroup: "MCP: Paper transition" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_time_remap",
    "Time on a footage or pre-comp layer: freeze a frame (hold one source time for the whole layer), set time-remap " +
      "keyframes for speed changes ({ time in comp seconds, sourceSeconds }), turn time remapping off, and set stretch " +
      "(200 = half speed) and frame blending (frameMix or pixelMotion smooth slow motion). Shape, text and solid layers " +
      "cannot be time-remapped.",
    {
      compName: z.string().optional(),
      compIndex: z.coerce.number().int().optional(),
      layerName: z.string().optional(),
      layerIndex: z.coerce.number().int().optional(),
      operation: z.enum(["freeze", "keyframes", "disable", "settings"]).optional().default("freeze"),
      sourceSeconds: z.number().min(0).optional().describe("freeze: the frame to hold, in the layer's own time."),
      keyframes: z.array(z.object({ time: z.number(), sourceSeconds: z.number() })).optional(),
      extendTo: z.number().optional().describe("keyframes: move the layer's out point to this comp time (slow motion needs a longer layer)."),
      stretch: z.number().optional().describe("Percent: 100 normal, 200 half speed, 50 double speed."),
      frameBlending: z.enum(["none", "frameMix", "pixelMotion"]).optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.time.remap", params, { undoGroup: "MCP: Time remap" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_morph_shapes",
    "Morph one shape layer into another (logo to icon, circle to star): both outlines are resampled to the same number " +
      "of points, with the same winding and aligned start, then keyed on the first layer's path together with the fill " +
      "colour; the first layer ends and the second starts at the end of the morph. Works with paths, rectangles and " +
      "ellipses (not polystars); only the first path of each layer is morphed, and parented layers are refused. " +
      "Text: Create Shapes from Text first. Check a frame in the middle with ae_get_comp_frame_preview.",
    {
      compName: z.string().optional(),
      compIndex: z.coerce.number().int().optional(),
      fromLayerName: z.string().optional(),
      fromLayerIndex: z.coerce.number().int().positive().optional(),
      toLayerName: z.string().optional(),
      toLayerIndex: z.coerce.number().int().positive().optional(),
      startSeconds: z.number().min(0),
      durationSeconds: z.number().min(0.1).max(6).optional().describe("Default 0.6 s."),
      points: z.number().int().min(16).max(400).optional().describe("Outline points (default 160; more = sharper corners)."),
      morphColor: z.boolean().optional().describe("Key the fill colour too (default true)."),
      hideTarget: z.boolean().optional().describe("End the first layer and start the second at the end of the morph (default true).")
    },
    async (p) => {
      try {
        const res = await router.dispatch("after-effects", "ae.shape.morph", p, { undoGroup: "MCP: Morph shapes" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_word_captions",
    "Word-by-word animated captions in a comp (Reels/TikTok/Shorts): one text layer per block of 1–4 words; the word being spoken " +
      "changes colour at its real time (text animator + expression selector), words not yet said are dimmed, each block pops in, " +
      "optional pill behind the text (sized with sourceRectAtTime, centred on the cap height) and the block never exceeds the safe width. " +
      "Give wordsPath (<name>.words.json from media_transcribe with wordTimestamps) or words; styles: 'centro' (default, clean, shadow), " +
      "'pilula' (brand pill behind), 'impacto' (bigger, thick outline, strong pop), 'leitura' (no colour change, words light up as read).",
    {
      compName: z.string().optional(),
      compIndex: z.coerce.number().int().optional(),
      wordsPath: z.string().optional().describe("JSON with { words: [{ word, start, end }] } (times in seconds of the comp)."),
      words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).optional(),
      style: z.enum(["centro", "pilula", "impacto", "leitura"]).optional().default("centro"),
      font: z.string().optional().describe("PostScript name of the brand's heavy font (e.g. 'Satoshi-Black')."),
      fontSize: z.number().positive().optional(),
      baseColor: z.string().optional().describe("'#RRGGBB' (default white)."),
      activeColor: z.string().optional().describe("Colour of the spoken word (brand accent; default '#FFC107')."),
      pillColor: z.string().optional().describe("Pill colour for style 'pilula' (brand colour)."),
      upperCase: z.boolean().optional().default(true),
      maxWords: z.number().int().min(1).max(6).optional().default(3),
      maxChars: z.number().int().min(6).max(40).optional().default(18),
      offsetSeconds: z.number().optional().describe("Shift all times (the clip starts later in the comp)."),
      y: z.number().optional().describe("Baseline y in px (default 72 % of the comp height; keep clear of faces and of the platform UI)."),
      singleLayer: z.boolean().optional().describe("One text layer for the whole video (Source Text picks the block by time): the style is edited in one place. Default: one layer per block."),
      replace: z.record(z.string(), z.string()).optional().describe("Fix words the engine misheard: { 'beta.': 'Beta.' } (case-insensitive match on the word).")
    },
    async (p) => {
      try {
        let words = p.words as { word: string; start: number; end: number }[] | undefined;
        if (!words && p.wordsPath) {
          const fsMod = await import("node:fs");
          const raw = JSON.parse(fsMod.readFileSync(p.wordsPath, "utf8")) as { words?: { word: string; start: number; end: number }[] };
          words = raw.words;
        }
        if (!words || !words.length) throw Object.assign(new Error("Give wordsPath or words (from media_transcribe with wordTimestamps: true)."), { code: "INVALID_PARAMS" });
        if (p.replace) {
          const map = new Map(Object.entries(p.replace).map(([k, v]) => [k.toLowerCase(), v]));
          words = words.map((w) => (map.has(w.word.toLowerCase()) ? { ...w, word: map.get(w.word.toLowerCase()) as string } : w));
        }
        const { groupWords } = await import("../../media/word-blocks.js");
        const { hexToAe } = await import("../../core/brand-kit.js");
        const blocks = groupWords(words, { maxWords: p.maxWords, maxChars: p.maxChars, upperCase: p.upperCase, offsetSeconds: p.offsetSeconds });
        const st = p.style ?? "centro";
        const preset: Record<string, unknown> =
          st === "impacto"
            ? { fontSize: 104, strokeWidth: 12, strokeColor: [0, 0, 0], pop: 0.22, wordScale: 112, futureOpacity: 100, shadow: true }
            : st === "pilula"
              ? { fontSize: 78, pop: 0.1, futureOpacity: 55, pillColor: hexToAe(p.pillColor ?? "#4B3693"), shadow: false }
              : st === "leitura"
                ? { fontSize: 72, pop: 0.04, futureOpacity: 35, shadow: true }
                : { fontSize: 84, pop: 0.1, futureOpacity: 60, shadow: true };
        const base = hexToAe(p.baseColor ?? "#FFFFFF");
        const params = {
          compName: p.compName,
          compIndex: p.compIndex,
          blocks,
          font: p.font,
          ...preset,
          ...(p.fontSize ? { fontSize: p.fontSize } : {}),
          baseColor: base,
          activeColor: st === "leitura" ? base : hexToAe(p.activeColor ?? "#FFC107"),
          y: p.y,
          singleLayer: p.singleLayer
        };
        const res = await router.dispatch("after-effects", "ae.captions.words", params, { undoGroup: "MCP: Word captions", timeoutMs: 300000 });
        return formatSuccessResponse({ ...(res.data as object), style: st, preview: blocks.slice(0, 6).map((b) => `${b.start}–${b.end} ${b.text}`) });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_pop_words",
    "Beat-synced words in 3D (lyric video, kinetic typography on music): one 3D text layer per word with a layer marker on the word's time and a " +
      "scale expression that reaches 100 % exactly ON the marker (damped overshoot after it), plus a camera that travels from word to word so " +
      "that every landing sits at a different place and size of the frame (inside the safe zone). Give wordsPath (<name>.words.json from " +
      "media_transcribe with wordTimestamps, after the person checked the text) or words. Then check with ae_measure_landings and ae_audit_camera.",
    {
      compName: z.string().optional(),
      compIndex: z.coerce.number().int().optional(),
      wordsPath: z.string().optional().describe("JSON with { words: [{ word, start, end }] } (seconds of the comp)."),
      words: z
        .array(
          z.object({
            word: z.string(),
            start: z.number(),
            end: z.number().optional(),
            id: z.string().optional().describe("Line.word id shown in the marker (e.g. 'L3.2')."),
            font: z.string().optional(),
            color: z.string().optional().describe("'#RRGGBB'."),
            size: z.number().positive().optional().describe("Multiplier of fontSize for this word."),
            position: z.array(z.number()).length(3).optional().describe("World position [x, y, z]; when given the camera does not aim at this word.")
          })
        )
        .optional(),
      offsetSeconds: z.number().optional().describe("Shift all times (the song starts later in the comp)."),
      font: z.string().optional().describe("PostScript name (default Arial-BoldMT)."),
      fonts: z.array(z.string()).optional().describe("PostScript names cycled word by word."),
      fontSize: z.number().positive().optional().describe("Base size in px (default 16 % of the comp width)."),
      sizePattern: z.array(z.number().positive()).optional().describe("Multipliers cycled word by word (default 1, 0.62, 1.3, 0.8, 1.12, 0.55): scale contrast between neighbours."),
      colors: z.array(z.string()).optional().describe("'#RRGGBB' cycled word by word (default white)."),
      upperCase: z.boolean().optional().default(true),
      camera: z.boolean().optional().default(true).describe("Create the travelling camera (false: words land directly on their screen targets, no camera)."),
      stepZ: z.number().positive().optional().describe("Depth between consecutive words in px (default 900)."),
      minGap: z.number().min(0).max(3).optional().describe("Words closer than this (seconds) share a camera stop and stack as lines of one block (default 0.4; 0 = one camera move per word, only for slow lyrics)."),
      maxWordsPerStop: z.number().int().min(1).max(8).optional().describe("Most words in one stop (default 5); a longer run is cut at its largest pause."),
      holdStops: z.number().int().min(0).optional().describe("A word fades out when this many later stops have started (default 1; 0 = stays, the camera flies past it)."),
      travel: z.number().min(0.15).max(2).optional().describe("Seconds the camera takes between two stops (default 0.45): it holds on a block and leaves late."),
      lead: z.number().min(0.02).max(0.3).optional().describe("Seconds of slam before the landing (default 0.08)."),
      overshoot: z.number().min(0).max(0.4).optional().describe("Overshoot after the landing (default 0.14)."),
      rotationSettle: z.number().min(0).max(15).optional().describe("Degrees of rotation that settle after the landing (default 4; alternates sign)."),
      drift: z.number().min(0).max(60).optional().describe("Slow camera drift in px so a hold still breathes (default 10; 0 = off)."),
      namePrefix: z.string().optional().describe("Layer name prefix (default 'Palavra ').")
    },
    async (p) => {
      try {
        let words = p.words as { word: string; start: number; end?: number; id?: string; font?: string; color?: string; size?: number; position?: number[] }[] | undefined;
        if (!words && p.wordsPath) {
          const raw = JSON.parse(fs.readFileSync(p.wordsPath, "utf8")) as { words?: { word: string; start: number; end: number }[] };
          words = raw.words;
        }
        if (!words || !words.length) throw Object.assign(new Error("Give wordsPath or words (from media_transcribe with wordTimestamps: true)."), { code: "INVALID_PARAMS" });
        const off = p.offsetSeconds ?? 0;
        const params = {
          compName: p.compName,
          compIndex: p.compIndex,
          words: words.map((w) => ({ text: w.word, start: Math.round((w.start + off) * 10000) / 10000, id: w.id, font: w.font, size: w.size, position: w.position, color: w.color ? hexToAe(w.color) : undefined })),
          font: p.font,
          fonts: p.fonts,
          fontSize: p.fontSize,
          sizePattern: p.sizePattern,
          colors: p.colors ? p.colors.map((c) => hexToAe(c)) : undefined,
          upperCase: p.upperCase,
          camera: p.camera,
          stepZ: p.stepZ,
          minGap: p.minGap,
          maxWordsPerStop: p.maxWordsPerStop,
          holdStops: p.holdStops,
          travel: p.travel,
          lead: p.lead,
          overshoot: p.overshoot,
          rotationSettle: p.rotationSettle,
          drift: p.drift,
          namePrefix: p.namePrefix
        };
        const res = await router.dispatch("after-effects", "ae.words.pop", params, { undoGroup: "MCP: Pop words", timeoutMs: 300000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_measure_landings",
    "Lyric-video camera gate, part 1: where each word sits on screen at its own time. Reads the projected centre and ink size of every word layer " +
      "(layers named with the prefix, time = first layer marker) through the active camera, without rendering, and reports the spread per block of " +
      "10 consecutive words (floors on a 1080x1920 frame: 150 px in x, 250 px in y; 120 px in x when a block holds a wide word), consecutive words " +
      "on the same spot and size, the number of framings and words outside the safe zone. pass=false lists what to move.",
    {
      compName: z.string().optional(),
      compIndex: z.coerce.number().int().optional(),
      namePrefix: z.string().optional().describe("Layers whose name starts with this (default 'Palavra ')."),
      layerNames: z.array(z.string()).optional().describe("Exact layer names instead of the prefix."),
      blockSize: z.number().int().min(2).max(40).optional().default(10),
      includeRows: z.boolean().optional().default(false).describe("Return the table of every word (id, frame, cx, cy, inkW, inkH).")
    },
    async (p) => {
      try {
        const res = await router.dispatch("after-effects", "ae.words.measure", { compName: p.compName, compIndex: p.compIndex, namePrefix: p.namePrefix, layerNames: p.layerNames }, { undoGroup: "MCP: Measure landings", timeoutMs: 180000 });
        const d = res.data as { compName: string; width: number; height: number; rows: import("../../media/landing.js").LandingRow[] };
        const { landingReport } = await import("../../media/landing.js");
        const rep = landingReport(d.rows ?? [], { width: d.width, height: d.height, blockSize: p.blockSize });
        return formatSuccessResponse({ compName: d.compName, frame: [d.width, d.height], ...rep, ...(p.includeRows ? { rows: d.rows } : {}) });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_audit_camera",
    "Lyric-video camera gate, part 2: samples the active camera frame by frame (world position and view direction, parents and expressions " +
      "included) and reports stretches where it stands still for 0.25 s or more, and jumps that are not declared cuts. " +
      "A motion piece with a 3D camera should return pass=true before it is rendered.",
    {
      compName: z.string().optional(),
      compIndex: z.coerce.number().int().optional(),
      from: z.number().min(0).optional(),
      to: z.number().positive().optional(),
      stepFrames: z.number().int().min(1).max(10).optional().default(1),
      minStaticSeconds: z.number().positive().optional().default(0.25),
      cuts: z.array(z.number().min(0)).optional().describe("Times of the declared hidden cuts (a jump there is expected).")
    },
    async (p) => {
      try {
        const res = await router.dispatch("after-effects", "ae.camera.trace", { compName: p.compName, compIndex: p.compIndex, from: p.from, to: p.to, stepFrames: p.stepFrames }, { undoGroup: "MCP: Audit camera", timeoutMs: 300000 });
        const d = res.data as { compName: string; fps: number; stepFrames: number; samples: import("../../media/landing.js").CameraSample[] };
        const { cameraReport } = await import("../../media/landing.js");
        return formatSuccessResponse({ compName: d.compName, fps: d.fps, stepFrames: d.stepFrames, ...cameraReport(d.samples ?? [], { minStatic: p.minStaticSeconds, cuts: p.cuts }) });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_text_ring",
    "A line of text as a ring of standing letters in 3D (text on a circular path with per-character 3D). With `times` (one per word) the ring " +
      "spins so that each word is in front at its time, arriving exactly on it; otherwise spinDegreesPerSecond gives a constant spin. " +
      "Returns the angle of every word. First run: check a frame and calibrate standAngle / frontOffsetDegrees / direction.",
    {
      compName: z.string().optional(),
      compIndex: z.coerce.number().int().optional(),
      text: z.string().min(1).describe("The whole line; words are split on spaces."),
      times: z.array(z.number().min(0)).optional().describe("Time of each word, in order (seconds of the comp)."),
      spinDegreesPerSecond: z.number().optional(),
      radius: z.number().positive().optional().describe("px (default 60 % of the comp width)."),
      arcDegrees: z.number().min(30).max(360).optional().default(300).describe("Arc the line fills when fit is on."),
      fit: z.boolean().optional().default(true).describe("Resize the font so the line fills arcDegrees."),
      font: z.string().optional(),
      fontSize: z.number().positive().optional(),
      color: z.string().optional().describe("'#RRGGBB' (default white)."),
      upperCase: z.boolean().optional().default(true),
      center: z.array(z.number()).length(3).optional().describe("World position of the ring centre [x, y, z]."),
      standAngle: z.number().optional().describe("Per-character X rotation that stands the letters up (default -90)."),
      frontOffsetDegrees: z.number().optional().describe("Added to every spin angle: which point of the ring faces the camera (default 180, measured live for a camera on -z)."),
      direction: z.enum(["cw", "ccw"]).optional().default("cw"),
      name: z.string().optional()
    },
    async (p) => {
      try {
        const params = { ...p, color: p.color ? hexToAe(p.color) : undefined };
        const res = await router.dispatch("after-effects", "ae.text.ring", params, { undoGroup: "MCP: Text ring" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_create_lower_third",
    "Recipe: lower third in one call — name + role in the brand fonts, a box that resizes to the text and an accent bar " +
      "(expressions on sourceRectAtTime), eased entrance and exit, transparent comp. Then audited (ae_audit_motion); with " +
      "mogrtPath, exported as .mogrt with Nome/Funcao fields for pr_insert_mogrt.",
    { ...KitShape, name: z.string().describe("e.g. 'Junior Rocha'."), role: z.string().optional(), scale: z.number().positive().optional() },
    async (params) => {
      try {
        return await runRecipe("ae.recipe.lowerThird", params, { name: params.name, role: params.role, scale: params.scale }, 1.6);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_create_title_card",
    "Recipe: title card in one call — kicker in the label font and accent colour, title whose words rise and fade in " +
      "(text animator by words), an accent line that draws in, brand background (background: false for transparent). Audited; optional .mogrt.",
    {
      ...KitShape,
      title: z.string(),
      kicker: z.string().optional(),
      titleSize: z.number().positive().optional().describe("Title size at 1080 px (default 110)."),
      background: z.boolean().optional()
    },
    async (params) => {
      try {
        return await runRecipe("ae.recipe.titleCard", params, { title: params.title, kicker: params.kicker, titleSize: params.titleSize, background: params.background }, 2.0);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_create_counter",
    "Recipe: animated number in one call — counts from → to with a strong ease (slider 'Valor' + Source Text expression), " +
      "prefix/suffix, decimals, Brazilian separators by default (1.234,5), label under it, small scale pop. Audited; optional .mogrt with Valor and Legenda.",
    {
      ...KitShape,
      to: z.number(),
      from: z.number().optional(),
      decimals: z.number().int().min(0).max(4).optional(),
      prefix: z.string().optional(),
      suffix: z.string().optional(),
      thousands: z.string().optional().describe("Thousands separator (default '.')."),
      decimal: z.string().optional().describe("Decimal separator (default ',')."),
      label: z.string().optional(),
      countSeconds: z.number().positive().optional(),
      numberSize: z.number().positive().optional(),
      background: z.boolean().optional()
    },
    async (params) => {
      try {
        const { to, from, decimals, prefix, suffix, thousands, decimal, label, countSeconds, numberSize, background } = params;
        return await runRecipe(
          "ae.recipe.counter",
          params,
          { to, from, decimals, prefix, suffix, thousands, decimal, label, countSeconds, numberSize, background },
          Math.max(2.6, (countSeconds ?? 2.2) + 0.4)
        );
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_create_logo_reveal",
    "Recipe: logo reveal in one call — an accent circle grows behind, the logo (png/ai/psd) scales in with a strong ease " +
      "and holds still for the last second or more; brand background. For a stroke-drawn reveal of a vector logo use " +
      "ae_import_vector_as_shapes + Trim Paths instead. Audited.",
    {
      ...KitShape,
      logoPath: z.string(),
      logoWidthPct: z.number().min(5).max(90).optional().describe("Logo width as % of the comp (default 40)."),
      keepCircle: z.boolean().optional(),
      background: z.boolean().optional()
    },
    async (params) => {
      try {
        return await runRecipe(
          "ae.recipe.logoReveal",
          params,
          { logoPath: params.logoPath, logoWidthPct: params.logoWidthPct, keepCircle: params.keepCircle, background: params.background },
          1.8
        );
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_create_transition",
    "Recipe: transition kit in one call — scene A → scene B (two placeholder precomps to replace) with one move in the " +
      "brand colours: wipe (accent band crosses the frame), circle (accent circle covers and uncovers), push (A out, " +
      "B in), zoom (A zooms and blurs out, B settles in) or fade. Strong eases, motion blur, markers at the start and " +
      "end of the move. Audited. Use between two clips in Premiere or as a template.",
    {
      ...KitShape,
      style: z.enum(["wipe", "circle", "push", "zoom", "fade"]).optional().describe("Default wipe."),
      transitionSeconds: z.number().min(0.2).max(4).optional().describe("Length of the move (default 0.8 s)."),
      angle: z.number().min(-45).max(45).optional().describe("wipe: band angle in degrees (default 12)."),
    },
    async (params) => {
      try {
        const td = params.transitionSeconds ?? 0.8;
        const dur = params.duration ?? Math.max(2, td + 2);
        return await runRecipe(
          "ae.recipe.transition",
          params,
          { style: params.style, transitionSeconds: params.transitionSeconds, angle: params.angle },
          // a third into the move: mid-move the circle/band covers the whole frame and the preview shows one colour
          (dur - td) / 2 + td * 0.3
        );
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_get_layers",
    "List all layers in an After Effects composition (1-based index, name, type, timing, 3D status, parent, effect count).",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.layer.list", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_create_layer",
    "Create a new Text, Solid, Adjustment, Null, Camera, Light, or empty Shape layer in an After Effects composition.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      layerType: z.enum(["text", "solid", "adjustment", "null", "camera", "light", "shape"]).default("text"),
      name: z.string().optional(),
      text: z.string().optional().describe("Text string when layerType='text'."),
      boxSize: z.array(z.number().positive()).length(2).optional().describe("Optional [width, height] for box text."),
      fontSize: z.number().positive().optional().default(72),
      font: z.string().optional().describe("PostScript font name."),
      fillColor: NormalizedColorSchema.optional(),
      tracking: z.number().optional(),
      justification: z.enum(["left", "center", "right"]).optional().describe("Text alignment (After Effects defaults to left)."),
      leading: z.number().positive().optional().describe("Line spacing in px (turns auto leading off)."),
      color: NormalizedColorSchema.optional().describe("Solid color [r,g,b] in 0..1 when layerType='solid'."),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      duration: z.number().positive().optional(),
      position: z.array(z.number()).optional().describe("[x, y] or [x, y, z] position."),
      inPoint: z.number().optional(),
      outPoint: z.number().optional(),
      threeDLayer: z.boolean().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.layer.create", params, {
          undoGroup: `MCP: Create AE ${params.layerType} Layer`
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_organize_project",
    "Organise an After Effects project without changing the picture: root items into folders by type (01 Comps, " +
      "02 Pre-comps, 03 Midia, 04 Audio, 05 Solidos; existing folders untouched), label colours by layer role (text " +
      "yellow, shape blue, footage aqua, pre-comp sandstone, null/control purple, adjustment lavender, audio sea foam, " +
      "camera/light orange) and names for layers left with default names (null -> CTRL <child>, shape -> its group name, " +
      "pre-comp -> its comp). Also lists fill/outline pairs that should be one shape layer. apply: false (default) only reports.",
    {
      compName: z.string().optional().describe("Only this comp for labels and names (default: every comp)."),
      compIndex: z.number().int().positive().optional(),
      apply: z.boolean().optional().default(false)
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.organize", params, { undoGroup: "MCP: Organize project", timeoutMs: 60000 });
        const d = (res.data || {}) as Record<string, unknown>;
        if (params.compName || params.compIndex) {
          try {
            const rr = await router.dispatch("after-effects", "ae.shapes.redundant", { compName: params.compName, compIndex: params.compIndex }, { timeoutMs: 30000 });
            d.splitFillStroke = ((rr.data || {}) as { pairs?: unknown[] }).pairs ?? [];
          } catch {
            /* older panel */
          }
        }
        if (!params.apply) d.next = "Call again with apply: true to move, label and rename.";
        return formatSuccessResponse(d);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_create_shape_layer",
    "Create a parametric or custom Bezier vector Shape Layer in After Effects. Fill and stroke go in the SAME layer, each " +
      "with its own colour, opacity and blend mode (never one layer for the fill and another for the outline); optional Trim Paths " +
      "on the outline only.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      name: z.string().optional().default("Shape Layer 1"),
      groupName: z.string().optional().default("Shape Group 1"),
      shapeType: z.enum(["rectangle", "ellipse", "polystar", "path"]).default("rectangle"),
      size: z.array(z.number().positive()).length(2).optional().default([400, 400]),
      roundness: z.number().min(0).optional().default(0),
      points: z.number().int().min(3).optional().describe("Star/Polygon points."),
      outerRadius: z.number().positive().optional(),
      innerRadius: z.number().positive().optional(),
      vertices: z.array(z.array(z.number()).length(2)).optional().describe("Bezier vertices [[x,y], ...] when shapeType='path'."),
      inTangents: z.array(z.array(z.number()).length(2)).optional(),
      outTangents: z.array(z.array(z.number()).length(2)).optional(),
      closed: z.boolean().optional().default(true),
      fillColor: NormalizedColorSchema.optional(),
      fillOpacity: z.number().min(0).max(100).optional(),
      strokeColor: NormalizedColorSchema.optional(),
      strokeWidth: z.number().min(0).optional(),
      strokeOpacity: z.number().min(0).max(100).optional(),
      fillBlendMode: BlendModeSchema.optional(),
      strokeBlendMode: BlendModeSchema.optional(),
      lineCap: z.number().int().min(1).max(3).optional().describe("1 butt, 2 round, 3 projecting."),
      lineJoin: z.number().int().min(1).max(3).optional().describe("1 miter, 2 round, 3 bevel."),
      paintOrder: z
        .enum(["strokeOverFill", "fillOverStroke"])
        .optional()
        .default("strokeOverFill")
        .describe("strokeOverFill (default) shows the whole stroke width; fillOverStroke hides its inner half."),
      trimTarget: z
        .enum(["stroke", "all"])
        .optional()
        .default("stroke")
        .describe("With fill + stroke + trimPaths: 'stroke' (default) draws on only the outline (its own group in the same layer); 'all' trims the fill too."),
      trimPaths: z
        .object({
          start: z.number().min(0).max(100).optional(),
          end: z.number().min(0).max(100).optional(),
          offset: z.number().optional()
        })
        .optional(),
      position: z.array(z.number()).optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.layer.createShape", params, {
          undoGroup: "MCP: Create Shape Layer"
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_modify_layer",
    "Update layer transform (position, scale, rotation, opacity, anchorPoint), timing (inPoint, outPoint, startTime, stretch), parenting, 3D state, motionBlur, or duplicate/delete a layer in After Effects.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      layerIndex: z.number().int().positive().optional().describe("1-based layer index."),
      layerName: z.string().optional().describe("Layer name (if layerIndex omitted)."),
      operation: z.enum(["update", "duplicate", "delete"]).optional().default("update"),
      newName: z.string().optional(),
      enabled: z.boolean().optional(),
      solo: z.boolean().optional(),
      locked: z.boolean().optional(),
      threeDLayer: z.boolean().optional(),
      motionBlur: z.boolean().optional(),
      inPoint: z.number().optional(),
      outPoint: z.number().optional(),
      startTime: z.number().optional(),
      stretch: z.number().optional(),
      parentLayerIndex: z.number().int().min(0).optional().describe("1-based parent layer index, or 0 to unparent."),
      position: z.array(z.number()).optional(),
      scale: z.array(z.number()).optional(),
      rotation: z.number().optional(),
      opacity: z.number().min(0).max(100).optional(),
      anchorPoint: z.array(z.number()).optional(),
      blendMode: z
        .string()
        .optional()
        .describe("Blending mode in camelCase: normal, multiply, screen, overlay, softLight, hardLight, add, colorDodge, colorBurn, darken, lighten, difference, exclusion, hue, saturation, color, luminosity, linearLight, vividLight, pinLight, hardMix, linearBurn, darkerColor, lighterColor, subtract, divide..."),
      adjustmentLayer: z.boolean().optional(),
      trackMatte: z
        .object({
          type: z.enum(["alpha", "alphaInverted", "luma", "lumaInverted", "none"]).default("alpha"),
          matteLayerIndex: z.number().int().positive().optional(),
          matteLayerName: z.string().optional()
        })
        .optional()
        .describe("Use another layer as track matte (AE 2023+ any layer; older versions use the layer directly above).")
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.layer.modify", params, {
          undoGroup: `MCP: Modify Layer (${params.operation})`
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_get_property_tree",
    "Universal Property Navigator: Recursively inspect all PropertyGroups and Properties on an After Effects layer (Transform, Effects, Masks, Vector Contents, Text Animators, Camera/Light Options) returning exact matchNames and values.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      layerIndex: z.number().int().positive().optional(),
      layerName: z.string().optional(),
      rootPath: z
        .array(z.union([z.string(), z.number().int().positive()]))
        .optional()
        .describe("Optional starting property path (e.g. ['ADBE Effect Parade'])."),
      maxDepth: z.number().int().min(1).max(6).optional().default(3)
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.anim.getPropertyTree", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_set_property",
    "Set the static value of any property or deep sub-property (effect parameter, shape transform, mask feather, text property, 3D material) by its propertyPath.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      layerIndex: z.number().int().positive().optional(),
      layerName: z.string().optional(),
      propertyPath: z
        .array(z.union([z.string(), z.number().int().positive()]))
        .min(1)
        .describe("Path of matchNames, display names, or 1-based indices (e.g. ['ADBE Transform Group', 'ADBE Opacity'] or ['Position'])."),
      value: z.unknown().describe("Value to set (number, [x,y], [r,g,b], boolean, etc.).")
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.anim.setProperty", params, {
          undoGroup: "MCP: Set AE Property"
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_set_keyframes",
    "Add or replace multiple keyframes on any After Effects property with support for Linear, Hold, and Bezier (easeIn, easeOut, easeInOut) temporal interpolation.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      layerIndex: z.number().int().positive().optional(),
      layerName: z.string().optional(),
      propertyPath: z
        .array(z.union([z.string(), z.number().int().positive()]))
        .min(1)
        .describe("Property path (e.g. ['ADBE Transform Group', 'ADBE Position'] or ['Scale'])."),
      clearExisting: z.boolean().optional().default(false).describe("Remove existing keyframes before adding."),
      keyframes: z
        .array(
          z.object({
            time: z.number().describe("Time in seconds."),
            value: z.unknown().describe("Keyframe value (number, [x,y], [x,y,z], [r,g,b,a])."),
            easing: z.enum(["linear", "hold", "easeIn", "easeOut", "easeInOut", "bezier"]).optional().default("easeInOut"),
            influence: z.number().min(0.1).max(100).optional().default(66).describe("Bezier temporal ease influence % (0.1 - 100)."),
            influenceIn: z.number().min(0.1).max(100).optional().describe("Incoming influence % (overrides easing/influence)."),
            influenceOut: z.number().min(0.1).max(100).optional().describe("Outgoing influence % (overrides easing/influence)."),
            speedIn: z.number().optional().describe("Incoming speed (units/second); 0 = flat ease."),
            speedOut: z.number().optional().describe("Outgoing speed (units/second); 0 = flat ease."),
            spatial: z
              .enum(["linear", "autoBezier", "continuous"])
              .optional()
              .describe("Spatial interpolation for position-like properties (motion path shape)."),
            roving: z.boolean().optional().describe("Roving key: timing smoothed between neighbours.")
          })
        )
        .min(1)
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.anim.setKeyframes", params, {
          undoGroup: "MCP: Set Keyframes"
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_set_expression",
    "Apply, update, or disable an After Effects expression on any property and automatically validate `expressionError`.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      layerIndex: z.number().int().positive().optional(),
      layerName: z.string().optional(),
      propertyPath: z.array(z.union([z.string(), z.number().int().positive()])).min(1),
      expression: z.string().describe("JavaScript expression (e.g. 'wiggle(3, 25)'). Pass empty string to remove."),
      enabled: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.anim.setExpression", params, {
          undoGroup: "MCP: Set Expression"
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_list_effects",
    "Search every effect installed in this After Effects (native and third-party) by name, matchName or category. " +
      "Returns matchNames to use with ae_apply_effect. Display names follow the app's language; matchNames do not.",
    {
      search: z.string().optional().describe("Words to look for, e.g. 'blur', 'glow', 'Sapphire'. Accents and case are ignored."),
      category: z.string().optional().describe("Filter by category, e.g. 'Blur & Sharpen', 'Distort', 'Generate'."),
      includeInternal: z.boolean().optional().default(false).describe("Include hidden effects that have no category."),
      limit: z.number().int().positive().max(2000).optional().default(200),
      refresh: z.boolean().optional().default(false).describe("Re-read the list from After Effects (after installing plugins).")
    },
    async ({ search, category, includeInternal, limit, refresh }) => {
      try {
        const all = await loadAeEffects(router, refresh);
        return formatSuccessResponse(queryEffects(all, { search, category, includeInternal, limit }));
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_apply_effect",
    "Apply any installed effect (native or third-party) to a layer by matchName or display name and set its parameters. " +
      "Returns every parameter of the new effect (name, matchName, value, range) and lists parameters it could not set. " +
      "Animate parameters afterwards with ae_set_keyframes, propertyPath ['ADBE Effect Parade', '<effect name>', '<parameter>'].",
    {
      ...LayerTarget,
      effectMatchNameOrName: z
        .string()
        .describe("Effect matchName (recommended, e.g. 'ADBE Gaussian Blur 2', 'ADBE Glo2') or display name. Find them with ae_list_effects."),
      effectCustomName: z.string().optional().describe("Name for this effect instance in Effect Controls."),
      properties: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Parameter name or matchName → value, e.g. { 'Blurriness': 35 } or { 'ADBE Gaussian Blur 2-0001': 35 }.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.effect.apply", params, {
          undoGroup: `MCP: Apply Effect ${params.effectMatchNameOrName}`
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(await withEffectSuggestions(router, err, params.effectMatchNameOrName));
      }
    }
  );

  server.tool(
    "ae_manage_effect",
    "List, describe, enable/disable, rename, duplicate, reorder or remove effects already on an After Effects layer.",
    {
      ...LayerTarget,
      operation: z.enum(["list", "describe", "enable", "disable", "rename", "duplicate", "move", "remove"]).default("list"),
      effectIndex: z.number().int().positive().optional().describe("1-based position in Effect Controls."),
      effectName: z.string().optional().describe("Effect instance name or matchName (when effectIndex is omitted)."),
      newName: z.string().optional().describe("For rename / duplicate."),
      newIndex: z.number().int().positive().optional().describe("For move: new 1-based position."),
      includeParameters: z.boolean().optional().default(false).describe("For list: include every parameter value.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.effect.manage", params, {
          undoGroup: `MCP: Effect ${params.operation}`
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_list_presets",
    "Find After Effects animation presets (.ffx): the built-in Presets folder, every 'User Presets' folder and any extra folders.",
    {
      search: z.string().optional().describe("Words to look for in the preset name or category, e.g. 'typewriter', 'fade'."),
      folders: z.array(z.string()).optional().describe("Extra absolute folders to scan for .ffx files."),
      limit: z.number().int().positive().max(2000).optional().default(200)
    },
    async ({ search, folders, limit }) => {
      try {
        const res = await router.dispatch("after-effects", "ae.preset.list", { folders: folders || [], limit: 5000 }, { timeoutMs: 60000 });
        const data = res.data as { roots: string[]; presets: Array<{ name: string; category: string; path: string }> };
        const tokens = normalizeText(search || "").split(/\s+/).filter(Boolean);
        const matched = data.presets.filter((p) => {
          const hay = normalizeText(`${p.name} ${p.category}`);
          return tokens.every((t) => hay.includes(t));
        });
        return formatSuccessResponse({
          roots: data.roots,
          installed: data.presets.length,
          matched: matched.length,
          truncated: matched.length > limit,
          presets: matched.slice(0, limit)
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_export_mogrt",
    "Turn a comp into a Motion Graphics template for Premiere: expose properties in Essential Graphics (text " +
      "layers' Source Text by default; also colours, sliders, checkboxes) under friendly names, and export the " +
      ".mogrt. Save the project first. Place it in Premiere with pr_insert_mogrt and fill it by those names.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      outputPath: z.string().describe("Absolute path of the .mogrt to write."),
      templateName: z.string().optional(),
      allowLocalFonts: z.boolean().optional().describe("Export even with fonts not from Adobe Fonts (After Effects asks for an OK click)."),
      properties: z
        .array(
          z.object({
            layerName: z.string().optional(),
            layerIndex: z.number().int().positive().optional(),
            propertyPath: z
              .array(z.union([z.string(), z.number().int().positive()]))
              .optional()
              .describe("Default: Source Text. E.g. ['ADBE Effect Parade', 'Farbe', 'ADBE Fill-0002'] for a Fill colour."),
            name: z.string().optional().describe("Name shown in Premiere (default: the layer name).")
          })
        )
        .min(1)
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.mogrt.export", params, { timeoutMs: 70000, undoGroup: "MCP: Export MOGRT" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_apply_preset",
    "Apply an animation preset (.ffx) to one layer. Use the full path from ae_list_presets (or an exact preset name). " +
      "Presets key from the current time: pass time (seconds) to start the animation there. Returns the effects, text " +
      "animators and keyframed properties the preset added.",
    {
      ...LayerTarget,
      time: z.number().min(0).optional().describe("Start time in seconds (moves the time indicator first)."),
      presetPath: z.string().optional().describe("Absolute path to the .ffx file."),
      presetName: z.string().optional().describe("Exact preset name, searched in the preset folders when presetPath is omitted."),
      folders: z.array(z.string()).optional().describe("Extra folders to search for presetName.")
    },
    async (params) => {
      try {
        if (!params.presetPath && !params.presetName) {
          throw new Error("Give presetPath or presetName.");
        }
        const res = await router.dispatch("after-effects", "ae.preset.apply", params, {
          undoGroup: "MCP: Apply Preset",
          timeoutMs: 60000
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_add_text_animator",
    "Add a text animator to a text layer: animated properties (position, scale, rotation, opacity, tracking, blur, colors), " +
      "a range selector (start/end/offset, based on characters/words/lines, shape, ease high/low, random order) and an optional " +
      "keyframed reveal of the selector. Typical reveal: properties {opacity: 0, position: [0, 40]}, animate offset from 0 to 100.",
    {
      ...LayerTarget,
      name: z.string().optional().describe("Animator name."),
      properties: z
        .object({
          position: z.array(z.number()).optional().describe("Offset [x, y] or [x, y, z] in pixels."),
          anchorPoint: z.array(z.number()).optional(),
          scale: z.array(z.number()).optional().describe("[x, y] or [x, y, z] percent."),
          skew: z.number().optional(),
          rotation: z.number().optional().describe("Degrees."),
          opacity: z.number().min(0).max(100).optional(),
          fillColor: NormalizedColorSchema.optional(),
          strokeColor: NormalizedColorSchema.optional(),
          tracking: z.number().optional(),
          blur: z.array(z.number()).optional().describe("[x, y] blur in pixels.")
        })
        .describe("Values the selected characters move to (the animator's target state)."),
      selector: z
        .object({
          start: z.number().optional(),
          end: z.number().optional(),
          offset: z.number().optional(),
          basedOn: z.enum(["characters", "charactersExcludingSpaces", "words", "lines"]).optional(),
          shape: z.enum(["square", "rampUp", "rampDown", "triangle", "round", "smooth"]).optional(),
          easeHigh: z.number().min(-100).max(100).optional(),
          easeLow: z.number().min(-100).max(100).optional(),
          randomizeOrder: z.boolean().optional()
        })
        .optional(),
      animate: z
        .object({
          property: z.enum(["start", "end", "offset"]),
          from: z.number(),
          to: z.number(),
          startTime: z.number().optional().describe("Seconds; defaults to the layer in-point."),
          duration: z.number().positive().optional().default(1),
          easing: z.enum(["linear", "ease"]).optional().default("ease"),
          influence: z.number().min(0.1).max(100).optional().default(75)
        })
        .optional()
        .describe("Keyframes the selector so the effect sweeps across the text.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.text.addAnimator", params, {
          undoGroup: "MCP: Add Text Animator"
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_add_mask",
    "Add a mask to a layer: rectangle, ellipse or a custom path (layer coordinates, origin at the layer's top-left), " +
      "with mode, feather, expansion, opacity and inversion.",
    {
      ...LayerTarget,
      shape: z.enum(["rectangle", "ellipse", "path"]).optional().default("rectangle"),
      rect: z.array(z.number()).length(4).optional().describe("[left, top, width, height] in layer pixels; defaults to the whole layer."),
      vertices: z.array(z.array(z.number()).length(2)).optional().describe("For shape 'path': list of [x, y] points."),
      inTangents: z.array(z.array(z.number()).length(2)).optional(),
      outTangents: z.array(z.array(z.number()).length(2)).optional(),
      closed: z.boolean().optional().default(true),
      mode: z.enum(["none", "add", "subtract", "intersect", "lighten", "darken", "difference"]).optional().default("add"),
      feather: z.union([z.number(), z.array(z.number()).length(2)]).optional(),
      expansion: z.number().optional(),
      opacity: z.number().min(0).max(100).optional(),
      inverted: z.boolean().optional(),
      name: z.string().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.layer.addMask", params, { undoGroup: "MCP: Add Mask" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_render_queue",
    "Add a composition to the After Effects Render Queue, configure templates and output path, and optionally start rendering or send to Adobe Media Encoder.",
    {
      compName: z.string().optional(),
      compIndex: z.number().int().positive().optional(),
      outputPath: z.string().describe("Absolute path for rendered output file."),
      renderSettingsTemplate: z.string().optional(),
      outputModuleTemplate: z.string().optional(),
      queueInAME: z.boolean().optional().default(false).describe("Queue in Adobe Media Encoder instead of blocking AE UI."),
      startRenderImmediately: z.boolean().optional().default(false),
      overwrite: z
        .boolean()
        .optional()
        .default(true)
        .describe("An existing file at the output path is replaced (default). false: refuse with OUTPUT_EXISTS. Either way After Effects never stops on its 'Overwrite?' dialog."),
      engine: z
        .enum(["auto", "app", "aerender"])
        .optional()
        .default("auto")
        .describe(
          "Who renders. auto (default): aerender, a separate After Effects process, when the project is saved with no unsaved changes, so the app stays usable during the render; otherwise inside the app. app: always inside the app (blocks it). aerender: only aerender (error if the project has unsaved changes)."
        )
    },
    async (params) => {
      try {
        const wantsRun = params.startRenderImmediately === true || params.queueInAME === true;
        if (params.overwrite === false && params.outputPath && fs.existsSync(params.outputPath)) {
          throw Object.assign(new Error(`Output file already exists: ${params.outputPath}. Choose another outputPath or pass overwrite: true.`), {
            code: "OUTPUT_EXISTS"
          });
        }
        // 0. Outside the app when possible: the open After Effects stays free during the render (22/11/2026: the app
        // looked frozen for the whole render and once froze for real).
        let engineNote: string | undefined;
        if (params.engine !== "app" && wantsRun && !params.queueInAME) {
          type RenderInfo = { compName?: string; projectPath?: string | null; dirty?: boolean; appPackage?: string | null };
          let info: RenderInfo | null = null;
          try {
            const ri = await router.dispatch("after-effects", "ae.render.info", { compName: params.compName, compIndex: params.compIndex }, { timeoutMs: 20000 });
            info = (ri.data || {}) as RenderInfo;
          } catch (errInfo) {
            if (params.engine === "aerender") throw errInfo;
            engineNote = `rendered in the app: ${(errInfo as Error).message.slice(0, 160)}`;
          }
          if (info) {
            const exe = info.appPackage ? aerenderPath(info.appPackage) : "";
            const hasExt = path.extname(params.outputPath) !== "";
            const choice = chooseRenderEngine({
              engine: params.engine,
              wantsRun,
              queueInAME: false,
              projectPath: info.projectPath ?? null,
              dirty: info.dirty === true,
              aerenderExists: !!exe && fs.existsSync(exe) && hasExt
            });
            if (choice.engine === "aerender" && info.projectPath && info.compName) {
              let replacedExisting = false;
              if (fs.existsSync(params.outputPath)) {
                fs.rmSync(params.outputPath, { force: true });
                replacedExisting = true;
              }
              fs.mkdirSync(path.dirname(params.outputPath), { recursive: true });
              const logPath = path.join(os.tmpdir(), "jradb-aerender", `${path.basename(params.outputPath)}.${Date.now()}.log`);
              const args = buildAerenderArgs({
                projectPath: info.projectPath,
                compName: info.compName,
                outputPath: params.outputPath,
                renderSettingsTemplate: params.renderSettingsTemplate,
                outputModuleTemplate: params.outputModuleTemplate
              });
              const { job } = startJob("render", () => runAerender({ exe, args, outputPath: params.outputPath, logPath }), `aerender ${path.basename(params.outputPath)}`);
              return formatSuccessResponse({
                engine: "aerender",
                compName: info.compName,
                projectPath: info.projectPath,
                outputPath: params.outputPath,
                replacedExisting,
                rendering: true,
                renderJobId: job.id,
                logPath,
                next: `Rendering in a separate After Effects process; the app stays usable. Poll media_job_status { jobId: "${job.id}" }.`
              });
            }
            engineNote = choice.reason ? `rendered in the app: ${choice.reason}` : undefined;
          }
        }
        // 1. Queue only: the output module may change the extension, so the real path comes back from After Effects.
        const res = await router.dispatch(
          "after-effects",
          "ae.render.queue",
          { ...params, startRenderImmediately: false, queueInAME: false },
          { timeoutMs: 60000 }
        );
        const d = (res.data || {}) as Record<string, unknown>;
        const finalPath = typeof d.outputPath === "string" ? d.outputPath : params.outputPath;
        // 2. An existing file would open "already exists. Overwrite?" and block the app until someone clicks.
        let replacedExisting = false;
        if (finalPath && fs.existsSync(finalPath)) {
          if (params.overwrite === false) {
            throw Object.assign(new Error(`Output file already exists: ${finalPath}. The item stays in the Render Queue, not started.`), {
              code: "OUTPUT_EXISTS"
            });
          }
          fs.rmSync(finalPath, { force: true });
          replacedExisting = true;
        }
        if (!wantsRun) return formatSuccessResponse({ ...d, replacedExisting });
        // 3. Start. A long render outlives the bridge timeout: it keeps running and is followed on disk.
        const startArgs = { queueInAME: params.queueInAME, startRenderImmediately: params.startRenderImmediately, renderQueueIndex: d.renderQueueIndex };
        try {
          const st = await router.dispatch("after-effects", "ae.render.start", startArgs, { timeoutMs: 120000 });
          const sd = (st.data || {}) as Record<string, unknown>;
          if (params.queueInAME && finalPath) {
            const job = watchRender(finalPath, `AME ${path.basename(finalPath)}`);
            return formatSuccessResponse({ ...d, ...sd, replacedExisting, renderJobId: job.id, next: `Poll media_job_status { jobId: "${job.id}" }: done when the file stops growing.` });
          }
          return formatSuccessResponse({ ...d, ...sd, replacedExisting, rendered: true, engine: "app", ...(engineNote ? { engineNote } : {}) });
        } catch (errStart) {
          const code = (errStart as { code?: string }).code;
          if (code === "ACTION_NOT_SUPPORTED") {
            // Older panel without ae.render.start: start through the script hatch.
            await router.dispatch(
              "after-effects",
              "ae.raw.executeExtendScript",
              { code: params.queueInAME ? `app.project.renderQueue.queueInAME(${params.startRenderImmediately ? "true" : "false"}); true` : "app.project.renderQueue.render(); true" },
              { timeoutMs: 120000 }
            );
            return formatSuccessResponse({ ...d, replacedExisting, rendered: true });
          }
          if ((code === "BRIDGE_TIMEOUT" || code === "APP_BUSY") && finalPath) {
            // After Effects writes a temporary .m4v/.aac pair and the final file only at the end.
            const job = watchRender(finalPath, `AE ${path.basename(finalPath)}`, { startTimeoutMs: 60 * 60 * 1000 });
            return formatSuccessResponse({
              ...d,
              replacedExisting,
              rendering: true,
              engine: "app",
              ...(engineNote ? { engineNote } : {}),
              renderJobId: job.id,
              next: `The render is still running in After Effects. Poll media_job_status { jobId: "${job.id}" }: done when the file stops growing. Other After Effects commands answer APP_BUSY until it ends.`
            });
          }
          throw errStart;
        }
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_execute_menu_command",
    "Execute any After Effects menu command by its menu string (resolved via `app.findMenuCommandId`) or numeric command ID.",
    {
      commandName: z.string().optional().describe("Exact menu command title (e.g. 'Easy Ease', 'Time-Reverse Keyframes', 'Purge All Memory and Disk Cache...')."),
      commandId: z.number().int().optional().describe("Numeric command ID if already known.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("after-effects", "ae.raw.executeMenuCommand", params, {
          undoGroup: "MCP: AE Menu Command"
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ae_execute_extendscript",
    "After Effects ExtendScript escape hatch: execute arbitrary ExtendScript (.jsx) code inside After Effects wrapped in an automatic Undo Group (`app.beginUndoGroup` / `app.endUndoGroup`), with dialogs suppressed, and JSON serializer. " +
      "Do not write app.beginUndoGroup/endUndoGroup yourself (the MCP already groups the script; if you do, they are tracked and closed for you, never left unbalanced). " +
      "Keep scripts short (one comp per call). Do not call app.project.save() here: save with ae_manage_project (operation 'save') " +
      "in its own call — a script that edited several comps and then saved froze After Effects on 13/11/2026 while Premiere held the project by Dynamic Link.",
    {
      code: z.string().describe("ExtendScript (ES3) code to evaluate in After Effects. Has full access to `app`, `app.project`, `CompItem`, `RenderQueue`, etc."),
      undoGroupName: z.string().optional().default("MCP Custom ExtendScript")
    },
    async ({ code, undoGroupName }) => {
      try {
        const res = await router.dispatch(
          "after-effects",
          "ae.raw.executeExtendScript",
          { code },
          { undoGroup: undoGroupName }
        );
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}
