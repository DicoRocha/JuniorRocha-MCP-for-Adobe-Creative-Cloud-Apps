import { withTrail } from "../../core/recipe-trail.js";
import * as os from "node:os";
import * as fs from "node:fs";
import { z } from "zod";
import { REFERENCE_LOOKS, referenceLook } from "../../core/looks.js";
import { countLeaves, planTree, psTreeToNodes } from "../../core/grouping.js";
import { auditPhotoshop, summarize, type PsAuditData } from "../../core/audit.js";
import { FORMATS, resolveZones } from "../../core/formats.js";
import { CAROUSEL_SIZES, planCarousel, seamBoxesFromTree, seamIssues, suggestCardCount } from "../../core/carousel.js";
import * as path from "node:path";
import { loadRecords, fillPattern } from "../../core/records.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../core/bridge-router.js";
import {
  buildImageToolResponse,
  formatErrorResponse,
  formatSuccessResponse
} from "../../core/image-helper.js";
import { ADJUSTMENT_TYPES, DOM_FILTERS, Descriptor, buildAdjustmentLayer, buildSmartObject } from "./descriptors.js";

/**
 * Runs actionJSON descriptors on whichever Photoshop bridge is available and turns batchPlay-style
 * error entries into a real error. Returns the active layer read back by the trailing "get" descriptors.
 */
async function runPsDescriptors(router: BridgeRouter, descriptors: Descriptor[], commandName: string): Promise<Record<string, unknown>> {
  const res = await router.dispatch(
    "photoshop",
    "ps.raw.batchPlay",
    { descriptors, options: { continueOnError: false }, commandName },
    { undoGroup: commandName }
  );
  const data = (res.data || {}) as { results?: Array<Record<string, unknown>> };
  const results = Array.isArray(data.results) ? data.results : [];
  const failure = results.find((r) => r && (r._obj === "error" || (typeof r.result === "number" && r.result < 0 && r.message)));
  if (failure) {
    throw new Error(`Photoshop rejected '${String(failure.descriptor ?? "")}': ${String(failure.message ?? "unknown error")}`);
  }
  const merged: Record<string, unknown> = {};
  for (const r of results) {
    if (r && typeof r === "object") {
      if ("layerID" in r) merged.layerId = r.layerID;
      if ("name" in r && typeof r.name === "string") merged.layerName = r.name;
    }
  }
  return { ok: true, bridge: res.bridgeType, ...merged, steps: descriptors.map((d) => d._obj) };
}

const ColorSchema = z
  .union([
    z.string().describe("Hex color string, e.g. '#FF5500'"),
    z.object({
      r: z.number().min(0).max(255),
      g: z.number().min(0).max(255),
      b: z.number().min(0).max(255)
    })
  ])
  .describe("RGB color as hex string ('#RRGGBB') or { r, g, b } object (0-255).");

/** Tools that act on "the active document" and therefore accept an optional documentName. */
export const PS_DOCUMENT_TOOLS = new Set([
  "ps_save_document",
  "ps_modify_canvas",
  "ps_get_canvas_snapshot",
  "ps_get_layer_tree",
  "ps_create_layer",
  "ps_edit_text_layer",
  "ps_transform_and_manage_layer",
  "ps_selection_and_masks",
  "ps_effects_and_adjustments",
  "ps_apply_filter",
  "ps_adjustment_layer",
  "ps_smart_object",
  "ps_menu_command",
  "ps_play_action",
  "ps_batch_play",
  "ps_place_file"
]);

/** Brings an open document to the front by name (with or without its extension). */
export async function activatePsDocument(router: BridgeRouter, documentName: string): Promise<void> {
  await runPsDescriptors(
    router,
    [{ _obj: "select", _target: [{ _ref: "document", _name: documentName }] } as Descriptor],
    "MCP: activate document"
  ).catch((err: unknown) => {
    const e = new Error(
      `No open Photoshop document named '${documentName}' (${err instanceof Error ? err.message : String(err)}). ` +
        "List them with ps_list_documents."
    ) as Error & { code?: string };
    e.code = "DOCUMENT_NOT_FOUND";
    throw e;
  });
}

/** Plans (and with apply: true creates) the semantic groups of a Photoshop document. Used by ps_organize_layers and the recipes. */
export async function organizePsDocument(
  router: BridgeRouter,
  documentName: string | undefined,
  opts: { apply?: boolean; language?: "pt" | "en" } = {}
): Promise<Record<string, unknown>> {
  const info = await router.dispatch("photoshop", "ps.layers.layoutInfo", { documentName });
  const d = (info.data || {}) as { documentName?: string; width?: number; height?: number; layers?: Array<Record<string, unknown>> };
  const plan = planTree(psTreeToNodes(d.layers ?? []), { width: Number(d.width) || 1, height: Number(d.height) || 1 }, { language: opts.language });
  const groups = plan.plans.flatMap((p) => p.proposals.map((g) => ({ container: p.container || "(top)", name: g.name, children: g.children.map((c) => c.name), layers: countLeaves(g) })));
  if (!opts.apply || !plan.plans.length) {
    return {
      documentName: d.documentName,
      applied: false,
      groups,
      skipped: plan.skipped,
      ...(plan.plans.length ? { next: "Call again with apply: true to create these groups." } : { verdict: "nothing to group" })
    };
  }
  const res = await router.dispatch(
    "photoshop",
    "ps.layers.groupPlan",
    { documentName: d.documentName, groups: plan.plans.flatMap((p) => p.proposals) },
    { undoGroup: "MCP: Organize layers", timeoutMs: 60000 }
  );
  return { documentName: d.documentName, applied: true, groups, skipped: plan.skipped, ...((res.data || {}) as object) };
}

