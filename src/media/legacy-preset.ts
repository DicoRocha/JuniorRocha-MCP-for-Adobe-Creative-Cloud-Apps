/**
 * Reads old Lightroom / Camera Raw presets (.xmp with crs: attributes or elements, .lrtemplate Lua tables) and
 * turns them into current Develop settings (process 2012+) for lr_apply_develop_settings, with an intensity.
 *
 * The 2010 -> 2012 factors are a starting point (not calibrated): compare on a real photo and adjust.
 * Presets made for 10 MP files ran Clarity, Sharpness and Contrast high; intensity scales those "strength"
 * controls (and grain and vignette) toward zero, never the white balance or the B&W switch.
 */

export type PresetValue = number | string | boolean | number[];

export interface LegacyPreset {
  name?: string;
  processVersion?: string;
  settings: Record<string, PresetValue>;
}

const num = (v: string): PresetValue => {
  const t = v.trim().replace(/^"|"$/g, "");
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === "true";
  if (/^[+-]?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
};

/** .xmp (attribute form `crs:Key="v"` or element form `<crs:Key>v</crs:Key>`). Curves come as point lists. */
export function parseXmpPreset(xml: string): LegacyPreset {
  const settings: Record<string, PresetValue> = {};
  for (const m of xml.matchAll(/crs:([A-Za-z0-9]+)="([^"]*)"/g)) settings[m[1]] = num(m[2]);
  for (const m of xml.matchAll(/<crs:([A-Za-z0-9]+)>([^<]*)<\/crs:\1>/g)) settings[m[1]] = num(m[2]);
  // tone curves: <crs:ToneCurvePV2012><rdf:Seq><rdf:li>0, 0</rdf:li>...
  for (const m of xml.matchAll(/<crs:(ToneCurve[A-Za-z0-9]*)>\s*<rdf:Seq>([\s\S]*?)<\/rdf:Seq>/g)) {
    const pts = [...m[2].matchAll(/<rdf:li>\s*([\d.]+)\s*,\s*([\d.]+)\s*<\/rdf:li>/g)].flatMap((p) => [Number(p[1]), Number(p[2])]);
    if (pts.length) settings[m[1]] = pts;
  }
  const name = /<rdf:li xml:lang="x-default">([^<]+)<\/rdf:li>/.exec(xml)?.[1];
  const pv = settings.ProcessVersion;
  return { name, processVersion: pv === undefined ? undefined : String(pv), settings };
}

/** .lrtemplate: `s = { title = "...", value = { settings = { Key = value, Curve = { 0, 0, 255, 255 }, ... } } }`. */
export function parseLrTemplate(lua: string): LegacyPreset {
  const settings: Record<string, PresetValue> = {};
  const start = lua.search(/settings\s*=\s*\{/);
  if (start >= 0) {
    let i = lua.indexOf("{", start) + 1;
    let depth = 1;
    const from = i;
    for (; i < lua.length && depth > 0; i++) {
      if (lua[i] === "{") depth++;
      else if (lua[i] === "}") depth--;
    }
    const body = lua.slice(from, i - 1);
    for (const m of body.matchAll(/([A-Za-z][A-Za-z0-9]*)\s*=\s*(\{[^{}]*\}|"[^"]*"|[^,\n]+)\s*,?/g)) {
      const raw = m[2].trim();
      if (raw.startsWith("{")) {
        const nums = raw.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean).map(Number);
        if (nums.every((n) => Number.isFinite(n))) settings[m[1]] = nums;
      } else settings[m[1]] = num(raw);
    }
  }
  const name = /title\s*=\s*"([^"]+)"/.exec(lua)?.[1];
  const pv = settings.ProcessVersion;
  return { name, processVersion: pv === undefined ? undefined : String(pv), settings };
}

export function parsePreset(text: string): LegacyPreset {
  return /crs:|x:xmpmeta/.test(text) ? parseXmpPreset(text) : parseLrTemplate(text);
}

/** Keys that are metadata or belong to the old process and are translated, not passed on. */
const SKIP = new Set(["Version", "ProcessVersion", "HasSettings", "HasCrop", "AlreadyApplied", "CameraProfile", "CameraProfileDigest", "ToneCurveName", "ToneCurve", "ToneCurveName2012"]);
const PV2010_ONLY = ["Exposure", "Recovery", "HighlightRecovery", "FillLight", "Shadows", "Brightness", "Contrast", "Clarity"];

/** Controls whose strength the intensity scales (proportionally toward 0). */
const SCALED = /^(Contrast2012|Clarity2012|Texture|Dehaze|Saturation|Vibrance|Sharpness|GrainAmount|PostCropVignetteAmount|VignetteAmount|Highlights2012|Shadows2012|Whites2012|Blacks2012|Exposure2012|Parametric(Shadows|Darks|Lights|Highlights)|(Hue|Saturation|Luminance)Adjustment\w+|SplitToning(Shadow|Highlight)Saturation|ColorGrade\w*Sat|GrayMixer\w+)$/;

