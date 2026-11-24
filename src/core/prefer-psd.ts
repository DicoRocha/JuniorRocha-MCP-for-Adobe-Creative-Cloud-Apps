/**
 * The edited Photoshop file is the master (author's rule, 24/11/2026): an image adjusted in Photoshop is saved as PSD,
 * and the PSD (not a PNG/JPG export of it) is what Illustrator, InDesign, Premiere and After Effects link, so a later
 * hand edit in Photoshop reaches every layout and video. When a tool is asked to place an image that has a PSD with
 * the same name in the same folder, the PSD goes in instead. JRADB_MCP_PREFER_PSD=off turns it off.
 */
import * as fs from "node:fs";
import * as path from "node:path";

/** Tools whose image inputs are placed or imported into another app. */
export const PSD_FIRST_TOOLS = new Set([
  "id_place_file",
  "id_recipe_flyer",
  "id_recipe_catalog",
  "id_recipe_manual",
  "pr_import_media",
  "ae_manage_project",
  "ae_import_vector_as_shapes",
  "ai_recipe_pop_out"
]);

const PATH_KEYS = ["filePath", "imagePath", "logoPath", "photoPath", "sourcePath"];
const RASTER = /\.(png|jpe?g|tiff?|webp|gif|bmp|heic)$/i;

export function psdTwin(file: string): string | null {
  if (!RASTER.test(file)) return null;
  const stem = file.replace(/\.[^./\\]+$/, "");
  for (const ext of [".psd", ".psb", ".PSD", ".PSB"]) {
    const p = stem + ext;
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function preferPsdEnabled(): boolean {
  return !/^(off|0|false|no)$/i.test(process.env.JRADB_MCP_PREFER_PSD || "");
}

/** Swaps raster inputs for their PSD twin. Returns the new input and what was swapped. */
export function rewritePsdInputs(tool: string, input: unknown): { input: unknown; swaps: Array<{ from: string; to: string }> } {
  const swaps: Array<{ from: string; to: string }> = [];
  if (!PSD_FIRST_TOOLS.has(tool) || !preferPsdEnabled() || !input || typeof input !== "object") return { input, swaps };
  const o = { ...(input as Record<string, unknown>) };
  if (tool === "ae_manage_project" && o.operation !== "import") return { input, swaps };
  const swap = (v: unknown): unknown => {
    if (typeof v !== "string" || !path.isAbsolute(v)) return v;
    const twin = psdTwin(v);
    if (!twin) return v;
    swaps.push({ from: v, to: twin });
    return twin;
  };
  for (const k of PATH_KEYS) if (k in o) o[k] = swap(o[k]);
  if (Array.isArray(o.filePaths)) o.filePaths = o.filePaths.map(swap);
  return { input: o, swaps };
}
