import { downscaleBase64 } from "../../media/downscale.js";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../core/bridge-router.js";
import { buildImageToolResponse, formatErrorResponse, formatSuccessResponse } from "../../core/image-helper.js";
import { encodePng } from "../../core/png.js";
import { decodeTiff, histogramImage, imageStats } from "../../core/tiff.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Named tone curves (x,y pairs 0–255) for lr_tone_curve. */
export const TONE_CURVES: Record<string, Array<[number, number]>> = {
  linear: [[0, 0], [255, 255]],
  mediumContrast: [[0, 0], [64, 56], [128, 128], [192, 199], [255, 255]],
  strongContrast: [[0, 0], [64, 48], [128, 128], [192, 208], [255, 255]],
  fadedBlacks: [[0, 22], [64, 66], [128, 128], [192, 194], [255, 250]],
  matte: [[0, 30], [48, 52], [128, 128], [208, 206], [255, 240]],
  softHighlights: [[0, 0], [128, 128], [200, 196], [255, 244]],
  liftShadows: [[0, 0], [48, 60], [128, 134], [255, 255]]
};

/** Validates and flattens curve points into Lightroom's [x1, y1, x2, y2, …]. */
export function flattenCurve(points: Array<[number, number]>): number[] {
  if (points.length < 2) throw new Error("A tone curve needs at least 2 points.");
  const flat: number[] = [];
  let lastX = -1;
  for (const [x, y] of points) {
    if (![x, y].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) throw new Error(`Curve point (${x}, ${y}) is outside 0–255.`);
    if (x <= lastX) throw new Error("Curve points must have increasing x.");
    lastX = x;
    flat.push(Math.round(x), Math.round(y));
  }
  return flat;
}

const PhotoTargets = {
  ids: z.array(z.number().int()).optional().describe("Photo ids (localIdentifier) from lr_find_photos."),
  useSelection: z.boolean().optional().default(true).describe("Use the photos selected in Lightroom when no ids are given.")
};

export const DEVELOP_KEYS_HINT =
  "Common keys: Exposure2012 (-5..5), Contrast2012, Highlights2012, Shadows2012, Whites2012, Blacks2012 (-100..100), " +
  "Texture, Clarity2012, Dehaze, Vibrance, Saturation, Temperature (K), Tint, WhiteBalance ('As Shot'|'Auto'|'Custom'), " +
  "ParametricShadows/Darks/Lights/Highlights, HueAdjustmentRed…, SaturationAdjustmentOrange…, LuminanceAdjustmentBlue…, " +
  "ColorGradeShadowHue/Sat/Lum, ColorGradeMidtoneHue/Sat/Lum, ColorGradeHighlightHue/Sat/Lum, ColorGradeBlending, " +
  "Sharpness, SharpenRadius, SharpenDetail, SharpenEdgeMasking, LuminanceSmoothing, ColorNoiseReduction, " +
  "PostCropVignetteAmount/Midpoint/Feather/Roundness, GrainAmount/Size/Frequency, ConvertToGrayscale (true/false), " +
  "CropTop/Left/Bottom/Right (0..1), CropAngle, LensProfileEnable (1), AutoLateralCA (1).";

function tool(
  server: McpServer,
  router: BridgeRouter,
  name: string,
  description: string,
  shape: z.ZodRawShape,
  action: string,
  timeoutMs?: number
): void {
  server.tool(name, description, shape, async (params: Record<string, unknown>) => {
    try {
      const res = await router.dispatch("lightroom", action, params, { undoGroup: `MCP: ${name}`, timeoutMs });
      return formatSuccessResponse(res.data);
    } catch (err) {
      return formatErrorResponse(err);
    }
  });
}

type LrWheel = { hue?: number; saturation?: number; luminance?: number };

