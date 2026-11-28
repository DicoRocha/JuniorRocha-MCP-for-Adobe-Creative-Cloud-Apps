/**
 * Photoshop recipes (phase 3): cut-out and product shot in one call. Both work on duplicates (the source is not
 * changed), keep every part editable (Smart Object + layer mask, fill layers) and export PNG by default.
 */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../core/bridge-router.js";
import { buildImageToolResponse, formatErrorResponse, formatSuccessResponse } from "../../core/image-helper.js";
import { FORMATS, resolveZones } from "../../core/formats.js";
import { hexToRgb, resolveKit } from "../../core/brand-kit.js";
import { downscaleBase64 } from "../../media/downscale.js";
import * as fsPreview from "node:fs";

const HEX = /^#?[0-9a-f]{6}$/i;
const norm = (h: string) => (h.startsWith("#") ? h : `#${h}`).toUpperCase();

/** Mixes a colour with white (amount > 0) or black (amount < 0); amount in -1..1. */
export function tint(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(norm(hex));
  const to = amount >= 0 ? 255 : 0;
  const a = Math.min(1, Math.abs(amount));
  const mix = (v: number) => Math.round(v + (to - v) * a);
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Canvas and safe margins for a product shot: a named format, or width/height with a 6 % margin. */
export function productCanvas(format?: string, width?: number, height?: number): { width: number; height: number; safe: { top: number; right: number; bottom: number; left: number }; format: string } {
  if (width && height) {
    const m = Math.round(Math.min(width, height) * 0.06);
    return { width, height, safe: { top: m, right: m, bottom: m, left: m }, format: "custom" };
  }
  const key = format ?? "square1x1";
  const f = FORMATS[key];
  if (!f) throw new Error(`Unknown format '${key}'. Use one of: ${Object.keys(FORMATS).join(", ")}, or width + height.`);
  const z0 = resolveZones(key, f.width, f.height);
  return {
    width: f.width,
    height: f.height,
    safe: { top: z0.safeRect.y, left: z0.safeRect.x, right: f.width - z0.safeRect.x - z0.safeRect.width, bottom: f.height - z0.safeRect.y - z0.safeRect.height },
    format: key
  };
}

/** Background for the product shot: explicit colour, else the kit's surface colour; the gradient centre is lighter. */
export function productBackground(opts: { background?: string; style?: "solid" | "gradient"; kitPath?: string }): { style: "solid" | "gradient"; edge: string; center: string } {
  const style = opts.style ?? "gradient";
  let edge = opts.background && HEX.test(opts.background) ? norm(opts.background) : "";
  if (!edge) edge = opts.kitPath ? resolveKit({ kitPath: opts.kitPath }).colors.superficie : "#E9E6E1";
  const [r, g, b] = hexToRgb(edge);
  const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  // light backgrounds get a white glow; dark ones a softer lift, so the product stays the brightest thing
  const center = tint(edge, light > 0.5 ? 0.55 : 0.18);
  return { style, edge, center };
}

const Source = {
  filePath: z.string().optional().describe("Image file to open (closed again unchanged). Default: documentName or the active document."),
  documentName: z.string().optional()
};

const Output = {
  outputPath: z.string().optional().describe("Image file to write (extension optional). PNG by default."),
  format: z.enum(["png", "jpg", "webp"]).optional().default("png"),
  quality: z.number().int().min(1).max(100).optional(),
  psdPath: z.string().optional().describe("Also save the layered result as a PSD copy.")
};

/**
 * Preview after a recipe. With closeAfter the working copy is already closed: no document may be open at all,
 * and a snapshot of "the active document" failed with "No active document" although the file was written
 * (21/11/2026). Then the written file itself is the preview; otherwise the snapshot is taken of the result.
 */
export async function recipePreview(
  router: BridgeRouter,
  data: Record<string, unknown>
): Promise<{ filePath?: string; base64Data?: string; mimeType?: string; previewNote?: string }> {
  const fileField = data.file as unknown;
  const written =
    typeof fileField === "string" ? fileField : fileField && typeof (fileField as { path?: unknown }).path === "string" ? String((fileField as { path: string }).path) : undefined;
  const docOpen = typeof data.document === "string" && data.document.length > 0;
  if (docOpen) {
    try {
      const snap = await router.dispatch("photoshop", "ps.doc.snapshot", { maxDimension: 1200, documentName: data.document }, { timeoutMs: 60000 });
      const sd = (snap.data || {}) as Record<string, unknown>;
      return {
        filePath: typeof sd.outputPath === "string" ? sd.outputPath : undefined,
        base64Data: typeof sd.previewBase64 === "string" ? sd.previewBase64 : undefined
      };
    } catch {
      // fall through to the written file
    }
  }
  if (written && /\.(png|jpe?g|webp)$/i.test(written) && fsPreview.existsSync(written)) {
    const mimeType = /\.png$/i.test(written) ? "image/png" : /\.webp$/i.test(written) ? "image/webp" : "image/jpeg";
    const raw = fsPreview.readFileSync(written).toString("base64");
    const small = mimeType === "image/webp" ? { base64: raw } : await downscaleBase64(raw, 1200, mimeType);
    return { base64Data: small.base64, mimeType, previewNote: "Preview from the written file (the working copy was closed)." };
  }
  return { previewNote: "No preview: the working copy was closed and no image file was written." };
}

export function registerPhotoshopRecipes(server: McpServer, router: BridgeRouter): void {
  server.tool(
    "ps_recolor_object",
    "Recolour an object that already has colour (shirt, product, wall) the controllable way: one masked group with three separate " +
      "adjustments — hue (solid fill in Hue blend mode), saturation (Hue/Saturation) and luminosity (Curves on RGB). " +
      "Avoids the Color blend mode, which over-saturates. Give a mask PNG (white = object) or select the object first.",
    {
      documentName: z.string().optional(),
      color: z.string().describe("Target colour '#RRGGBB' (only its hue is used)."),
      saturation: z.number().int().min(-100).max(100).optional().describe("Hue/Saturation saturation, e.g. -33 for red fabric to brand purple."),
      curve: z.array(z.array(z.number().min(0).max(255)).length(2)).min(2).optional().describe("RGB curve points [[in,out],…], e.g. [[0,0],[125,105],[255,231]] to darken."),
      maskPath: z.string().optional().describe("PNG with the object in white (same size as the document)."),
      feather: z.number().min(0).optional().describe("Mask feather in px (2 is a good start; dilate the mask 2–3 px first to avoid a fringe)."),
      groupName: z.string().optional()
    },
    async (params) => {
      try {
        if (!HEX.test(params.color)) throw new Error("color must be '#RRGGBB'.");
        const res = await router.dispatch("photoshop", "ps.recolor.object", { ...params, color: norm(params.color) }, { undoGroup: "MCP: Recolor", timeoutMs: 180000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_blend_if",
    "Blend If (Layer Style > Blending Options) on a layer: split the underlying-layer black/white sliders so shadows and texture of what is " +
      "below show through — e.g. a white logo on fabric: opacity 90, underlyingBlack [15, 75]. Not readable through layer 'get'; set it here.",
    {
      documentName: z.string().optional(),
      layerName: z.string(),
      underlyingBlack: z.array(z.number().int().min(0).max(255)).length(2).optional(),
      underlyingWhite: z.array(z.number().int().min(0).max(255)).length(2).optional(),
      thisBlack: z.array(z.number().int().min(0).max(255)).length(2).optional(),
      thisWhite: z.array(z.number().int().min(0).max(255)).length(2).optional(),
      opacity: z.number().min(0).max(100).optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.layer.blendIf", params, { undoGroup: "MCP: Blend If" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_center_text_in_shape",
    "Centres a text layer inside a shape layer (button, pill, tag, card) by the CAP HEIGHT of the text, which is how the eye reads it: " +
      "the ink box of a line with descenders or accents sits off-centre. Multi-line point text is centred from the first cap top to the " +
      "last baseline; paragraph text falls back to the ink box. Returns the space left on each side; offsetY nudges it optically. " +
      "With layerNames it centres a set of layers on both axes (block of lines, price phrase).",
    {
      documentName: z.string().optional(),
      textLayerName: z.string().optional(),
      textLayerId: z.number().int().optional(),
      shapeLayerName: z.string().optional(),
      shapeLayerId: z.number().int().optional(),
      mode: z.enum(["capHeight", "ink"]).optional().default("capHeight"),
      horizontal: z.boolean().optional().default(true),
      vertical: z.boolean().optional().default(true),
      offsetX: z.number().optional().describe("Extra px to the right (optical adjustment)."),
      offsetY: z.number().optional().describe("Extra px downwards (optical adjustment)."),
      layerNames: z
        .array(z.string())
        .optional()
        .describe("Centre a SET as one (a text block of several layers, a price, icon + text): the box around their ink goes to the centre of the shape, measured without effects; the layers keep their positions relative to each other.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.text.centerInShape", params, { undoGroup: "MCP: Center text in shape" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_motion_trail",
    "Speed on an object (icon, product, ball): turns the layer into a Smart Object, puts a motion-blurred copy behind it shifted " +
      "back along the movement (the trail) and a light motion blur on the object itself. The source asset should be sharp (no blur " +
      "baked in by the image generator): the blur is done here, editable as Smart Filters.",
    {
      documentName: z.string().optional(),
      layerName: z.string(),
      angle: z.number().optional().default(0).describe("Direction of the movement in degrees (0 = horizontal)."),
      distance: z.number().min(1).max(999).optional().default(90).describe("Trail blur distance, px."),
      offset: z.number().optional().default(30).describe("Trail shift in px along the angle (negative = the other side)."),
      trailOpacity: z.number().min(0).max(100).optional().default(85),
      selfBlur: z.number().min(0).max(200).optional().default(12).describe("Light blur on the object itself (0 = sharp).")
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.recipe.motionTrail", params, { undoGroup: "MCP: Motion trail", timeoutMs: 70000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_price_tag",
    "A price set as one phrase (\"PLANOS A PARTIR DE R$ 59,90/mês\"): creates the text layers in the shape's artboard, puts the currency, " +
      "cents and period at the same distance from the value as the gap between its own digits (cents on top, period on the baseline), " +
      "the label a line gap above, and centres the set in the shape (measured without its shadow).",
    {
      documentName: z.string().optional(),
      shapeLayerName: z.string().describe("Card/shape that holds the price."),
      value: z.string().describe("Main number, e.g. '59'."),
      currency: z.string().optional().default("R$"),
      cents: z.string().optional().describe("e.g. ',90'."),
      period: z.string().optional().describe("e.g. '/mês'."),
      label: z.string().optional().describe("e.g. 'PLANOS A PARTIR DE'."),
      valueSize: z.number().positive().optional().default(120).describe("px."),
      fonts: z
        .object({ value: z.string().optional(), currency: z.string().optional(), cents: z.string().optional(), period: z.string().optional(), label: z.string().optional() })
        .optional()
        .describe("PostScript names (default Poppins ExtraBold/SemiBold/Bold/Medium)."),
      accentColor: z.string().optional().default("#F26A1B"),
      mutedColor: z.string().optional().default("#6B6B6B"),
      namePrefix: z.string().optional().default("Preco")
    },
    async (params) => {
      try {
        const f = { value: "Poppins-ExtraBold", currency: "Poppins-SemiBold", cents: "Poppins-Bold", period: "Poppins-Medium", label: "Poppins-Medium", ...(params.fonts ?? {}) };
        const q = await router.dispatch("photoshop", "ps.text.arrangePrice", { documentName: params.documentName, queryShape: params.shapeLayerName });
        const b = (q.data as { bounds: number[] }).bounds;
        const pos: [number, number] = [Math.round(b[0] + 20), Math.round((b[1] + b[3]) / 2)];
        const vs = params.valueSize;
        const make = async (name: string, text: string, font: string, size: number, color: string) => {
          await router.dispatch("photoshop", "ps.layer.create", { documentName: params.documentName, layerType: "text", name, text, font, fontSize: size, color, position: pos }, { undoGroup: "MCP: Price tag" });
          return name;
        };
        const P = params.namePrefix;
        const names: Record<string, string | undefined> = {};
        if (params.label) names.labelLayer = await make(`${P} rotulo`, params.label, f.label, Math.round(vs * 0.18), params.mutedColor);
        names.valueLayer = await make(`${P} valor`, params.value, f.value, vs, params.accentColor);
        if (params.currency) names.currencyLayer = await make(`${P} moeda`, params.currency, f.currency, Math.round(vs * 0.28), params.accentColor);
        if (params.cents) names.centsLayer = await make(`${P} centavos`, params.cents, f.cents, Math.round(vs * 0.38), params.accentColor);
        if (params.period) names.periodLayer = await make(`${P} periodo`, params.period, f.period, Math.round(vs * 0.2), params.mutedColor);
        const res = await router.dispatch("photoshop", "ps.text.arrangePrice", { documentName: params.documentName, shapeLayer: params.shapeLayerName, ...names }, { undoGroup: "MCP: Price tag" });
        return formatSuccessResponse({ layers: names, ...(res.data as object) });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_place_logo",
    "Places the brand logo (PNG/SVG/AI/PSD file from the kit) as a Smart Object in a corner of the document or of one artboard, sized as a " +
      "fraction of the width and kept away from the edges by the house margin (default 18 % wide, margin 6 % of the short side).",
    {
      documentName: z.string().optional(),
      filePath: z.string().describe("Logo file (use the version for the background: light logo on dark art and the reverse)."),
      artboard: z.string().optional().describe("Artboard name (default: the whole document)."),
      corner: z
        .enum(["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"])
        .optional()
        .default("bottom-right"),
      widthFraction: z.number().min(0.02).max(1).optional().describe("Logo width as a fraction of the area width (default 0.18)."),
      width: z.number().positive().optional().describe("Logo width in px (wins over widthFraction)."),
      maxHeightFraction: z.number().min(0.02).max(1).optional(),
      marginFraction: z.number().min(0).max(0.4).optional().describe("Margin as a fraction of the short side (default 0.06)."),
      margin: z.number().min(0).optional().describe("Margin in px (wins over marginFraction)."),
      opacity: z.number().min(0).max(100).optional(),
      name: z.string().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.logo.place", params, { undoGroup: "MCP: Place logo" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_create_shape",
    "Live shape layer: rounded rectangle (buttons, badges, cards), rectangle or ellipse, with an editable fill " +
      "colour. Position and size in pixels (top-left x, y). The corner radius stays editable in Properties; " +
      "radius = height / 2 makes a pill button.",
    {
      documentName: z.string().optional(),
      shape: z.enum(["rounded", "rectangle", "ellipse"]).optional().describe("Default rounded."),
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
      radius: z.number().min(0).optional().describe("Corner radius in px (rounded); capped at half the smaller side."),
      color: z.string().optional().describe("'#RRGGBB' (default black)."),
      opacity: z.number().min(0).max(100).optional(),
      name: z.string().optional()
    },
    async (params) => {
      try {
        if (params.color && !HEX.test(params.color)) throw new Error("color must be '#RRGGBB'.");
        const res = await router.dispatch("photoshop", "ps.shape.create", { ...params, color: params.color ? norm(params.color) : undefined }, { undoGroup: "MCP: Shape" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_remove_background",
    "Recipe: cut out the subject of a photo in one call. Works on a duplicate of the whole document: one layer turned " +
      "into a Smart Object, Photoshop's Remove Background (or Select Subject) applied as an editable layer mask, " +
      "optional solid background colour and crop to the subject with padding, PNG with transparency by default. " +
      "Returns the subject box and coverage with warnings (nothing removed, tiny subject) and a preview. Hair and " +
      "glass edges still need Select and Mask by hand.",
    {
      ...Source,
      method: z.enum(["removeBackground", "selectSubject"]).optional().describe("Default removeBackground (falls back to selectSubject)."),
      smartObject: z.boolean().optional().describe("Convert to Smart Object first (default true)."),
      background: z.string().optional().describe("'#RRGGBB' fill layer under the subject; default none (transparent)."),
      cropToSubject: z.boolean().optional().describe("Trim to the subject (less empty transparent area: easier to edit after placing in Illustrator or InDesign). Leave off when the full frame must line up with the original photo."),
      closeAfter: z.boolean().optional().describe("With outputPath: close the working copy after writing the file."),
      padding: z.number().min(0).optional().describe("Pixels around the subject when cropping (default 0)."),
      ...Output
    },
    async (params) => {
      try {
        if (params.background && !HEX.test(params.background)) throw new Error("background must be '#RRGGBB'.");
        const res = await router.dispatch(
          "photoshop",
          "ps.recipe.removeBackground",
          { ...params, background: params.background ? norm(params.background) : undefined },
          { timeoutMs: 300000, undoGroup: "MCP: Remove background" }
        );
        const data = res.data as Record<string, unknown>;
        const pv = await recipePreview(router, data);
        return buildImageToolResponse(pv.previewNote ? { ...data, previewNote: pv.previewNote } : data, {
          filePath: pv.filePath,
          base64Data: pv.base64Data,
          mimeType: pv.mimeType,
          includeImageContent: true
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_pop_out",
    "Recipe: 'out of bounds' / pop-out portrait in one call (also asked for as: person coming out of a circle, breaking " +
      "the frame, 3D pop-out). Works on a duplicate of the document, or in the document itself on a named layer " +
      "(inPlace / layerName) when the photo is part of a layout in progress. Cuts the subject out, puts a shape behind it " +
      "(circle by default), clips the subject to the shape so the shape crops the body, then adds an unclipped copy " +
      "of the subject whose mask hides everything below a cut line: the head and shoulders stick out of the shape. " +
      "Layers, in one group: Subject top, Subject (clipped), Shape — all editable; move the Shape or repaint the " +
      "masks to adjust. By default the shape is 1.5× the subject's width, centred on it, with its top 22 % of its " +
      "height below the top of the subject, and the cut line at the middle of the shape. If an arm or object leaves " +
      "the shape below the cut line it is cropped by the shape: lower cutAt or widen the shape. Returns the geometry " +
      "and a preview.",
    {
      ...Source,
      inPlace: z.boolean().optional().describe("Build it in the open document itself, on the active layer or the one named, keeping its place in the stack (the photo inside a layout in progress). Default: work on a duplicate."),
      layerName: z.string().optional().describe("Photo layer to use (implies inPlace)."),
      layerId: z.number().int().optional(),
      cutout: z.enum(["auto", "yes", "no"]).optional().describe("auto: keep a layer mask that is already there, else remove the background; no: take the layer as it is (already transparent)."),
      keepBackground: z.boolean().optional().describe("Show the original photo, background included, inside the shape (the top copy stays cut out)."),
      method: z.enum(["removeBackground", "selectSubject"]).optional().describe("Cut-out method. Default removeBackground (falls back to selectSubject)."),
      shape: z.enum(["circle", "ellipse", "rectangle", "roundedRectangle"]).optional().describe("Default circle."),
      shapeColor: z.string().optional().describe("'#RRGGBB' fill of the shape."),
      shapeBounds: z
        .object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() })
        .optional()
        .describe("Exact box of the shape in px. Default: derived from the subject (shapeScale, overflow)."),
      shapeScale: z.number().min(0.5).max(4).optional().describe("Shape width as a multiple of the subject's width (default 1.5)."),
      shapeAspect: z.number().min(0.2).max(5).optional().describe("Height / width for ellipse and rectangles (default 1). Ignored for circle."),
      radius: z.number().min(0).optional().describe("Corner radius in px for roundedRectangle."),
      overflow: z.number().min(0).max(0.9).optional().describe("How far the subject sticks out above the shape, as a share of the shape's height (default 0.22)."),
      cutAt: z.number().min(0).max(1).optional().describe("Cut line of the top copy, 0 = top of the shape, 1 = bottom (default 0.5). Above it the subject may leave the shape; below it the shape crops it."),
      background: z.string().optional().describe("'#RRGGBB' fill layer under everything; default none (transparent)."),
      groupName: z.string().optional(),
      ...Output
    },
    async (params) => {
      try {
        for (const k of ["shapeColor", "background"] as const) {
          if (params[k] && !HEX.test(params[k] as string)) throw new Error(`${k} must be '#RRGGBB'.`);
        }
        const res = await router.dispatch(
          "photoshop",
          "ps.recipe.popOut",
          {
            ...params,
            shapeColor: params.shapeColor ? norm(params.shapeColor) : undefined,
            background: params.background ? norm(params.background) : undefined
          },
          { timeoutMs: 300000, undoGroup: "MCP: Pop-out" }
        );
        const data = res.data as Record<string, unknown>;
        const pv = await recipePreview(router, data);
        return buildImageToolResponse(pv.previewNote ? { ...data, previewNote: pv.previewNote } : data, {
          filePath: pv.filePath,
          base64Data: pv.base64Data,
          mimeType: pv.mimeType,
          includeImageContent: true
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_product_shot",
    "Recipe: product photo → finished product shot in one call. Cuts the product out (skipped when the file already " +
      "has transparency), opens a new document in the format (default square 1:1) with a radial-gradient or solid " +
      "background from the brand kit, fits the product as a Smart Object inside the safe area (resting on the lower " +
      "part by default) and adds a soft contact shadow. Layers: Produto, Sombra, Fundo — all editable. PNG by default.",
    {
      ...Source,
      format: z.enum(Object.keys(FORMATS) as [string, ...string[]]).optional().describe("Canvas format (default square1x1)."),
      width: z.number().int().positive().optional().describe("Custom canvas width in px (with height)."),
      height: z.number().int().positive().optional(),
      kitPath: z.string().optional().describe("kit-de-marca.json: the surface colour becomes the background."),
      background: z.string().optional().describe("'#RRGGBB' background (overrides the kit)."),
      backgroundStyle: z.enum(["solid", "gradient"]).optional().describe("Default gradient (lighter centre)."),
      cutout: z.enum(["auto", "yes", "no"]).optional().describe("auto: cut out unless the image already has transparency."),
      method: z.enum(["removeBackground", "selectSubject"]).optional(),
      fill: z.number().min(0.2).max(1).optional().describe("Share of the safe area the product may take (default 0.72)."),
      anchor: z.enum(["floor", "center"]).optional().describe("floor: product rests on the lower part (default); center."),
      shadow: z.enum(["contact", "none"]).optional(),
      shadowOpacity: z.number().min(0).max(100).optional(),
      documentTitle: z.string().optional(),
      outputPath: Output.outputPath,
      exportFormat: z.enum(["png", "jpg", "webp"]).optional().default("png"),
      quality: Output.quality,
      psdPath: Output.psdPath
    },
    async (params) => {
      try {
        const canvas = productCanvas(params.format, params.width, params.height);
        const bg = productBackground({ background: params.background, style: params.backgroundStyle, kitPath: params.kitPath });
        const res = await router.dispatch(
          "photoshop",
          "ps.recipe.productShot",
          {
            filePath: params.filePath,
            documentName: params.documentName,
            width: canvas.width,
            height: canvas.height,
            safe: canvas.safe,
            background: bg.edge,
            backgroundCenter: bg.center,
            backgroundStyle: bg.style,
            cutout: params.cutout,
            method: params.method,
            fill: params.fill,
            anchor: params.anchor,
            shadow: params.shadow,
            shadowOpacity: params.shadowOpacity,
            documentTitle: params.documentTitle,
            outputPath: params.outputPath,
            format: params.exportFormat,
            quality: params.quality,
            psdPath: params.psdPath
          },
          { timeoutMs: 300000, undoGroup: "MCP: Product shot" }
        );
        const data = { ...(res.data as Record<string, unknown>), format: canvas.format };
        const pv = await recipePreview(router, data);
        return buildImageToolResponse(pv.previewNote ? { ...data, previewNote: pv.previewNote } : data, {
          filePath: pv.filePath,
          base64Data: pv.base64Data,
          mimeType: pv.mimeType,
          includeImageContent: true
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  const hex = z.string().regex(/^#?[0-9a-fA-F]{6}$/, "colour as #RRGGBB");
  const pathItem = z.object({
    type: z.enum(["rounded", "rectangle", "ellipse", "polyline", "polygon"]).default("rounded"),
    op: z
      .enum(["add", "subtract", "intersect", "exclude"])
      .optional()
      .describe("Combine Shapes / Subtract Front Shape / Intersect Shape Areas / Exclude Overlapping Shapes. The first item is always add."),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    radius: z.number().min(0).optional().describe("rounded: corner radius, px."),
    points: z
      .array(z.array(z.number()).min(2).max(3))
      .optional()
      .describe("polyline: [[x,y], ...] (open path, use with stroke). polygon: [[x,y,radius?], ...] around the shape, every corner rounded (convex and concave)."),
    cornerRadius: z.number().min(0).optional().describe("polygon: radius for the vertices that do not give their own."),
    closed: z.boolean().optional().describe("polyline: close it (a polygon, e.g. a speech-bubble tail).")
  });

  server.tool(
    "ps_create_path_shape",
    "One shape layer made of several components combined with Photoshop's shape modes (Combine Shapes = add, Subtract Front Shape = " +
      "subtract, Intersect, Exclude), like drawing with the shape tools in those modes: an abstract 'window' of rounded rectangles " +
      "joined and cut, a speech bubble (rounded rect + tail), a frame with a hole. Also open paths (polyline) for lines with a stroke " +
      "and no fill. polygon: the outline as points with a radius per vertex, so EVERY corner is rounded (adding/subtracting rounded " +
      "rectangles leaves pointed corners where the shapes meet). The components stay live. Clip a photo to it for a window.",
    {
      documentName: z.string().optional(),
      items: z.array(pathItem).min(1).describe("Components in order (document px, top-left origin)."),
      fill: hex.nullable().optional().default("#FFFFFF").describe("null = no fill (outline or line only)."),
      stroke: z
        .object({
          width: z.number().positive().default(2),
          color: hex.default("#FFFFFF"),
          align: z.enum(["inside", "center", "outside"]).optional(),
          cap: z.enum(["butt", "round"]).optional(),
          opacity: z.number().min(0).max(100).optional()
        })
        .optional(),
      name: z.string().optional(),
      aboveLayer: z.string().optional().describe("Create right above this layer (puts it in that layer's group/artboard)."),
      artboard: z.string().optional().describe("Look for aboveLayer only inside this artboard."),
      opacity: z.number().min(0).max(100).optional(),
      fillOpacity: z.number().min(0).max(100).optional(),
      blendMode: z.string().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.shape.path", params, { undoGroup: "MCP: Path shape", timeoutMs: 45000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_callout",
    "Callout line from a tag/label to a point on the subject, like the Pen tool in Shape mode: an angled run then a straight run " +
      "(give the points), stroke only (2 px), and a double dot at one end (ring 18 px with a 1 px stroke at 90 % + filled dot 10 px). " +
      "groupWith puts the line, the dots and the tag layers in one group (one group per tag inside the tags group).",
    {
      documentName: z.string().optional(),
      points: z.array(z.array(z.number()).length(2)).min(2).describe("[[x,y], ...] in document px, e.g. tag edge → elbow → point on the subject."),
      dotAt: z.enum(["start", "end"]).optional().default("end"),
      name: z.string().describe("Base name: 'Linha <name>', 'Ponto <name>', 'Ponto <name> anel'."),
      color: hex.optional().default("#FFFFFF"),
      lineWidth: z.number().positive().optional().default(2),
      ringDiameter: z.number().min(0).optional().default(18),
      dotDiameter: z.number().min(0).optional().default(10),
      aboveLayer: z.string().optional(),
      artboard: z.string().optional(),
      groupWith: z.array(z.string()).optional().describe("Tag layers (glass, circle, icon, text) to group with the line and the dots."),
      groupName: z.string().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.recipe.callout", params, { undoGroup: "MCP: Callout", timeoutMs: 45000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_group_layers",
    "Group the named layers into a new group where they are (inside their artboard or group), e.g. one group per tag with its line " +
      "and dots inside the 'Tags' group. Same names in several artboards: pass artboard.",
    {
      documentName: z.string().optional(),
      layerNames: z.array(z.string()).optional(),
      layerIds: z.array(z.number().int()).optional(),
      groupName: z.string(),
      artboard: z.string().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.layers.group", params, { undoGroup: "MCP: Group layers" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_gradient_background",
    "Background of an artboard as a rectangle of the artboard's size + Gradient Overlay (radial by default). Unlike a gradient fill " +
      "layer it does not shift when the artboard is duplicated to another format. Optional sun: a sharp disc (blur 0-1 px) in the " +
      "centre colour, visible because the gradient is darker outside it. Measure inside the sun, just outside and in the corners.",
    {
      documentName: z.string().optional(),
      artboard: z.string(),
      stops: z
        .array(z.object({ color: hex, location: z.number().min(0).max(100) }))
        .min(2)
        .optional()
        .describe("Default red: #D8060A 0 · #B00206 39 · #8A0106 73 · #6A0105 100."),
      type: z.enum(["radial", "linear"]).optional().default("radial"),
      angle: z.number().optional().default(90),
      scale: z.number().min(10).max(150).optional().default(105),
      offsetX: z.number().optional().default(0).describe("% of the layer."),
      offsetY: z.number().optional().default(-12).describe("% of the layer (negative = up)."),
      name: z.string().optional(),
      sun: z
        .object({
          diameter: z.number().positive().optional(),
          centerX: z.number().optional().describe("px from the artboard's left."),
          centerY: z.number().optional().describe("px from the artboard's top."),
          color: hex.optional(),
          blur: z.number().min(0).max(10).optional().default(1),
          name: z.string().optional()
        })
        .optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.recipe.gradientBackground", params, { undoGroup: "MCP: Gradient background", timeoutMs: 45000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_vignette",
    "Vignette that values the subject: selects what keeps its tone (an ellipse, or the subject expanded), inverts, adds an adjustment " +
      "layer on the rest (Hue/Saturation lightness by default, or Curves / Levels) and softens the edge with the mask's Feather " +
      "(non-destructive; default ~5.5 % of the short side, at least 60 px — 80 px on 1080x1440). It should rarely be noticed; it can be " +
      "strong as long as the shape cannot be seen. Put it above the background/photo layers and below texts and cards. It darkens the " +
      "background only: by default a cutout copy of the subject goes right above it.",
    {
      documentName: z.string().optional(),
      artboard: z.string().optional(),
      aboveLayer: z.string().optional().describe("Create right above this layer (e.g. the background photo)."),
      shape: z.enum(["ellipse", "subject"]).optional().default("ellipse"),
      bounds: z
        .object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() })
        .optional()
        .describe("ellipse: box in document px (default: 76 % x 70 % of the artboard, a bit above the centre)."),
      subjectLayer: z.string().optional().describe("shape subject: the photo layer to select the subject from (default aboveLayer)."),
      expand: z.number().min(0).optional().describe("shape subject: grow the selection so the subject sits inside the light area (default 60)."),
      adjustment: z.enum(["hueSaturation", "curves", "levels"]).optional().default("hueSaturation"),
      amount: z.number().min(1).max(100).optional().default(42).describe("hueSaturation: lightness −amount; curves/levels: how much darker."),
      saturation: z.number().min(-100).max(100).optional().describe("hueSaturation: also change saturation outside the subject."),
      feather: z.number().min(0).max(1000).optional().describe("Mask feather in px (60+; bigger files need more)."),
      name: z.string().optional(),
      protectSubject: z
        .boolean()
        .optional()
        .default(true)
        .describe("Cutout copy of the subject (from subjectLayer/aboveLayer) right above the vignette, so only the background darkens. false only when a cutout already sits above."),
      subjectName: z.string().optional().describe("Name of the subject copy (default 'Assunto sobre a vinheta').")
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.recipe.vignette", params, { undoGroup: "MCP: Vignette", timeoutMs: 60000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ps_recipe_background_blur_clean",
    "Blur a photo's background without a halo around the people: selects the subject on the scene layer, expands it (~10 px), " +
      "removes the people from a copy with Content-Aware Fill (local, no generative credits), turns it into a Smart Object with a " +
      "Gaussian Blur, and puts the subject cutout from the original on top. The original scene stays hidden below. Never blur a " +
      "scene that still has the subject in it when a cutout of that subject sits on top: that is what makes the halo. method remove uses " +
      "Photoshop's Remove tool instead (better fill, may spend generative credits: only with the person's consent; two steps, the person " +
      "clicks Remove between them).",
    {
      documentName: z.string().optional(),
      layerName: z.string().describe("The scene/photo layer."),
      artboard: z.string().optional(),
      expand: z.number().min(0).max(100).optional().default(10),
      radius: z.number().min(1).max(250).optional().default(12).describe("Gaussian blur radius, px."),
      subjectName: z.string().optional(),
      addSubject: z.boolean().optional().default(true).describe("false when the document already has the subject cutout on top (a pop-out copy)."),
      method: z
        .enum(["contentAware", "remove"])
        .optional()
        .default("contentAware")
        .describe("contentAware: Content-Aware Fill, local and free (default). remove: Photoshop's Remove tool (AI, better fill) — may spend the person's generative credits: ASK FIRST."),
      allowGenerativeCredits: z.boolean().optional().describe("method remove: true only after the person agreed to spend credits."),
      step: z.enum(["prepare", "finish"]).optional().describe("method remove: 'prepare' hides the layers above and selects the subject; the person clicks Remove; 'finish' stamps, blurs and restores."),
      hiddenLayerIds: z.array(z.number().int()).optional().describe("method remove, finish: the ids 'prepare' returned."),
      editsLayerName: z.string().optional().describe("method remove, finish: the layer Remove created (default 'Remove tool edits').")
    },
    async (params) => {
      try {
        const res = await router.dispatch("photoshop", "ps.recipe.backgroundBlurClean", params, { undoGroup: "MCP: Background blur (clean)", timeoutMs: 120000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}
