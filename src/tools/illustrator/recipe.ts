/**
 * ai_recipe_logo_package (phase 3): one approved logo → the delivery package
 * (vetor-pacote-de-marca): versions as artboards in a copy of the .ai, SVG/PNG per version, favicon and avatar,
 * one-page usage sheet, vector PDF, and a contact sheet of every version on light and dark grounds.
 */
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../core/bridge-router.js";
import { buildImageToolResponse, formatErrorResponse } from "../../core/image-helper.js";
import { resolveKit, hexToRgb } from "../../core/brand-kit.js";
import { CAROUSEL_SIZES, planCarousel } from "../../core/carousel.js";
import { contactSheet, decodePng, encodePng, type RgbImage } from "../../core/png.js";

/** File-name slug: lowercase, no accents, words joined by '-'. */
export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Illustrator raster export scale (%) for a target pixel width; Illustrator caps the scale at 776 %. */
export function pngScale(targetPx: number, artboardWidthPt: number): { scale: number; px: number; capped: boolean } {
  const raw = (targetPx / artboardWidthPt) * 100;
  const scale = Math.min(776, Math.round(raw * 1000) / 1000);
  return { scale, px: Math.round((artboardWidthPt * scale) / 100), capped: raw > 776 };
}

type Ab = { version: string; index: number; width: number; height: number };

