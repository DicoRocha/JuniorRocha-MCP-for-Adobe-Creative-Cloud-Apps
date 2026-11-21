/**
 * InDesign recipes (phase 3): flyer and product catalogue in one call, coloured and typed from the brand kit,
 * audited on the way out (id.audit → auditInDesign), with a page preview and optional .indd / PDF.
 */
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../core/bridge-router.js";
import { formatErrorResponse } from "../../core/image-helper.js";
import { auditInDesign, summarize, type IdAuditData } from "../../core/audit.js";
import { printPalette, resolveKit } from "../../core/brand-kit.js";
import { loadRecords } from "../../core/records.js";
import { withTrail } from "../../core/recipe-trail.js";

/** Paper sizes in mm (portrait). */
export const PAPER: Record<string, [number, number]> = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  A6: [105, 148],
  carta: [215.9, 279.4],
  quadrado: [210, 210],
  "dl-envelope": [99, 210]
};

export function paperSize(size: string | undefined, orientation: "retrato" | "paisagem" | undefined, w?: number, h?: number): [number, number] {
  let [W, H] = w && h ? [w, h] : PAPER[size ?? "A4"] ?? PAPER.A4;
  if (orientation === "paisagem" && W < H) [W, H] = [H, W];
  if (orientation === "retrato" && W > H) [W, H] = [H, W];
  return [W, H];
}

/** Price as shown on a card: numbers (or "1234,5") become currency; anything else passes through. */
export function formatPrice(v: unknown, locale = "pt-BR", currency = "BRL"): string {
  if (v === null || v === undefined || v === "") return "";
  const raw = String(v).trim();
  let n = NaN;
  if (typeof v === "number") n = v;
  else if (/^-?\d+(\.\d{1,2})?$/.test(raw)) n = Number(raw); // 89.9 / 1234.50
  else if (/^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(raw) || /^-?\d+(,\d{1,2})?$/.test(raw)) n = Number(raw.replace(/\./g, "").replace(",", ".")); // 1.234,5
  else if (/^-?\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(raw)) n = Number(raw.replace(/,/g, "")); // 1,234.50
  if (!Number.isFinite(n)) return raw;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}

const KitShape = {
  kitPath: z.string().optional().describe("00_briefing/kit-de-marca.json (cores por uso, cmyk oficial, tipos titulo/corpo/rotulo)."),
  colors: z
    .object({ fundo: z.string(), superficie: z.string(), texto: z.string(), textoSecundario: z.string(), destaque: z.string() })
    .partial()
    .optional()
    .describe("'#RRGGBB' per role; overrides the kit."),
  fonts: z.object({ titulo: z.string(), corpo: z.string(), rotulo: z.string() }).partial().optional().describe("Font names (PostScript or 'Family\\tStyle')."),
  theme: z.enum(["marca", "papel"]).optional().describe("marca: page in the kit background colour (default); papel: white paper, dark text."),
  colorSpace: z.enum(["cmyk", "rgb"]).optional().describe("Default cmyk (print); rgb for screen-only PDFs."),
  size: z.enum(Object.keys(PAPER) as [string, ...string[]]).optional().describe("Default A4."),
  orientation: z.enum(["retrato", "paisagem"]).optional(),
  width: z.number().positive().optional().describe("Custom page width in mm (with height)."),
  height: z.number().positive().optional(),
  bleed: z.number().min(0).max(10).optional().describe("mm, default 3."),
  margin: z.number().min(3).max(40).optional().describe("mm, default 12."),
  savePath: z.string().optional().describe("Save the .indd here."),
  pdfPath: z.string().optional().describe("Export a PDF here."),
  pdfPreset: z.string().optional().describe("Default '[High Quality Print]' (cmyk) or '[Smallest File Size]' (rgb)."),
  cropMarks: z.boolean().optional().describe("Crop/bleed marks in the PDF (ask the print shop)."),
  previewPath: z.string().optional()
};

