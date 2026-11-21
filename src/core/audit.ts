/**
 * Audit rules shared by the *_audit_* tools. Hosts collect measurements; the verdicts live here so they
 * are testable and the same in every app. Severity: error (fix before delivery), warn (check), info.
 */
import { contrastRatio, guessFormat, resolveZones } from "./formats.js";

export interface Finding {
  severity: "error" | "warn" | "info";
  code: string;
  message: string;
  target?: string;
}

export function summarize(findings: Finding[]) {
  const count = (s: Finding["severity"]) => findings.filter((f) => f.severity === s).length;
  const errors = count("error");
  const warnings = count("warn");
  return {
    verdict: errors ? "corrigir antes de entregar" : warnings ? "conferir os avisos" : "ok",
    errors,
    warnings,
    infos: count("info")
  };
}

/* ---------- Photoshop ---------- */

export interface PsLayerData {
  name: string;
  path: string;
  kind: string;
  visible: boolean;
  bounds: [number, number, number, number] | null;
  defaultName: boolean;
  empty: boolean;
  text?: { contents: string; sizePx: number; color: [number, number, number] | null; font: string; background?: Array<[number, number, number]> };
}

export interface PsAuditData {
  document: string;
  width: number;
  height: number;
  mode: string;
  bits: string;
  profile: string;
  layers: PsLayerData[];
}

/** Phone screen width the piece is judged at (CSS px). */
const PHONE_WIDTH = 390;

export function auditPhotoshop(d: PsAuditData, opts: { format?: string; minContrast?: number } = {}): { format: string | null; findings: Finding[] } {
  const f: Finding[] = [];
  const formatKey = opts.format ?? guessFormat(d.width, d.height);
  const zones = formatKey ? resolveZones(formatKey, d.width, d.height) : null;
  if (opts.format && zones) {
    const want = zones.expected;
    const aspectErr = Math.abs(d.width / d.height - want.width / want.height) / (want.width / want.height);
    if (aspectErr > 0.01) f.push({ severity: "error", code: "WRONG_ASPECT", message: `${d.width}×${d.height} não é ${zones.label}.` });
  }
  if (zones && d.width < Math.round(zones.expected.width) && d.width < 1080) {
    f.push({ severity: "warn", code: "LOW_RESOLUTION", message: `Largura ${d.width} px: abaixo de 1080 px, a plataforma amplia e perde nitidez.` });
  }
  if (!/RGB/i.test(d.mode)) f.push({ severity: "error", code: "NOT_RGB", message: `Modo ${d.mode.replace("DocumentMode.", "")}: peças de tela devem estar em RGB.` });
  if (/16|32|SIXTEEN|THIRTYTWO/i.test(d.bits)) f.push({ severity: "info", code: "HIGH_BIT_DEPTH", message: `${d.bits.replace("BitsPerChannelType.", "")}: exporte em 8 bits (ps_export_web converte).` });
  if (d.profile && !/sRGB/i.test(d.profile)) f.push({ severity: "warn", code: "NOT_SRGB", message: `Perfil ${d.profile}: converta para sRGB na saída para tela.` });

  for (const L of d.layers) {
    if (!L.visible || !L.text || !L.bounds) continue;
    const [l, t, r, b] = L.bounds;
    if (zones) {
      const s = zones.safeRect;
      const out = { left: s.x - l, top: s.y - t, right: r - (s.x + s.width), bottom: b - (s.y + s.height) };
      const worst = Object.entries(out).filter(([, v]) => v > 2).sort((a, z) => z[1] - a[1]);
      if (worst.length) {
        f.push({
          severity: "error",
          code: "TEXT_OUTSIDE_SAFE_ZONE",
          target: L.path,
          message: `Texto "${L.text.contents.slice(0, 30)}" passa ${worst.map(([side, v]) => `${Math.round(v)} px (${side})`).join(", ")} da zona segura de ${zones.label}.`
        });
      }
      for (const a of zones.avoid) {
        if (l < a.x + a.width && r > a.x && t < a.y + a.height && b > a.y) {
          f.push({ severity: "warn", code: "TEXT_UNDER_UI", target: L.path, message: `Texto sob a área da ${a.why}.` });
        }
      }
    }
    const shown = (L.text.sizePx * PHONE_WIDTH) / d.width;
    const bold = /bold|black|heavy|extrabold|semibold|demi/i.test(L.text.font);
    const large = shown >= 24 || (bold && shown >= 18.7);
    if (shown < 11) {
      f.push({ severity: "warn", code: "TEXT_TOO_SMALL", target: L.path, message: `Texto "${L.text.contents.slice(0, 30)}" fica com ~${shown.toFixed(1)} px no celular (mínimo ~11–12).` });
    }
    const bg = L.text.background ?? [];
    if (L.text.color && bg.length) {
      const ratios = bg.map((c) => contrastRatio(L.text!.color!, c)).sort((a, z) => a - z);
      const min = opts.minContrast ?? (large ? 3 : 4.5);
      const worst = ratios[0];
      const median = ratios[Math.floor(ratios.length / 2)];
      if (median < min) {
        f.push({ severity: "error", code: "LOW_CONTRAST", target: L.path, message: `Contraste ${median}:1 (pior ponto ${worst}:1) do texto "${L.text.contents.slice(0, 30)}"; mínimo ${min}:1.` });
      } else if (worst < min) {
        f.push({ severity: "warn", code: "UNEVEN_CONTRAST", target: L.path, message: `Contraste cai para ${worst}:1 em parte do texto "${L.text.contents.slice(0, 30)}" (fundo irregular): faixa, caixa ou degradê de proteção.` });
      }
    }
  }
  const unnamed = d.layers.filter((L) => L.defaultName);
  if (unnamed.length) {
    f.push({ severity: "info", code: "DEFAULT_LAYER_NAMES", message: `${unnamed.length} camada(s) com nome padrão: ${unnamed.slice(0, 8).map((L) => L.path).join(", ")}${unnamed.length > 8 ? "…" : ""}.` });
  }
  const empty = d.layers.filter((L) => L.empty);
  if (empty.length) f.push({ severity: "info", code: "EMPTY_LAYERS", message: `${empty.length} camada(s) vazia(s): ${empty.slice(0, 8).map((L) => L.path).join(", ")}.` });
  const hidden = d.layers.filter((L) => !L.visible && L.kind !== "group");
  if (hidden.length) f.push({ severity: "info", code: "HIDDEN_LAYERS", message: `${hidden.length} camada(s) oculta(s) — confira se não são versões antigas.` });
  return { format: formatKey, findings: f };
}