export function registerIllustratorRecipe(server: McpServer, router: BridgeRouter): void {
  server.tool(
    "ai_recipe_logo_package",
    "Recipe: logo delivery package from the OPEN Illustrator document (approved logo on one artboard; an artboard " +
      "named 'simbolo'/'icone'/'symbol' is used for the square marks). Saves a COPY as <outDir>/fonte/<base>.ai (the " +
      "original is not changed) and builds artboards: cor, negativa (white), mono-preto (black 100 %), avatar and " +
      "favicon (mark on a solid brand colour) and a one-page usage sheet (versions on light/dark, clear space, minimum " +
      "size, colours HEX/CMYK). Exports svg/ and png/ (512, 1024, 2048 px, transparent) per version, web/ (favicon 32, " +
      "180, 512 and avatar 1080) and pdf/ (all artboards, vector). Returns a contact sheet of every version on light and " +
      "dark grounds. Raster images or special objects inside the logo are reported (they cannot be recoloured).",
    {
      outDir: z.string().describe("Package folder, e.g. <job>/06_entrega/marca."),
      name: z.string().optional().describe("Base file name, e.g. 'levatio' (slugged; default: document name)."),
      artboardIndex: z.number().int().min(0).optional().default(0).describe("Artboard of the approved full-colour logo."),
      symbolArtboardIndex: z.number().int().min(0).optional(),
      kitPath: z.string().optional(),
      colors: z.object({ fundo: z.string(), superficie: z.string(), texto: z.string(), textoSecundario: z.string(), destaque: z.string() }).partial().optional(),
      fonts: z.object({ titulo: z.string(), corpo: z.string(), rotulo: z.string() }).partial().optional(),
      squareBackground: z.string().optional().describe("'#RRGGBB' behind avatar/favicon (default: kit destaque if dark enough, else fundo)."),
      squareArt: z.enum(["negativa", "mono-preto", "cor"]).optional().describe("Mark version on the square background (default: by contrast)."),
      pngSizes: z.array(z.number().int().min(16).max(8000)).optional().default([512, 1024, 2048]),
      clearSpace: z.number().min(0.05).max(1).optional().default(0.25).describe("Clear space as a share of the logo height."),
      minWidthMm: z.number().positive().optional().default(25),
      minWidthPx: z.number().int().positive().optional().default(120),
      usageSheet: z.boolean().optional().default(true),
      pdf: z.boolean().optional().default(true)
    },
    async (params) => {
      const steps: string[] = [];
      try {
        const kit = resolveKit({ kitPath: params.kitPath, colors: params.colors, fonts: params.fonts });
        const info = (await router.dispatch("illustrator", "ai.doc.getInfo", {}, { timeoutMs: 60000 })).data as { name?: string; documentName?: string; hasOpenDocument?: boolean };
        if (info.hasOpenDocument === false) throw new Error("Open the approved logo in Illustrator first (one artboard per logo; the full-colour one at artboardIndex).");
        const base = slug(params.name ?? info.name ?? info.documentName ?? "marca") || "marca";
        const dirs = { fonte: "fonte", svg: "svg", png: "png", web: "web", pdf: "pdf" };
        for (const d of Object.values(dirs)) fs.mkdirSync(path.join(params.outDir, d), { recursive: true });
        const aiPath = path.join(params.outDir, dirs.fonte, `${base}.ai`);
        const lum = (hex: string) => {
          const [r, g, b] = hexToRgb(hex).map((v) => {
            const x = v / 255;
            return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const sqHex = params.squareBackground ?? (lum(kit.colors.destaque) < 0.35 ? kit.colors.destaque : kit.colors.fundo);
        const squareArt = params.squareArt ?? (lum(sqHex) < 0.45 ? "negativa" : "mono-preto");
        const roleName: Record<string, string> = { fundo: "Fundo", superficie: "Superfície", texto: "Texto", textoSecundario: "Texto 2", destaque: "Destaque" };
        const seen = new Set<string>();
        const colors = (Object.keys(kit.colors) as Array<keyof typeof kit.colors>)
          .filter((k) => !seen.has(kit.colors[k]) && seen.add(kit.colors[k]))
          .map((k) => ({ name: roleName[k], hex: kit.colors[k], cmyk: kit.cmyk?.[k] }));

        const built = (
          await router.dispatch(
            "illustrator",
            "ai.recipe.logoPackage",
            {
              aiPath,
              artboardIndex: params.artboardIndex,
              symbolArtboardIndex: params.symbolArtboardIndex,
              squareBackground: { hex: sqHex, cmyk: sqHex === kit.colors.destaque ? kit.cmyk?.destaque : sqHex === kit.colors.fundo ? kit.cmyk?.fundo : undefined },
              squareArt,
              accent: { hex: kit.colors.destaque, cmyk: kit.cmyk?.destaque },
              colors,
              fonts: kit.fonts,
              clearSpace: params.clearSpace,
              minWidthMm: params.minWidthMm,
              minWidthPx: params.minWidthPx,
              usageSheet: params.usageSheet
            },
            { timeoutMs: 300000 }
          )
        ).data as { artboards: Ab[]; warnings: string[]; recolor: unknown; original: string | null; aiPath: string };
        steps.push(`cópia editável salva em ${built.aiPath} (original intacto)`);

        const files: string[] = [];
        const notes: string[] = [...(built.warnings ?? [])];
        const exp = async (ab: Ab, format: "svg" | "png", filePath: string, scale?: number) => {
          await router.dispatch(
            "illustrator",
            "ai.export.file",
            { format, artboardIndex: ab.index, filePath, scale, transparency: true },
            { timeoutMs: 180000 }
          );
          files.push(filePath);
        };
        const previews: Array<{ label: string; file: string; dark: boolean }> = [];
        for (const ab of built.artboards.filter((a) => !["avatar", "favicon", "folha-de-uso"].includes(a.version))) {
          await exp(ab, "svg", path.join(params.outDir, dirs.svg, `${base}_${ab.version}.svg`));
          for (const px of params.pngSizes) {
            const s = pngScale(px, ab.width);
            const f = path.join(params.outDir, dirs.png, `${base}_${ab.version}_${s.px}.png`);
            await exp(ab, "png", f, s.scale);
            if (s.capped) notes.push(`${ab.version}: ${px} px pedido, saiu ${s.px} px (o Illustrator limita a escala a 776 %; aumente a prancheta)`);
            if (px === params.pngSizes[0]) previews.push({ label: ab.version, file: f, dark: ab.version === "negativa" });
          }
        }
        const square = (v: string) => built.artboards.find((a) => a.version === v);
        const fav = square("favicon");
        if (fav) {
          for (const px of [32, 180, 512]) {
            const s = pngScale(px, fav.width);
            const f = path.join(params.outDir, dirs.web, `${base}_favicon_${px}.png`);
            await exp(fav, "png", f, s.scale);
            if (px === 180) previews.push({ label: "favicon", file: f, dark: false });
          }
        }
        const av = square("avatar");
        if (av) {
          const s = pngScale(1080, av.width);
          const f = path.join(params.outDir, dirs.web, `${base}_avatar_1080.png`);
          await exp(av, "png", f, s.scale);
          previews.push({ label: "avatar", file: f, dark: false });
        }
        const sheet = square("folha-de-uso");
        if (sheet) {
          const f = path.join(params.outDir, `${base}_folha-de-uso.png`);
          await exp(sheet, "png", f, pngScale(1684, sheet.width).scale);
          previews.push({ label: "folha-de-uso", file: f, dark: false });
        }
        steps.push(`${files.length} arquivo(s) exportado(s) em svg/, png/ e web/`);

        if (params.pdf) {
          const pdfPath = path.join(params.outDir, dirs.pdf, `${base}_vetor.pdf`);
          await router.dispatch("illustrator", "ai.recipe.logoPackage", { op: "pdf", aiPath: built.aiPath, pdfPath }, { timeoutMs: 300000 });
          files.push(pdfPath);
          steps.push(`PDF vetorial com todas as pranchetas: ${pdfPath}`);
        }

        // contact sheet: transparent versions on light AND dark grounds, squares and the usage sheet as they are
        const light: [number, number, number] = [242, 242, 242];
        const dark = hexToRgb(kit.colors.fundo) as [number, number, number];
        const imgs: RgbImage[] = [];
        const order: string[] = [];
        for (const p of previews) {
          if (!fs.existsSync(p.file)) continue;
          const buf = fs.readFileSync(p.file);
          if (["avatar", "favicon", "folha-de-uso"].includes(p.label)) {
            imgs.push(decodePng(buf, light));
            order.push(p.label);
          } else {
            imgs.push(decodePng(buf, light), decodePng(buf, dark));
            order.push(`${p.label} (claro)`, `${p.label} (escuro)`);
          }
        }
        const missing = files.filter((f) => !fs.existsSync(f));
        const summary = {
          package: params.outDir,
          base,
          editable: built.aiPath,
          original: built.original,
          artboards: built.artboards,
          squareMarks: { background: sqHex, art: squareArt },
          steps,
          files: files.map((f) => path.relative(params.outDir, f)),
          missing,
          notes,
          sheetOrder: order,
          next: "Confira a folha: negativa branca pura, mono preto 100 %, favicon legível em 32 px. Depois feche/salve o .ai do pacote."
        };
        const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
          { type: "text", text: JSON.stringify(summary, null, 2) }
        ];
        if (imgs.length) content.push({ type: "image", data: encodePng(contactSheet(imgs, { columns: 4, cellWidth: 260, gap: 8, background: [128, 128, 128] })).toString("base64"), mimeType: "image/png" });
        return { content };
      } catch (err) {
        const res = formatErrorResponse(err);
        if (steps.length) res.content.push({ type: "text", text: `Etapas concluídas antes do erro:\n- ${steps.join("\n- ")}` });
        return res;
      }
    }
  );

  server.tool(
    "ai_recipe_carousel_artboards",
    "Seamless Instagram carousel in Illustrator: a new document with count artboards side by side and NO space between " +
      "them (named 01..NN, default 1080x1350 pt = px), a layer 'Arte' and a locked layer 'Guias' with the safe margin " +
      "of each card as guides. Draw the background and photos across the artboard edges; keep text and logo inside one " +
      "artboard's margins. Export each artboard with ai_export_assets (PNG, 72 ppi, 'use artboards'). For independent " +
      "cards (not seamless) ask first: then the artboards can keep a gap.",
    {
      count: z.number().int().min(2).max(20),
      ratio: z.enum(["4:5", "3:4", "1:1", "1.91:1"]).optional().default("4:5"),
      cardWidth: z.number().int().positive().optional(),
      cardHeight: z.number().int().positive().optional(),
      margin: z.number().int().min(0).max(300).optional().default(80),
      filePath: z.string().optional().describe("Save the new document as this .ai right away.")
    },
    async (params) => {
      try {
        const size = CAROUSEL_SIZES[(params.ratio ?? "4:5") as keyof typeof CAROUSEL_SIZES];
        const plan = planCarousel({ count: params.count, ratio: params.ratio, cardWidth: params.cardWidth ?? size.width, cardHeight: params.cardHeight ?? size.height, margin: params.margin });
        const res = await router.dispatch(
          "illustrator",
          "ai.recipe.carouselArtboards",
          { count: plan.count, cardWidth: plan.cardWidth, cardHeight: plan.cardHeight, margin: plan.margin, filePath: params.filePath },
          { timeoutMs: 70000 }
        );
        return { content: [{ type: "text" as const, text: JSON.stringify({ ...((res.data || {}) as object), fileNames: plan.fileNames, warnings: plan.warnings }, null, 2) }] };
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );

  server.tool(
    "ai_recipe_pop_out",
    "Recipe: 'out of bounds' / pop-out portrait built with clipping masks in the OPEN Illustrator document (also asked " +
      "for as: person coming out of a circle, breaking the frame). Illustrator's own Remove Background has no script " +
      "access, so Photoshop cuts the photo out first and saves a transparent PNG (trimmed to the subject, which is " +
      "easier to edit afterwards); the PNG is then placed in Illustrator and the masks are made there. Result, in one " +
      "group: 'Subject top' (clip group: a rectangle tight on the part above the cut line + the cut-out) and 'Subject' " +
      "(clip group whose clipping path is the shape itself, with fill and optional stroke set after masking). " +
      "keepBackground: the original photo with its background fills the shape; then the cut-out is not trimmed so " +
      "both images line up. Pass a ready transparent PNG with cutout 'no', or imageName for an image already in the " +
      "document (it must already have no background). Returns the geometry and a preview.",
    {
      filePath: z.string().optional().describe("Photo (or ready cut-out) to place. Without it: imageName, the selected image, or the only image in the document."),
      imageName: z.string().optional().describe("Name of an image already in the document (already without background)."),
      cutout: z.enum(["auto", "yes", "no"]).optional().describe("auto: Photoshop removes the background unless the file is a PNG/PSD/WebP/TIFF with transparency expected; yes: always; no: place the file as it is."),
      method: z.enum(["removeBackground", "selectSubject"]).optional(),
      cutoutPath: z.string().optional().describe("Where Photoshop writes the cut-out: default <photo>_recorte.psd next to the photo (editable mask, linked by Illustrator); a .png path writes a PNG instead."),
      keepBackground: z.boolean().optional().describe("Show the original photo, background included, inside the shape."),
      shape: z.enum(["circle", "ellipse", "rectangle", "roundedRectangle"]).optional().describe("Default circle."),
      shapeColor: z.string().optional().describe("'#RRGGBB' fill of the shape (default #C8783C)."),
      strokeColor: z.string().optional().describe("'#RRGGBB' outline of the shape."),
      strokeWidth: z.number().min(0).optional().describe("Outline width in pt."),
      shapeBounds: z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() }).optional().describe("Exact box of the shape in pt from the artboard's top-left."),
      shapeScale: z.number().min(0.5).max(4).optional().describe("Shape width as a multiple of the subject's width (default 1.5)."),
      shapeAspect: z.number().min(0.2).max(5).optional(),
      radius: z.number().min(0).optional(),
      overflow: z.number().min(0).max(0.9).optional().describe("How far the subject sticks out above the shape, as a share of the shape's height (default 0.22)."),
      cutAt: z.number().min(0).max(1).optional().describe("Cut line of the top copy: 0 = top of the shape, 1 = bottom (default 0.5)."),
      placeHeight: z.number().positive().optional().describe("Height of the placed image in pt (default 90 % of the artboard)."),
      centerX: z.number().optional().describe("Horizontal centre of the placed image, pt from the artboard's left (default: centred)."),
      top: z.number().optional().describe("Top of the placed image, pt from the artboard's top (default: centred)."),
      embed: z.boolean().optional().describe("Default false: the image stays linked (a later edit of the PSD updates the layout). true embeds it, with a PSD's layers flattened."),
      groupName: z.string().optional()
    },
    async (params) => {
      const steps: string[] = [];
      try {
        for (const k of ["shapeColor", "strokeColor"] as const) {
          if (params[k] && !/^#?[0-9a-fA-F]{6}$/.test(params[k] as string)) throw new Error(`${k} must be '#RRGGBB'.`);
        }
        const ai: Record<string, unknown> = { ...params };
        delete ai.cutout;
        delete ai.method;
        delete ai.cutoutPath;
        delete ai.keepBackground;
        const ext = params.filePath ? path.extname(params.filePath).toLowerCase() : "";
        const wantCut = params.filePath ? (params.cutout === "yes" || (params.cutout !== "no" && ![".png", ".psd", ".webp", ".tif", ".tiff"].includes(ext))) : false;
        if (params.keepBackground && !params.filePath) throw new Error("keepBackground needs filePath: the original photo.");
        if (params.filePath && wantCut) {
          if (!fs.existsSync(params.filePath)) throw new Error(`File not found: ${params.filePath}`);
          // The cut-out is a PSD (layer mask, editable) and Illustrator links that PSD: a later touch-up of the mask in
          // Photoshop updates the layout (author's rule 24/11/2026). A PNG only when cutoutPath asks for one.
          const wantsPng = params.cutoutPath ? /\.(png|webp)$/i.test(params.cutoutPath) : false;
          const out = params.cutoutPath || path.join(path.dirname(params.filePath), `${path.basename(params.filePath, ext)}_recorte.psd`);
          const cut = (
            await router.dispatch(
              "photoshop",
              "ps.recipe.removeBackground",
              {
                filePath: params.filePath,
                ...(wantsPng ? { outputPath: out, format: "png" } : { psdPath: out }),
                method: params.method,
                smartObject: true,
                cropToSubject: !params.keepBackground,
                closeAfter: true
              },
              { timeoutMs: 300000, undoGroup: "MCP: Remove background" }
            )
          ).data as { subject?: { x: number; y: number; width: number; height: number }; size?: number[]; file?: { path?: string } | string; psd?: string; warnings?: string[] };
          const written = wantsPng ? (typeof cut.file === "string" ? cut.file : cut.file?.path) : cut.psd;
          if (!written) throw new Error("Photoshop did not write the cut-out file.");
          steps.push(`Photoshop: background removed as an editable mask${params.keepBackground ? "" : ", trimmed to the subject"} → ${written}`);
          ai.filePath = written;
          if (params.keepBackground) {
            ai.backgroundFilePath = params.filePath;
            if (cut.subject && cut.size) {
              ai.subjectBox = cut.subject;
              ai.imageSize = { width: cut.size[0], height: cut.size[1] };
            }
          }
        } else if (params.keepBackground) {
          throw new Error("keepBackground needs the photo with its background: pass the original photo in filePath (cutout auto or yes).");
        }
        const res = (await router.dispatch("illustrator", "ai.recipe.popOut", ai, { timeoutMs: 180000, undoGroup: "MCP: Pop-out" })).data as Record<string, unknown>;
        steps.push("Illustrator: image placed, clipping masks made, shape filled after masking");
        const data = { ...res, cutout: ai.filePath !== params.filePath ? ai.filePath : null, steps };
        const prev = await router.dispatch("illustrator", "ai.export.artboardPreview", { scale: 50 }, { timeoutMs: 120000 });
        const pd = (prev.data || {}) as Record<string, unknown>;
        return buildImageToolResponse(data, {
          filePath: typeof pd.outputPath === "string" ? pd.outputPath : undefined,
          base64Data: typeof pd.previewBase64 === "string" ? pd.previewBase64 : undefined,
          includeImageContent: true
        });
      } catch (err) {
        const res = formatErrorResponse(err);
        if (steps.length) res.content.push({ type: "text", text: `Steps done before the error:\n- ${steps.join("\n- ")}` });
        return res;
      }
    }
  );
}