type KitParams = {
  kitPath?: string;
  colors?: Record<string, string>;
  fonts?: Record<string, string>;
  theme?: "marca" | "papel";
  colorSpace?: "cmyk" | "rgb";
  size?: string;
  orientation?: "retrato" | "paisagem";
  width?: number;
  height?: number;
  bleed?: number;
  margin?: number;
  savePath?: string;
  pdfPath?: string;
  pdfPreset?: string;
  cropMarks?: boolean;
  previewPath?: string;
};

async function runIdRecipe(
  router: BridgeRouter,
  action: string,
  p: KitParams,
  extra: Record<string, unknown>,
  timeoutMs: number
) {
  const kit = resolveKit({ kitPath: p.kitPath, colors: p.colors, fonts: p.fonts });
  const palette = printPalette(kit, { theme: p.theme, space: p.colorSpace });
  const [W, H] = paperSize(p.size, p.orientation, p.width, p.height);
  const logPath = path.join(os.tmpdir(), `id_recipe_${Date.now()}.log`);
  let res;
  try {
    res = await router.dispatch(
      "indesign",
      action,
      { units: "mm", width: W, height: H, bleed: p.bleed, margin: p.margin, palette, fonts: kit.fonts, intent: p.colorSpace === "rgb" ? "web" : "print", logPath, ...extra },
      { timeoutMs, undoGroup: `MCP: ${action}` }
    );
  } catch (err) {
    throw withTrail(err, logPath);
  }
  const data = res.data as Record<string, unknown>;
  const audit = (await router.dispatch("indesign", "id.audit", { units: "mm" }, { timeoutMs: 180000 })).data as IdAuditData;
  const findings = auditInDesign(audit);
  const files: Record<string, string> = {};
  if (p.savePath) {
    await router.dispatch("indesign", "id.doc.manage", { operation: "save", filePath: p.savePath }, { timeoutMs: 120000 });
    files.indd = p.savePath;
  }
  if (p.pdfPath) {
    const preset = p.pdfPreset ?? (p.colorSpace === "rgb" ? "[Smallest File Size]" : "[High Quality Print]");
    await router.dispatch(
      "indesign",
      "id.export",
      { format: "pdf", filePath: p.pdfPath, pdfPreset: preset, cropMarks: p.cropMarks === true, bleed: p.colorSpace !== "rgb" },
      { timeoutMs: 300000 }
    );
    files.pdf = p.pdfPath;
  }
  const previewRes = await router.dispatch("indesign", "id.preview", { page: 1, resolution: 60, outputPath: p.previewPath }, { timeoutMs: 60000 });
  const preview = { ...(previewRes.data as { previewBase64?: string; outputPath?: string }) };
  // The UXP panel sends the image outside `data`, and a large preview is not encoded inside the app: read the file.
  if (!preview.previewBase64 && typeof previewRes.previewBase64 === "string") preview.previewBase64 = previewRes.previewBase64;
  if (!preview.previewBase64 && preview.outputPath && fs.existsSync(preview.outputPath)) {
    preview.previewBase64 = fs.readFileSync(preview.outputPath).toString("base64");
  }
  const { warnings: recipeWarnings, ...rest } = data as { warnings?: string[] } & Record<string, unknown>;
  const summary = {
    ...rest,
    recipeWarnings: recipeWarnings ?? [],
    kit: kit.source,
    palette: Object.fromEntries(
      Object.entries(palette)
        .filter(([k]) => k !== "notes")
        .map(([k, v]) => [k, v ? `${(v as { name: string }).name} ${(v as { hex: string }).hex}` : "papel"])
    ),
    notes: palette.notes,
    ...summarize(findings),
    findings,
    files,
    previewPath: preview.outputPath
  };
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
    { type: "text", text: JSON.stringify(summary, null, 2) }
  ];
  if (preview.previewBase64) content.push({ type: "image", data: preview.previewBase64, mimeType: "image/jpeg" });
  return { content };
}

