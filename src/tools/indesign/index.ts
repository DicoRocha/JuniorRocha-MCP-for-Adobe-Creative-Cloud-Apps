import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../core/bridge-router.js";
import { buildImageToolResponse, formatErrorResponse, formatSuccessResponse } from "../../core/image-helper.js";
import { loadRecords } from "../../core/records.js";
import { auditInDesign, summarize, type IdAuditData } from "../../core/audit.js";
import * as path from "node:path";

const Units = z
  .enum(["mm", "cm", "pt", "px", "in", "pica"])
  .optional()
  .default("mm")
  .describe("Measurement unit for every number in this call (default mm).");

const Rect = z
  .object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() })
  .describe("Frame from the top-left of the page: x, y, width, height in `units`.");

const Color = z
  .union([z.string(), z.array(z.number()).min(3).max(4)])
  .describe("Swatch name ('Black', 'Paper', 'None', a document swatch), '#RRGGBB', [r,g,b] 0-255 or [c,m,y,k] 0-100.");

const PageRef = z
  .union([z.number().int().positive(), z.string()])
  .optional()
  .describe("1-based page number or page name; defaults to the active page.");

const Targets = {
  ids: z.array(z.number().int()).optional().describe("Object ids from id_find_objects (most reliable)."),
  names: z.array(z.string()).optional().describe("Object names (Layers panel)."),
  useSelection: z.boolean().optional().default(true).describe("Use the current selection when no ids / names are given.")
};

const TextFormat = z
  .object({
    paragraphStyle: z.string().optional(),
    characterStyle: z.string().optional(),
    fontFamily: z.string().optional().describe("e.g. 'Montserrat', 'Minion Pro'."),
    fontStyle: z.string().optional().describe("e.g. 'Bold', 'Regular', 'Italic'."),
    size: z.number().positive().optional().describe("Points."),
    leading: z.number().positive().optional().describe("Points."),
    tracking: z.number().optional(),
    color: Color.optional(),
    align: z.enum(["left", "center", "right", "justify", "justifyAll"]).optional(),
    spaceBefore: z.number().optional(),
    spaceAfter: z.number().optional(),
    capitalization: z.enum(["normal", "allCaps"]).optional()
  })
  .optional();

const FrameOptions = z
  .object({
    columns: z.number().int().positive().optional(),
    gutter: z.number().optional(),
    inset: z.number().optional(),
    verticalAlign: z.enum(["top", "center", "bottom", "justify"]).optional(),
    autoSize: z.enum(["off", "height", "width", "both"]).optional()
  })
  .optional();

const ItemStyle = {
  fillColor: Color.optional(),
  strokeColor: Color.optional(),
  strokeWeight: z.number().min(0).optional().describe("Points."),
  cornerRadius: z.number().min(0).optional(),
  opacity: z.number().min(0).max(100).optional(),
  blendMode: z.string().optional().describe("normal, multiply, screen, overlay, softLight, hardLight, darken, lighten, colorDodge, colorBurn, difference, exclusion, hue, saturation, color, luminosity."),
  dropShadow: z
    .object({
      enabled: z.boolean().optional().default(true),
      distance: z.number().optional(),
      angle: z.number().optional(),
      size: z.number().optional(),
      opacity: z.number().min(0).max(100).optional(),
      color: Color.optional()
    })
    .optional(),
  feather: z
    .object({
      type: z.enum(["gradient", "basic", "directional", "none"]).default("gradient"),
      fadeTo: z.enum(["bottom", "top", "left", "right"]).optional().describe("gradient: side that becomes transparent (default bottom)."),
      angle: z.number().optional().describe("gradient/directional: explicit angle in degrees (overrides fadeTo)."),
      start: z.number().min(0).max(99).optional().describe("gradient: % of the object where the fade begins (0 = whole object, 60 = last 40%)."),
      endOpacity: z.number().min(0).max(100).optional().describe("gradient: opacity at the faded end (default 0)."),
      shape: z.enum(["linear", "radial"]).optional(),
      width: z.number().min(0).optional().describe("basic/directional: feather width in the call's units."),
      choke: z.number().min(0).max(100).optional().describe("basic/directional: choke %."),
      noise: z.number().min(0).max(100).optional().describe("directional: noise %."),
      edges: z
        .enum(["leadingEdges", "allEdges", "none"])
        .optional()
        .describe("directional: Shape option of the Effects panel (default leadingEdges)."),
      sides: z
        .object({ top: z.number().optional(), bottom: z.number().optional(), left: z.number().optional(), right: z.number().optional() })
        .optional()
        .describe("directional: width per side.")
    })
    .optional()
    .describe(
      "Feather effect (Effects panel): gradient fade toward one side, soft edges, or per-side feather. type 'none' removes them. " +
        "Photo dissolving into a dark text panel: fit the frame to the whole image so it runs under the text, then " +
        "{ type: 'directional', sides: { bottom: ~35% of the frame height } }."
    ),
  objectStyle: z.string().optional(),
  layer: z.string().optional(),
  name: z.string().optional()
};

