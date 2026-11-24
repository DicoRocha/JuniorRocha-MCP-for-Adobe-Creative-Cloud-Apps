/**
 * Brand templates (phase 3): builds .psdt, .indt, .ait and .mogrt files from the brand kit, so recurring pieces
 * start from a file with the right colours, fonts and named layers instead of from scratch. Each app is built
 * independently: an app that is closed or fails is reported and the others still run.
 */
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../core/bridge-router.js";
import { formatErrorResponse, formatSuccessResponse } from "../../core/image-helper.js";
import { hexToAe, printPalette, resolveKit, type ResolvedKit } from "../../core/brand-kit.js";
import { FORMATS, resolveZones } from "../../core/formats.js";
import { paperSize } from "../indesign/recipes.js";

export const TEMPLATE_APPS = ["photoshop", "indesign", "illustrator", "after-effects"] as const;
type TemplateApp = (typeof TEMPLATE_APPS)[number];

export function kitSlug(kit: ResolvedKit, explicit?: string): string {
  if (explicit) return explicit;
  if (kit.source.endsWith(".json")) {
    const dir = path.basename(path.dirname(path.dirname(kit.source)));
    const base = dir && dir !== "." && dir !== "00_briefing" ? dir : path.basename(kit.source, ".json");
    return base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "marca";
  }
  return "neutro";
}

/** Default output: <project>/templates/<slug> (the server runs from dist/, two levels below the project). */
export function defaultTemplatesRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..", "templates");
}

const SAMPLE_RECORDS = [1, 2, 3, 4, 5, 6].map((i) => ({
  title: `Produto ${i}`,
  description: "Descrição curta do produto em uma ou duas linhas.",
  price: "R$ 99,90",
  code: `REF-00${i}`,
  image: undefined
}));

