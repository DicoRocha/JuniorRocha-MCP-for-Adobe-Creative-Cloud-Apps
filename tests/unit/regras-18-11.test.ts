import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { balanceLines } from "../../src/media/balance";
import { groupWords } from "../../src/media/word-blocks";
import { tokensToWords } from "../../src/media/transcribe";

describe("text_balance_lines (regra de 18/11/2026)", () => {
  it("never leaves a single word alone on the last line", () => {
    const r = balanceLines("Abra a arte no Photoshop Beta.", { maxChars: 22 });
    expect(r.orphan).toBe(false);
    expect(r.lines).toEqual(["Abra a arte", "no Photoshop Beta."]);
  });

  it("balances a three-line title", () => {
    const r = balanceLines("Recebeu uma arte do ChatGPT cheia de texto?", { lines: 3 });
    expect(r.lines.length).toBe(3);
    expect(r.orphan).toBe(false);
    expect(r.evenness).toBeGreaterThan(0.6);
  });

  it("does not end a line with a connector when there is an alternative", () => {
    const r = balanceLines("Para mudar uma palavra, era preciso redigitar texto por texto.", { lines: 2 });
    for (const l of r.lines.slice(0, -1)) expect(/\b(de|o|a|em|por|para|que|com)$/i.test(l)).toBe(false);
  });

  it("keeps a short text on one line and survives a word longer than maxChars", () => {
    expect(balanceLines("Resultado", { maxChars: 30 }).lines).toEqual(["Resultado"]);
    expect(balanceLines("Extraordinariamente bom", { maxChars: 6 }).lines.length).toBe(2);
  });
});

describe("Photoshop recolor / blend-if handlers", () => {
  const src = fs.readFileSync("src/extendscript/ps-handlers.jsx", "utf8");
  it("recolor uses Hue blend mode and three separate adjustments, never Color", () => {
    const a = src.indexOf('action === "ps.recolor.object"');
    const b = src.indexOf('action === "ps.layer.blendIf"');
    const body = src.slice(a, b);
    expect(a).toBeGreaterThan(0);
    expect(body).toContain("BlendMode.HUE");
    expect(body).not.toContain("COLORBLEND");
    expect(body).toContain('cRc("Crvs")');
    expect(body).toContain('cRc("HStr")');
  });
  it("blend-if sets the underlying-layer split", () => {
    const body = src.slice(src.indexOf('action === "ps.layer.blendIf"'), src.indexOf('action === "ps.shape.create"'));
    expect(body).toContain('cBi("DstB")');
    expect(body).toContain('cBi("Dstl")');
  });
});

describe("word-by-word captions (18/11/2026)", () => {
  it("joins tokens into words with real times; punctuation stays with the word", () => {
    const w = tokensToWords([" Al", "les", " hat", " ein", " En", "de", ",", " nur"], [0, 0.24, 0.4, 0.64, 0.8, 0.96, 1.12, 1.28], 10, 12);
    expect(w.map((x) => x.word)).toEqual(["Alles", "hat", "ein", "Ende,", "nur"]);
    expect(w[0].start).toBe(10);
    expect(w[1].start).toBe(10.4);
    expect(w[0].end).toBe(10.4);
  });

  it("groups words in short blocks, closing at pauses, sentence ends and width", () => {
    const words = [
      { word: "Quem", start: 0, end: 0.12 }, { word: "nunca", start: 0.12, end: 0.44 }, { word: "recebeu", start: 0.44, end: 1.0 },
      { word: "uma", start: 1.68, end: 1.9 }, { word: "arte.", start: 1.9, end: 2.1 }, { word: "Imagina", start: 2.15, end: 2.6 }
    ];
    const b = groupWords(words, { upperCase: true, maxWords: 3, maxChars: 18 });
    expect(b.map((x) => x.text)).toEqual(["QUEM NUNCA RECEBEU", "UMA ARTE.", "IMAGINA"]);
    expect(b[0].end).toBeLessThanOrEqual(b[1].start);
    expect(b[1].end).toBe(b[2].start);
    for (const blk of b) expect(blk.words.length).toBeLessThanOrEqual(3);
  });

  it("the After Effects handler highlights by word with an expression selector and centres on the cap height", () => {
    const src = fs.readFileSync("src/extendscript/ae-handlers.jsx", "utf8");
    const body = src.slice(src.indexOf('action === "ae.captions.words"'), src.indexOf('action === "ae.render.queue"'));
    expect(body).toContain("ADBE Text Expressible Selector");
    expect(body).toContain("sourceRectAtTime");
    expect(body).toContain("capW / 2");
    expect(body).not.toContain("beginUndoGroup");
  });
});

describe("Illustrator Export for Screens (18/11/2026)", () => {
  it("exports every artboard in one call through exportForScreens and copies the files out of the stage folder", () => {
    const src = fs.readFileSync("src/extendscript/ai-handlers.jsx", "utf8");
    const body = src.slice(src.indexOf('action === "ai.export.screens"'), src.indexOf('action === "ai.export.file"'));
    expect(body).toContain("exportForScreens(");
    expect(body).toContain("ExportForScreensType.SE_PNG24");
    expect(body).toContain('"1-" + docSc.artboards.length');
    expect(body).toContain("__mcpCopyFile");
  });
});

describe("camera transitions (18/11/2026)", () => {
  const src = fs.readFileSync("src/extendscript/ae-handlers.jsx", "utf8");
  const body = src.slice(src.indexOf('action === "ae.transition.camera"'), src.indexOf('action === "ae.render.queue"'));
  it("is non-destructive: adjustment layer, intensity slider, validated properties, cleanup on failure", () => {
    expect(body).toContain("adjustmentLayer = true");
    expect(body).toContain('sl.name = "Intensidade"');
    expect(body).toContain("needT(");
    expect(body).toContain("lay.remove()");
    expect(body).toContain("new KeyframeEase(0, 90)");
  });
  it("covers whip, zoom, spin, shake and flash", () => {
    for (const st of ["whip", "zoom", "spin", "shake", "flash"]) expect(body).toContain('styleT === "' + st + '"');
    expect(body).toContain("wiggle(");
  });
});