export function registerInDesignRecipes(server: McpServer, router: BridgeRouter): void {
  server.tool(
    "id_recipe_flyer",
    "Recipe: a print-ready flyer/poster in one call, in a NEW InDesign document. Brand kit → swatches (official CMYK " +
      "when the kit has it) and paragraph styles (Chamada, Titulo, Subtitulo, Corpo, Lista, CTA, Rodape); image with " +
      "bleed, text column, call-to-action button sized to its text, footer band with contact and logo. Layouts: " +
      "imagem-topo (portrait default), imagem-cheia (image behind, gradient veil under the text), lateral (landscape " +
      "default). Shrinks the type together if the text does not fit, then audits (overset, minimum size, bleed, ppi, " +
      "RGB in print) and returns a preview. Optional .indd and PDF. Everything stays editable.",
    {
      ...KitShape,
      layout: z.enum(["imagem-topo", "imagem-cheia", "lateral"]).optional(),
      kicker: z.string().optional().describe("Short line above the title (e.g. 'Lançamento')."),
      title: z.string(),
      subtitle: z.string().optional(),
      body: z.string().optional().describe("Paragraphs separated by \\r."),
      bullets: z.array(z.string()).max(8).optional(),
      cta: z.string().optional().describe("Button text, e.g. 'Agende pelo WhatsApp (11) 99999-0000'."),
      footer: z.string().optional().describe("Contact line: address, site, social."),
      imagePath: z.string().optional(),
      logoPath: z.string().optional()
    },
    async (params) => {
      try {
        for (const f of [params.imagePath, params.logoPath]) if (f && !fs.existsSync(f)) throw new Error(`File not found: ${f}`);
        return await runIdRecipe(
          router,
          "id.recipe.flyer",
          params as KitParams,
          {
            layout: params.layout,
            content: {
              kicker: params.kicker,
              title: params.title,
              subtitle: params.subtitle,
              body: params.body,
              bullets: params.bullets,
              cta: params.cta,
              footer: params.footer,
              imagePath: params.imagePath,
              logoPath: params.logoPath
            }
          },
          180000
        );
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "id_recipe_catalog",
    "Recipe: product catalogue / price list from a spreadsheet in one call, in a NEW InDesign document. Each record " +
      "becomes a card (image, code, name, description, price) in a grid of columns × rows per page, with a header band " +
      "(catalogue title) and a footer with page numbers; pages are added as needed. Prices that are numbers are " +
      "formatted as currency (R$ by default). Long descriptions shrink a little, then are reported. Audited, preview, " +
      "optional .indd and PDF. Map your column names with `fields`.",
    {
      ...KitShape,
      csvPath: z.string().optional().describe("CSV/TSV with a header row (delimiter auto-detected)."),
      jsonPath: z.string().optional(),
      records: z.array(z.record(z.union([z.string(), z.number(), z.boolean()]))).optional(),
      fields: z
        .object({ title: z.string(), description: z.string(), price: z.string(), image: z.string(), code: z.string() })
        .partial()
        .optional()
        .describe("Column names in your data (defaults: nome/titulo/title, descricao/description, preco/price, imagem/image, codigo/sku)."),
      imageFolder: z.string().optional().describe("Relative image paths are resolved against this folder (default: the CSV's folder)."),
      title: z.string().optional().describe("Catalogue title on every page."),
      headerSubtitle: z.string().optional().describe("Small line above the title, e.g. 'Coleção Verão 2027'."),
      footer: z.string().optional(),
      columns: z.number().int().min(1).max(6).optional().default(2),
      rows: z.number().int().min(1).max(8).optional().default(3),
      imageRatio: z.number().min(0.2).max(0.8).optional().describe("Share of the card height for the image (default 0.58)."),
      currency: z.string().optional().default("BRL"),
      locale: z.string().optional().default("pt-BR")
    },
    async (params) => {
      try {
        const rows = loadRecords(params as { csvPath?: string; jsonPath?: string; records?: Array<Record<string, unknown>> });
        if (!rows.length) throw new Error("No records.");
        const pick = (r: Record<string, unknown>, wanted: string | undefined, fallbacks: string[]) => {
          const keys = Object.keys(r);
          const names = wanted ? [wanted] : fallbacks;
          for (const n of names) {
            const k = keys.find((x) => x.trim().toLowerCase() === n.toLowerCase());
            if (k && r[k] !== undefined && r[k] !== "") return r[k];
          }
          return undefined;
        };
        const base = params.imageFolder ?? (params.csvPath ? path.dirname(params.csvPath) : params.jsonPath ? path.dirname(params.jsonPath) : undefined);
        const f = params.fields ?? {};
        const records = rows.map((r) => {
          const img = pick(r, f.image, ["imagem", "image", "foto", "photo", "arquivo"]);
          const imgPath = img ? (path.isAbsolute(String(img)) || !base ? String(img) : path.join(base, String(img))) : undefined;
          return {
            title: String(pick(r, f.title, ["nome", "titulo", "título", "produto", "title", "name"]) ?? ""),
            description: String(pick(r, f.description, ["descricao", "descrição", "description", "desc"]) ?? ""),
            price: formatPrice(pick(r, f.price, ["preco", "preço", "valor", "price"]), params.locale, params.currency),
            code: String(pick(r, f.code, ["codigo", "código", "sku", "ref", "referencia", "referência"]) ?? ""),
            image: imgPath
          };
        });
        return await runIdRecipe(
          router,
          "id.recipe.catalog",
          params as KitParams,
          {
            records,
            title: params.title,
            headerSubtitle: params.headerSubtitle,
            footer: params.footer,
            columns: params.columns,
            rows: params.rows,
            imageRatio: params.imageRatio
          },
          Math.min(1800000, 120000 + records.length * 3000)
        );
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "id_recipe_manual_skeleton",
    "Recipe: skeleton of a manual / handbook / guide in one call, in a NEW InDesign document (facing pages by default, " +
      "white paper theme). Cover in the brand band, table of contents built from the headings (dot leaders, page " +
      "numbers), one opener per chapter on a right-hand page (master B, number only) and the chapter text threaded onto " +
      "as many pages as it needs (master A: running head + automatic page number). Sections numbered 1.1, 1.2…, " +
      "placeholder copy and one sample 'Aviso' box to replace. Named paragraph styles for everything (Titulo 1/2, Corpo, " +
      "Lista, Aviso, Legenda…). Audited, preview, optional .indd and PDF.",
    {
      ...KitShape,
      title: z.string(),
      subtitle: z.string().optional(),
      kicker: z.string().optional().describe("Small line above the cover title (default 'Manual')."),
      organization: z.string().optional(),
      version: z.string().optional().describe("e.g. 'Versão 1.0'."),
      date: z.string().optional(),
      chapters: z
        .array(z.object({ title: z.string(), intro: z.string().optional(), sections: z.array(z.string()).optional() }))
        .min(1)
        .max(40),
      facingPages: z.boolean().optional().describe("Default true (printed and bound)."),
      chapterOnRight: z.boolean().optional().describe("Chapters open on a right-hand page (default true)."),
      placeholderParagraphs: z.number().int().min(0).max(10).optional().describe("Placeholder paragraphs per section (default 2)."),
      placeholderText: z.string().optional()
    },
    async (params) => {
      try {
        const p = { ...params, theme: params.theme ?? "papel", size: params.size ?? "A5" } as KitParams;
        const sections = params.chapters.reduce((n, c) => n + (c.sections?.length ?? 0), 0);
        return await runIdRecipe(
          router,
          "id.recipe.manual",
          p,
          {
            title: params.title,
            subtitle: params.subtitle,
            kicker: params.kicker,
            organization: params.organization,
            version: params.version,
            date: params.date,
            chapters: params.chapters,
            facingPages: params.facingPages,
            chapterOnRight: params.chapterOnRight,
            placeholderParagraphs: params.placeholderParagraphs,
            placeholderText: params.placeholderText
          },
          Math.min(1800000, 180000 + sections * 4000)
        );
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}
