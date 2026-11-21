/**
 * lr_recipe_batch_develop (phase 3): one approved photo (or a preset) → the whole light group.
 * Safety snapshot on every target first, sync without geometry/local edits, measured exposure match against the
 * reference, a before/after report and a contact sheet of the series; optional export.
 */
import { z } from "zod";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../core/bridge-router.js";
import { formatErrorResponse } from "../../core/image-helper.js";
import { contactSheet, encodePng, type RgbImage } from "../../core/png.js";
import { decodeTiff, imageStats, type ImageStats } from "../../core/tiff.js";

/** Settings that belong to one frame only: never synced by the recipe. */
export const PER_PHOTO_KEYS = [
  /^Crop/,
  /^HasCrop$/,
  /^Orientation$/,
  /^RetouchInfo$/,
  /^RetouchAreas$/,
  /BasedCorrections$/, // masks: MaskGroupBased, GradientBased, CircularGradientBased, PaintBased
  /^RedEyeInfo$/,
  /^Perspective/,
  /^UprightTransform/,
  /^UprightCenter/,
  /^UprightFocal/,
  /^UprightPreview$/,
  /^UprightVersion$/,
  /^UprightDependent/
];
const WB_KEYS = /^(WhiteBalance|Temperature|Tint|IncrementalTemperature|IncrementalTint)$/;

export function syncKeys(all: string[], opts: { whiteBalance?: boolean; exclude?: string[] } = {}): string[] {
  return all.filter(
    (k) => !PER_PHOTO_KEYS.some((re) => re.test(k)) && (opts.whiteBalance !== false || !WB_KEYS.test(k)) && !(opts.exclude ?? []).includes(k)
  );
}

const lin = (v8: number) => {
  const x = Math.min(254, Math.max(1, v8)) / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

/** Exposure (EV) that would bring `photoP50` to `refP50` (8-bit sRGB medians), damped and clamped. */
export function exposureDelta(refP50: number, photoP50: number, opts: { damping?: number; maxEv?: number } = {}): number {
  const ev = Math.log2(lin(refP50) / lin(photoP50)) * (opts.damping ?? 0.85);
  const max = opts.maxEv ?? 1.5;
  return Math.round(Math.max(-max, Math.min(max, ev)) * 100) / 100;
}

/**
 * Median brightness (0-255) of a region of the image, [x, y, width, height] as fractions of the frame.
 * 18/11/2026: on a shoot the whole-frame median is not comparable from photo to photo (a closer framing has
 * more dark clothes, a wider one more backdrop); measuring the same thing in every photo - the backdrop, the
 * skin - is. Without a region it is the whole frame.
 */
export function regionP50(img: RgbImage, region?: number[]): number {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const [rx, ry, rw, rh] = region && region.length === 4 ? region : [0, 0, 1, 1];
  const x0 = Math.floor(clamp(rx) * img.width);
  const y0 = Math.floor(clamp(ry) * img.height);
  const x1 = Math.max(x0 + 1, Math.min(img.width, Math.ceil(clamp(rx + rw) * img.width)));
  const y1 = Math.max(y0 + 1, Math.min(img.height, Math.ceil(clamp(ry + rh) * img.height)));
  const hist = new Array<number>(256).fill(0);
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 3;
      hist[Math.round(0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2])]++;
      n++;
    }
  }
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= n / 2) return v;
  }
  return 255;
}

type Stat = ImageStats & { id: number; image: RgbImage };