function tool(
  server: McpServer,
  router: BridgeRouter,
  name: string,
  description: string,
  shape: z.ZodRawShape,
  action: string,
  undo?: string,
  timeoutMs?: number
): void {
  server.tool(name, description, shape, async (params: Record<string, unknown>) => {
    try {
      const res = await router.dispatch("indesign", action, params, { undoGroup: undo ?? `MCP: ${name}`, timeoutMs });
      return formatSuccessResponse(res.data);
    } catch (err) {
      return formatErrorResponse(err);
    }
  });
}

export function registerInDesignTools(server: McpServer, router: BridgeRouter): void {
  tool(
    server,
    router,
    "id_get_document_info",
    "InDesign: open documents and, for the active one, page size, bleed, pages with their parent pages, layers, " +
      "paragraph / character / object styles, swatches and counts. Call this first.",
    { units: Units },
    "id.doc.getInfo"
  );

  tool(
    server,
    router,
    "id_manage_document",
    "Create (size, pages, facing pages, margins, columns, bleed, print or web intent), open, save or close an InDesign document.",
    {
      operation: z.enum(["create", "open", "save", "close"]),
      units: Units,
      width: z.number().positive().optional().describe("Page width (default 210 mm)."),
      height: z.number().positive().optional().describe("Page height (default 297 mm)."),
      pages: z.number().int().positive().optional(),
      facingPages: z.boolean().optional(),
      margins: z.number().min(0).optional(),
      columns: z.number().int().positive().optional(),
      gutter: z.number().min(0).optional(),
      bleed: z.number().min(0).optional(),
      intent: z.enum(["print", "web"]).optional(),
      filePath: z.string().optional().describe("For open / save (.indd)."),
      save: z.boolean().optional().describe("For close: save first.")
    },
    "id.doc.manage",
    "MCP: Document",
    60000
  );

  tool(
    server,
    router,
    "id_manage_pages",
    "Add pages (after a page or at the end, with a parent page), remove, duplicate, move, or apply a parent page (master).",
    {
      operation: z.enum(["add", "remove", "duplicate", "move", "applyParent"]),
      page: PageRef,
      afterPage: PageRef,
      toPage: PageRef.describe("For move: place after this page."),
      count: z.number().int().positive().optional(),
      parent: z.string().optional().describe("Parent page name or prefix, e.g. 'A-Parent' or 'A'; 'None' removes it.")
    },
    "id.page.manage"
  );

  tool(
    server,
    router,
    "id_find_objects",
    "Find frames and shapes: by type (TextFrame, Rectangle, Oval, Polygon, GraphicLine, Group), name, page, layer or text content. " +
      "Returns id (use it in other id_ tools), page, x/y/width/height from the page's top-left, text preview, overset and linked file.",
    {
      units: Units,
      type: z.string().optional(),
      name: z.string().optional(),
      nameContains: z.string().optional(),
      textContains: z.string().optional(),
      page: z.string().optional().describe("Page name, e.g. '1'."),
      layer: z.string().optional(),
      limit: z.number().int().positive().max(2000).optional().default(300)
    },
    "id.item.find"
  );

  tool(
    server,
    router,
    "id_modify_objects",
    "Edit frames and shapes (by ids, names or selection): move, move by, resize, rotate, duplicate, fill, stroke, corner radius, " +
      "opacity, blend mode, drop shadow, object style, layer, fit content (images), stacking order, lock, hide, rename or delete. " +
      "Returns the objects afterwards.",
    {
      ...Targets,
      units: Units,
      position: z.object({ x: z.number(), y: z.number() }).optional().describe("New top-left from the page's top-left."),
      moveBy: z.object({ x: z.number().optional(), y: z.number().optional() }).optional(),
      size: z.object({ width: z.number().positive().optional(), height: z.number().positive().optional() }).optional(),
      rotate: z.number().optional().describe("Absolute rotation in degrees."),
      duplicate: z.boolean().optional().describe("Edit a duplicate instead of the original."),
      ...ItemStyle,
      fit: z.enum(["proportionally", "fill", "contentToFrame", "frameToContent", "center", "contentAware"]).optional(),
      zOrder: z.enum(["bringToFront", "bringForward", "sendBackward", "sendToBack"]).optional(),
      locked: z.boolean().optional(),
      visible: z.boolean().optional(),
      remove: z.boolean().optional()
    },
    "id.item.modify"
  );

  tool(
    server,
    router,
    "id_create_text_frame",
    "Create a text frame on a page with text, formatting (paragraph/character style or direct font, size, leading, colour, " +
      "alignment) and frame options (columns, inset, vertical alignment, auto-size). Reports overset text.",
    {
      units: Units,
      page: PageRef,
      rect: Rect,
      contents: z.string().describe("Text; use \\r for new paragraphs."),
      format: TextFormat,
      frame: FrameOptions,
      fillColor: Color.optional(),
      objectStyle: z.string().optional(),
      layer: z.string().optional(),
      name: z.string().optional()
    },
    "id.text.createFrame"
  );

  tool(
    server,
    router,
    "id_edit_text",
    "Change the text of frames (replace or append), format the whole story or one paragraph, change frame options, " +
      "or thread the frame into another frame (threadTo).",
    {
      ...Targets,
      units: Units,
      contents: z.string().optional(),
      append: z.string().optional(),
      paragraphIndex: z.number().int().min(0).optional().describe("Format only this paragraph (0-based)."),
      format: TextFormat,
      frame: FrameOptions,
      threadTo: z.number().int().optional().describe("Id of the next frame in the thread.")
    },
    "id.text.edit"
  );

  tool(
    server,
    router,
    "id_find_change",
    "Find / change across the whole document: plain text or GREP. Without a change it only finds (count + samples). " +
      "Can replace text and/or apply a paragraph style, character style or colour to every match.",
    {
      mode: z.enum(["text", "grep"]).default("text"),
      find: z.string(),
      replace: z.string().optional(),
      applyParagraphStyle: z.string().optional(),
      applyCharacterStyle: z.string().optional(),
      color: Color.optional(),
      caseSensitive: z.boolean().optional(),
      wholeWord: z.boolean().optional(),
      includeParentPages: z.boolean().optional()
    },
    "id.text.findChange"
  );

  tool(
    server,
    router,
    "id_create_shape",
    "Draw a rectangle, ellipse, polygon/star or line with fill, stroke, corner radius, opacity, blend mode and drop shadow.",
    {
      units: Units,
      page: PageRef,
      shape: z.enum(["rectangle", "ellipse", "polygon", "line"]).default("rectangle"),
      rect: Rect.optional(),
      sides: z.number().int().min(3).optional().describe("Polygon sides."),
      starInset: z.number().min(0).max(100).optional().describe("Star inset % (polygon)."),
      from: z.object({ x: z.number(), y: z.number() }).optional().describe("Line start."),
      to: z.object({ x: z.number(), y: z.number() }).optional().describe("Line end."),
      ...ItemStyle
    },
    "id.shape.create"
  );

  tool(
    server,
    router,
    "id_place_file",
    "Place an image, PDF, AI/PSD or a Word/RTF/TXT file: into a new frame (page + rect) or into an existing frame (intoId), " +
      "with fitting (fill, proportionally, contentAware...). Returns the frame and the image's effective PPI.",
    {
      units: Units,
      filePath: z.string().describe("Absolute path."),
      page: PageRef,
      rect: Rect.optional(),
      intoId: z.number().int().optional(),
      fit: z.enum(["proportionally", "fill", "contentToFrame", "frameToContent", "center", "contentAware"]).optional().default("fill"),
      name: z.string().optional(),
      layer: z.string().optional(),
      objectStyle: z.string().optional()
    },
    "id.place",
    "MCP: Place",
    120000
  );

  tool(
    server,
    router,
    "id_manage_styles",
    "List, create, update or apply paragraph, character, object, table and cell styles. Properties use friendly names: " +
      "fontFamily, fontStyle, size, leading, tracking, color, align, spaceBefore, spaceAfter, firstLineIndent, hyphenation, capitalization " +
      "(text styles); fillColor, strokeColor, strokeWeight (object styles); cell: fillColor, fillTint, paragraphStyle, inset, " +
      "verticalAlign (top|center|bottom|justify), strokeColor, strokeWeight (all edges); table: headerCellStyle, bodyCellStyle, " +
      "footerCellStyle, leftColumnCellStyle, rightColumnCellStyle (cell style names), rowFill + alternateRowFill (+ alternateRowTint) " +
      "for zebra rows, borderColor, borderWeight, spaceBefore, spaceAfter. Build cell styles first, then the table style that uses " +
      "them. Apply table/cell styles to text frames (ids/names) whose story holds tables; a property the app refuses comes back in warnings.",
    {
      ...Targets,
      units: Units,
      kind: z.enum(["paragraph", "character", "object", "table", "cell"]).default("paragraph"),
      operation: z.enum(["list", "create", "update", "apply"]).default("list"),
      name: z.string().optional(),
      basedOn: z.string().optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
      clearOverrides: z.boolean().optional().describe("Apply table style: clear local table/cell formatting (default true)."),
      rows: z.array(z.number().int().min(0)).optional().describe("Apply cell style: only these 0-based rows (default all cells).")
    },
    "id.style.manage"
  );

  tool(
    server,
    router,
    "id_swatches",
    "List the document's swatches or add a colour swatch ('#RRGGBB', [r,g,b] or [c,m,y,k]) with an optional name.",
    {
      operation: z.enum(["list", "add"]).default("list"),
      color: Color.optional(),
      name: z.string().optional()
    },
    "id.swatch.manage"
  );

  tool(
    server,
    router,
    "id_create_table",
    "Create a table in a new text frame from a 2-D array of values (rows × columns), with header rows, table style and header fill.",
    {
      units: Units,
      page: PageRef,
      rect: Rect,
      data: z.array(z.array(z.union([z.string(), z.number()]))).optional(),
      rows: z.number().int().positive().optional(),
      columns: z.number().int().positive().optional(),
      headerRows: z.number().int().min(0).optional().default(1),
      tableStyle: z.string().optional(),
      headerFill: Color.optional(),
      name: z.string().optional()
    },
    "id.table.create"
  );

  tool(
    server,
    router,
    "id_manage_layers",
    "List, add, rename, show/hide, lock/unlock or remove document layers.",
    {
      operation: z.enum(["list", "add", "update", "remove"]).default("list"),
      name: z.string().optional(),
      newName: z.string().optional(),
      visible: z.boolean().optional(),
      locked: z.boolean().optional()
    },
    "id.layer.manage"
  );

  tool(
    server,
    router,
    "id_preflight",
    "Check the document before export: overset text, missing or modified links, low-resolution images (minPpi), " +
      "missing fonts, empty text frames, and optionally a named preflight profile. ok=true means no errors.",
    {
      minPpi: z.number().positive().optional().default(250),
      profile: z.string().optional().describe("Name of an InDesign preflight profile, e.g. '[Basic] (working)'.")
    },
    "id.preflight",
    "MCP: Preflight",
    120000
  );

  tool(
    server,
    router,
    "id_links",
    "List placed files (links) with status, update modified links, or relink one (name + newPath).",
    {
      operation: z.enum(["list", "update", "relink"]).default("list"),
      name: z.string().optional(),
      newPath: z.string().optional()
    },
    "id.links",
    "MCP: Links",
    120000
  );

  tool(
    server,
    router,
    "id_export",
    "Export the active document: PDF (with a PDF preset such as '[High Quality Print]' or '[PDF/X-4:2008]' and a page range), " +
      "JPG/PNG (resolution, page range), IDML, reflowable EPUB or fixed-layout EPUB. PDF uses the document bleed by default " +
      "(the stock presets do not) and adds crop marks on request. Missing output folders are created.",
    {
      format: z.enum(["pdf", "jpg", "png", "idml", "epub", "fixedEpub"]).default("pdf"),
      filePath: z.string().describe("Absolute output path."),
      pdfPreset: z.string().optional(),
      bleed: z.boolean().optional().describe("PDF: include the document bleed (default: true when the document has bleed)."),
      cropMarks: z.boolean().optional().describe("PDF: crop and bleed marks, placed outside the bleed (default false; ask the print shop)."),
      pageRange: z.string().optional().describe("e.g. '1-3,5'. Omit for all pages."),
      resolution: z.number().int().positive().optional().describe("JPG/PNG ppi (default 150)."),
      transparent: z.boolean().optional()
    },
    "id.export",
    "MCP: Export",
    300000
  );

  tool(
    server,
    router,
    "id_manage_sections",
    "Sections and page numbering: list the sections, or set one starting on a page (start number or continue, numbering " +
      "style arabic / romanUpper / romanLower / lettersUpper / lettersLower, prefix, section marker text), or remove one. Use " +
      "it for roman-numbered front matter, a catalogue whose numbering starts at 2, or chapters with their own marker.",
    {
      operation: z.enum(["list", "set", "remove"]).default("list"),
      page: PageRef,
      startNumber: z.number().int().positive().optional(),
      continueNumbering: z.boolean().optional(),
      numbering: z.enum(["arabic", "romanUpper", "romanLower", "lettersUpper", "lettersLower"]).optional(),
      prefix: z.string().optional(),
      includePrefix: z.boolean().optional().describe("Show the prefix in page numbers (default: InDesign's)."),
      marker: z.string().optional().describe("Section marker text (shown by Type > Insert Special Character > Section Marker).")
    },
    "id.section.manage",
    "MCP: Sections"
  );

  tool(
    server,
    router,
    "id_text_wrap",
    "Text wrap around objects: none, boundingBox, contour, jumpObject or nextColumn, with an offset (one number, or " +
      "[top, left, bottom, right]) in the units of the call. The text of other frames flows around the object.",
    {
      ...Targets,
      units: Units,
      mode: z.enum(["none", "boundingBox", "contour", "jumpObject", "nextColumn"]).default("boundingBox"),
      offset: z.union([z.number(), z.array(z.number()).length(4)]).optional(),
      invert: z.boolean().optional()
    },
    "id.textWrap",
    "MCP: Text wrap"
  );

  tool(
    server,
    router,
    "id_qr_code",
    "Create a QR code as vector artwork in a new frame: a web address (url), plain text, or an e-mail (address in value, " +
      "plus subject and body). The colour is a swatch name, '#RRGGBB', [r,g,b] or [c,m,y,k]; keep it dark on a light ground.",
    {
      units: Units,
      page: z.union([z.number().int(), z.string()]).optional(),
      rect: Rect,
      kind: z.enum(["url", "text", "email"]).default("url"),
      value: z.string().describe("The URL, the text, or the e-mail address."),
      subject: z.string().optional(),
      body: z.string().optional(),
      color: z.unknown().optional(),
      layer: z.string().optional(),
      name: z.string().optional()
    },
    "id.qrCode",
    "MCP: QR code"
  );

  tool(
    server,
    router,
    "id_paragraph_options",
    "Paragraph options on text frames (every paragraph of the story, or one by paragraphIndex): drop cap (lines and " +
      "characters), a heading that spans the columns of a multi-column frame, and tab stops (position in the units of the " +
      "call, alignment and leader such as '.'). tabs replaces the existing tab stops; tabs: [] clears them.",
    {
      ...Targets,
      units: Units,
      paragraphIndex: z.number().int().min(0).optional(),
      dropCap: z.object({ lines: z.number().int().min(0).max(25), characters: z.number().int().min(1).max(150).optional() }).optional().describe("lines: 0 removes the drop cap."),
      span: z.union([z.enum(["all", "none"]), z.number().int().min(2)]).optional(),
      tabs: z.array(z.object({ position: z.number(), align: z.enum(["left", "center", "right", "decimal"]).optional(), leader: z.string().max(8).optional() })).optional(),
      keepWithNext: z.number().int().min(0).max(5).optional(),
      hyphenation: z.boolean().optional()
    },
    "id.paragraphOptions",
    "MCP: Paragraph options"
  );

  tool(
    server,
    router,
    "id_anchor_object",
    "Anchor an object to text so it moves with it: inline (sits in the line like a character), aboveLine, or custom. " +
      "The anchor goes at the start of a paragraph (paragraphIndex) or at a character position of the story.",
    {
      units: Units,
      objectId: z.number().int().describe("The object to anchor (id from id_find_objects)."),
      textFrameId: z.number().int().describe("A frame of the story that receives it."),
      paragraphIndex: z.number().int().min(0).optional(),
      characterIndex: z.number().int().min(0).optional(),
      position: z.enum(["inline", "aboveLine", "custom"]).default("inline")
    },
    "id.anchor",
    "MCP: Anchor object"
  );

  tool(
    server,
    router,
    "id_thread_text",
    "Thread text frames into one story in reading order (ids or names, in order), unthread them, or report the chain and " +
      "overset. addPagesUntilFits adds pages after the last frame (same parent page, frame mirrored on facing pages) and " +
      "threads new frames until the story fits — for long copy in brochures and catalogues.",
    {
      ...Targets,
      units: Units,
      operation: z.enum(["thread", "unthread", "status"]).default("thread"),
      addPagesUntilFits: z.boolean().optional().default(false),
      maxNewPages: z.number().int().min(1).max(200).optional().default(40)
    },
    "id.text.thread",
    "MCP: Thread text",
    180000
  );

  tool(
    server,
    router,
    "id_create_toc",
    "Create or update a table of contents from paragraph styles (e.g. Título 1 level 1, Título 2 level 2), with optional " +
      "entry styles, page number position and separator (default tab), title and title style, placed in a rectangle on a page. " +
      "Re-run with the same tocStyleName after editing headings to update it. Reports overset.",
    {
      units: Units,
      entries: z
        .array(
          z.object({
            paragraphStyle: z.string().describe("Paragraph style of the headings to collect."),
            level: z.number().int().min(1).max(9).optional(),
            entryStyle: z.string().optional().describe("Paragraph style for this level in the TOC."),
            pageNumber: z.enum(["after", "before", "none"]).optional(),
            separator: z.string().optional().describe("Between entry and number; default tab ('^t'). Add a right tab with leader dots in the entry style.")
          })
        )
        .min(1),
      title: z.string().optional(),
      titleStyle: z.string().optional(),
      tocStyleName: z.string().optional(),
      page: PageRef,
      rect: Rect.optional(),
      name: z.string().optional(),
      replace: z.boolean().optional().describe("Replace an existing table of contents (default true)."),
      includeOverset: z.boolean().optional()
    },
    "id.toc.create",
    "MCP: Table of contents",
    120000
  );

  tool(
    server,
    router,
    "id_package",
    "Package the document for the print shop (File > Package): copies fonts, linked images and the .indd into a folder, " +
      "updates modified links, writes the instructions report and optionally an IDML and a PDF. Needs a saved document " +
      "(saveFirst saves pending changes). Run id_preflight first. Adobe Fonts are not copied.",
    {
      folder: z.string().describe("Absolute output folder (created if missing)."),
      copyFonts: z.boolean().optional(),
      copyLinks: z.boolean().optional(),
      copyProfiles: z.boolean().optional(),
      updateGraphics: z.boolean().optional(),
      includeHiddenLayers: z.boolean().optional(),
      createReport: z.boolean().optional(),
      includeIdml: z.boolean().optional(),
      includePdf: z.boolean().optional(),
      pdfPreset: z.string().optional().describe("PDF preset when includePdf, e.g. '[PDF/X-4:2008]'."),
      comments: z.string().optional(),
      saveFirst: z.boolean().optional().describe("Save pending changes before packaging (default true).")
    },
    "id.package",
    "MCP: Package",
    600000
  );

  server.tool(
    "id_audit_document",
    "Check an InDesign document beyond preflight: overset text, text without paragraph styles, type below the minimum " +
      "size, text closer than 3 mm to the trim, missing bleed, missing/modified links, low effective ppi, RGB images and " +
      "RGB swatches in print, font problems, empty frames. Uses the document intent (print/web). Returns findings by severity.",
    {
      minPpi: z.number().int().positive().optional().describe("Default 250 for print, 72 for web."),
      minPointSize: z.number().positive().optional().describe("Default 6 pt for print, 9 pt for web."),
      safeMarginMm: z.number().min(0).optional().describe("Distance from the trim for text (default 3 mm)."),
      maxStories: z.number().int().positive().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch(
          "indesign",
          "id.audit",
          { units: "mm", safeMarginMm: params.safeMarginMm, maxStories: params.maxStories },
          { timeoutMs: 180000, undoGroup: "MCP: Audit" }
        );
        const data = res.data as IdAuditData;
        const findings = auditInDesign(data, { minPpi: params.minPpi, minPointSize: params.minPointSize });
        return formatSuccessResponse({ document: data.document, intent: data.intent, pages: data.pages, ...summarize(findings), findings });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "id_data_merge",
    "Data merge without the Data Merge panel: the template page(s) carry {{field}} in text and frames named " +
      "{{field}} for images; each record (CSV/TSV/JSON or inline) gets its own copy of the template pages, filled, " +
      "added at the end of the document (template pages removed unless removeTemplate is false). Catalogues, " +
      "certificates, price cards, name badges. Reports missing fields and overset text. Then id_preflight + id_export.",
    {
      csvPath: z.string().optional().describe("CSV/TSV with a header row (delimiter auto-detected)."),
      jsonPath: z.string().optional(),
      records: z.array(z.record(z.union([z.string(), z.number(), z.boolean()]))).optional(),
      templateFirstPage: PageRef,
      templateLastPage: PageRef,
      imageFit: z.enum(["fill", "proportionally", "contentAware", "frameToContent"]).optional().default("fill"),
      imageFolder: z.string().optional().describe("Relative image paths in the data are resolved against this folder."),
      removeTemplate: z.boolean().optional().default(true)
    },
    async (params) => {
      try {
        const rows = loadRecords(params as { csvPath?: string; jsonPath?: string; records?: Array<Record<string, unknown>> });
        const resolved = rows.map((r) =>
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [
              k,
              params.imageFolder && /\.(jpe?g|png|tiff?|psd|ai|pdf|eps|svg)$/i.test(v) && !/^([a-z]:[\\/]|\/|\\\\)/i.test(v)
                ? path.join(params.imageFolder, v)
                : v
            ])
          )
        );
        const res = await router.dispatch(
          "indesign",
          "id.dataMerge",
          { ...params, records: resolved, csvPath: undefined, jsonPath: undefined },
          { timeoutMs: 300000, undoGroup: "MCP: Data merge" }
        );
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "id_get_page_preview",
    "Visual check: render one InDesign page to JPEG and return it as an image.",
    {
      page: PageRef,
      resolution: z.number().int().min(24).max(300).optional().default(72),
      outputPath: z.string().optional()
    },
    async (params) => {
      try {
        const res = await router.dispatch("indesign", "id.preview", params, { timeoutMs: 60000 });
        const data = (res.data || {}) as Record<string, unknown>;
        return buildImageToolResponse(data, { mimeType: "image/jpeg", base64Data: typeof res.previewBase64 === "string" ? res.previewBase64 : undefined });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "id_execute_extendscript",
    "InDesign escape hatch: run ExtendScript (ES3) with `app` in scope, as one undo step. The value of the last expression is returned. " +
      "Numbers use the scripting unit of this call's `units` (default mm) and the page ruler origin — including type sizes: " +
      "write pointSize/leading as strings with a unit (\"10pt\"), otherwise 10 means 10 mm.",
    {
      code: z.string(),
      units: Units
    },
    async ({ code, units }) => {
      try {
        const res = await router.dispatch("indesign", "id.raw.executeExtendScript", { code, units }, { undoGroup: "MCP: Script" });
        return formatSuccessResponse(res.data);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}