export interface TranslatedPreset {
  name?: string;
  sourceProcess: "2010" | "2012+" | "unknown";
  intensity: number;
  settings: Record<string, PresetValue>;
  notes: string[];
}

export function translatePreset(p: LegacyPreset, opts: { intensity?: number } = {}): TranslatedPreset {
  const k = Math.max(0, Math.min(1, opts.intensity ?? 0.6));
  const s = p.settings;
  const pv = parseFloat(p.processVersion ?? "");
  const is2010 = (Number.isFinite(pv) && pv < 6) || (s.Exposure2012 === undefined && PV2010_ONLY.some((x) => s[x] !== undefined));
  const out: Record<string, PresetValue> = {};
  const notes: string[] = [];
  for (const [key, v] of Object.entries(s)) {
    if (SKIP.has(key) || (is2010 && PV2010_ONLY.includes(key))) continue;
    if (/^Enable/.test(key) || key === "ConvertToGrayscale" || typeof v === "boolean") {
      out[key] = v;
      continue;
    }
    out[key] = v;
  }
  if (is2010) {
    const n = (x: PresetValue | undefined) => (typeof x === "number" ? x : 0);
    out.Exposure2012 = Math.round((n(s.Exposure) + (n(s.Brightness) - 50) / 100) * 100) / 100;
    if (s.Contrast !== undefined) out.Contrast2012 = Math.round(0.5 * (n(s.Contrast) - 25));
    const rec = n(s.Recovery ?? s.HighlightRecovery);
    if (rec) out.Highlights2012 = -Math.round(0.6 * rec);
    if (s.FillLight !== undefined) out.Shadows2012 = Math.round(0.6 * n(s.FillLight));
    if (s.Shadows !== undefined) out.Blacks2012 = -Math.round(0.6 * n(s.Shadows));
    if (s.Clarity !== undefined) out.Clarity2012 = Math.round(0.5 * n(s.Clarity));
    if (Array.isArray(s.ToneCurve)) out.ToneCurvePV2012 = s.ToneCurve;
    notes.push("Process 2010 translated to the current process (Exposure+Brightness, Contrast, Recovery, Fill Light, Blacks, Clarity) with uncalibrated factors: check on the photo.");
  }
  Object.assign(out, scaleDevelopSettings(out, k));
  if (typeof out.Sharpness === "number" && typeof out.SharpenRadius === "number" && out.SharpenRadius > 1.5) {
    out.SharpenRadius = 1.0;
    notes.push("SharpenRadius above 1.5 makes halos on today's large files: set to 1.0.");
  }
  if (typeof out.Clarity2012 === "number" && Math.abs(out.Clarity2012) > 40) notes.push(`Clarity ${out.Clarity2012} is strong: keep it off skin (mask) or lower the intensity.`);
  notes.push(`Strength controls scaled to ${Math.round(k * 100)} %; white balance, B&W and switches kept as they are.`);
  return { name: p.name, sourceProcess: is2010 ? "2010" : Number.isFinite(pv) ? "2012+" : "unknown", intensity: k, settings: out, notes };
}

/** Strength controls moved toward 0 by k (0..1.5); white balance, switches, hues and the rest unchanged. */
export function scaleDevelopSettings(settings: Record<string, PresetValue>, k: number): Record<string, PresetValue> {
  const out: Record<string, PresetValue> = { ...settings };
  for (const [key, v] of Object.entries(out)) {
    if (typeof v === "number" && SCALED.test(key)) out[key] = key === "Exposure2012" ? Math.round(v * k * 100) / 100 : Math.round(v * k);
  }
  return out;
}

/**
 * Lightroom 16 renders colour when ConvertToGrayscale is set alone through the SDK: black and white also needs the
 * monochrome profile (live, 23/11/2026). The Look table below is Adobe Monochrome as Camera Raw ships it.
 */
export const ADOBE_MONOCHROME_LOOK = {
  Amount: 1,
  Group: { "x-default": "Profiles" },
  Name: "Adobe Monochrome",
  UUID: "0CFE8F8AB5F63B2A73CE0B0077D20817",
  Parameters: { CameraProfile: "Adobe Standard", Clarity2012: 8, ConvertToGrayscale: true, LookTable: "73ED6C18DDE909DD7EA2D771F5AC282D", ProcessVersion: "10.0" }
};

export function withGrayscaleProfile<T extends Record<string, unknown>>(settings: T): T & { Look?: unknown } {
  if (settings.ConvertToGrayscale === true && settings.Look === undefined) return { ...settings, Look: ADOBE_MONOCHROME_LOOK };
  return settings;
}