export function registerTemplatesTool(server: McpServer, router: BridgeRouter, enabledApps: string[]): void {
  server.tool(
    "jradb_templates_build",
    "Build the brand's template set from the brand kit: Photoshop .psdt social posts (feed 4:5, story 9:16, square — " +
      "layers named Titulo, Apoio, CTA, Foto, Logo, Botao, Fundo for ps_batch_variants), InDesign .indt (flyer A4, " +
      "catalogue A4, manual A5), Illustrator .ait (brand swatches, character styles, social artboards) and After " +
      "Effects .mogrt (lower third, title card, counter) plus the .aep. Writes manifest.json and LEIA-ME.md. Each app " +
      "is optional and reported on its own; the apps must be open. Slow (minutes): run it from jradb_code with background.",
    {
      kitPath: z.string().optional(),
      colors: z
        .object({ fundo: z.string(), superficie: z.string(), texto: z.string(), textoSecundario: z.string(), destaque: z.string() })
        .partial()
        .optional(),
      fonts: z.object({ titulo: z.string(), corpo: z.string(), rotulo: z.string() }).partial().optional(),
      apps: z.array(z.enum(TEMPLATE_APPS)).optional().describe("Default: all four."),
      slug: z.string().optional().describe("Folder name under templates/ (default: client folder of the kit, or 'neutro')."),
      outputFolder: z.string().optional().describe("Default <project>/templates/<slug>."),
      allowLocalFonts: z.boolean().optional().describe("AE: export .mogrt even with fonts not from Adobe Fonts (AE asks for an OK click).")
    },
    async (params) => {
      try {
        const kit = resolveKit({ kitPath: params.kitPath, colors: params.colors, fonts: params.fonts });
        const slug = kitSlug(kit, params.slug);
        const out = params.outputFolder ?? path.join(defaultTemplatesRoot(), slug);
        fs.mkdirSync(out, { recursive: true });
        const apps = (params.apps?.length ? params.apps : [...TEMPLATE_APPS]).filter((a) => enabledApps.includes(a)) as TemplateApp[];
        const results: Record<string, unknown> = {};
        const files: Array<{ app: string; file: string; use: string }> = [];
        const fail = (app: string, e: unknown) => (results[app] = { error: (e as Error).message });

        if (apps.includes("photoshop")) {
          try {
            const made = [];
            for (const key of ["feed3x4", "story9x16", "square1x1"]) {
              const f = FORMATS[key];
              const zn = resolveZones(key, f.width, f.height);
              const safe = { top: zn.safeRect.y, left: zn.safeRect.x, right: f.width - zn.safeRect.x - zn.safeRect.width, bottom: f.height - zn.safeRect.y - zn.safeRect.height };
              const r = await router.dispatch(
                "photoshop",
                "ps.template.socialPost",
                { width: f.width, height: f.height, safe, name: `post_${key}`, colors: kit.colors, fonts: kit.fonts, outputPath: path.join(out, "photoshop", `post_${key}`) },
                { timeoutMs: 180000 }
              );
              const d = r.data as { file: string; layers: string[]; warnings: string[] };
              made.push(d);
              files.push({ app: "photoshop", file: d.file, use: `Post ${f.label}: troque Foto/Logo (Smart Object) e os textos, ou rode ps_batch_variants com colunas Titulo, Apoio, CTA, Foto, Logo.` });
            }
            results.photoshop = made;
          } catch (e) {
            fail("photoshop", e);
          }
        }

        if (apps.includes("indesign")) {
          const made: unknown[] = [];
          const jobs: Array<{ action: string; name: string; size: string; theme: "marca" | "papel"; extra: Record<string, unknown>; use: string }> = [
            {
              action: "id.recipe.flyer",
              name: "flyer_A4",
              size: "A4",
              theme: "marca",
              extra: { layout: "imagem-topo", content: { kicker: "Chamada", title: "Título do flyer", subtitle: "Subtítulo com o benefício", body: "Texto de apoio em duas ou três linhas.", bullets: ["Item 1", "Item 2", "Item 3"], cta: "Chamada para ação", footer: "endereço · site · @perfil" } },
              use: "Flyer/cartaz A4: troque a imagem e os textos (estilos de parágrafo já prontos)."
            },
            {
              action: "id.recipe.catalog",
              name: "catalogo_A4",
              size: "A4",
              theme: "papel",
              extra: { records: SAMPLE_RECORDS, title: "Catálogo", headerSubtitle: "Coleção", footer: "site · telefone", columns: 2, rows: 3 },
              use: "Catálogo A4 com cartões de produto (para lotes grandes use id_recipe_catalog com a planilha)."
            },
            {
              action: "id.recipe.manual",
              name: "manual_A5",
              size: "A5",
              theme: "papel",
              extra: { title: "Título do manual", subtitle: "Subtítulo", chapters: [{ title: "Introdução", sections: ["Objetivo", "Como usar"] }, { title: "Capítulo 2", sections: ["Seção 1", "Seção 2"] }], facingPages: true },
              use: "Manual A5 com páginas-mestre, sumário automático e estilos (Titulo 1/2, Corpo, Aviso)."
            }
          ];
          for (const j of jobs) {
            try {
              const palette = printPalette(kit, { theme: j.theme, space: "cmyk" });
              const [W, H] = paperSize(j.size, undefined);
              await router.dispatch(
                "indesign",
                j.action,
                { units: "mm", width: W, height: H, palette, fonts: kit.fonts, intent: "print", ...j.extra },
                { timeoutMs: 300000 }
              );
              const file = path.join(out, "indesign", `${j.name}.indt`);
              fs.mkdirSync(path.dirname(file), { recursive: true });
              const js = JSON.stringify(file.replace(/\\/g, "/"));
              await router.dispatch(
                "indesign",
                "id.raw.executeExtendScript",
                { code: `var d = app.activeDocument; d.save(new File(${js}), true); d.close(SaveOptions.NO); "ok"` },
                { timeoutMs: 120000 }
              );
              made.push({ file });
              files.push({ app: "indesign", file, use: j.use });
            } catch (e) {
              made.push({ template: j.name, error: (e as Error).message });
            }
          }
          results.indesign = made;
        }

        if (apps.includes("illustrator")) {
          try {
            const boards = ["feed3x4", "story9x16", "square1x1", "link191"].map((k) => ({ name: k, width: FORMATS[k].width, height: FORMATS[k].height }));
            const r = await router.dispatch(
              "illustrator",
              "ai.template.brand",
              { colors: kit.colors, fonts: kit.fonts, artboards: boards, outputPath: path.join(out, "illustrator", "marca_social") },
              { timeoutMs: 180000 }
            );
            const d = r.data as { file: string };
            results.illustrator = d;
            files.push({ app: "illustrator", file: d.file, use: "Pranchetas sociais com amostras 'Marca' e estilos de caractere Titulo/Corpo/Rotulo." });
          } catch (e) {
            fail("illustrator", e);
          }
        }

        if (apps.includes("after-effects")) {
          try {
            const colors = Object.fromEntries(Object.entries(kit.colors).map(([k, v]) => [k, hexToAe(v)]));
            const comps: Array<{ action: string; extra: Record<string, unknown>; file: string; use: string }> = [
              { action: "ae.recipe.lowerThird", extra: { name: "Nome Sobrenome", role: "Cargo ou função" }, file: "lower_third", use: "Lower third: campos Nome e Cargo no Premiere." },
              { action: "ae.recipe.titleCard", extra: { title: "Título", kicker: "Chamada" }, file: "titulo", use: "Cartela de título: campos Titulo e Chamada." },
              { action: "ae.recipe.counter", extra: { to: 100, label: "Legenda" }, file: "contador", use: "Contador animado: campos Valor e Legenda." }
            ];
            const built: Array<{ compName: string; mogrtFields?: unknown; file: string; use: string }> = [];
            for (const c of comps) {
              const r = await router.dispatch(
                "after-effects",
                c.action,
                { ...c.extra, width: 1920, height: 1080, colors, fonts: kit.fonts },
                { timeoutMs: 120000 }
              );
              const d = r.data as { compName: string; mogrtFields?: unknown };
              built.push({ ...d, file: c.file, use: c.use });
            }
            const aep = path.join(out, "after-effects", "templates.aep");
            await router.dispatch("after-effects", "ae.project.manage", { operation: "save", filePath: aep }, { timeoutMs: 120000 });
            const mogrts: unknown[] = [];
            for (const b of built) {
              const file = path.join(out, "after-effects", `${b.file}.mogrt`);
              try {
                await router.dispatch(
                  "after-effects",
                  "ae.mogrt.export",
                  { compName: b.compName, outputPath: file, templateName: b.compName, properties: b.mogrtFields, allowLocalFonts: params.allowLocalFonts },
                  { timeoutMs: 180000 }
                );
                mogrts.push({ file });
                files.push({ app: "after-effects", file, use: b.use });
              } catch (e) {
                mogrts.push({ comp: b.compName, error: (e as Error).message });
              }
            }
            files.push({ app: "after-effects", file: aep, use: "Projeto com as composições editáveis (fonte dos .mogrt)." });
            results["after-effects"] = { project: aep, mogrts };
          } catch (e) {
            fail("after-effects", e);
          }
        }

        const manifest = {
          kit: kit.source,
          slug,
          createdAt: new Date().toISOString(),
          colors: kit.colors,
          fonts: kit.fonts,
          files: files.map((f) => ({ ...f, file: path.relative(out, f.file) }))
        };
        fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
        const md = [
          `# Templates — ${slug}`,
          "",
          `Gerados de \`${kit.source}\` em ${manifest.createdAt.slice(0, 10)} por \`jradb_templates_build\`. Para atualizar depois de mudar o kit, rode a ferramenta de novo.`,
          "",
          "| App | Arquivo | Uso |",
          "|---|---|---|",
          ...manifest.files.map((f) => `| ${f.app} | \`${f.file}\` | ${f.use} |`),
          "",
          "Templates (.psdt, .indt, .ait) abrem como cópia sem título: o original não muda. Os .mogrt vão para a pasta de Essential Graphics do Premiere (arrastar para o painel)."
        ].join("\n");
        fs.writeFileSync(path.join(out, "LEIA-ME.md"), md);
        const skipped = (params.apps?.length ? params.apps : [...TEMPLATE_APPS]).filter((a) => !enabledApps.includes(a));
        return formatSuccessResponse({ folder: out, slug, files: manifest.files.length, results, skipped });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}
