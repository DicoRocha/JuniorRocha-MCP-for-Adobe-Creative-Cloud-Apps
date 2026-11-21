/**
 * Illustrator Live Effect XML builders for PageItem.applyEffect().
 * The XML templates (effect names, Dict keys and type letters) are adapted from
 * "Live Effect Functions for Illustrator" by Mark Bean (MIT License, 2021):
 * https://github.com/mark1bean/live-effect-functions-for-illustrator
 */

type Opts = Record<string, unknown>;

function num(o: Opts, key: string, fallback: number): number {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(o: Opts, key: string, fallback: boolean): boolean {
  const v = o[key];
  return typeof v === "boolean" ? v : fallback;
}

/** Live Effect colour string: "5 r g b" (RGB 0-1), "1 c m y k" (CMYK 0-1) or "0 k" (gray). */
export function formatLiveEffectColor(color: unknown, fallback: number[]): string {
  let c: number[] = fallback;
  if (typeof color === "string" && /^#?[0-9a-f]{6}$/i.test(color)) {
    const hex = color.replace("#", "");
    c = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  } else if (Array.isArray(color) && color.every((n) => typeof n === "number")) {
    c = color as number[];
  }
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  if (c.length === 1) return `0 ${r3(c[0] / 100)}`;
  if (c.length === 4) return `1 ${c.map((n) => r3(n / 100)).join(" ")}`;
  if (c.length === 3) return `5 ${c.map((n) => r3(n / 255)).join(" ")}`;
  throw new Error(`Colour must be '#RRGGBB', [r,g,b] 0-255, [c,m,y,k] 0-100 or [k] 0-100; got ${JSON.stringify(color)}.`);
}

const BLEND = { normal: 0, multiply: 1, screen: 2, overlay: 3, softLight: 4, hardLight: 5, colorDodge: 6, colorBurn: 7, darken: 8, lighten: 9, difference: 10, exclusion: 11, hue: 12, saturation: 13, color: 14, luminosity: 15 } as const;

function blend(o: Opts, fallback: keyof typeof BLEND): number {
  const v = o.blendMode;
  if (typeof v === "number") return v;
  if (typeof v === "string" && v in BLEND) return BLEND[v as keyof typeof BLEND];
  return BLEND[fallback];
}

const WARP_STYLES = ["arc", "arcLower", "arcUpper", "arch", "bulge", "shellLower", "shellUpper", "flag", "wave", "fish", "rise", "fishEye", "inflate", "squeeze", "twist"];
const PIN_POINTS = ["topLeft", "top", "topRight", "left", "center", "right", "bottomLeft", "bottom", "bottomRight"];

export interface LiveEffectSpec {
  description: string;
  options: string;
  build: (o: Opts) => string;
}

export const LIVE_EFFECTS: Record<string, LiveEffectSpec> = {
  dropShadow: {
    description: "Drop shadow",
    options: "offsetX=7, offsetY=7 (pt), blur=5, opacity=0.75 (0-1), color='#000000', blendMode='multiply'",
    build: (o) =>
      `<LiveEffect name="Adobe Drop Shadow"><Dict data="I blnd ${blend(o, "multiply")} R opac ${num(o, "opacity", 0.75)} R horz ${num(o, "offsetX", 7)} R vert ${num(o, "offsetY", 7)} R blur ${num(o, "blur", 5)} B usePSLBlur ${bool(o, "usePSLBlur", true) ? 1 : 0} I csrc ${bool(o, "useDarkness", false) ? 1 : 0} R dark ${num(o, "darkness", 100)} B pair 1 "><Entry name="sclr" valueType="F"><Fill color="${formatLiveEffectColor(o.color, [0, 0, 0])}"/></Entry></Dict></LiveEffect>`
  },
  outerGlow: {
    description: "Outer glow",
    options: "blur=5, opacity=0.75, color='#FFFFFF', blendMode='screen'",
    build: (o) =>
      `<LiveEffect name="Adobe Outer Glow"><Dict data="I blnd ${blend(o, "screen")} R opac ${num(o, "opacity", 0.75)} R blur ${num(o, "blur", 5)} B usePSLBlur ${bool(o, "usePSLBlur", true) ? 1 : 0} "><Entry name="sclr" valueType="F"><Fill color="${formatLiveEffectColor(o.color, [255, 255, 255])}"/></Entry></Dict></LiveEffect>`
  },
  innerGlow: {
    description: "Inner glow",
    options: "blur=5, opacity=0.75, color='#FFFFFF', glowFrom='center'|'edge', blendMode='screen'",
    build: (o) =>
      `<LiveEffect name="Adobe Inner Glow"><Dict data="I blnd ${blend(o, "screen")} I gtyp ${o.glowFrom === "edge" ? 1 : 0} R opac ${num(o, "opacity", 0.75)} R blur ${num(o, "blur", 5)} "><Entry name="gclr" valueType="F"><Fill color="${formatLiveEffectColor(o.color, [255, 255, 255])}"/></Entry></Dict></LiveEffect>`
  },
  gaussianBlur: {
    description: "Gaussian blur",
    options: "radius=10",
    build: (o) => `<LiveEffect name="Adobe PSL Gaussian Blur"><Dict data="R PrevDocScale 1 I PrevDres 300 R blur ${num(o, "radius", 10)} "></Dict></LiveEffect>`
  },
  feather: {
    description: "Feather (soft edges)",
    options: "radius=10",
    build: (o) => `<LiveEffect name="Adobe Fuzzy Mask"><Dict data="R Radius ${num(o, "radius", 10)} "/></LiveEffect>`
  },
  offsetPath: {
    description: "Offset path (outline around the shape)",
    options: "offset=10 (pt, negative shrinks), joinType='round'|'bevel'|'miter', miterLimit=4",
    build: (o) => {
      const join = { round: 0, bevel: 1, miter: 2 }[String(o.joinType ?? "miter")] ?? 2;
      return `<LiveEffect name="Adobe Offset Path"><Dict data="R ofst ${num(o, "offset", 10)} I jntp ${join} R mlim ${num(o, "miterLimit", 4)} "/></LiveEffect>`;
    }
  },
  roundCorners: {
    description: "Round corners",
    options: "radius=10",
    build: (o) => `<LiveEffect name="Adobe Round Corners"><Dict data="R radius ${num(o, "radius", 10)} "/></LiveEffect>`
  },
  roughen: {
    description: "Roughen",
    options: "amount=5, absolute=false, detail=10 (per inch), smooth=0 (0 corners … 1 smooth)",
    build: (o) => {
      const a = num(o, "amount", 5);
      return `<LiveEffect name="Adobe Roughen"><Dict data="R asiz ${a} R size ${a} R absoluteness ${bool(o, "absolute", false) ? 1 : 0} R dtal ${num(o, "detail", 10)} R roundness ${num(o, "smooth", 0)} "/></LiveEffect>`;
    }
  },
  zigZag: {
    description: "Zig zag",
    options: "amount=10, absolute=true, ridges=4, smooth=0",
    build: (o) => {
      const a = num(o, "amount", 10);
      return `<LiveEffect name="Adobe Zigzag"><Dict data="R amount ${a} R relAmount ${a} R absoluteness ${bool(o, "absolute", true) ? 1 : 0} R ridges ${num(o, "ridges", 4)} R roundness ${num(o, "smooth", 0)} "/></LiveEffect>`;
    }
  },
  puckerBloat: {
    description: "Pucker & bloat",
    options: "value=50 (-200 pucker … 200 bloat)",
    build: (o) => `<LiveEffect name="Adobe Punk and Bloat"><Dict data="R d_factor ${num(o, "value", 50)} "/></LiveEffect>`
  },
  twist: {
    description: "Twist",
    options: "angle=10",
    build: (o) => `<LiveEffect name="Adobe Twirl" isPre="1"><Dict data="R angle ${num(o, "angle", 10)} "/></LiveEffect>`
  },
  transform: {
    description: "Transform effect (scale/move/rotate, optional repeated copies)",
    options: "scaleX=100, scaleY=100, moveX=0, moveY=0, rotate=0, copies=0, pinPoint='center', reflectX, reflectY, scaleStrokes, randomize",
    build: (o) => {
      const sx = num(o, "scaleX", 100);
      const sy = num(o, "scaleY", 100);
      const rot = num(o, "rotate", 0);
      const pin = Math.max(0, PIN_POINTS.indexOf(String(o.pinPoint ?? "center")));
      const b = (k: string, d: boolean) => (bool(o, k, d) ? 1 : 0);
      return `<LiveEffect name="Adobe Transform"><Dict data="R scaleH_Percent ${sx} R scaleV_Percent ${sy} R scaleH_Factor ${sx / 100} R scaleV_Factor ${sy / 100} R moveH_Pts ${num(o, "moveX", 0)} R moveV_Pts ${num(o, "moveY", 0)} R rotate_Degrees ${rot} R rotate_Radians ${(rot * Math.PI) / 180} I numCopies ${num(o, "copies", 0)} I pinPoint ${pin} B scaleLines ${b("scaleStrokes", false)} B transformPatterns ${b("transformPatterns", true)} B transformObjects ${b("transformObjects", true)} B reflectX ${b("reflectX", false)} B reflectY ${b("reflectY", false)} B randomize ${b("randomize", false)} "/></LiveEffect>`;
    }
  },
  warp: {
    description: "Warp",
    options: `style=${WARP_STYLES.join("|")}, amount=50 (%), vertical=false, distortH=0, distortV=0`,
    build: (o) => {
      const idx = Math.max(0, WARP_STYLES.indexOf(String(o.style ?? "arc")));
      const name = WARP_STYLES[idx].charAt(0).toUpperCase() + WARP_STYLES[idx].slice(1);
      return `<LiveEffect name="Adobe Deform"><Dict data="S DisplayString Warp:${name} I DeformStyle ${idx + 1} B Rotate ${bool(o, "vertical", false) ? 1 : 0} R DeformValue ${num(o, "amount", 50) / 100} R DeformHoriz ${num(o, "distortH", 0) / 100} R DeformVert ${num(o, "distortV", 0) / 100} "/></LiveEffect>`;
    }
  },
  scribble: {
    description: "Scribble fill",
    options: "angle=30, pathOverlap=0, pathOverlapVariation=5, strokeWidth=3, curviness=5 (%), curvinessVariation=1 (%), spacing=5, spacingVariation=0.5",
    build: (o) =>
      `<LiveEffect name="Adobe Scribble Fill"><Dict data="R Spacing ${num(o, "spacing", 5)} R Angle ${num(o, "angle", 30)} R Scribbliness ${num(o, "curviness", 5) / 100} R StrokeWidth ${num(o, "strokeWidth", 3)} R EdgeOverlap ${num(o, "pathOverlap", 0)} R ScribbleVariation ${num(o, "curvinessVariation", 1) / 100} R SpacingVariation ${num(o, "spacingVariation", 0.5)} R EdgeOverlapVariation ${num(o, "pathOverlapVariation", 5)}"/></LiveEffect>`
  },
  rasterize: {
    description: "Rasterize (live)",
    options: "dpi=72, colorModel='rgb'|'cmyk'|'grayscale'|'bitmap', transparent=true, padding=0, antialias='none'|'art'|'type', clipMask=false",
    build: (o) => {
      const model = { rgb: 0, cmyk: 1, grayscale: 2, bitmap: 3 }[String(o.colorModel ?? "rgb")] ?? 0;
      const aa = { none: 0, art: 1, type: 2 }[String(o.antialias ?? "art")] ?? 1;
      return `<LiveEffect name="Adobe Rasterize"><Dict data="I colr ${model + (bool(o, "transparent", true) ? 4 : 0)} B alis ${aa > 0 ? 1 : 0} I dpi. ${Math.round(num(o, "dpi", 72))} B mask ${bool(o, "clipMask", false) ? 1 : 0} R padd ${num(o, "padding", 0)} I optn ${aa === 2 ? 16 : 0} "/></LiveEffect>`;
    }
  },
  outlineStroke: {
    description: "Outline stroke (live)",
    options: "(none)",
    build: () => `<LiveEffect name="Adobe Outline Stroke"><Dict data=" "/></LiveEffect>`
  }
};

export function buildLiveEffectXml(effect: string, options: Opts = {}): string {
  const spec = LIVE_EFFECTS[effect];
  if (!spec) {
    throw new Error(`Unknown live effect '${effect}'. Available: ${Object.keys(LIVE_EFFECTS).join(", ")}.`);
  }
  return spec.build(options);
}
