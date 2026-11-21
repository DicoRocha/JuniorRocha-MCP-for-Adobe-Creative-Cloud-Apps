/**
 * Delivery formats: canvas size and the zones where platform UI or crops cover the picture.
 * Safe margins are in pixels at the base size and scale with the actual canvas width.
 * Values follow skills/fundamentos/craft-formatos — review them with the platforms each quarter.
 */
export interface FormatSpec {
  label: string;
  width: number;
  height: number;
  /** Keep text and key elements inside these margins (px at base size). */
  safe: { top: number; right: number; bottom: number; left: number };
  /** Extra areas covered by UI (px at base size), e.g. the video duration badge on thumbnails. */
  avoid?: Array<{ x: number; y: number; width: number; height: number; why: string }>;
}

/** Last review of this table and of craft-formatos/references/formatos.md (phase 4: review every quarter). */
export const FORMATS_REVIEWED = "2026-11-13";

/** Days since the last review; jradb_get_status warns after 92. */
export function formatsReviewAge(now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(`${FORMATS_REVIEWED}T00:00:00Z`).getTime()) / 86400000);
}

export const FORMATS: Record<string, FormatSpec> = {
  feed4x5: { label: "Feed 4:5", width: 1080, height: 1350, safe: { top: 60, right: 60, bottom: 60, left: 60 } },
  square1x1: { label: "Quadrado 1:1", width: 1080, height: 1080, safe: { top: 60, right: 60, bottom: 60, left: 60 } },
  story9x16: {
    label: "Story/Reels 9:16",
    width: 1080,
    height: 1920,
    safe: { top: 250, right: 120, bottom: 400, left: 60 }
  },
  reelsCover: {
    label: "Capa de Reels (lida no recorte 4:5 do feed)",
    width: 1080,
    height: 1920,
    safe: { top: 285 + 40, right: 60, bottom: 285 + 40, left: 60 }
  },
  link191: { label: "Link 1,91:1", width: 1200, height: 628, safe: { top: 40, right: 40, bottom: 40, left: 40 } },
  youtubeThumb: {
    label: "Thumbnail YouTube 16:9",
    width: 1280,
    height: 720,
    safe: { top: 40, right: 40, bottom: 40, left: 40 },
    avoid: [{ x: 1080, y: 630, width: 200, height: 90, why: "duração do vídeo" }]
  },
  landscape16x9: { label: "Vídeo 16:9", width: 1920, height: 1080, safe: { top: 54, right: 96, bottom: 54, left: 96 } }
};

/** The format whose aspect is closest to width×height (within 3 %), or null. */
export function guessFormat(width: number, height: number): string | null {
  let best: string | null = null;
  let bestErr = 0.03;
  for (const [key, f] of Object.entries(FORMATS)) {
    if (key === "reelsCover") continue;
    const err = Math.abs(width / height - f.width / f.height) / (f.width / f.height);
    if (err < bestErr) {
      bestErr = err;
      best = key;
    }
  }
  return best;
}

/** Safe rectangle and avoid zones scaled to the real canvas. */
export function resolveZones(key: string, width: number, height: number) {
  const f = FORMATS[key];
  if (!f) throw new Error(`Unknown format '${key}'. Use one of: ${Object.keys(FORMATS).join(", ")}.`);
  const k = width / f.width;
  const s = { top: Math.round(f.safe.top * k), right: Math.round(f.safe.right * k), bottom: Math.round(f.safe.bottom * k), left: Math.round(f.safe.left * k) };
  return {
    format: key,
    label: f.label,
    expected: { width: Math.round(f.width * k), height: Math.round(f.height * k) },
    safeRect: { x: s.left, y: s.top, width: width - s.left - s.right, height: height - s.top - s.bottom },
    avoid: (f.avoid ?? []).map((a) => ({ x: Math.round(a.x * k), y: Math.round(a.y * k), width: Math.round(a.width * k), height: Math.round(a.height * k), why: a.why }))
  };
}

/** WCAG relative luminance contrast ratio between two sRGB colours (0–255). */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const lum = (c: [number, number, number]) => {
    const [r, g, bl] = c.map((v) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const la = lum(a);
  const lb = lum(b);
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
}