/* ---------- InDesign ---------- */

export interface IdAuditData {
  document: string;
  intent: string;
  bleedMm: number;
  pages: number;
  stories: Array<{ frameId: number | null; page: string | null; excerpt: string; overset: boolean; paragraphs: number; unstyledParagraphs: number; minPointSize: number | null; empty: boolean }>;
  textNearEdge: Array<{ id: number; page: string; excerpt: string; distanceMm: number }>;
  graphics: Array<{ id: number; name: string; page: string | null; effectivePpi: number[] | null; space: string; status: string; type: string }>;
  colors: Array<{ name: string; model: string; space: string }>;
  fonts: Array<{ name: string; status: string }>;
}

export function auditInDesign(d: IdAuditData, opts: { minPpi?: number; minPointSize?: number } = {}): Finding[] {
  const f: Finding[] = [];
  const print = d.intent === "print";
  const where = (s: { page: string | null; excerpt: string }) => `${s.page ? `pág. ${s.page}` : "fora da página"} — "${s.excerpt.replace(/\r/g, " ").slice(0, 30)}"`;
  for (const s of d.stories) {
    if (s.overset) f.push({ severity: "error", code: "OVERSET_TEXT", target: where(s), message: "Texto excedente (sobra texto fora da moldura)." });
  }
  const unstyled = d.stories.filter((s) => !s.empty && s.paragraphs > 0 && s.unstyledParagraphs === s.paragraphs);
  if (unstyled.length) {
    f.push({ severity: "warn", code: "NO_PARAGRAPH_STYLE", message: `${unstyled.length} texto(s) só com [Parágrafo básico]/sem estilo — aplique estilos para manter a série consistente: ${unstyled.slice(0, 5).map(where).join("; ")}.` });
  }
  const minPt = opts.minPointSize ?? (print ? 6 : 9);
  for (const s of d.stories) {
    if (s.minPointSize !== null && s.minPointSize < minPt) f.push({ severity: "warn", code: "TINY_TEXT", target: where(s), message: `Corpo de ${s.minPointSize} pt (mínimo ${minPt} pt).` });
  }
  if (print) {
    for (const t of d.textNearEdge) {
      f.push({ severity: "warn", code: "TEXT_NEAR_TRIM", target: `pág. ${t.page} — "${t.excerpt.slice(0, 30)}"`, message: `Texto a ${t.distanceMm} mm do corte (mínimo 3 mm; pode ser cortado).` });
    }
    if (d.pages > 0 && d.bleedMm <= 0) f.push({ severity: "warn", code: "NO_BLEED", message: "Documento sem sangria: fundos e imagens que encostam na borda precisam de 3 mm." });
  }
  const minPpi = opts.minPpi ?? (print ? 250 : 72);
  for (const g of d.graphics) {
    const label = `${g.name || g.type}${g.page ? ` (pág. ${g.page})` : ""}`;
    if (/MISSING/i.test(g.status)) f.push({ severity: "error", code: "MISSING_LINK", target: label, message: "Vínculo ausente." });
    else if (/OUT_OF_DATE|MODIFIED/i.test(g.status)) f.push({ severity: "warn", code: "MODIFIED_LINK", target: label, message: "Vínculo modificado: atualize (id_links update)." });
    const ppi = g.effectivePpi ? Math.min(...g.effectivePpi) : null;
    if (ppi !== null && Number.isFinite(ppi) && ppi > 0 && !/PDF|EPS|Illustrator|ImportedPage/i.test(g.type)) {
      if (ppi < minPpi * 0.6) f.push({ severity: "error", code: "LOW_PPI", target: label, message: `${Math.round(ppi)} ppi efetivos (mínimo ${minPpi}).` });
      else if (ppi < minPpi) f.push({ severity: "warn", code: "LOW_PPI", target: label, message: `${Math.round(ppi)} ppi efetivos (ideal ≥ ${minPpi}).` });
    }
    if (print && /RGB/i.test(g.space)) f.push({ severity: "info", code: "RGB_IMAGE", target: label, message: "Imagem RGB: o PDF/X-4 converte na saída; confira cores críticas (marca, pele) na prova." });
  }
  if (print) {
    const rgb = d.colors.filter((c) => /RGB/i.test(c.space) && /PROCESS/i.test(c.model));
    if (rgb.length) f.push({ severity: "warn", code: "RGB_SWATCHES", message: `Amostras de cor em RGB num impresso: ${rgb.map((c) => c.name).join(", ")} — converta para CMYK (ou Pantone) com os valores da marca.` });
  }
  for (const font of d.fonts) {
    if (!/^(FontStatus\.)?INSTALLED$/i.test(font.status)) f.push({ severity: "error", code: "FONT_PROBLEM", target: font.name, message: `Fonte com status ${font.status.replace("FontStatus.", "")}.` });
  }
  const empty = d.stories.filter((s) => s.empty).length;
  if (empty) f.push({ severity: "info", code: "EMPTY_TEXT_FRAMES", message: `${empty} moldura(s) de texto vazia(s).` });
  return f;
}

