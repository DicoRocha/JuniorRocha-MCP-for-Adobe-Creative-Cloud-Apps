/**
 * Brand kit for recipes: reads 00_briefing/kit-de-marca.json (skills/_shared/kit-de-marca.schema.json) and/or
 * inline overrides, and resolves the roles recipes need. Falls back to a neutral palette.
 */
import * as fs from "node:fs";

export interface ResolvedKit {
  colors: { fundo: string; superficie: string; texto: string; textoSecundario: string; destaque: string };
  fonts: { titulo: string; corpo: string; rotulo: string };
  source: string;
  /** Official CMYK values from the kit file (cores[].cmyk), by role, when given. */
  cmyk?: Partial<Record<keyof ResolvedKit["colors"], [number, number, number, number]>>;
}

const NEUTRAL: ResolvedKit = {
  colors: { fundo: "#101418", superficie: "#1E252C", texto: "#FFFFFF", textoSecundario: "#C9CED6", destaque: "#E63946" },
  fonts: { titulo: "Arial-BoldMT", corpo: "ArialMT", rotulo: "Arial-BoldMT" },
  source: "neutro (sem kit)"
};

export interface KitInput {
  kitPath?: string;
  colors?: Partial<ResolvedKit["colors"]>;
  fonts?: Partial<ResolvedKit["fonts"]>;
}

const HEX = /^#?[0-9a-f]{6}$/i;
const norm = (h: string) => (h.startsWith("#") ? h : `#${h}`).toUpperCase();

export function resolveKit(input: KitInput = {}): ResolvedKit {
  const kit: ResolvedKit = { colors: { ...NEUTRAL.colors }, fonts: { ...NEUTRAL.fonts }, source: NEUTRAL.source };
  if (input.kitPath) {
    const raw = JSON.parse(fs.readFileSync(input.kitPath, "utf8")) as {
      cores?: Array<{ nome?: string; hex?: string; uso?: string; cmyk?: number[] | null }>;
      tipos?: Record<string, { familia?: string; estilo?: string; postscript?: string }>;
    };
    const byUse: Record<string, string> = {};
    const cmykByUse: Record<string, [number, number, number, number]> = {};
    for (const c of raw.cores ?? []) {
      if (!(c.hex && HEX.test(c.hex) && c.uso) || byUse[c.uso]) continue;
      byUse[c.uso] = norm(c.hex);
      if (Array.isArray(c.cmyk) && c.cmyk.length === 4) cmykByUse[c.uso] = c.cmyk.map(Number) as [number, number, number, number];
    }
    const roleOf: Record<string, keyof ResolvedKit["colors"]> = { fundo: "fundo", superficie: "superficie", texto: "texto", "texto-secundario": "textoSecundario", destaque: "destaque" };
    for (const [use, v] of Object.entries(cmykByUse)) if (roleOf[use]) (kit.cmyk ??= {})[roleOf[use]] = v;
    if (byUse.fundo) kit.colors.fundo = byUse.fundo;
    if (byUse.superficie) kit.colors.superficie = byUse.superficie;
    else if (byUse.fundo) kit.colors.superficie = byUse.fundo;
    if (byUse.texto) kit.colors.texto = byUse.texto;
    if (byUse["texto-secundario"]) kit.colors.textoSecundario = byUse["texto-secundario"];
    if (byUse.destaque) kit.colors.destaque = byUse.destaque;
    for (const role of ["titulo", "corpo", "rotulo"] as const) {
      const t = raw.tipos?.[role];
      const ps = t?.postscript || (t?.familia ? `${t.familia.replace(/\s+/g, "")}${t.estilo ? `-${t.estilo.replace(/\s+/g, "")}` : ""}` : "");
      if (ps) kit.fonts[role] = ps;
    }
    if (!raw.tipos?.rotulo && raw.tipos?.titulo) kit.fonts.rotulo = kit.fonts.titulo;
    kit.source = input.kitPath;
  }
  for (const [k, v] of Object.entries(input.colors ?? {})) {
    if (typeof v === "string" && HEX.test(v)) (kit.colors as Record<string, string>)[k] = norm(v);
  }
  for (const [k, v] of Object.entries(input.fonts ?? {})) if (typeof v === "string" && v) (kit.fonts as Record<string, string>)[k] = v;
  if (input.colors || input.fonts) kit.source = input.kitPath ? `${input.kitPath} + valores na chamada` : "valores na chamada";
  return kit;
}

/** '#RRGGBB' → [r, g, b] in 0–1 (After Effects). */
export function hexToAe(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255].map((v) => Math.round(v * 10000) / 10000) as [number, number, number];
}

/** '#RRGGBB' → [r, g, b] 0–255. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Naive device-independent RGB → CMYK (0–100). A starting point only: the brand's official CMYK wins. */
export function hexToCmyk(hex: string): [number, number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const k = 1 - Math.max(r, g, b);
  if (k >= 0.999) return [0, 0, 0, 100];
  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);
  return [c, m, y, k].map((v) => Math.round(v * 100)) as [number, number, number, number];
}

