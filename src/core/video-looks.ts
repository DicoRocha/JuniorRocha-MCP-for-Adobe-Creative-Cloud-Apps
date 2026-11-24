/**
 * Named looks for pr_color (Lumetri by the Lightroom-style names). A look is applied after the correction, at an
 * intensity: each value moves from neutral toward the look by that fraction. Saturation is neutral at 100.
 */
export const VIDEO_LOOKS: Record<string, { description: string; settings: Record<string, number> }> = {
  "natural-limpo": { description: "Clean and true: a little contrast and vibrance, nothing that shows.", settings: { contrast: 6, highlights: -10, shadows: 6, vibrance: 8 } },
  "cinematico-contido": { description: "Contained cinematic: soft highlights, deep but open blacks, a little less saturation, slight fade.", settings: { contrast: 12, highlights: -25, whites: -10, blacks: -8, shadows: 8, saturation: 92, vibrance: 6, fadedFilm: 8 } },
  "quente-editorial": { description: "Warm editorial: warmer, gentle contrast, skin forward.", settings: { temperature: 10, tint: 2, contrast: 8, highlights: -12, saturation: 98, vibrance: 10 } },
  "frio-tecnologico": { description: "Cool tech: cooler white balance, crisp contrast, controlled saturation.", settings: { temperature: -10, tint: -2, contrast: 14, highlights: -15, blacks: -6, saturation: 90, vibrance: 4 } },
  "pb-contraste": { description: "Black and white with contrast (no colour left).", settings: { saturation: 0, contrast: 20, highlights: -15, blacks: -10, whites: 8 } }
};

const NEUTRAL: Record<string, number> = { saturation: 100 };

export function lookSettings(name: string, intensity = 1, overrides: Record<string, number> = {}): Record<string, number> {
  const look = VIDEO_LOOKS[name];
  if (!look) throw Object.assign(new Error(`No look '${name}'. Looks: ${Object.keys(VIDEO_LOOKS).join(", ")}.`), { code: "INVALID_PARAMS" });
  const k = Math.max(0, Math.min(1.5, intensity));
  const out: Record<string, number> = {};
  for (const [key, v] of Object.entries(look.settings)) {
    const n = NEUTRAL[key] ?? 0;
    out[key] = Math.round((n + (v - n) * k) * 100) / 100;
  }
  return { ...out, ...overrides };
}