async function measure(router: BridgeRouter, ids: number[], longEdge = 320): Promise<Stat[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lr_batch_"));
  try {
    const res = await router.dispatch(
      "lightroom",
      "lr.export",
      { ids, useSelection: false, folder: dir, format: "TIFF", bitDepth: 8, tiffCompression: "none", longEdge, colorSpace: "sRGB", metadata: "copyrightOnly", collision: "rename" },
      { timeoutMs: 900000 }
    );
    const files = (res.data as { files?: Array<{ id?: number; path?: string; ok?: boolean; error?: string }> })?.files ?? [];
    const out: Stat[] = [];
    for (const f of files) {
      if (!f.ok || !f.path || typeof f.id !== "number") continue;
      const img = decodeTiff(fs.readFileSync(f.path));
      out.push({ ...imageStats(img, 16), id: f.id, image: img });
    }
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const brief = (s?: ImageStats) =>
  s ? { p50: s.percentiles.p50, luma: s.mean.luma, clipped: s.clippedHighlightsPct, crushed: s.crushedShadowsPct, warmth: s.warmth } : null;

export function registerLightroomRecipe(server: McpServer, router: BridgeRouter): void {
  server.tool(
    "lr_recipe_batch_develop",
    "Recipe: develop a light group from one approved photo (fromId) or a preset, in one call. 1) safety snapshot " +
      "'MCP antes do lote' on every target; 2) sync the reference's Develop settings WITHOUT crop, rotation, spot " +
      "removal, masks or Upright (white balance optional); 3) measure every photo as developed and nudge Exposure so " +
      "its median brightness matches the reference (two passes, ±1.5 EV max); 4) report before/after (median, clipped " +
      "highlights, crushed shadows, warmth) and return a contact sheet of the series; 5) optional export. Undo per " +
      "photo: restore the snapshot. Use it on one light group at a time (same place, same light).",
    {
      ids: z.array(z.number().int()).min(1).describe("Target photo ids (lr_find_photos). The reference may be included; it is not changed."),
      fromId: z.number().int().optional().describe("Approved reference photo."),
      presetName: z.string().optional().describe("Instead of fromId: a Develop preset (then exposure is matched to the group median)."),
      presetFolder: z.string().optional(),
      whiteBalance: z.boolean().optional().default(true).describe("Sync white balance too (same light). false for mixed light."),
      excludeKeys: z.array(z.string()).optional().describe("Extra Develop keys not to sync."),
      matchExposure: z.boolean().optional().default(true),
      measureRegion: z
        .array(z.number().min(0).max(1))
        .length(4)
        .optional()
        .describe("[x, y, width, height] as fractions of the frame: match the exposure on this region only (the backdrop, the skin) instead of the whole frame. Use it when the framing changes from photo to photo."),
      maxEv: z.number().min(0.1).max(3).optional().default(1.5),
      snapshotName: z.string().optional(),
      exportFolder: z.string().optional().describe("Export the finished group here (JPEG sRGB)."),
      exportLongEdge: z.number().int().positive().optional(),
      exportQuality: z.number().int().min(0).max(100).optional().default(85),
      sheetColumns: z.number().int().min(1).max(8).optional().default(4)
    },
    async (params) => {
      const steps: string[] = [];
      try {
        if (!params.fromId && !params.presetName) throw new Error("Pass fromId (approved photo) or presetName.");
        const targets = params.ids.filter((id) => id !== params.fromId);
        if (!targets.length) throw new Error("No target photos besides the reference.");
        const snap = params.snapshotName ?? `MCP antes do lote ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
        await router.dispatch("lightroom", "lr.develop.snapshot", { ids: targets, useSelection: false, name: snap }, { timeoutMs: 300000 });
        steps.push(`snapshot "${snap}" em ${targets.length} foto(s)`);
        const before = await measure(router, targets);

        let synced = 0;
        if (params.fromId) {
          const ref = (await router.dispatch("lightroom", "lr.develop.getSettings", { id: params.fromId }, { timeoutMs: 60000 })).data as {
            settings?: Record<string, unknown>;
          } & Record<string, unknown>;
          const all = Object.keys((ref.settings as Record<string, unknown>) ?? ref);
          const keys = syncKeys(all, { whiteBalance: params.whiteBalance, exclude: params.excludeKeys });
          await router.dispatch(
            "lightroom",
            "lr.develop.copySettings",
            { fromId: params.fromId, ids: targets, useSelection: false, keys },
            { timeoutMs: 600000 }
          );
          synced = keys.length;
          steps.push(`${keys.length} ajustes copiados da foto ${params.fromId} (sem recorte, rotação, remoção de manchas, máscaras e Upright${params.whiteBalance === false ? ", sem balanço de branco" : ""})`);
        } else {
          await router.dispatch(
            "lightroom",
            "lr.develop.applyPreset",
            { ids: targets, useSelection: false, presetName: params.presetName, folder: params.presetFolder },
            { timeoutMs: 600000 }
          );
          steps.push(`preset "${params.presetName}" aplicado`);
        }

        let after = await measure(router, targets);
        let refStat: Stat | undefined;
        const evApplied: Record<number, number> = {};
        const p50Of = (st: Stat) => (params.measureRegion ? regionP50(st.image, params.measureRegion) : st.percentiles.p50);
        if (params.matchExposure) {
          let refP50: number;
          if (params.fromId) {
            refStat = (await measure(router, [params.fromId]))[0];
            if (!refStat) throw new Error("Could not render the reference photo.");
            refP50 = p50Of(refStat);
          } else {
            const med = after.map((s) => p50Of(s)).sort((a, b) => a - b);
            refP50 = med[Math.floor(med.length / 2)];
          }
          for (let pass = 0; pass < 2; pass++) {
            const toFix = after.map((s) => ({ id: s.id, ev: exposureDelta(refP50, p50Of(s), { maxEv: params.maxEv }) })).filter((x) => Math.abs(x.ev) >= 0.08);
            if (!toFix.length) break;
            for (const f of toFix) {
              const cur = (await router.dispatch("lightroom", "lr.develop.getSettings", { id: f.id, keys: ["Exposure2012"] }, { timeoutMs: 60000 })).data as Record<string, unknown>;
              const curEv = Number(((cur.settings as Record<string, unknown>) ?? cur).Exposure2012 ?? 0);
              const next = Math.round(Math.max(-5, Math.min(5, curEv + f.ev)) * 100) / 100;
              await router.dispatch("lightroom", "lr.develop.apply", { ids: [f.id], useSelection: false, settings: { Exposure2012: next }, historyName: "MCP: exposição do lote" }, { timeoutMs: 60000 });
              evApplied[f.id] = Math.round(((evApplied[f.id] ?? 0) + f.ev) * 100) / 100;
            }
            after = await measure(router, targets);
          }
          steps.push(`exposição igualada à mediana ${refP50} da referência em ${Object.keys(evApplied).length} foto(s)`);
        }

        const report = targets.map((id) => {
          const b = before.find((s) => s.id === id);
          const a = after.find((s) => s.id === id);
          const warn: string[] = [];
          if (a && a.clippedHighlightsPct > 2) warn.push(`altas estouradas ${a.clippedHighlightsPct}%`);
          if (a && a.crushedShadowsPct > 4) warn.push(`sombras empastadas ${a.crushedShadowsPct}%`);
          if (a && refStat && Math.abs(a.warmth - refStat.warmth) > 12) warn.push(`cor ${a.warmth > refStat.warmth ? "mais quente" : "mais fria"} que a referência (${a.warmth} vs ${refStat.warmth})`);
          return { id, before: brief(b), after: brief(a), exposureChange: evApplied[id] ?? 0, warnings: warn };
        });

        let exported: unknown = null;
        if (params.exportFolder) {
          exported = (
            await router.dispatch(
              "lightroom",
              "lr.export",
              {
                ids: params.fromId ? [params.fromId, ...targets] : targets,
                useSelection: false,
                folder: params.exportFolder,
                format: "JPEG",
                quality: params.exportQuality,
                longEdge: params.exportLongEdge,
                colorSpace: "sRGB",
                sharpen: "screen",
                sharpenAmount: "standard",
                metadata: "all",
                collision: "rename"
              },
              { timeoutMs: 1800000 }
            )
          ).data;
          steps.push(`exportado para ${params.exportFolder}`);
        }

        const sheetImgs = [...(refStat ? [refStat.image] : []), ...targets.map((id) => after.find((s) => s.id === id)?.image).filter((x): x is RgbImage => !!x)];
        const summary = {
          reference: params.fromId ?? `preset ${params.presetName}`,
          reference_stats: brief(refStat),
          targets: targets.length,
          keysSynced: synced,
          snapshot: snap,
          steps,
          report,
          needsAttention: report.filter((r) => r.warnings.length).map((r) => r.id),
          exported,
          sheet: refStat ? "folha: a 1ª é a referência, depois as fotos do lote na ordem dos ids" : "folha: fotos do lote na ordem dos ids"
        };
        const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
          { type: "text", text: JSON.stringify(summary, null, 2) }
        ];
        if (sheetImgs.length) {
          const png = encodePng(contactSheet(sheetImgs, { columns: params.sheetColumns, cellWidth: 240, gap: 6 }));
          content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" });
        }
        return { content };
      } catch (err) {
        const res = formatErrorResponse(err);
        if (steps.length) res.content.push({ type: "text", text: `Etapas concluídas antes do erro (desfaça pelo snapshot):\n- ${steps.join("\n- ")}` });
        return res;
      }
    }
  );
}