export function registerPhotoshopTools(realServer: McpServer, router: BridgeRouter): void {
  // Every tool that works on "the active document" also takes documentName: the user may switch tabs in
  // Photoshop while the agent works, and a save or an edit would then land in the wrong file.
  const server = {
    tool: (name: string, description: string, schema: Record<string, z.ZodTypeAny>, handler: (p: any, extra: any) => any) => {
      if (!PS_DOCUMENT_TOOLS.has(name)) return (realServer.tool as any)(name, description, schema, handler);
      const withDoc = {
        ...schema,
        documentName: z
          .string()
          .optional()
          .describe("Open document to act on (brought to the front first). Default: the active document.")
      };
      return (realServer.tool as any)(name, description, withDoc, async (params: Record<string, unknown>, extra: unknown) => {
        const { documentName, ...rest } = params;
        if (typeof documentName === "string" && documentName.trim() !== "") {
          try {
            await activatePsDocument(router, documentName.trim());
          } catch (err) {
            return formatErrorResponse(err);
          }
        }
        return handler(rest, extra);
      });
    }
  };
  server.tool(
    "ps_list_documents",
    "List all open documents in Adobe Photoshop with dimensions, resolution, color mode, and active state.",
    {},
    async () => {
      try {
        const res = await router.dispatch("photoshop", "ps.doc.list", {});
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_create_document",
    "Create a new document in Adobe Photoshop.",
    {
      name: z.string().optional().default("Untitled-MCP").describe("Document title."),
      width: z.number().positive().default(1920).describe("Width in pixels."),
      height: z.number().positive().default(1080).describe("Height in pixels."),
      resolution: z.number().positive().optional().default(72).describe("Resolution in PPI (default 72)."),
      mode: z.enum(["RGBColorMode", "CMYKColorMode", "grayscaleMode", "labColorMode"]).optional().default("RGBColorMode"),
      fill: z.enum(["white", "transparent", "backgroundColor"]).optional().default("white")
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.doc.create", params, {
          undoGroup: "MCP: Create Document"
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_open_document",
    "Open an existing image or PSD/PSB document in Adobe Photoshop.",
    {
      filePath: z.string().describe("Absolute path to the file (.psd, .psb, .png, .jpg, .webp, .tiff, .pdf).")
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.doc.open", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_save_document",
    "Save or export the active Adobe Photoshop document (.psd, .png, .jpg).",
    {
      filePath: z.string().optional().describe("Destination file path. Omit to save in-place."),
      format: z.enum(["psd", "png", "jpg"]).optional().default("psd"),
      quality: z.number().min(1).max(12).optional().default(10).describe("JPEG quality (1-12).")
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.doc.save", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_modify_canvas",
    "Crop, resize image, resize canvas, rotate, trim transparent pixels, or flatten the active Photoshop document.",
    {
      operation: z.enum(["crop", "resizeImage", "resizeCanvas", "rotate", "trim", "flatten"]).describe("Canvas operation."),
      width: z.number().positive().optional().describe("Target width in pixels (for resizeImage / resizeCanvas)."),
      height: z.number().positive().optional().describe("Target height in pixels (for resizeImage / resizeCanvas)."),
      bounds: z
        .object({
          left: z.number(),
          top: z.number(),
          right: z.number(),
          bottom: z.number()
        })
        .optional()
        .describe("Crop rectangle in pixels."),
      angle: z.number().optional().describe("Rotation angle in degrees.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.doc.modifyCanvas", params, {
          undoGroup: `MCP: Canvas ${params.operation}`
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_get_canvas_snapshot",
    "Multimodal Visual Feedback: Render the active Photoshop document (downscaled to maxDimension) and return it as an inline image for visual inspection. Pass outputPath to also save a full PNG copy on disk.",
    {
      outputPath: z.string().optional().describe("Optional file path to save the PNG snapshot."),
      maxDimension: z.number().int().min(128).max(4096).optional().default(1024).describe("Max width/height for preview scaling."),
      includeImageContent: z.boolean().optional().default(true).describe("Return inline base64 image in MCP response.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.doc.snapshot", params, { timeoutMs: 45000 });
        const dataObj = { ...((res.data || {}) as Record<string, unknown>) };
        const inlineBase64 =
          res.previewBase64 || (typeof dataObj.previewBase64 === "string" ? dataObj.previewBase64 : undefined);
        delete dataObj.previewBase64;
        const snapshotFile = typeof dataObj.outputPath === "string" ? dataObj.outputPath : params.outputPath;
        const response = buildImageToolResponse(dataObj, {
          filePath: snapshotFile,
          base64Data: inlineBase64,
          mimeType:
            res.previewMimeType || (typeof dataObj.previewMimeType === "string" ? dataObj.previewMimeType : undefined),
          includeImageContent: params.includeImageContent
        });
        // The ExtendScript bridge writes a scratch PNG when the caller gave no outputPath: remove it once read.
        if (dataObj.temporaryFile === true && snapshotFile && !params.outputPath) {
          try {
            fs.unlinkSync(snapshotFile);
          } catch {
            // best effort
          }
        }
        return response;
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_get_layer_tree",
    "Retrieve the complete hierarchy of layers and groups in the active Photoshop document (IDs, names, types, bounds, opacity, blend modes, visibility).",
    {
      maxDepth: z.number().int().min(1).max(10).optional().default(5)
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.layer.getTree", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_luminosity_masks",
    "Create luminosity masks as alpha channels, no brush: Luzes 1..N (brightness of the composite, each step narrower), " +
      "Sombras 1..N (the inverse) and Medios (neither). Load one as a selection before an adjustment layer to touch only " +
      "that tonal range. Replaces channels with the same names.",
    {
      documentName: z.string().optional(),
      steps: z.number().int().min(1).max(5).optional().default(3),
      midtones: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.luminosityMasks", params, { undoGroup: "MCP: Luminosity masks", timeoutMs: 60000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_zone_dodge_burn",
    "Dodge & burn by zones without a brush: Curves layers masked by luminosity masks (lift the shadows on Sombras 2, " +
      "hold the highlights on Luzes 2, optional midtone contrast on Medios) in one group. strength 0-100 sets the curve; " +
      "lower the group opacity to taste. Creates the masks when missing.",
    {
      documentName: z.string().optional(),
      strength: z.number().min(0).max(100).optional().default(50),
      liftShadows: z.boolean().optional().default(true),
      holdHighlights: z.boolean().optional().default(true),
      midContrast: z.boolean().optional().default(false),
      shadowsMask: z.string().optional().describe("Channel for the shadow lift (default Sombras 2)."),
      highlightsMask: z.string().optional().describe("Channel for the highlight hold (default Luzes 2)."),
      groupName: z.string().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.recipe.zoneDodgeBurn", params, { undoGroup: "MCP: Zone dodge & burn", timeoutMs: 60000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_frequency_separation",
    "Light frequency separation for skin, no brush: Baixa frequencia (blur) + Alta frequencia (Apply Image, Linear Light) " +
      "rebuild the photo exactly; Suavizar pele (edge-preserving surface blur, masked to skin tones, 25-40 % opacity) evens colour and tone and " +
      "keeps the texture. All in one group above the base layer. Radius defaults to the long side / 600.",
    {
      documentName: z.string().optional(),
      layerId: z.number().int().optional(),
      layerName: z.string().optional(),
      radius: z.number().min(1).max(50).optional(),
      smoothOpacity: z.number().min(0).max(100).optional().default(30),
      skinMask: z.boolean().optional().default(true).describe("Mask Suavizar pele with Select > Color Range > Skin Tones."),
      groupName: z.string().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.recipe.frequencySeparation", params, { undoGroup: "MCP: Frequency separation", timeoutMs: 60000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_look",
    "Apply a reference look as editable adjustment layers in one group above everything (the photo is not touched): " +
      Object.keys(REFERENCE_LOOKS).join(", ") +
      ". The group opacity is the intensity (default 70 %). Same looks as lr_apply_look and pr_color.",
    {
      documentName: z.string().optional(),
      look: z.enum(Object.keys(REFERENCE_LOOKS) as [string, ...string[]]),
      intensity: z.number().min(0).max(1).optional().default(0.7)
    },
    async (params) => {
      try {
        const l = referenceLook(params.look);
        const res = await router.dispatch(
          "photoshop",
          "ps.recipe.look",
          { documentName: params.documentName, name: params.look, stack: l.photoshop, opacity: Math.round(params.intensity * 100) },
          { undoGroup: `MCP: Look ${params.look}`, timeoutMs: 60000 }
        );
        return formatSuccessResponse({ ...((res.data || {}) as object), description: l.description });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_carousel_setup",
    "Seamless Instagram carousel (one continuous panel, also called panoramic or infinite carousel), step 1: a new " +
      "wide document = count x card width (default 1080x1440, 3:4, Instagram's current size) with guides at every seam, at the safe margin inside " +
      "each card and at the 3:4 profile-grid crop of card 1, a 'Fundo continuo' layer and one empty 'Card NN - textos' " +
      "group per card. Background shapes and photos may cross the seams; text and logo stay inside one card's margins. " +
      "For a carousel of independent cards use ps_artboards instead (ask the person which kind first, and how many cards " +
      "or whether you decide from the content: then pass contentBlocks). Then build the " +
      "art and export with ps_recipe_carousel_split.",
    {
      count: z.number().int().min(2).max(20).optional().describe("Number of cards (Instagram: 2-20). Give this or contentBlocks."),
      contentBlocks: z.number().int().min(0).max(20).optional().describe("When the AI decides: content blocks of the script (ideas/steps); cards = cover + blocks + CTA card, max 20."),
      ratio: z.enum(["3:4", "4:5", "1:1", "1.91:1"]).optional().default("3:4").describe("3:4 = 1080x1440 (Instagram default); 4:5 = 1080x1350 (for scheduling tools / Meta API)."),
      cardWidth: z.number().int().positive().optional().describe("Overrides the ratio's width (keep 1080 for Instagram)."),
      cardHeight: z.number().int().positive().optional(),
      margin: z.number().int().min(0).max(300).optional().default(80).describe("Safe margin in px from every card edge (and so from every seam)."),
      name: z.string().optional().describe("Document name."),
      psdPath: z.string().optional().describe("Save the new document as this PSD right away.")
    },
    async (params) => {
      try {
        const size = CAROUSEL_SIZES[(params.ratio ?? "3:4") as keyof typeof CAROUSEL_SIZES];
        if (params.count === undefined && params.contentBlocks === undefined) {
          throw new Error("Say how many cards (count) or let the content decide (contentBlocks = ideas/steps of the script). Ask the person which they prefer.");
        }
        const count = params.count ?? suggestCardCount(params.contentBlocks ?? 0);
        const plan = planCarousel({ count, ratio: params.ratio, cardWidth: params.cardWidth ?? size.width, cardHeight: params.cardHeight ?? size.height, margin: params.margin });
        const res = await router.dispatch(
          "photoshop",
          "ps.recipe.carouselSetup",
          { count: plan.count, cardWidth: plan.cardWidth, cardHeight: plan.cardHeight, margin: plan.margin, name: params.name, psdPath: params.psdPath },
          { undoGroup: "MCP: Carrossel seamless", timeoutMs: 70000 }
        );
        return formatSuccessResponse({ ...((res.data || {}) as object), seams: plan.seams, warnings: plan.warnings, next: "Build the art, then ps_recipe_carousel_split." });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_carousel_split",
    "Seamless Instagram carousel, step 2: cut the wide document into its cards and export them in posting order " +
      "(<prefix>_01.png ... _NN) at exact whole pixels, without touching the working document (a flattened duplicate is " +
      "cut, card by card, so the 8192 px Save for Web limit does not apply; never use the Slice tool or Save for Web slices for this). Checks first that the width is an exact " +
      "multiple of the card width and that no text or logo layer (names with logo/marca/brand) crosses a seam or sits " +
      "inside the margin next to one: a crossing stops the export (nothing written) unless allowTextOnSeams; a margin touch " +
      "is reported in seamIssues. PNG is the default: JPEG blocks show at the seams.",
    {
      documentName: z.string().optional(),
      outputFolder: z.string().describe("Folder for the cards."),
      prefix: z.string().optional().describe("File name prefix (default: the document name)."),
      count: z.number().int().min(2).max(20).optional().describe("Number of cards (default: width / cardWidth)."),
      cardWidth: z.number().int().positive().optional().default(1080),
      margin: z.number().int().min(0).max(300).optional().default(80).describe("Margin used for the seam check."),
      format: z.enum(["png", "jpg", "webp"]).optional().default("png"),
      quality: z.number().int().min(1).max(100).optional().default(92).describe("jpg/webp quality."),
      allowTextOnSeams: z.boolean().optional().default(false).describe("Export even when text crosses a seam (normally a mistake).")
    },
    async (params) => {
      try {
        if (!params.allowTextOnSeams) {
          // Refuse before exporting when a text or logo crosses a seam (a margin touch is only a warning).
          if (params.documentName) await activatePsDocument(router, params.documentName);
          const tree = await router.dispatch("photoshop", "ps.layer.getTree", { maxDepth: 8 });
          const { boxes, maxRight } = seamBoxesFromTree(((tree.data as { layers?: unknown[] })?.layers ?? []) as never[]);
          const cw = params.cardWidth ?? 1080;
          const n = params.count ?? Math.max(1, Math.round(maxRight / cw));
          const seams = Array.from({ length: Math.max(0, n - 1) }, (_, i) => (i + 1) * cw);
          const crossing = seamIssues(boxes, { seams, margin: params.margin ?? 80 }).filter((i) => i.problem === "crosses");
          if (crossing.length) {
            return formatErrorResponse(
              new Error(
                `Nothing exported: ${crossing.length} text/logo layer(s) cross a seam (${crossing.map((c) => `'${c.name}' on seam ${c.seam}`).join(", ")}). ` +
                  "A word or logo cut between two cards does not read: move it inside one card and run again, or pass allowTextOnSeams: true if the person wants it so."
              )
            );
          }
        }
        const res = await router.dispatch("photoshop", "ps.recipe.carouselSplit", params, { undoGroup: "MCP: Exportar carrossel", timeoutMs: 70000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_film_grain",
    "Film grain on top of the document: a 50 % grey layer in Overlay with monochrome Gaussian noise, slightly blurred. " +
      "amount 2-20 (8 = subtle), size = blur radius (0.4-1.5), opacity 30-80. Works on any Photoshop version (the 27.4 " +
      "grain adjustment is ps_adjustment_layer type grain).",
    {
      documentName: z.string().optional(),
      amount: z.number().min(0.5).max(40).optional().default(8),
      size: z.number().min(0).max(4).optional().default(0.6),
      opacity: z.number().min(0).max(100).optional().default(60),
      name: z.string().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.recipe.filmGrain", params, { undoGroup: "MCP: Film grain", timeoutMs: 60000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_organize_layers",
    "Organise a Photoshop document in groups by meaning: text on a shape becomes a label group, an icon with its text " +
      "(and the lines under it) an item group, repeated items/labels in a column or row one list group holding them. Lone " +
      "objects, the background and adjustment layers stay as they are; a group that would change the stacking is skipped. " +
      "apply: false (default) only reports the plan; apply: true creates the groups (one history step each; work on a copy of the user's file).",
    {
      documentName: z.string().optional(),
      apply: z.boolean().optional().default(false),
      language: z.enum(["pt", "en"]).optional().default("pt").describe("Language of the group names.")
    },
    async (params) => {
      try {
        return formatSuccessResponse(await organizePsDocument(router, params.documentName, { apply: params.apply, language: params.language }));
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_create_layer",
    "Create a new pixel layer, group (folder), solid color fill layer, or text layer in Photoshop. 'position' places the text insertion point in document pixels.",
    {
      layerType: z.enum(["pixel", "group", "text", "solidColor"]).default("pixel"),
      name: z.string().optional().describe("Layer name."),
      text: z.string().optional().describe("Text content when layerType='text'."),
      fontSize: z.number().positive().optional().default(48).describe("Font size in pt."),
      font: z.string().optional().describe("PostScript font name (e.g. 'ArialMT')."),
      position: z.array(z.number()).length(2).optional().describe("[x, y] coordinates in pixels."),
      artboard: z.string().optional().describe("Text layers in a document with artboards: name of the artboard that receives the layer (default: the artboard that contains 'position', else the first)."),
      color: ColorSchema.optional(),
      opacity: z.number().min(0).max(100).optional().default(100),
      blendMode: z.string().optional().default("normal")
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.layer.create", params, {
          undoGroup: `MCP: Create ${params.layerType} Layer`
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_edit_text_layer",
    "Modify text contents, font, size, color, tracking, leading, or alignment on an existing text layer in Photoshop.",
    {
      layerId: z.number().int().optional().describe("Target layer ID."),
      layerName: z.string().optional().describe("Target layer name."),
      text: z.string().optional().describe("New text string."),
      fontSize: z.number().positive().optional(),
      font: z.string().optional().describe("PostScript font name."),
      color: ColorSchema.optional(),
      tracking: z.number().optional(),
      leading: z.number().optional(),
      alignment: z.enum(["left", "center", "right", "justify"]).optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.layer.editText", params, {
          undoGroup: "MCP: Edit Text Layer"
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_transform_and_manage_layer",
    "Transform (translate, scale, rotate, flip) or manage (rename, duplicate, delete, convert to Smart Object, rasterize, set opacity/blendMode/visibility) a layer in Photoshop. Targets layerId/layerName, or the active layer when neither is given; a named layer that does not exist is an error. Reordering and merging are not built in: use ps_batch_play.",
    {
      operation: z
        .enum([
          "updateProperties",
          "translate",
          "scale",
          "rotate",
          "flipHorizontal",
          "flipVertical",
          "duplicate",
          "delete",
          "convertToSmartObject",
          "rasterize"
        ])
        .default("updateProperties"),
      layerId: z.number().int().optional(),
      layerName: z.string().optional(),
      newName: z.string().optional(),
      visible: z.boolean().optional(),
      opacity: z.number().min(0).max(100).optional(),
      blendMode: z.string().optional(),
      deltaX: z.number().optional(),
      deltaY: z.number().optional(),
      scaleX: z.number().optional().describe("Horizontal scale percentage (e.g. 150 for 150%)."),
      scaleY: z.number().optional().describe("Vertical scale percentage."),
      angle: z.number().optional().describe("Rotation angle in degrees.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.layer.manage", params, {
          undoGroup: `MCP: Layer ${params.operation}`
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_selection_and_masks",
    "Create or modify pixel selections (rectangle, ellipse, polygon, selectAll, selectSubject, selectSky, invert, clear), remove the background, or add/delete a layer mask from the current selection. 'feather' applies to rectangle, ellipse and polygon. Refine the current selection with expand, contract, smooth, feather, border (amount in px), grow, similar (tolerance) or colorRange (highlights, midtones, shadows, a colour family, skin tones); keep it with saveSelection and bring it back with loadSelection.",
    {
      operation: z.enum([
        "rectangle",
        "ellipse",
        "polygon",
        "selectAll",
        "clear",
        "invert",
        "selectSubject",
        "selectSky",
        "removeBackground",
        "addMaskFromSelection",
        "deleteMask",
        "expand",
        "contract",
        "smooth",
        "feather",
        "border",
        "grow",
        "similar",
        "colorRange",
        "saveSelection",
        "loadSelection"
      ]),
      amount: z.number().positive().optional().describe("expand / contract / smooth / feather / border: pixels."),
      tolerance: z.number().min(0).max(255).optional().describe("grow / similar: tolerance (default 32)."),
      range: z
        .enum(["highlights", "midtones", "shadows", "reds", "yellows", "greens", "cyans", "blues", "magentas", "skinTones"])
        .optional()
        .describe("colorRange: what to select."),
      name: z.string().optional().describe("saveSelection / loadSelection: name of the saved selection (an alpha channel)."),
      invert: z.boolean().optional().describe("loadSelection: load it inverted."),
      bounds: z
        .object({
          left: z.number(),
          top: z.number(),
          right: z.number(),
          bottom: z.number()
        })
        .optional(),
      points: z.array(z.array(z.number()).length(2)).optional().describe("Polygon vertices [[x,y], ...]."),
      feather: z.number().min(0).optional().default(0)
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.selection.operate", params, {
          undoGroup: `MCP: Selection ${params.operation}`,
          timeoutMs: 45000
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_effects_and_adjustments",
    "Apply a built-in filter (gaussianBlur, motionBlur, highPass, addNoise, unsharpMask), layer style (dropShadow, innerShadow, stroke, outerGlow, innerGlow, bevelEmboss, satin, colorOverlay, gradientOverlay) or adjustment layer (brightnessContrast, hueSaturation, vibrance, levels, curves, colorBalance, blackAndWhite). Layer styles work on both panels (CEP and UXP); adjustment layers here need the UXP panel (ps_adjustment_layer works everywhere). Applying a layer style replaces the styles already on the layer; levels and curves are created with neutral defaults. Anything else (Smart Sharpen, LUT, ...) goes through ps_batch_play.",
    {
      category: z.enum(["filter", "layerStyle", "adjustmentLayer"]),
      type: z
        .string()
        .describe(
          "filter: gaussianBlur | motionBlur | highPass | addNoise | unsharpMask. layerStyle: dropShadow | innerShadow | stroke | outerGlow | innerGlow | bevelEmboss | satin | colorOverlay | gradientOverlay. adjustmentLayer: brightnessContrast | hueSaturation | vibrance | levels | curves | colorBalance | blackAndWhite."
        ),
      layerId: z.number().int().optional(),
      layerName: z.string().optional().describe("Target layer or group (folder) name. A layer style on a group affects everything inside it."),
      replaceExisting: z
        .boolean()
        .optional()
        .describe("layerStyle: by default the style is added to the ones already on the layer (call once per style to stack several). true removes the other styles first."),
      settings: z
        .record(z.string(), z.unknown())
        .optional()
        .default({})
        .describe(
          "Parameters. gaussianBlur/highPass {radius}; motionBlur {angle,distance}; addNoise {amount,distribution:'gaussian'|'uniform',monochromatic}; unsharpMask {amount,radius,threshold}; dropShadow {color,opacity,angle,distance,spread,size,blendMode}; stroke {color,size,position:'outside'|'inside'|'center',opacity}; outerGlow {color,opacity,spread,size}; colorOverlay {color,opacity,blendMode}; gradientOverlay {from,to,fromOpacity,toOpacity,angle,style:'linear'|'radial',scale,reverse,opacity,blendMode}; brightnessContrast {brightness,contrast}; hueSaturation {hue,saturation,lightness,colorize}; vibrance {vibrance,saturation}; colorBalance {shadows,midtones,highlights: [cyanRed,magentaGreen,yellowBlue]}; blackAndWhite {red,yellow,green,cyan,blue,magenta}."
        )
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.effects.apply", params, {
          undoGroup: `MCP: ${params.category} ${params.type}`
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_apply_filter",
    "Apply any of the Photoshop DOM filters to a layer (works on the UXP panel and on ExtendScript/COM). " +
      "`args` follow the method's parameter order, in pixels / percent / degrees; enum arguments are strings like " +
      "'NoiseDistribution.GAUSSIAN'. Common signatures: applyGaussianBlur(radius) · applyMotionBlur(angle, distance) · " +
      "applyAddNoise(amount, distribution, monochromatic) · applyUnSharpMask(amount, radius, threshold) · applyHighPass(radius) · " +
      "applySmartBlur(radius, threshold, quality, mode) · applyLensBlur(...) · applyTwirl(angle) · applyWave(...) · applyClouds() · " +
      "applyDustAndScratches(radius, threshold) · applyMedianNoise(radius). For a non-destructive Smart Filter, convert the layer " +
      "with ps_smart_object first.",
    {
      layerId: z.number().int().optional(),
      layerName: z.string().optional(),
      filter: z.enum(DOM_FILTERS).describe("Layer method name."),
      args: z.array(z.unknown()).optional().default([]).describe("Arguments in method order.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.filter.applyDom", params, {
          undoGroup: `MCP: ${params.filter.replace(/^apply/, "")}`
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_adjustment_layer",
    "Create any non-destructive adjustment layer: " +
      Object.keys(ADJUSTMENT_TYPES).join(", ") +
      ". Optional `settings` are actionJSON fields merged into the adjustment (record the exact fields with Alchemist or " +
      "Plugins > Development > Record Action Commands). Can clip to the layer below. Returns the new layer's id and name.",
    {
      type: z.enum(Object.keys(ADJUSTMENT_TYPES) as [string, ...string[]]),
      settings: z.record(z.string(), z.unknown()).optional().describe("actionJSON fields, e.g. { brightness: 20, center: 10 } for brightnessContrast; { clarity: 30 } for clarity; { grainAmount: 40, grainSize: 30, grainRoughness: 60 } for grain (clarity and grain need Photoshop 27.4+)."),
      layerId: z.number().int().optional().describe("Create it above this layer (default: above the active layer)."),
      layerName: z.string().optional(),
      name: z.string().optional(),
      clipToBelow: z.boolean().optional().default(false).describe("Clip to the layer below (affects only that layer)."),
      opacity: z.number().min(0).max(100).optional(),
      blendMode: z.string().optional().describe("actionJSON blend mode, e.g. normal, multiply, screen, overlay, softLight, luminosity.")
    },
    async (params) => {
      try {
        const descriptors = buildAdjustmentLayer(params);
        return formatSuccessResponse(await runPsDescriptors(router, descriptors, `MCP: ${params.type}`));
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_guides",
    "Guides of the active Photoshop document: list them, add single guides, lay out a column/row grid with margins and gutters " +
      "(the usual layout grid), or clear them all. Positions are pixels from the top-left.",
    {
      operation: z.enum(["list", "add", "layout", "clear"]).optional().default("list"),
      guides: z
        .array(z.object({ orientation: z.enum(["vertical", "horizontal"]), position: z.number() }))
        .optional()
        .describe("add: the guides to create."),
      margin: z.number().min(0).optional().describe("layout: margin on the four sides (px)."),
      columns: z.number().int().min(0).optional().describe("layout: number of columns."),
      rows: z.number().int().min(0).optional().describe("layout: number of rows."),
      gutter: z.number().min(0).optional().describe("layout: space between columns and between rows (px)."),
      replace: z.boolean().optional().describe("layout: remove the existing guides first."),
      documentName: z.string().optional()
    },
    async (params) => {
      try {
        if (params.documentName) await activatePsDocument(router, params.documentName);
        const res = await router.dispatch("photoshop", "ps.guides", params, { undoGroup: "MCP: guides" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_camera_raw_filter",
    "Apply the Camera Raw filter to a layer with the same controls as the Lightroom develop tools: temperature, tint, exposure, " +
      "contrast, highlights, shadows, whites, blacks, texture, clarity, dehaze, vibrance, saturation, sharpening, luminanceNoise, " +
      "colorNoise, vignette, grain. Convert the layer to a Smart Object first (ps_smart_object) to keep it as an editable " +
      "Smart Filter; on a pixel layer the change is permanent. No dialog is shown.",
    {
      settings: z
        .record(z.string(), z.number())
        .describe("e.g. { exposure: 0.4, contrast: 15, highlights: -30, shadows: 25, clarity: 10, vibrance: 12 }. Exposure is in stops (-5..5); most others -100..100."),
      layerId: z.number().int().optional(),
      layerName: z.string().optional(),
      documentName: z.string().optional()
    },
    async (params) => {
      try {
        if (params.documentName) await activatePsDocument(router, params.documentName);
        const res = await router.dispatch("photoshop", "ps.cameraRaw", params, { undoGroup: "MCP: Camera Raw filter" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_smart_object",
    "Smart Object operations on a layer: convert to Smart Object, open its contents, replace or relink its contents with a file " +
      "(mockups), convert back to layers, or rasterize. Returns the resulting active layer.",
    {
      operation: z.enum(["convert", "editContents", "replaceContents", "relink", "convertToLayers", "rasterize"]),
      layerId: z.number().int().optional(),
      layerName: z.string().optional(),
      filePath: z.string().optional().describe("Absolute path for replaceContents / relink.")
    },
    async ({ operation, layerId, layerName, filePath }) => {
      try {
        const descriptors = buildSmartObject(operation, { layerId, layerName }, filePath);
        return formatSuccessResponse(await runPsDescriptors(router, descriptors, `MCP: Smart Object ${operation}`));
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_menu_command",
    "Run any Photoshop menu command by its numeric command ID (record the ID with Alchemist or Record Action Commands, " +
      "where it appears as 'select menuItemClass'). On the UXP panel it first checks that the command is available and returns its title.",
    {
      commandId: z.number().int().positive()
    },
    async ({ commandId }) => {
      try {
        const res = await router.dispatch("photoshop", "ps.menu.perform", { commandId }, { undoGroup: `MCP: Menu ${commandId}` });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_batch_variants",
    "Ads and posts from a spreadsheet: in an open template PSD, layers are named after the data columns — text " +
      "layers get the text, Smart Objects get the file in the cell (photo, logo), a cell 'hide'/'show' toggles a layer. " +
      "Each record is exported (PNG/JPG/PSD copy) to outputFolder as fileNamePattern ({{column}}, {{#}} = row number), " +
      "and the document returns to its original state. For several formats, keep one template per format.",
    {
      documentName: z.string().optional().describe("Open template document (default: the active one)."),
      csvPath: z.string().optional(),
      jsonPath: z.string().optional(),
      records: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))).optional(),
      outputFolder: z.string(),
      fileNamePattern: z.string().optional().default("{{#}}"),
      format: z.enum(["png", "jpg", "psd"]).optional().default("png"),
      quality: z.number().int().min(1).max(12).optional(),
      fileFolder: z.string().optional().describe("Relative file paths in the data are resolved against this folder.")
    },
    async (params) => {
      try {
        const rows = loadRecords(params as { csvPath?: string; jsonPath?: string; records?: Array<Record<string, unknown>> });
        const recs = rows.map((r, i) => {
          const o: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) {
            o[k] =
              params.fileFolder && /\.(jpe?g|png|tiff?|psd|psb|ai|pdf|eps|svg|webp|heic)$/i.test(v) && !/^([a-z]:[\\/]|\/|\\\\)/i.test(v)
                ? path.join(params.fileFolder, v)
                : v;
          }
          o.__file = fillPattern(params.fileNamePattern || "{{#}}", r, i) || `variant_${i + 1}`;
          return o;
        });
        const res = await router.dispatch(
          "photoshop",
          "ps.variants",
          { documentName: params.documentName, records: recs, outputFolder: params.outputFolder, format: params.format, quality: params.quality },
          { timeoutMs: 300000, undoGroup: "MCP: Variants" }
        );
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  const WebOutput = {
    quality: z.number().int().min(1).max(100).optional().describe("JPG/WebP quality 1–100 (default 82)."),
    maxKB: z.number().positive().optional().describe("JPG/WebP: lower the quality step by step until the file fits (down to minQuality)."),
    minQuality: z.number().int().min(1).max(100).optional().describe("Floor for maxKB (default 45)."),
    lossless: z.boolean().optional().describe("WebP lossless."),
    transparent: z.boolean().optional().describe("PNG: keep transparency (default true)."),
    srgb: z.boolean().optional().describe("Convert to sRGB and 8 bits first (default true)."),
    scale: z.number().positive().optional().describe("Resize to this % (e.g. 200 for @2x, 50 for half)."),
    maxWidth: z.number().int().positive().optional(),
    maxHeight: z.number().int().positive().optional()
  };

  server.tool(
    "ps_artboards",
    "Artboards: list them (name, rect, background), create several at once (name, width, height, optional x/y — placed " +
      "side by side by default — and backgroundColor), or export each one to its own file named after the artboard " +
      "(png/jpg/webp, scale for @2x, sRGB, maxKB) — one PSD with feed 4:5, story 9:16 and square delivered in one call. " +
      "Exports work on duplicates; the document is not changed.",
    {
      documentName: z.string().optional(),
      operation: z
        .enum(["list", "create", "export", "quickExport"])
        .default("list")
        .describe("quickExport = File > Export > Quick Export as PNG (one file per artboard, named after it) — preferred for a PSD with artboards; export = per-artboard crop with naming pattern, formats and size budget."),
      artboards: z
        .array(
          z.object({
            name: z.string(),
            width: z.number().positive(),
            height: z.number().positive(),
            x: z.number().optional(),
            y: z.number().optional(),
            backgroundColor: z.string().optional().describe("'#RRGGBB' fill layer 'Fundo' inside the artboard.")
          })
        )
        .optional()
        .describe("create: artboards in pixels."),
      gap: z.number().optional().describe("create: space between artboards placed automatically (default 100 px)."),
      names: z.array(z.string()).optional().describe("export: only these artboards (default all)."),
      outputFolder: z.string().optional(),
      fileNamePattern: z.string().optional().describe("export: {{name}} artboard, {{#}} order, {{document}}. Default '{{name}}'."),
      format: z.enum(["png", "jpg", "webp"]).optional(),
      ...WebOutput
    },
    async (params) => {
      try {
        if ((params.operation === "export" || params.operation === "quickExport") && !params.outputFolder) throw new Error("outputFolder is required for export.");
        const res = await router.dispatch("photoshop", "ps.artboards", params, {
          timeoutMs: params.operation === "export" ? 300000 : 60000,
          undoGroup: "MCP: Artboards"
        });
        if (params.operation === "quickExport") {
          // Photoshop writes the files after the script returns: wait until every expected file exists and stops growing.
          const data = (res.data || {}) as { folder?: string; expected?: string[]; extension?: string };
          const fsMod = await import("node:fs");
          const pathMod = await import("node:path");
          const folder = data.folder || (params.outputFolder as string);
          const want = (data.expected || []).map((n) => pathMod.join(folder, `${n}.${data.extension || "png"}`));
          const sizes = new Map<string, number>();
          const deadline = Date.now() + 90000;
          let stable = 0;
          while (Date.now() < deadline && stable < 2) {
            await new Promise((r) => setTimeout(r, 1000));
            let changed = false;
            for (const f of want) {
              const sz = fsMod.existsSync(f) ? fsMod.statSync(f).size : -1;
              if (sizes.get(f) !== sz) changed = true;
              sizes.set(f, sz);
            }
            stable = !changed && want.every((f) => (sizes.get(f) ?? -1) > 0) ? stable + 1 : 0;
          }
          const files = want.map((f) => ({ path: f, bytes: Math.max(0, sizes.get(f) ?? 0), ok: (sizes.get(f) ?? -1) > 0 }));
          const missing = files.filter((f) => !f.ok).map((f) => pathMod.basename(f.path));
          return formatSuccessResponse({
            ...data,
            files,
            missing,
            blankSuspects: files.filter((f) => f.ok && f.bytes < 12000).map((f) => pathMod.basename(f.path)),
            next: missing.length ? "Some files did not appear: Photoshop may have named them differently (check the folder) or the export needs the document saved. Fall back to operation 'export'." : "Look at the files before delivering."
          });
        }
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_export_web",
    "Export the document for web and social: JPG, PNG or WebP, converted to sRGB 8-bit, metadata stripped, resized to fit " +
      "maxWidth/maxHeight or by scale, with a file-size budget (maxKB lowers the quality step by step). sizes exports several " +
      "widths at once (e.g. 1920, 1280, 640 with suffixes). Works on a duplicate; the document is not changed.",
    {
      documentName: z.string().optional(),
      filePath: z.string().describe("Output path; the extension may be left out."),
      format: z.enum(["jpg", "png", "webp"]).default("jpg"),
      sizes: z
        .array(
          z.object({
            suffix: z.string().describe("Added before the extension, e.g. '_1280'."),
            maxWidth: z.number().int().positive().optional(),
            maxHeight: z.number().int().positive().optional(),
            scale: z.number().positive().optional()
          })
        )
        .optional(),
      ...WebOutput
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.export.web", params, { timeoutMs: 300000, undoGroup: "MCP: Export web" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_social_set",
    "Recipe: key art → every social format in one call. Creates a new document (the key art is untouched) with one " +
      "artboard per format (default feed 4:5, story 9:16, square 1:1, link 1.91:1). Layers that fill the canvas or are " +
      "named Fundo/Background/Foto/Photo cover each artboard; titles, logo and CTA keep their edge or centre, scale with " +
      "the format and are pulled inside its safe zone. Each artboard is audited (safe zone, contrast, size); with " +
      "outputFolder, exported one file per artboard. Recompose by hand where the audit or the look asks for it.",
    {
      documentName: z.string().optional().describe("Key art document (default: active)."),
      formats: z.array(z.enum(Object.keys(FORMATS) as [string, ...string[]])).optional(),
      overlayScale: z.number().min(0.3).max(3).optional().describe("Extra scale for titles/logo (default 1)."),
      focus: z
        .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
        .optional()
        .describe("Focal point in the key art (0–1). Default: upper third of a layer named Motiv/sujeito/produto, else centre."),
      outputFolder: z.string().optional(),
      exportFormat: z.enum(["png", "jpg", "webp"]).optional().default("png").describe("Social exports are PNG by default (user rule)."),
      quality: z.number().int().min(1).max(100).optional(),
      organize: z.boolean().optional().default(true).describe("Group related layers by meaning in each artboard (ps_organize_layers) before exporting.")
    },
    async (params) => {
      try {
        const keys: string[] = params.formats?.length ? params.formats : ["feed3x4", "story9x16", "square1x1", "link191"];
        const formats = keys.map((key: string) => {
          const f = FORMATS[key];
          const z0 = resolveZones(key, f.width, f.height);
          return {
            key,
            name: key,
            width: f.width,
            height: f.height,
            safe: { top: z0.safeRect.y, left: z0.safeRect.x, right: f.width - z0.safeRect.x - z0.safeRect.width, bottom: f.height - z0.safeRect.y - z0.safeRect.height }
          };
        });
        const logPath = path.join(os.tmpdir(), `ps_social_${Date.now()}.log`);
        let res;
        try {
          res = await router.dispatch(
            "photoshop",
            "ps.recipe.socialSet",
            { documentName: params.documentName, formats, overlayScale: params.overlayScale, focus: params.focus, logPath },
            // copying layers between documents takes 1–4 s each with heavy Smart Objects
            { timeoutMs: 900000, undoGroup: "MCP: Social set" }
          );
        } catch (err) {
          throw withTrail(err, logPath);
        }
        const data = res.data as {
          document: string;
          source: string;
          artboards: Array<{ name: string; format: string; rect: { width: number; height: number }; layers: PsAuditData["layers"]; placed: Array<{ name: string; role: string; scale: number; upscaledPixels: boolean }> }>;
        };
        let errors = 0;
        let warnings = 0;
        const boards = data.artboards.map((a) => {
          const { findings } = auditPhotoshop(
            { document: a.name, width: a.rect.width, height: a.rect.height, mode: "RGB", bits: "EIGHT", profile: "", layers: a.layers },
            { format: a.format }
          );
          const kept = findings.filter((f) => f.code !== "DEFAULT_LAYER_NAMES" && f.code !== "HIDDEN_LAYERS");
          for (const f of a.placed) {
            if (f.upscaledPixels) kept.push({ severity: "warn", code: "UPSCALED_PIXELS", target: f.name, message: `Camada de pixels ampliada ${f.scale} %: use Smart Object ou arte maior.` });
          }
          errors += kept.filter((f) => f.severity === "error").length;
          warnings += kept.filter((f) => f.severity === "warn").length;
          return { artboard: a.name, size: `${a.rect.width}×${a.rect.height}`, placed: a.placed.map((p) => `${p.name} (${p.role}, ${p.scale} %)`), ...summarize(kept), findings: kept };
        });
        const out: Record<string, unknown> = { document: data.document, source: data.source, errors, warnings, artboards: boards };
        if (params.organize !== false) {
          try {
            const org = await organizePsDocument(router, data.document, { apply: true });
            out.organized = { groups: (org.groups as unknown[] | undefined)?.length ?? 0, skipped: org.skipped };
          } catch (eOrg) {
            out.organized = { error: (eOrg as Error).message.slice(0, 200), hint: "Run ps_organize_layers on the new document." };
          }
        }
        if (params.outputFolder) {
          const ex = await router.dispatch(
            "photoshop",
            "ps.artboards",
            {
              documentName: data.document,
              operation: "export",
              outputFolder: params.outputFolder,
              format: params.exportFormat ?? "png",
              quality: params.quality,
              fileNamePattern: `${data.source.replace(/\.[^.]+$/, "")}_{{name}}`
            },
            { timeoutMs: 300000 }
          );
          out.exported = (ex.data as { files?: unknown }).files;
        }
        const snap = await router.dispatch("photoshop", "ps.doc.snapshot", { maxDimension: 1600 }, { timeoutMs: 60000 });
        const sd = (snap.data || {}) as Record<string, unknown>;
        return buildImageToolResponse(out, {
          filePath: typeof sd.outputPath === "string" ? sd.outputPath : undefined,
          base64Data: typeof sd.previewBase64 === "string" ? sd.previewBase64 : undefined,
          includeImageContent: true
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_audit_document",
    "Check a Photoshop piece before delivery: canvas vs format, RGB/sRGB/8-bit, text outside the format's safe zone " +
      "(story bars, reels buttons, thumbnail duration badge), text contrast measured against the real background under " +
      "each text layer (WCAG 4.5:1, 3:1 for large text), text too small on a phone, layers with default names, empty " +
      "and hidden layers. Returns findings by severity. The format is guessed from the aspect unless given.",
    {
      documentName: z.string().optional(),
      format: z.enum(Object.keys(FORMATS) as [string, ...string[]]).optional(),
      minContrast: z.number().min(1).max(21).optional(),
      sampleBackground: z.boolean().optional().default(true),
      maxTextLayers: z.number().int().min(0).max(40).optional().default(12)
    },
    async (params) => {
      try {
        const res = await router.dispatch(
          "photoshop",
          "ps.audit",
          { documentName: params.documentName, sampleBackground: params.sampleBackground, maxTextLayers: params.maxTextLayers },
          { timeoutMs: 120000, undoGroup: "MCP: Audit" }
        );
        const data = res.data as PsAuditData;
        const { format, findings } = auditPhotoshop(data, { format: params.format, minContrast: params.minContrast });
        // Organisation: related layers left loose (icon + text, text on a shape, lists) -> ps_organize_layers.
        try {
          const li = await router.dispatch("photoshop", "ps.layers.layoutInfo", { documentName: params.documentName });
          const ld = (li.data || {}) as { width?: number; height?: number; layers?: Array<Record<string, unknown>> };
          const plan = planTree(psTreeToNodes(ld.layers ?? []), { width: Number(ld.width) || 1, height: Number(ld.height) || 1 });
          const loose = plan.plans.flatMap((p) => p.proposals);
          if (loose.length) {
            findings.push({
              severity: "warn",
              code: "UNGROUPED_RELATED",
              message: `${plan.ungroupedRelated} related layers are not grouped (${loose.map((g) => g.name).slice(0, 4).join("; ")}). Run ps_organize_layers.`
            });
          }
        } catch {
          /* older panel without ps.layers.layoutInfo: skip the organisation check */
        }
        return formatSuccessResponse({
          document: data.document,
          size: `${data.width}×${data.height}`,
          format,
          ...summarize(findings),
          findings,
          textLayers: data.layers.filter((l) => l.text).length
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_list_fonts",
    "List installed fonts with the PostScript names Photoshop text tools expect (search by family, style or name, " +
      "e.g. 'cormorant', 'dm sans medium').",
    {
      search: z.string().optional(),
      limit: z.number().int().positive().max(2000).optional().default(200)
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.fonts.list", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_place_file",
    "Place an image, PDF, AI or PSD file as a Smart Object layer (embedded, or linked), optionally fitted into a box " +
      "(x/y = top-left in px; fit contain/cover/width/height) and renamed. Bounds are those of the visible pixels. " +
      "Swap its contents later with ps_smart_object replaceContents.",
    {
      filePath: z.string().describe("Absolute path."),
      name: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      fit: z.enum(["contain", "cover", "width", "height", "none"]).optional(),
      linked: z.boolean().optional().default(false)
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.layer.place", params, { undoGroup: "MCP: Place file" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_list_actions",
    "List every Action set and Action loaded in Photoshop's Actions panel (including the user's own .atn sets).",
    {},
    async () => {
      try {
        const res = await router.dispatch("photoshop", "ps.action.list", {}, { timeoutMs: 60000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_play_action",
    "Play an Action from the Actions panel by set and action name (as listed by ps_list_actions).",
    {
      setName: z.string(),
      actionName: z.string()
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.action.play", params, {
          undoGroup: `MCP: Action ${params.actionName}`,
          timeoutMs: 180000
        });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_batch_play",
    "Photoshop escape hatch: run raw actionJSON descriptors (batchPlay format). Reaches anything Photoshop can record as an action (filters, adjustments, styles, smart objects, menu commands). Runs on the UXP panel, and on ExtendScript (CEP / COM) through a built-in actionJSON → ActionDescriptor converter. File paths may be plain absolute paths in {_path}. Check 'errorCount': failures come back as { _obj: 'error' } entries.",
    {
      descriptors: z
        .array(z.record(z.string(), z.unknown()))
        .min(1)
        .describe("Array of batchPlay ActionDescriptor objects (each having _obj, _target, etc.)."),
      options: z.record(z.string(), z.unknown()).optional().default({ synchronousExecution: false }),
      commandName: z.string().optional().default("MCP BatchPlay")
    },
    async ({ descriptors, options, commandName }) => {
      try {
        const res = await router.dispatch(
          "photoshop",
          "ps.raw.batchPlay",
          { descriptors, options, commandName },
          { undoGroup: commandName }
        );
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_execute_uxp_script",
    "Photoshop UXP escape hatch: execute arbitrary async JavaScript inside Photoshop's UXP environment with `app`, `core`, `action`, `batchPlay`, `uxp`, `constants` and `executionContext` in scope, inside an executeAsModal block. Requires the Photoshop UXP panel.",
    {
      code: z
        .string()
        .describe("JavaScript async body to execute. You can use `app`, `core`, `action`, `uxp`, and `return` any JSON-serializable value."),
      commandName: z.string().optional().default("MCP UXP Script")
    },
    async ({ code, commandName }) => {
      try {
        const res = await router.dispatch(
          "photoshop",
          "ps.raw.executeUxp",
          { code, commandName },
          { undoGroup: commandName, preferBridge: "uxp" }
        );
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_execute_extendscript",
    "Photoshop ExtendScript escape hatch: execute arbitrary .jsx (ES3) code in Photoshop. Runs through the CEP panel or, with no panel at all, through Windows COM DoJavaScript (the UXP panel cannot run ExtendScript, so the command is routed past it automatically).",
    {
      code: z.string().describe("ExtendScript (ES3) code to evaluate in Photoshop. The last evaluated expression is returned.")
    },
    async ({ code }) => {
      try {
        const res = await router.dispatch("photoshop", "ps.raw.executeExtendScript", { code });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}
