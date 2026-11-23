/**
 * Zone System report of an image (Ansel Adams, mapped on CIE L*): zone N covers L* around N×10, 0 = pure
 * black … X = pure white. Tells where the tones sit, what clips, the key of the picture and whether the
 * midtones carry a colour cast, so a grade is decided on numbers instead of on a guess.
 */
export const ZONE_SRGB = [0, 27, 48, 71, 94, 119, 145, 171, 198, 226, 255];

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const LUT = Array.from({ length: 256 }, (_, i) => lin(i));
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB 0–255 -> CIE L*a*b* (D65). */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = LUT[r], G = LUT[g], B = LUT[b];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export const ZONE_NAMES = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export interface ZoneReport {
  pixels: number;
  zones: Array<{ zone: string; percent: number }>;
  meanL: number;
  medianZone: string;
  key: "low-key" | "mid-key" | "high-key";
  clipping: { shadowsPercent: number; highlightsPercent: number };
  midtoneCast: { a: number; b: number; chroma: number; direction: string | null };
  diagnosis: string[];
}

export function zoneReport(rgb: Uint8Array): ZoneReport {
  const n = Math.floor(rgb.length / 3);
  const counts = new Array(11).fill(0);
  let sumL = 0, clipLo = 0, clipHi = 0, midN = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const [L, A, Bb] = rgbToLab(r, g, b);
    sumL += L;
    counts[Math.max(0, Math.min(10, Math.round(L / 10)))]++;
    if (r <= 2 && g <= 2 && b <= 2) clipLo++;
    if (r >= 253 || g >= 253 || b >= 253) clipHi++;
    if (L >= 35 && L <= 65) {
      midN++;
      sa += A;
      sb += Bb;
    }
  }
  const pct = (x: number) => Math.round((x / Math.max(1, n)) * 1000) / 10;
  const zones = counts.map((c, i) => ({ zone: ZONE_NAMES[i], percent: pct(c) }));
  let acc = 0, med = 0;
  for (let i = 0; i < 11; i++) {
    acc += counts[i];
    if (acc >= n / 2) {
      med = i;
      break;
    }
  }
  const meanL = Math.round((sumL / Math.max(1, n)) * 10) / 10;
  const key = meanL < 38 ? "low-key" : meanL > 62 ? "high-key" : "mid-key";
  const a = midN ? sa / midN : 0, b = midN ? sb / midN : 0;
  const chroma = Math.hypot(a, b);
  let direction: string | null = null;
  if (midN > n * 0.05 && chroma > 4) {
    const h = (Math.atan2(b, a) * 180) / Math.PI;
    direction = h > -30 && h <= 30 ? "magenta" : h > 30 && h <= 75 ? "red/orange (warm)" : h > 75 && h <= 120 ? "yellow (warm)" : h > 120 && h <= 200 ? "green" : h > -120 && h <= -30 ? "blue/violet (cool)" : "cyan/blue (cool)";
  }
  const clipping = { shadowsPercent: pct(clipLo), highlightsPercent: pct(clipHi) };
  const diagnosis: string[] = [];
  if (clipping.highlightsPercent > 0.5) diagnosis.push(`HIGHLIGHTS_CLIPPED: ${clipping.highlightsPercent}% of the pixels are clipped white (limit 0.5%).`);
  if (clipping.shadowsPercent > 1) diagnosis.push(`SHADOWS_CRUSHED: ${clipping.shadowsPercent}% of the pixels are pure black (limit 1%).`);
  const ends = zones[0].percent + zones[1].percent + zones[9].percent + zones[10].percent;
  const mids = zones.slice(3, 8).reduce((s, z) => s + z.percent, 0);
  if (mids > 85 && ends < 2) diagnosis.push("FLAT: almost everything sits in zones III–VII; the picture lacks depth (deeper blacks or brighter highlights).");
  if (zones[0].percent + zones[1].percent + zones[2].percent === 0) diagnosis.push("NO_BLACK: nothing reaches zone II; blacks look lifted (fine only for a faded look).");
  if (zones[8].percent + zones[9].percent + zones[10].percent === 0) diagnosis.push("NO_WHITE: nothing reaches zone VIII; the highlights look dull.");
  if (direction) diagnosis.push(`MIDTONE_CAST: midtones lean ${direction} (a* ${a.toFixed(1)}, b* ${b.toFixed(1)}). Check skin and neutrals.`);
  return {
    pixels: n,
    zones,
    meanL,
    medianZone: ZONE_NAMES[med],
    key,
    clipping,
    midtoneCast: { a: Math.round(a * 10) / 10, b: Math.round(b * 10) / 10, chroma: Math.round(chroma * 10) / 10, direction },
    diagnosis
  };
}

/** Zone map: each pixel painted with the grey of its zone (posterised), for a visual check. */
export function zoneMap(rgb: Uint8Array): Uint8Array {
  const out = new Uint8Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    const [L] = rgbToLab(rgb[i], rgb[i + 1], rgb[i + 2]);
    const v = ZONE_SRGB[Math.max(0, Math.min(10, Math.round(L / 10)))];
    out[i] = out[i + 1] = out[i + 2] = v;
  }
  return out;
}