export interface PrintSwatch {
  name: string;
  values: number[];
  hex: string;
}

export interface PrintPalette {
  bg: PrintSwatch | null;
  text: PrintSwatch;
  text2: PrintSwatch;
  accent: PrintSwatch;
  /** Colour for accent-coloured type (kicker, price): the accent when it reads on the page, else the text colour. */
  accentText: PrintSwatch;
  onAccent: PrintSwatch;
  band: PrintSwatch;
  onBand: PrintSwatch;
  notes: string[];
}

/**
 * Colour roles for print/layout recipes. theme "marca": page in the kit's background colour; "papel": white paper,
 * text in the darkest kit colour. Text on the accent and on the band is picked by contrast. space "cmyk" uses the kit's
 * official CMYK when given, else a naive conversion (reported in notes).
 */
export function printPalette(kit: ResolvedKit, opts: { theme?: "marca" | "papel"; space?: "cmyk" | "rgb" } = {}): PrintPalette {
  const space = opts.space ?? "cmyk";
  const notes: string[] = [];
  const naive: string[] = [];
  const sw = (name: string, hex: string, role?: keyof ResolvedKit["colors"]): PrintSwatch => {
    if (space === "rgb") return { name, values: hexToRgb(hex), hex };
    const official = role ? kit.cmyk?.[role] : undefined;
    if (official && hex === kit.colors[role!]) return { name, values: official, hex };
    if (role) naive.push(name);
    return { name, values: hexToCmyk(hex), hex };
  };
  const c = kit.colors;
  const cr = (a: string, b: string) => contrast(hexToRgb(a), hexToRgb(b));
  // first brand colour (in order) that reads on `on` (≥ 4.5:1), else the highest-contrast option overall
  const best = (on: string, brand: string[]) =>
    brand.find((o) => cr(on, o) >= 4.5) ?? [...brand, "#FFFFFF", "#111111"].sort((a, b) => cr(on, b) - cr(on, a))[0];
  const theme = opts.theme ?? "marca";
  let bg: PrintSwatch | null;
  let text: PrintSwatch;
  let text2: PrintSwatch;
  if (theme === "papel") {
    bg = null;
    const dark = [c.fundo, c.superficie, c.texto, c.destaque].sort((a, b) => cr("#FFFFFF", b) - cr("#FFFFFF", a))[0];
    const darkRole = (Object.keys(c) as Array<keyof ResolvedKit["colors"]>).find((k) => c[k] === dark);
    text = cr("#FFFFFF", dark) >= 7 ? sw("Marca Texto", dark, darkRole) : sw("Marca Texto", "#1A1A1A");
    text2 = sw("Marca Texto 2", "#5A5F66");
  } else {
    bg = sw("Marca Fundo", c.fundo, "fundo");
    text = sw("Marca Texto", best(c.fundo, [c.texto]), "texto");
    text2 = cr(c.fundo, c.textoSecundario) >= 4.5 ? sw("Marca Texto 2", c.textoSecundario, "textoSecundario") : text;
    if (text2 === text) notes.push("texto secundário do kit com pouco contraste sobre o fundo: usei a cor do texto");
  }
  const accent = sw("Marca Destaque", c.destaque, "destaque");
  const pageHex = bg ? bg.hex : "#FFFFFF";
  const accentText = cr(pageHex, c.destaque) >= 3 ? accent : text;
  if (accentText === text) notes.push(`destaque com pouco contraste sobre a página (${cr(pageHex, c.destaque)}:1): chamadas e preços na cor do texto`);
  const onAccentHex = best(c.destaque, [c.texto, c.fundo]);
  const onAccent = sw("Marca Sobre Destaque", onAccentHex);
  const bandHex = theme === "papel" ? c.fundo : c.superficie;
  const band = sw("Marca Faixa", bandHex, theme === "papel" ? "fundo" : "superficie");
  const onBand = sw("Marca Sobre Faixa", best(bandHex, [c.texto, c.textoSecundario]));
  if (cr(c.destaque, onAccentHex) < 4.5) notes.push(`contraste baixo no botão (${cr(c.destaque, onAccentHex)}:1): considere outra cor de destaque`);
  if (naive.length) notes.push(`CMYK convertido do hex de forma simples para: ${[...new Set(naive)].join(", ")} — use os valores oficiais (campo cmyk do kit) para impressão`);
  return { bg, text, text2, accent, accentText, onAccent, band, onBand, notes };
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const lum = (x: [number, number, number]) => {
    const [r, g, bl] = x.map((v) => {
      const t = v / 255;
      return t <= 0.04045 ? t / 12.92 : Math.pow((t + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const la = lum(a);
  const lb = lum(b);
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
}