/* ---------- Premiere ---------- */

export interface PrClip { name: string; start: number; end: number; disabled: boolean; offline: boolean; speed: number; mgt: boolean }
export interface PrTrack { kind: "video" | "audio"; index: number; name: string; locked: boolean; muted: boolean; clips: PrClip[] }
export interface PrAuditData { sequence: string; width: number; height: number; fps: number; durationSeconds: number; video: PrTrack[]; audio: PrTrack[] }
export interface LoudnessInput { gatedDb: number; peakDb: number; duration: number }

const tc = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;

export function auditPremiere(
  d: PrAuditData,
  opts: { format?: string; loudness?: LoudnessInput; targetLufs?: number; gapTracks?: Array<{ kind: "video" | "audio"; index: number }> } = {}
): Finding[] {
  const f: Finding[] = [];
  const frame = d.fps > 0 ? 1 / d.fps : 1 / 30;
  if (opts.format) {
    const z = resolveZones(opts.format, d.width, d.height);
    const err = Math.abs(d.width / d.height - z.expected.width / z.expected.height) / (z.expected.width / z.expected.height);
    if (err > 0.01) f.push({ severity: "error", code: "WRONG_FRAME_SIZE", message: `Sequência ${d.width}×${d.height} não é ${z.label}.` });
  }
  // gaps: on the main picture track (V1) and main voice track (A1) unless told otherwise
  const gapTracks = opts.gapTracks ?? [{ kind: "video", index: 0 }, { kind: "audio", index: 0 }];
  for (const g of gapTracks) {
    const tr = (g.kind === "video" ? d.video : d.audio)[g.index];
    if (!tr || !tr.clips.length) continue;
    const clips = [...tr.clips].sort((a, b) => a.start - b.start);
    const label = `${g.kind === "video" ? "V" : "A"}${g.index + 1}`;
    if (clips[0].start > frame * 1.5) f.push({ severity: "warn", code: "GAP_AT_START", target: label, message: `Começa em ${tc(clips[0].start)}: preto/silêncio no início.` });
    for (let i = 1; i < clips.length; i++) {
      const gap = clips[i].start - clips[i - 1].end;
      if (gap > frame * 1.5) f.push({ severity: "warn", code: "GAP", target: label, message: `Buraco de ${gap.toFixed(2)} s em ${tc(clips[i - 1].end)}.` });
    }
    const last = Math.max(...clips.map((c) => c.end));
    if (g.kind === "video" && d.durationSeconds - last > frame * 1.5) {
      f.push({ severity: "warn", code: "GAP_AT_END", target: label, message: `Imagem termina em ${tc(last)}, a sequência vai até ${tc(d.durationSeconds)}.` });
    }
  }
  for (const tr of [...d.video, ...d.audio]) {
    const label = `${tr.kind === "video" ? "V" : "A"}${tr.index + 1}`;
    for (const c of tr.clips) {
      if (c.offline) f.push({ severity: "error", code: "OFFLINE_MEDIA", target: `${label} ${tc(c.start)}`, message: `Mídia offline: ${c.name}.` });
      if (c.disabled) f.push({ severity: "info", code: "DISABLED_CLIP", target: `${label} ${tc(c.start)}`, message: `Clipe desativado: ${c.name} (não sai no render).` });
      if (Math.abs(c.speed - 1) > 0.001 && c.speed !== 0) f.push({ severity: "info", code: "SPEED_CHANGE", target: `${label} ${tc(c.start)}`, message: `${c.name} a ${Math.round(c.speed * 100)} %.` });
    }
    if (tr.muted && tr.clips.length) f.push({ severity: "warn", code: "MUTED_TRACK", target: label, message: "Trilha com clipes está muda: não sai no render." });
  }
  if (opts.loudness) {
    const target = opts.targetLufs ?? -14;
    const L = opts.loudness;
    if (Math.abs(L.gatedDb - target) > 1.5) f.push({ severity: "warn", code: "LOUDNESS", message: `Loudness ~${L.gatedDb} dB (alvo ${target} ±1,5).` });
    if (L.peakDb > -1) f.push({ severity: "warn", code: "PEAK", message: `Pico ${L.peakDb} dBFS (máximo −1).` });
    if (Math.abs(L.duration - d.durationSeconds) > 0.5) f.push({ severity: "info", code: "RENDER_DURATION", message: `Render com ${L.duration.toFixed(2)} s; sequência com ${d.durationSeconds.toFixed(2)} s.` });
  }
  return f;
}

