/**
 * Reference looks shared by Lightroom (develop keys), Photoshop (adjustment-layer stack) and Premiere (pr_color).
 * Own value ranges, written from studying old presets of the user; the preset files themselves are never shipped.
 */
import type { PresetValue } from "../media/legacy-preset.js";

export interface PsLookStack {
  /** Black & White mix (reds, yellows, greens, cyans, blues, magentas: -200..300) and optional tint. */
  blackAndWhite?: { red: number; yellow: number; green: number; cyan: number; blue: number; magenta: number; tint?: [number, number, number] };
  /** Curve points [[in, out], ...] 0-255 on the composite. */
  curve?: Array<[number, number]>;
  /** Hue/Saturation master saturation -100..100. */
  saturation?: number;
  /** Color Balance [cyan-red, magenta-green, yellow-blue] per range (-100..100). */
  colorBalance?: { shadows: [number, number, number]; highlights: [number, number, number] };
  /** Film grain recipe (ps_recipe_film_grain). */
  grain?: { amount: number; size: number; opacity: number };
}

export interface ReferenceLook {
  description: string;
  lightroom: Record<string, PresetValue>;
  photoshop: PsLookStack;
  premiere: Record<string, number>;
  premiereNote?: string;
}

export const REFERENCE_LOOKS: Record<string, ReferenceLook> = {
  "esportivo-dramatico": {
    description: "Sport / dramatic: muted colour, strong local contrast, deep blacks, cool shadows and warm highlights, dark vignette.",
    lightroom: {
      Exposure2012: -0.3, Contrast2012: 45, Shadows2012: 32, Blacks2012: -20, Clarity2012: 40, Saturation: -38, Vibrance: 13,
      LuminanceAdjustmentOrange: -14, LuminanceAdjustmentRed: -12, LuminanceAdjustmentYellow: -14,
      SplitToningShadowHue: 232, SplitToningShadowSaturation: 10, SplitToningHighlightHue: 52, SplitToningHighlightSaturation: 5,
      PostCropVignetteAmount: -25, PostCropVignetteMidpoint: 30, PostCropVignetteFeather: 70
    },
    photoshop: {
      curve: [[0, 0], [64, 52], [128, 128], [192, 204], [255, 255]],
      saturation: -38,
      colorBalance: { shadows: [-8, 0, 10], highlights: [6, 0, -6] }
    },
    premiere: { exposure: -0.2, contrast: 30, highlights: -15, shadows: 15, blacks: -20, saturation: 65, vibrance: 10, sharpen: 15 },
    premiereNote: "Local contrast (Clarity) and split toning are not in pr_color: the user can add them in Color Mode."
  },
  "pb-papel-antigo": {
    description: "Black and white on old paper: light sepia highlights, cool shadows, light vignette, heavy grain.",
    lightroom: {
      ConvertToGrayscale: true, Contrast2012: 15,
      GrayMixerRed: 15, GrayMixerOrange: -15, GrayMixerYellow: -20, GrayMixerGreen: -25, GrayMixerBlue: 10,
      SplitToningHighlightHue: 52, SplitToningHighlightSaturation: 50, SplitToningShadowHue: 230, SplitToningShadowSaturation: 8,
      PostCropVignetteAmount: 32, GrainAmount: 50, GrainSize: 60, GrainFrequency: 68
    },
    photoshop: {
      blackAndWhite: { red: 55, yellow: 40, green: 15, cyan: 60, blue: 30, magenta: 80, tint: [222, 200, 165] },
      curve: [[0, 12], [64, 62], [128, 132], [192, 200], [255, 248]],
      grain: { amount: 10, size: 0.8, opacity: 70 }
    },
    premiere: { saturation: 0, contrast: 15, highlights: -10, blacks: 10, fadedFilm: 25 },
    premiereNote: "Sepia needs a tint: in Color Mode or with a Tint effect; pr_color makes the black and white."
  },
  "pb-vintage": {
    description: "Dark vintage black and white: sepia shadows, strong dark vignette, rough grain.",
    lightroom: {
      ConvertToGrayscale: true, Exposure2012: -0.45, Contrast2012: 35, Shadows2012: 30,
      GrayMixerYellow: 30, GrayMixerGreen: -20, GrayMixerAqua: -20,
      SplitToningShadowHue: 35, SplitToningShadowSaturation: 50, SplitToningHighlightHue: 60, SplitToningHighlightSaturation: 15,
      PostCropVignetteAmount: -50, PostCropVignetteMidpoint: 25, GrainAmount: 52, GrainFrequency: 78
    },
    photoshop: {
      blackAndWhite: { red: 40, yellow: 90, green: 20, cyan: 40, blue: 20, magenta: 80, tint: [190, 160, 120] },
      curve: [[0, 0], [64, 48], [128, 118], [192, 196], [255, 250]],
      grain: { amount: 12, size: 0.6, opacity: 75 }
    },
    premiere: { saturation: 0, exposure: -0.3, contrast: 30, shadows: 10, blacks: -15, fadedFilm: 10 },
    premiereNote: "Sepia shadows and the vignette are not in pr_color: Color Mode, or a Tint + Vignette effect."
  }
};

export function referenceLook(name: string): ReferenceLook {
  const l = REFERENCE_LOOKS[name];
  if (!l) throw Object.assign(new Error(`No look '${name}'. Looks: ${Object.keys(REFERENCE_LOOKS).join(", ")}.`), { code: "INVALID_PARAMS" });
  return l;
}