/** Friendly colour-panel names -> Lightroom develop keys (each key was applied and read back on 20/11/2026). */
export function buildLrColorSettings(p: {
  hsl?: Partial<Record<string, LrWheel>>;
  colorGrading?: { shadows?: LrWheel; midtones?: LrWheel; highlights?: LrWheel; global?: LrWheel; blending?: number; balance?: number };
  calibration?: { shadowTint?: number; red?: LrWheel; green?: LrWheel; blue?: LrWheel };
}): Record<string, number> {
  const out: Record<string, number> = {};
  const put = (key: string, v: number | undefined) => {
    if (typeof v === "number") out[key] = v;
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  for (const [colour, v] of Object.entries(p.hsl ?? {})) {
    if (!v) continue;
    put(`HueAdjustment${cap(colour)}`, v.hue);
    put(`SaturationAdjustment${cap(colour)}`, v.saturation);
    put(`LuminanceAdjustment${cap(colour)}`, v.luminance);
  }
  const g = p.colorGrading;
  if (g) {
    // shadows and highlights keep their Split Toning key names; midtones and global are ColorGrade keys
    put("SplitToningShadowHue", g.shadows?.hue);
    put("SplitToningShadowSaturation", g.shadows?.saturation);
    put("ColorGradeShadowLum", g.shadows?.luminance);
    put("SplitToningHighlightHue", g.highlights?.hue);
    put("SplitToningHighlightSaturation", g.highlights?.saturation);
    put("ColorGradeHighlightLum", g.highlights?.luminance);
    put("ColorGradeMidtoneHue", g.midtones?.hue);
    put("ColorGradeMidtoneSat", g.midtones?.saturation);
    put("ColorGradeMidtoneLum", g.midtones?.luminance);
    put("ColorGradeGlobalHue", g.global?.hue);
    put("ColorGradeGlobalSat", g.global?.saturation);
    put("ColorGradeGlobalLum", g.global?.luminance);
    put("ColorGradeBlending", g.blending);
    put("SplitToningBalance", g.balance);
  }
  const c = p.calibration;
  if (c) {
    put("ShadowTint", c.shadowTint);
    put("RedHue", c.red?.hue);
    put("RedSaturation", c.red?.saturation);
    put("GreenHue", c.green?.hue);
    put("GreenSaturation", c.green?.saturation);
    put("BlueHue", c.blue?.hue);
    put("BlueSaturation", c.blue?.saturation);
  }
  return out;
}

export function registerLightroomTools(server: McpServer, router: BridgeRouter): void {
  tool(
    server,
    router,
    "lr_get_catalog_info",
    "Lightroom Classic: catalog path, number of photos, current module, active sources (folders/collections) and the selected photos.",
    {},
    "lr.catalog.getInfo"
  );

  tool(
    server,
    router,
    "lr_find_photos",
    "Find photos in the Lightroom Classic catalog: from the selection, a folder, a collection or the whole catalog, filtered by " +
      "file name, keyword, minimum rating, flag and colour label. Returns id (localIdentifier), path, file name, rating, flag, " +
      "label, size, capture date and keywords.",
    {
      source: z.enum(["selection", "folder", "collection", "all"]).default("selection"),
      folderPath: z.string().optional().describe("Absolute folder path for source 'folder'."),
      includeSubfolders: z.boolean().optional().default(true),
      collection: z.string().optional().describe("Collection name for source 'collection'."),
      filenameContains: z.string().optional(),
      keyword: z.string().optional(),
      minRating: z.number().int().min(0).max(5).optional(),
      pick: z.enum(["picked", "rejected", "unflagged"]).optional(),
      label: z.enum(["red", "yellow", "green", "blue", "purple", "none"]).optional(),
      limit: z.number().int().positive().max(5000).optional().default(200)
    },
    "lr.photo.find",
    120000
  );

  tool(server, router, "lr_select_photos", "Select photos in Lightroom Classic (makes the first one the active photo).", { ids: z.array(z.number().int()).min(1) }, "lr.photo.select");

  tool(
    server,
    router,
    "lr_set_metadata",
    "Set rating, flag, colour label, title, caption, copyright and add/remove keywords on photos (one undo step).",
    {
      ...PhotoTargets,
      rating: z.number().int().min(0).max(5).optional(),
      pick: z.enum(["picked", "rejected", "unflagged"]).optional(),
      label: z.enum(["red", "yellow", "green", "blue", "purple", "none"]).optional(),
      title: z.string().optional(),
      caption: z.string().optional(),
      copyright: z.string().optional(),
      addKeywords: z.array(z.string()).optional(),
      removeKeywords: z.array(z.string()).optional()
    },
    "lr.photo.setMetadata"
  );

  tool(
    server,
    router,
    "lr_get_develop_settings",
    "Read the Develop settings of a photo (all, or only the listed keys).",
    { id: z.number().int().optional().describe("Photo id; default = active photo."), keys: z.array(z.string()).optional() },
    "lr.develop.getSettings"
  );

  tool(
    server,
    router,
    "lr_apply_develop_settings",
    "Apply Develop settings to photos without leaving the current module (non-destructive, one history step per photo). " + DEVELOP_KEYS_HINT,
    {
      ...PhotoTargets,
      settings: z.record(z.string(), z.unknown()).describe("Develop key → value."),
      historyName: z.string().optional().default("MCP")
    },
    "lr.develop.apply",
    300000
  );

  server.tool(
    "lr_color",
    "Colour panels of the Develop module by their own names (validated live on Lightroom Classic 16): the HSL / Color Mixer " +
      "(hue, saturation, luminance per colour), Color Grading (shadows, midtones, highlights and global wheels, blending, " +
      "balance) and Calibration (shadow tint and the red, green, blue primaries). Non-destructive; make a snapshot or a " +
      "virtual copy first (lr_create_snapshot). Values: HSL and calibration -100..100; grading hue 0..360, saturation 0..100, " +
      "luminance -100..100.",
    {
      ...PhotoTargets,
      hsl: z
        .record(
          z.enum(["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"]),
          z.object({ hue: z.number().min(-100).max(100).optional(), saturation: z.number().min(-100).max(100).optional(), luminance: z.number().min(-100).max(100).optional() })
        )
        .optional()
        .describe("e.g. { orange: { saturation: -10, luminance: 8 }, blue: { hue: -5 } }"),
      colorGrading: z
        .object({
          shadows: z.object({ hue: z.number().min(0).max(360).optional(), saturation: z.number().min(0).max(100).optional(), luminance: z.number().min(-100).max(100).optional() }).optional(),
          midtones: z.object({ hue: z.number().min(0).max(360).optional(), saturation: z.number().min(0).max(100).optional(), luminance: z.number().min(-100).max(100).optional() }).optional(),
          highlights: z.object({ hue: z.number().min(0).max(360).optional(), saturation: z.number().min(0).max(100).optional(), luminance: z.number().min(-100).max(100).optional() }).optional(),
          global: z.object({ hue: z.number().min(0).max(360).optional(), saturation: z.number().min(0).max(100).optional(), luminance: z.number().min(-100).max(100).optional() }).optional(),
          blending: z.number().min(0).max(100).optional(),
          balance: z.number().min(-100).max(100).optional()
        })
        .optional(),
      calibration: z
        .object({
          shadowTint: z.number().min(-100).max(100).optional(),
          red: z.object({ hue: z.number().min(-100).max(100).optional(), saturation: z.number().min(-100).max(100).optional() }).optional(),
          green: z.object({ hue: z.number().min(-100).max(100).optional(), saturation: z.number().min(-100).max(100).optional() }).optional(),
          blue: z.object({ hue: z.number().min(-100).max(100).optional(), saturation: z.number().min(-100).max(100).optional() }).optional()
        })
        .optional(),
      historyName: z.string().optional().default("MCP Cor")
    },
    async (params) => {
      try {
        const settings = buildLrColorSettings(params);
        if (Object.keys(settings).length === 0) throw new Error("Give hsl, colorGrading and/or calibration.");
        const { hsl: _h, colorGrading: _g, calibration: _c, ...rest } = params;
        const res = await router.dispatch("lightroom", "lr.develop.apply", { ...rest, settings }, { timeoutMs: 300000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "lr_tone_curve",
    "Point tone curve (Develop > Tone Curve, point mode) for the composite RGB or one channel: named curves " +
      "(linear, mediumContrast, strongContrast, fadedBlacks, matte, softHighlights, liftShadows) or your own points " +
      "[[x,y], …] in 0–255 with increasing x. Make a snapshot or virtual copy first (lr_create_snapshot).",
    {
      ...PhotoTargets,
      curve: z.enum(["linear", "mediumContrast", "strongContrast", "fadedBlacks", "matte", "softHighlights", "liftShadows"]).optional(),
      points: z.array(z.array(z.number()).length(2)).optional().describe("[[x, y], …] in 0–255, x increasing."),
      channel: z.enum(["rgb", "red", "green", "blue"]).optional().default("rgb"),
      historyName: z.string().optional().default("MCP Curva")
    },
    async (params) => {
      try {
        const pts = (params.points as Array<[number, number]> | undefined) ?? TONE_CURVES[params.curve ?? ""];
        if (!pts) throw new Error("Give curve (a named curve) or points.");
        const key = { rgb: "ToneCurvePV2012", red: "ToneCurvePV2012Red", green: "ToneCurvePV2012Green", blue: "ToneCurvePV2012Blue" }[params.channel ?? "rgb"];
        const settings: Record<string, unknown> = { [key]: flattenCurve(pts) };
        if ((params.channel ?? "rgb") === "rgb") settings.ToneCurveName2012 = "Custom";
        // The curve replaces the one already there (a look's matte curve, for instance): keep it to report and undo.
        let previous: unknown = null;
        try {
          const prev = await router.dispatch("lightroom", "lr.develop.getSettings", { id: params.ids?.[0], keys: [key] }, { timeoutMs: 60000 });
          previous = ((prev.data as { settings?: Record<string, unknown> })?.settings ?? {})[key] ?? null;
        } catch {
          previous = null;
        }
        const res = await router.dispatch(
          "lightroom",
          "lr.develop.apply",
          { ids: params.ids, useSelection: params.useSelection, settings, historyName: params.historyName },
          { timeoutMs: 300000 }
        );
        const prevFlat = Array.isArray(previous) ? (previous as number[]) : null;
        const wasLinear = !prevFlat || (prevFlat.length === 4 && prevFlat.join(",") === "0,0,255,255");
        return formatSuccessResponse({
          ...(res.data as Record<string, unknown>),
          previousCurve: prevFlat,
          warning: wasLinear
            ? undefined
            : "Replaced an existing custom curve (e.g. a look's lifted blacks): check lr_photo_stats for crushed shadows / clipped highlights; to go back, apply previousCurve as points."
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "lr_photo_stats",
    "Measure photos as developed: renders a small 8-bit TIFF of each (long edge 400 px, sRGB) and returns the luminance " +
      "histogram, mean RGB/luminance, percentiles, % clipped highlights and crushed shadows, warmth (R−B in the mid-tones) " +
      "and colourfulness — to check exposure and match a series objectively. Returns the first photo's histogram as an image.",
    {
      ...PhotoTargets,
      longEdge: z.number().int().min(64).max(2000).optional().default(400),
      bins: z.number().int().min(8).max(256).optional().default(32),
      includeImageContent: z.boolean().optional().default(true)
    },
    async (params) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lr_stats_"));
      try {
        const res = await router.dispatch(
          "lightroom",
          "lr.export",
          {
            ids: params.ids,
            useSelection: params.useSelection,
            folder: dir,
            format: "TIFF",
            bitDepth: 8,
            tiffCompression: "none",
            longEdge: params.longEdge,
            colorSpace: "sRGB",
            metadata: "copyrightOnly",
            collision: "rename"
          },
          { timeoutMs: 600000 }
        );
        const files = ((res.data as { files?: Array<{ id?: number; path?: string; ok?: boolean; error?: string }> })?.files ?? []);
        const photos = [];
        let firstHist: number[] | null = null;
        for (const f of files) {
          if (!f.ok || !f.path) {
            photos.push({ id: f.id, error: f.error ?? "not rendered" });
            continue;
          }
          const st = imageStats(decodeTiff(fs.readFileSync(f.path)), params.bins ?? 32);
          if (!firstHist) firstHist = st.histogram;
          photos.push({ id: f.id, ...st });
        }
        const summary = { count: photos.length, photos };
        if (!firstHist || params.includeImageContent === false) return formatSuccessResponse(summary);
        const png = encodePng(histogramImage(firstHist));
        return buildImageToolResponse(summary, { base64Data: png.toString("base64"), includeImageContent: true });
      } catch (err) {
        return formatErrorResponse(err);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  );

  tool(
    server,
    router,
    "lr_list_develop_presets",
    "List Develop presets (built-in and user) by folder; search by words.",
    { search: z.string().optional() },
    "lr.develop.listPresets"
  );

  tool(
    server,
    router,
    "lr_apply_develop_preset",
    "Apply a Develop preset (exact name from lr_list_develop_presets) to photos.",
    { ...PhotoTargets, presetName: z.string(), folder: z.string().optional().describe("Preset folder, when names repeat.") },
    "lr.develop.applyPreset",
    300000
  );

  tool(
    server,
    router,
    "lr_copy_develop_settings",
    "Copy the Develop settings of one photo to other photos (all settings, or only the listed keys) — like Sync.",
    { fromId: z.number().int(), ...PhotoTargets, keys: z.array(z.string()).optional() },
    "lr.develop.copySettings",
    300000
  );

  tool(
    server,
    router,
    "lr_sync_settings_groups",
    "Sync named GROUPS of Develop settings from one photo to others (Lightroom Classic 16 settings groups) — the way to carry edits that have no " +
      "parameter API. Main use: AI Blemish Removal (Remove > Distraction Removal > Blemishes): apply it once on a reference photo, then sync " +
      "group 'distractionRemovalBlemish' to the rest of the shoot. Other groups: distractionRemovalPeople, distractionRemovalReflections, " +
      "distractionRemovalSensorDust, manualRemove, masking, crop, basic, color, detail, effects, lensBlur. Snapshot the targets first.",
    { fromId: z.number().int(), ...PhotoTargets, groups: z.array(z.string()).min(1).describe("Group names from LrDevelopSettingsGroups.") },
    "lr.develop.syncGroups",
    300000
  );

  tool(
    server,
    router,
    "lr_create_snapshot",
    "Create a named Develop snapshot on photos (a restorable state of the edit).",
    { ...PhotoTargets, name: z.string() },
    "lr.develop.snapshot"
  );

  tool(
    server,
    router,
    "lr_auto_tone",
    "Run Auto Tone on one photo (switches Lightroom to the Develop module with that photo) and return the resulting settings.",
    { id: z.number().int().optional() },
    "lr.develop.autoTone",
    60000
  );

  tool(
    server,
    router,
    "lr_masks",
    "Local masks on one photo (Develop module): create an AI mask (subject, people, sky, background, objects, landscape), " +
      "a linear/radial gradient or a colour/luminance/depth range mask, and set its local sliders (Exposure, Temperature, " +
      "Tint, Contrast, Highlights, Shadows, Whites, Blacks, Clarity, Dehaze, Texture, Saturation, Sharpness…); then list, " +
      "adjust or delete masks. Work on a virtual copy or after lr_create_snapshot. AI masks take a few seconds.",
    {
      id: z.number().int().optional().describe("Photo id (default: the selected photo)."),
      operation: z.enum(["list", "create", "adjust", "delete"]).default("list"),
      maskType: z.enum(["aiSelection", "gradient", "radialGradient", "rangeMask", "brush"]).optional().describe("create: default aiSelection."),
      maskSubtype: z
        .enum(["subject", "people", "sky", "background", "objects", "landscape", "color", "luminance", "depth"])
        .optional()
        .describe(
          "aiSelection: subject/people/sky/background/objects/landscape; rangeMask: color/luminance/depth. For a person use 'subject' (tested): 'people' was not created through the SDK (Lightroom asks which detected person)."
        ),
      invert: z.boolean().optional().describe("create: invert the new mask (e.g. everything except the subject)."),
      adjustments: z
        .record(z.number())
        .optional()
        .describe("Local sliders, e.g. { Exposure: 0.4, Temperature: 10, Clarity: 15 } (the 'local_' prefix is added)."),
      maskId: z.string().optional(),
      maskName: z.string().optional().describe("e.g. 'Mask 1'."),
      maskIndex: z.number().int().min(1).optional(),
      waitSeconds: z.number().min(1).max(120).optional()
    },
    "lr.develop.mask",
    180000
  );

  tool(
    server,
    router,
    "lr_collections",
    "Collections: list all, create one (optionally inside a collection set), add or remove photos, or list a collection's photos.",
    {
      operation: z.enum(["list", "create", "add", "remove", "photos"]).default("list"),
      name: z.string().optional(),
      parentSet: z.string().optional(),
      ids: z.array(z.number().int()).optional()
    },
    "lr.collection.manage"
  );

  tool(
    server,
    router,
    "lr_import_photos",
    "Add image files to the catalog in place (no copy/move), optionally into a collection.",
    { paths: z.array(z.string()).min(1), collection: z.string().optional() },
    "lr.photo.import",
    300000
  );

  tool(
    server,
    router,
    "lr_export_photos",
    "Export photos (ids, selection or a collection) with their Develop edits: JPEG/TIFF/PSD/DNG/original, quality, long edge in pixels, " +
      "colour space, output sharpening, metadata and naming collisions. Returns the exported file paths.",
    {
      ...PhotoTargets,
      collection: z.string().optional(),
      folder: z.string().describe("Absolute destination folder."),
      format: z.enum(["JPEG", "TIFF", "PSD", "DNG", "ORIGINAL"]).default("JPEG"),
      quality: z.number().int().min(0).max(100).optional().default(85),
      longEdge: z.number().int().positive().optional().describe("Resize so the long edge is this many pixels (no enlargement)."),
      colorSpace: z.enum(["sRGB", "AdobeRGB", "ProPhotoRGB", "DisplayP3"]).optional().default("sRGB"),
      sharpen: z.enum(["none", "screen", "matte", "glossy"]).optional().default("screen"),
      sharpenAmount: z.enum(["low", "standard", "high"]).optional().default("standard"),
      metadata: z.enum(["all", "copyrightOnly", "copyrightAndContact", "allExceptCameraInfo"]).optional().default("all"),
      collision: z.enum(["rename", "overwrite", "skip"]).optional().default("rename"),
      fileNames: z
        .array(z.string())
        .optional()
        .describe("Output names without extension, one per photo in the order of ids (e.g. ['01_gespraech', '02_planung']).")
    },
    "lr.export",
    600000
  );

  server.tool(
    "lr_get_photo_preview",
    "Visual check: a JPEG preview of a photo with its current Develop edits (default: the active photo). " +
      "Falls back to a small export when Lightroom answers with no thumbnail or with a full-size placeholder " +
      "(common right after Auto Tone or on a new virtual copy); method 'export' forces that path.",
    {
      id: z.number().int().optional(),
      size: z.number().int().min(64).max(2048).optional().default(800),
      method: z.enum(["auto", "export"]).optional().default("auto")
    },
    async (params) => {
      try {
        const res = await router.dispatch("lightroom", "lr.preview", params, { timeoutMs: 60000 });
        const data = { ...((res.data || {}) as Record<string, unknown>) };
        // Lightroom sometimes answers with a bigger thumbnail than asked (805 px for 400): shrink it here (B6).
        if (typeof data.previewBase64 === "string") {
          const s = await downscaleBase64(data.previewBase64, params.size ?? 800, "image/jpeg");
          if (s.resized) {
            data.previewBase64 = s.base64;
            data.resizedFrom = s.from;
            data.resizedTo = s.to;
          }
        }
        return buildImageToolResponse(data, { mimeType: "image/jpeg" });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  tool(
    server,
    router,
    "lr_execute_lua",
    "Lightroom Classic escape hatch: run Lua 5.1 code inside the plug-in with `catalog`, `import`, `json`, `write(name, fn)` " +
      "(catalog write access as one undo step), `LrTasks`, `LrApplication`, `LrDevelopController`, `LrPathUtils` and " +
      "`LrFileUtils` in scope. `return` a JSON-serialisable value. Virtual copies: select photos, then " +
      "`catalog:createVirtualCopies(name)` (outside write()).",
    { code: z.string() },
    "lr.raw.executeLua",
    300000
  );
}