/* ---------- After Effects ---------- */

export interface AeAuditLayer {
  index: number;
  name: string;
  enabled: boolean;
  inPoint: number;
  outPoint: number;
  isText: boolean;
  words: number;
  text?: string;
  linear: Array<{ property: string; matchName: string; segments: number; of: number }>;
  expressionErrors: Array<{ property: string; error: string }>;
  missingFootage: boolean;
  effects: string[];
}
export interface AeAuditData { compName: string; width: number; height: number; duration: number; frameRate: number; bitsPerChannel: number; layers: AeAuditLayer[] }

/** Properties where linear motion usually looks mechanical (opacity and continuous rotation are fine linear). */
const MOTION_PROPS = /ADBE Position|ADBE Scale|ADBE Anchor Point|ADBE Orientation|ADBE Mask Shape|ADBE Vector Shape|ADBE Text Percent|ADBE Text Offset/;

export function auditAfterEffects(d: AeAuditData, opts: { secondsPerWord?: number; holdSeconds?: number } = {}): Finding[] {
  const f: Finding[] = [];
  const perWord = opts.secondsPerWord ?? 0.3;
  const hold = opts.holdSeconds ?? 0.5;
  for (const L of d.layers) {
    const label = `${L.index}. ${L.name}`;
    for (const e of L.expressionErrors) f.push({ severity: "error", code: "EXPRESSION_ERROR", target: `${label} › ${e.property}`, message: e.error });
    if (L.missingFootage) f.push({ severity: "error", code: "MISSING_FOOTAGE", target: label, message: "Mídia ausente." });
    if (!L.enabled) continue;
    for (const lin of L.linear) {
      if (MOTION_PROPS.test(lin.matchName)) {
        f.push({ severity: "warn", code: "LINEAR_MOTION", target: `${label} › ${lin.property}`, message: `${lin.segments} de ${lin.of} trecho(s) lineares: use ae_set_easing (smooth/strong).` });
      }
    }
    if (L.isText && L.words > 0) {
      const needed = L.words * perWord + hold;
      const onScreen = Math.max(0, Math.min(L.outPoint, d.duration) - Math.max(0, L.inPoint));
      if (onScreen < needed) {
        f.push({ severity: "warn", code: "READING_TIME", target: label, message: `"${(L.text ?? "").slice(0, 30)}" fica ${onScreen.toFixed(1)} s na tela; ${L.words} palavra(s) pedem ~${needed.toFixed(1)} s.` });
      }
    }
  }
  const gradients = d.layers.filter((L) => L.effects.some((m) => /ADBE Ramp|ADBE 4ColorGradient|Gradient/i.test(m)));
  if (d.bitsPerChannel === 8 && gradients.length) {
    f.push({ severity: "info", code: "BANDING_RISK", message: `Degradê em projeto de 8 bpc (${gradients.map((L) => L.name).join(", ")}): use 16 bpc para evitar faixas.` });
  }
  return f;
}
