import { z } from "zod";
import * as path from "node:path";
import { fillPattern, loadRecords } from "../../core/records.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../core/bridge-router.js";
import {
  buildImageToolResponse,
  formatErrorResponse,
  formatSuccessResponse
} from "../../core/image-helper.js";
import { LIVE_EFFECTS, buildLiveEffectXml } from "./live-effects.js";

const ItemTarget = {
  uuids: z.array(z.string()).optional().describe("Object uuids from ai_find_objects (most reliable)."),
  itemNames: z.array(z.string()).optional().describe("Object names."),
  layerName: z.string().optional().describe("Every top-level object in this layer."),
  useSelection: z.boolean().optional().default(true).describe("Use the current selection when nothing else is given."),
  artboardIndex: z.number().int().min(0).optional().describe("Artboard for coordinates (default: active artboard).")
};

const AiColorSchema = z
  .union([
    z.string().describe("Hex color '#RRGGBB'"),
    z.object({
      r: z.number().min(0).max(255),
      g: z.number().min(0).max(255),
      b: z.number().min(0).max(255)
    })
  ])
  .describe("RGB color as hex string ('#RRGGBB') or { r, g, b } (0-255).");

export function registerIllustratorTools(server: McpServer, router: BridgeRouter): void {
  server.tool(
    "ai_get_document_info",
    "Retrieve active Adobe Illustrator document metadata, dimensions, color space, artboards, layers, and page item counts.",
    {},
    async () => {
      try {
        const res = await router.dispatch("illustrator", "ai.doc.getInfo", {});
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_manage_document",
    "Create, open, save, save-as, or close an Adobe Illustrator document (.ai, .svg, .eps, .pdf).",
    {
      operation: z.enum(["create", "open", "save", "close"]).default("create"),
      title: z.string().optional().default("Untitled-MCP"),
      width: z.number().positive().optional().default(1920).describe("Width in points/pixels."),
      height: z.number().positive().optional().default(1080).describe("Height in points/pixels."),
      colorSpace: z.enum(["RGB", "CMYK"]).optional().default("RGB"),
      numArtboards: z.number().int().min(1).max(100).optional().default(1),
      filePath: z.string().optional().describe("File path for open or save."),
      saveChanges: z.boolean().optional().default(false).describe("Save changes when operation='close'.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.doc.manage", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_manage_artboards",
    "Add, activate, or remove artboards in the active Illustrator document.",
    {
      operation: z.enum(["add", "setActive", "remove"]).default("add"),
      name: z.string().optional(),
      index: z.number().int().min(0).optional().describe("0-based artboard index."),
      rect: z
        .array(z.number())
        .length(4)
        .optional()
        .describe("Illustrator artboard rectangle [left, top, right, bottom] where top > bottom (e.g. [0, 1080, 1920, 0]).")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.artboard.manage", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_manage_layers",
    "Add, rename, toggle visibility/lock, or delete layers in the active Illustrator document.",
    {
      operation: z.enum(["add", "update", "delete"]).default("add"),
      layerIndex: z.number().int().min(0).optional(),
      layerName: z.string().optional(),
      name: z.string().optional().describe("Name when adding a layer."),
      newName: z.string().optional(),
      visible: z.boolean().optional(),
      locked: z.boolean().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.layer.manage", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_create_shape",
    "Create vector primitive shapes (rectangle, rounded rectangle, ellipse, polygon, star) in Illustrator with fill and stroke styling.",
    {
      shapeType: z.enum(["rectangle", "ellipse", "polygon", "star"]).default("rectangle"),
      name: z.string().optional(),
      top: z.number().optional().default(700).describe("Top Y coordinate (Illustrator artboard coordinates)."),
      left: z.number().optional().default(100).describe("Left X coordinate."),
      width: z.number().positive().optional().default(300),
      height: z.number().positive().optional().default(300),
      cornerRadius: z.number().min(0).optional(),
      radius: z.number().positive().optional().describe("Polygon radius."),
      sides: z.number().int().min(3).optional().default(6),
      outerRadius: z.number().positive().optional(),
      innerRadius: z.number().positive().optional(),
      points: z.number().int().min(3).optional().default(5),
      fillColor: AiColorSchema.optional(),
      filled: z.boolean().optional().default(true),
      strokeColor: AiColorSchema.optional(),
      strokeWidth: z.number().min(0).optional(),
      stroked: z.boolean().optional(),
      opacity: z.number().min(0).max(100).optional().default(100)
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.vector.createShape", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_create_bezier_path",
    "Draw custom precision vector paths and Bezier curves in Illustrator by specifying anchor points and left/right control handles.",
    {
      name: z.string().optional(),
      closed: z.boolean().optional().default(true),
      points: z
        .array(
          z.object({
            anchor: z.array(z.number()).length(2).describe("[x, y] anchor coordinate."),
            leftDirection: z.array(z.number()).length(2).optional().describe("[x, y] incoming Bezier handle."),
            rightDirection: z.array(z.number()).length(2).optional().describe("[x, y] outgoing Bezier handle."),
            pointType: z.enum(["corner", "smooth"]).optional().default("corner")
          })
        )
        .min(2),
      fillColor: AiColorSchema.optional(),
      strokeColor: AiColorSchema.optional(),
      strokeWidth: z.number().min(0).optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.vector.createBezierPath", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_create_text",
    "Create a typography TextFrame in Illustrator, configure font/size/color, and optionally convert text to vector outlines (`createOutlines`).",
    {
      contents: z.string().describe("Text string to render."),
      position: z.array(z.number()).length(2).optional().default([100, 600]).describe("[x, y] coordinate."),
      name: z.string().optional(),
      fontSize: z.number().positive().optional().default(48),
      fontName: z.string().optional().describe("PostScript font name (e.g. 'ArialMT')."),
      fillColor: AiColorSchema.optional(),
      createOutlines: z.boolean().optional().default(false).describe("Convert text frame into editable vector paths.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.text.create", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_text_on_path",
    "Text on a circular arc for seals, badges and stamps: 'text' runs over the top of the circle (outside), " +
      "'bottomText' under it, upright, in the same ring; both centred and editable on their paths. Default centre: " +
      "the active artboard; coordinates as in ai_create_text. Optional outlines.",
    {
      text: z.string().optional(),
      bottomText: z.string().optional(),
      center: z.array(z.number()).length(2).optional().describe("[x, y]; default: centre of the active artboard."),
      radius: z.number().positive().optional().describe("Baseline radius of the top text (default 35 % of the artboard)."),
      arcDegrees: z.number().min(30).max(350).optional().describe("Arc span each text may use (default 160)."),
      fontSize: z.number().positive().optional(),
      fontName: z.string().optional().describe("PostScript name."),
      fillColor: AiColorSchema.optional(),
      tracking: z.number().optional().describe("Letter spacing in 1/1000 em (seals usually 50–200)."),
      name: z.string().optional().describe("Prefix for the item names (default 'Selo')."),
      createOutlines: z.boolean().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.text.onPath", params, { undoGroup: "MCP: Text on path" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_get_artboard_preview",
    "Multimodal Visual Feedback: Export the active Illustrator artboard as a PNG24 preview and return it as inline base64 ImageContent so the AI can visually inspect the vector artwork.",
    {
      outputPath: z.string().optional(),
      artboardIndex: z.number().int().min(0).optional().describe("0-based artboard to preview (default: the active artboard)."),
      scale: z.number().min(10).max(400).optional().default(100).describe("Export scale percentage (default 100%)."),
      transparency: z.boolean().optional().default(true),
      includeImageContent: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.export.artboardPreview", params);
        const dataObj = (res.data || {}) as Record<string, unknown>;
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
    "ai_batch_variants",
    "Variations from a spreadsheet (Illustrator's answer to data-driven graphics): in an open template, page items are " +
      "named after the data columns — text frames get the text, placed images are relinked to the file in the cell (fitted " +
      "into the original frame), a '#RRGGBB' cell recolours a path, 'hide'/'show' toggles an item. Each record exports one " +
      "artboard (png/jpg/svg) named by fileNamePattern ({{column}}, {{#}}); the document returns to its original state. " +
      "Badges, price tags, name cards, icon sets, social tiles.",
    {
      csvPath: z.string().optional(),
      jsonPath: z.string().optional(),
      records: z.array(z.record(z.union([z.string(), z.number(), z.boolean()]))).optional(),
      outputFolder: z.string(),
      fileNamePattern: z.string().optional().default("{{#}}"),
      format: z.enum(["png", "jpg", "svg"]).optional().default("png"),
      artboardIndex: z.number().int().min(0).optional(),
      scale: z.number().min(10).max(1000).optional().describe("PNG/JPG scale in %."),
      transparency: z.boolean().optional(),
      fileFolder: z.string().optional().describe("Relative image paths in the data are resolved against this folder.")
    },
    async (params) => {
      try {
        const rows = loadRecords(params as { csvPath?: string; jsonPath?: string; records?: Array<Record<string, unknown>> });
        const recs = rows.map((r, i) => {
          const o: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) {
            o[k] =
              params.fileFolder && /\.(jpe?g|png|tiff?|psd|ai|pdf|eps|svg)$/i.test(v) && !/^([a-z]:[\\/]|\/|\\\\)/i.test(v)
                ? path.join(params.fileFolder, v)
                : v;
          }
          o.__file = fillPattern(params.fileNamePattern || "{{#}}", r, i) || `variant_${i + 1}`;
          return o;
        });
        const res = await router.dispatch(
          "illustrator",
          "ai.variants",
          { records: recs, outputFolder: params.outputFolder, format: params.format, artboardIndex: params.artboardIndex, scale: params.scale, transparency: params.transparency },
          { timeoutMs: 600000, undoGroup: "MCP: Variants" }
        );
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_export_assets",
    "Export one Illustrator artboard to SVG, PNG24, or JPEG (scale in % for PNG/JPEG, e.g. 400 for icons used in " +
      "Photoshop). The open document keeps its own path (SVG goes through Export for Screens); missing folders are created.",
    {
      filePath: z.string().describe("Destination file path."),
      format: z.enum(["svg", "png", "jpg"]).default("svg"),
      transparency: z.boolean().optional().default(true),
      artboardIndex: z.number().int().min(0).optional().describe("0-based artboard (default: active artboard)."),
      scale: z.number().min(10).max(1000).optional().describe("PNG/JPEG: export scale in % (default 100).")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.export.file", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_center_text_in_shape",
    "Centres a text frame inside a shape (button, pill, tag) by the CAP HEIGHT of the text, which is how the eye reads it: the bounding box " +
      "of a line with descenders or accents sits off-centre. The text stays live (measured on temporary outlined copies). Returns the space " +
      "left on each side in points; offsetY nudges it optically.",
    {
      textName: z.string().optional(),
      textUuid: z.string().optional(),
      shapeName: z.string().optional(),
      shapeUuid: z.string().optional(),
      mode: z.enum(["capHeight", "ink"]).optional().default("capHeight"),
      horizontal: z.boolean().optional().default(true),
      vertical: z.boolean().optional().default(true),
      offsetX: z.number().optional().describe("Extra points to the right."),
      offsetY: z.number().optional().describe("Extra points downwards.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.text.centerInShape", params, { undoGroup: "MCP: Center text in shape" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_export_artboards",
    "Export for Screens (File > Export > Export for Screens): every artboard, or a range, in ONE call — one file per artboard, named after the artboard. " +
      "Use it for carousels, format sets and brand manuals instead of exporting artboard by artboard. PNG (default, with scale), JPG, SVG or PDF.",
    {
      outputFolder: z.string().describe("Absolute destination folder (created if missing)."),
      format: z.enum(["png", "jpg", "svg", "pdf"]).optional().default("png"),
      artboards: z.string().optional().describe("Range in Illustrator's notation, 1-based: '1-7', '2,4,6'. Default: all."),
      scale: z.number().min(10).max(1000).optional().describe("PNG/JPG scale in % (100 = artboard size in px at 72 ppi; 200 for @2x)."),
      transparency: z.boolean().optional().default(true).describe("PNG: keep transparency (false = white background)."),
      prefix: z.string().optional().describe("Text added before each file name.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.export.screens", params, { timeoutMs: 300000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_find_objects",
    "Find existing objects in the active Illustrator document by name, type or layer. Returns uuid (stable id for other ai_ tools), " +
      "name, type, layer and position/size in artboard coordinates (x/y from the artboard's top-left, y down, points).",
    {
      name: z.string().optional().describe("Exact object name."),
      nameContains: z.string().optional(),
      typename: z
        .enum(["PathItem", "CompoundPathItem", "GroupItem", "TextFrame", "PlacedItem", "RasterItem", "SymbolItem", "MeshItem", "PluginItem", "GraphItem", "LegacyTextItem", "NonNativeItem"])
        .optional(),
      layerName: z.string().optional(),
      topLevelOnly: z.boolean().optional().default(true).describe("Skip objects nested inside groups."),
      artboardIndex: z.number().int().min(0).optional(),
      limit: z.number().int().positive().max(2000).optional().default(200)
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.item.find", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_modify_objects",
    "Edit existing Illustrator objects (by uuid, name, layer or current selection): move to an artboard position, move by an offset, " +
      "resize, scale, rotate, fill/stroke colour and width (paths, compound paths, text, groups), opacity, blend mode, hide/lock, " +
      "rename, change stacking order, move to another layer, or delete. Returns the objects afterwards (readback).",
    {
      ...ItemTarget,
      position: z.object({ x: z.number(), y: z.number() }).optional().describe("Top-left corner from the artboard's top-left (y down), points."),
      moveBy: z.object({ x: z.number().optional(), y: z.number().optional() }).optional().describe("Relative move; y positive = down."),
      size: z.object({ width: z.number().positive().optional(), height: z.number().positive().optional() }).optional(),
      scale: z.union([z.number().positive(), z.array(z.number().positive()).length(2)]).optional().describe("Percent, or [x%, y%]."),
      rotate: z.number().optional().describe("Degrees, counter-clockwise."),
      fillColor: z.string().optional().describe("Hex '#RRGGBB'."),
      strokeColor: z.string().optional().describe("Hex '#RRGGBB'."),
      strokeWidth: z.number().min(0).optional().describe("Points; 0 removes the stroke."),
      opacity: z.number().min(0).max(100).optional(),
      blendMode: z.string().optional().describe("normal, multiply, screen, overlay, softLight, hardLight, colorDodge, colorBurn, darken, lighten, difference, exclusion, hue, saturation, color, luminosity."),
      hidden: z.boolean().optional(),
      locked: z.boolean().optional(),
      name: z.string().optional().describe("New name (only when one object is targeted)."),
      zOrder: z.enum(["bringToFront", "bringForward", "sendBackward", "sendToBack"]).optional(),
      moveToLayer: z.string().optional(),
      remove: z.boolean().optional().describe("Delete the targeted objects.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.item.modify", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_apply_live_effect",
    "Apply a non-destructive Illustrator Live Effect (Effect menu) to objects: " +
      Object.entries(LIVE_EFFECTS)
        .map(([k, v]) => `${k} (${v.options})`)
        .join("; ") +
      ". Or pass rawXml for any other effect. expandAppearance=true bakes it into paths.",
    {
      ...ItemTarget,
      effect: z.enum(Object.keys(LIVE_EFFECTS) as [string, ...string[]]).optional(),
      options: z.record(z.string(), z.unknown()).optional().default({}).describe("Effect options listed above."),
      rawXml: z.string().optional().describe("Full <LiveEffect ...> XML (overrides effect/options)."),
      expandAppearance: z.boolean().optional().default(false)
    },
    async (params) => {
      try {
        if (!params.effect && !params.rawXml) {
          throw new Error("Give effect (with options) or rawXml.");
        }
        const xml = params.rawXml || buildLiveEffectXml(params.effect as string, params.options);
        const { effect, options, rawXml, ...rest } = params;
        void options;
        void rawXml;
        const res = await router.dispatch("illustrator", "ai.effect.applyLive", { ...rest, xml, effectName: effect ?? "raw" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_graphic_style",
    "List the document's Graphic Styles, or apply / merge one onto objects. Graphic Styles carry complete appearances " +
      "(multiple fills, strokes and effects) created in Illustrator's Graphic Styles panel.",
    {
      ...ItemTarget,
      operation: z.enum(["list", "apply", "merge"]).default("list"),
      styleName: z.string().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.style.graphic", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_swatches",
    "List the document's swatches (with RGB/CMYK values) or add a new RGB swatch.",
    {
      operation: z.enum(["list", "add"]).default("list"),
      name: z.string().optional(),
      color: z.string().optional().describe("Hex '#RRGGBB' for add.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.swatch.manage", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_apply_gradient",
    "Create a linear or radial gradient (2+ colour stops) and fill objects with it.",
    {
      ...ItemTarget,
      type: z.enum(["linear", "radial"]).default("linear"),
      stops: z
        .array(
          z.object({
            color: z.string().describe("Hex '#RRGGBB'."),
            offset: z.number().min(0).max(100).optional().describe("Position 0-100 %; evenly spaced when omitted."),
            opacity: z.number().min(0).max(100).optional()
          })
        )
        .min(2),
      angle: z.number().optional().describe("Linear gradient angle in degrees."),
      name: z.string().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.color.gradient", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_align_distribute",
    "Align objects (left, centerH, right, top, centerV, bottom) to their combined bounds, the artboard or the first (key) object, " +
      "and/or distribute them evenly — by centres, or with a fixed gap in points between edges.",
    {
      ...ItemTarget,
      align: z.enum(["left", "centerH", "right", "top", "centerV", "bottom"]).optional(),
      relativeTo: z.enum(["selection", "artboard", "keyObject"]).optional().default("selection"),
      distribute: z.enum(["horizontal", "vertical"]).optional(),
      gap: z.number().optional().describe("Fixed spacing between objects when distributing, in points."),
      useVisibleBounds: z.boolean().optional().default(false).describe("Include stroke width in the bounds.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.arrange.align", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_mask",
    "Clipping masks: 'clip' turns the top object of the set into the mask shape and clips the objects below it (the result is a " +
      "clipped group); 'releaseClip' undoes it. Opacity masks ('opacity', 'releaseOpacity') are not exposed to scripts in " +
      "Illustrator and answer NOT_AVAILABLE.",
    {
      ...ItemTarget,
      operation: z.enum(["clip", "releaseClip", "opacity", "releaseOpacity"]).optional().default("clip"),
      name: z.string().optional().describe("Name for the resulting group.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.mask", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_stroke",
    "Stroke settings of paths (groups and compound paths are entered): dashed line (dashes: [dash, gap, ...] in points), caps, " +
      "joins, miter limit, width and colour. dashes: [] makes the stroke solid again. Arrowheads are not exposed to scripts.",
    {
      ...ItemTarget,
      width: z.number().min(0).optional(),
      color: AiColorSchema.optional(),
      dashes: z.array(z.number().min(0)).max(6).optional().describe("Dash pattern in points, e.g. [12, 6]; [] = solid."),
      dashOffset: z.number().optional(),
      cap: z.enum(["butt", "round", "projecting"]).optional(),
      join: z.enum(["miter", "round", "bevel"]).optional(),
      miterLimit: z.number().min(1).optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.stroke", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_image_trace",
    "Image Trace: turn a placed or embedded image (or an image file, placed for you) into vector paths. Pick one of the " +
      "installed presets by name (listPresets: true returns them; the names follow the app's language), then the result is " +
      "expanded into paths unless expand is false. A photo traced in high fidelity can produce thousands of paths.",
    {
      ...ItemTarget,
      filePath: z.string().optional().describe("Image file to place and trace (instead of naming an object)."),
      preset: z.string().optional().describe("Tracing preset name, exactly as listed."),
      ignoreWhite: z.boolean().optional(),
      maxColors: z.number().int().min(2).max(256).optional(),
      threshold: z.number().int().min(1).max(255).optional().describe("Black-and-white threshold."),
      expand: z.boolean().optional().default(true),
      listPresets: z.boolean().optional(),
      name: z.string().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.trace", params, { timeoutMs: 70000 });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_text_styles",
    "Paragraph and character styles of the document: list, create, update (attributes and/or newName), apply to text objects, " +
      "or remove. Attributes: font (PostScript name), size, leading, tracking, color, allCaps; paragraph styles also take " +
      "justification (left, center, right, justify), spaceBefore, spaceAfter, firstLineIndent, hyphenation.",
    {
      ...ItemTarget,
      kind: z.enum(["paragraph", "character"]).optional().default("paragraph"),
      operation: z.enum(["list", "create", "update", "apply", "remove"]).optional().default("list"),
      name: z.string().optional().describe("Style name (not needed for list)."),
      newName: z.string().optional().describe("update: rename the style."),
      attributes: z
        .object({
          font: z.string().optional(),
          size: z.number().positive().optional(),
          leading: z.number().positive().optional(),
          tracking: z.number().optional(),
          color: AiColorSchema.optional(),
          allCaps: z.boolean().optional(),
          justification: z.enum(["left", "center", "right", "justify"]).optional(),
          spaceBefore: z.number().optional(),
          spaceAfter: z.number().optional(),
          firstLineIndent: z.number().optional(),
          hyphenation: z.boolean().optional()
        })
        .optional(),
      clearOverrides: z.boolean().optional().default(true).describe("apply: remove local formatting so the style shows as defined.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.textStyle", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_pathfinder",
    "Combine shapes with Pathfinder: unite, minusFront, intersect, exclude, divide, trim, merge, crop, outline, minusBack. " +
      "Expanded into real paths by default (expand=false keeps a live compound shape).",
    {
      ...ItemTarget,
      operation: z.enum(["unite", "minusFront", "intersect", "exclude", "divide", "trim", "merge", "crop", "outline", "minusBack"]),
      expand: z.boolean().optional().default(true),
      name: z.string().optional().describe("Name for the resulting object.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.pathfinder", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_execute_menu_or_action",
    "Execute any Illustrator menu command string (`app.executeMenuCommand`, e.g. 'Live Pathfinder Add', 'expandStyle', 'group', 'ungroup') or recorded Action (`app.doScript`).",
    {
      menuCommand: z.string().optional().describe("Menu command string for app.executeMenuCommand()."),
      actionName: z.string().optional().describe("Action name for app.doScript()."),
      actionSet: z.string().optional().describe("Action set name for app.doScript().")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.raw.executeMenuOrAction", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_send_cpp_script_message",
    "Native C++ SDK Bridge (`AIScriptMessageSuite` from Adobe Illustrator 2026 SDK): Send a message selector and JSON/string payload via `app.sendScriptMessage(pluginName, selector, payload)` to an in-process C++ .aip plugin.",
    {
      pluginName: z.string().default("ScriptMessage").describe("Target C++ plugin name registered in Illustrator."),
      selector: z.string().default("Send Text").describe("Message selector string."),
      payload: z.union([z.string(), z.record(z.string(), z.unknown())]).describe("Input string or JSON object (`inParam`) sent to C++ plugin.")
    },
    async (params) => {
      try {
        const res = await router.dispatch("illustrator", "ai.raw.sendCppScriptMessage", params);
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_execute_extendscript",
    "Illustrator ExtendScript escape hatch: execute arbitrary .jsx ExtendScript code in Adobe Illustrator (works via CEP WebSocket or zero-plugin Windows COM DoJavaScript).",
    {
      code: z.string().describe("ExtendScript (ES3) code to evaluate in Illustrator.")
    },
    async ({ code }) => {
      try {
        const res = await router.dispatch("illustrator", "ai.raw.executeExtendScript", { code });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}
