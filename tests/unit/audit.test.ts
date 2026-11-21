/**
 * Audit rules (phase 3). The Photoshop fixture was measured live in Photoshop 2027 on a story with three planted
 * problems: light text on a light background, a title inside the top bar, a layer with a default name.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { auditPhotoshop, summarize } from "../../src/core/audit.js";
import { contrastRatio, guessFormat, resolveZones } from "../../src/core/formats.js";

const fixture = (n: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../fixtures", n), "utf8"));

describe("formats", () => {
  it("guesses formats by aspect and scales the zones with the canvas", () => {
    expect(guessFormat(1080, 1920)).toBe("story9x16");
    expect(guessFormat(2160, 2700)).toBe("feed4x5");
    expect(guessFormat(1000, 300)).toBeNull();
    const z = resolveZones("story9x16", 2160, 3840);
    expect(z.safeRect).toEqual({ x: 120, y: 500, width: 2160 - 120 - 240, height: 3840 - 500 - 800 });
    expect(resolveZones("youtubeThumb", 1920, 1080).avoid[0]).toMatchObject({ x: 1620, y: 945 });
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBe(21);
    expect(contrastRatio([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 1);
  });
});

describe("auditPhotoshop", () => {
  it("finds exactly the planted problems of the live fixture", () => {
    const r = auditPhotoshop(fixture("ps-audit-story.json"));
    expect(r.format).toBe("story9x16");
    expect(r.findings.map((f) => f.code).sort()).toEqual(["DEFAULT_LAYER_NAMES", "LOW_CONTRAST", "TEXT_OUTSIDE_SAFE_ZONE"]);
    expect(r.findings.find((f) => f.code === "TEXT_OUTSIDE_SAFE_ZONE")!.message).toMatch(/158 px \(top\)/);
    expect(summarize(r.findings).verdict).toBe("corrigir antes de entregar");
  });

  it("flags CMYK, uneven contrast, tiny text and the thumbnail duration badge", () => {
    const d = {
      document: "thumb",
      width: 1280,
      height: 720,
      mode: "DocumentMode.CMYK",
      bits: "BitsPerChannelType.SIXTEEN",
      profile: "Adobe RGB (1998)",
      layers: [
        {
          name: "Titulo",
          path: "Titulo",
          kind: "LayerKind.TEXT",
          visible: true,
          bounds: [1100, 640, 1240, 690],
          defaultName: false,
          empty: false,
          text: { contents: "NOVO", sizePx: 30, color: [255, 255, 255], font: "Montserrat-Black", background: [[0, 0, 0], [10, 10, 10], [240, 240, 240]] }
        }
      ]
    };
    const codes = auditPhotoshop(d as never, { format: "youtubeThumb" }).findings.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["NOT_RGB", "HIGH_BIT_DEPTH", "NOT_SRGB", "TEXT_UNDER_UI", "UNEVEN_CONTRAST", "TEXT_TOO_SMALL"]));
  });
});

import { auditInDesign } from "../../src/core/audit.js";

describe("auditInDesign", () => {
  it("finds the planted print problems of the live fixture", () => {
    const f = auditInDesign(fixture("id-audit-print.json"));
    expect(f.filter((x) => x.severity === "error").map((x) => x.code).sort()).toEqual(["LOW_PPI", "OVERSET_TEXT"]);
    expect(f.map((x) => x.code)).toEqual(expect.arrayContaining(["NO_PARAGRAPH_STYLE", "TINY_TEXT", "TEXT_NEAR_TRIM", "NO_BLEED", "RGB_SWATCHES", "RGB_IMAGE"]));
    expect(f.find((x) => x.code === "TINY_TEXT")!.message).toMatch(/5 pt/);
  });

  it("is lighter for web documents and reports missing links and fonts", () => {
    const d = fixture("id-audit-print.json");
    d.intent = "web";
    d.graphics[0].status = "LinkStatus.LINK_MISSING";
    d.fonts.push({ name: "Gotham\tBold", status: "FontStatus.NOT_AVAILABLE" });
    const codes = auditInDesign(d).map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(["MISSING_LINK", "FONT_PROBLEM", "TINY_TEXT"]));
    expect(codes).not.toContain("NO_BLEED");
    expect(codes).not.toContain("LOW_PPI");
    expect(codes).not.toContain("RGB_SWATCHES");
  });
});

import { auditPremiere } from "../../src/core/audit.js";

describe("auditPremiere", () => {
  const base = () => ({
    sequence: "Reel",
    width: 1080,
    height: 1920,
    fps: 30,
    durationSeconds: 20,
    video: [
      {
        kind: "video" as const,
        index: 0,
        name: "V1",
        locked: false,
        muted: false,
        clips: [
          { name: "a.mp4", start: 0, end: 5, disabled: false, offline: false, speed: 1, mgt: false },
          { name: "b.mp4", start: 5.5, end: 12, disabled: false, offline: true, speed: 1, mgt: false },
          { name: "c.mp4", start: 12, end: 18, disabled: true, offline: false, speed: 1.5, mgt: false }
        ]
      }
    ],
    audio: [{ kind: "audio" as const, index: 0, name: "A1", locked: false, muted: true, clips: [{ name: "a.mp4", start: 0.5, end: 20, disabled: false, offline: false, speed: 1, mgt: false }] }]
  });

  it("finds gaps, offline media, disabled clips, speed changes and muted tracks", () => {
    const f = auditPremiere(base());
    const codes = f.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(["GAP", "GAP_AT_END", "GAP_AT_START", "OFFLINE_MEDIA", "DISABLED_CLIP", "SPEED_CHANGE", "MUTED_TRACK"]));
    expect(f.find((x) => x.code === "GAP")!.message).toMatch(/0\.50 s em 0:05\.00/);
  });

  it("checks frame size and loudness of the render", () => {
    const f = auditPremiere(base(), { format: "landscape16x9", loudness: { gatedDb: -20, peakDb: -0.2, duration: 19 } });
    expect(f.map((x) => x.code)).toEqual(expect.arrayContaining(["WRONG_FRAME_SIZE", "LOUDNESS", "PEAK", "RENDER_DURATION"]));
    expect(auditPremiere(base(), { format: "story9x16", loudness: { gatedDb: -14.3, peakDb: -1.5, duration: 20 } }).map((x) => x.code)).not.toContain("LOUDNESS");
  });
});

import { auditAfterEffects } from "../../src/core/audit.js";

describe("auditAfterEffects", () => {
  it("flags expression errors, linear motion, short text and banding risk, but not linear opacity", () => {
    const layer = (o: Record<string, unknown>) => ({ index: 1, name: "L", enabled: true, inPoint: 0, outPoint: 10, isText: false, words: 0, linear: [], expressionErrors: [], missingFootage: false, effects: [], ...o });
    const f = auditAfterEffects({
      compName: "Main",
      width: 1080,
      height: 1920,
      duration: 10,
      frameRate: 30,
      bitsPerChannel: 8,
      layers: [
        layer({ name: "Titel", isText: true, words: 8, text: "Oito palavras de texto para ler com calma", outPoint: 2 }),
        layer({ name: "Logo", linear: [{ property: "Transform › Position", matchName: "ADBE Position", segments: 2, of: 2 }, { property: "Transform › Opacity", matchName: "ADBE Opacity", segments: 1, of: 1 }] }),
        layer({ name: "Fundo", effects: ["ADBE Ramp"], expressionErrors: [{ property: "Transform › Rotation", error: "ReferenceError: x is not defined" }] })
      ]
    } as never);
    const codes = f.map((x) => x.code);
    expect(codes.sort()).toEqual(["BANDING_RISK", "EXPRESSION_ERROR", "LINEAR_MOTION", "READING_TIME"]);
    expect(f.find((x) => x.code === "READING_TIME")!.message).toMatch(/2\.0 s/);
  });
});
