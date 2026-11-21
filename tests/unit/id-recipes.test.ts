import { describe, expect, it } from "vitest";
import { formatPrice, paperSize } from "../../src/tools/indesign/recipes.js";
import { hexToCmyk, printPalette, resolveKit } from "../../src/core/brand-kit.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("InDesign recipe helpers", () => {
  it("formats prices as currency and leaves text alone", () => {
    expect(formatPrice(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(formatPrice("1.234,5").replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(formatPrice("89.9").replace(/\s/g, " ")).toBe("R$ 89,90");
    expect(formatPrice("Sob consulta")).toBe("Sob consulta");
    expect(formatPrice("")).toBe("");
  });

  it("resolves paper sizes and orientation", () => {
    expect(paperSize("A5", undefined)).toEqual([148, 210]);
    expect(paperSize("A4", "paisagem")).toEqual([297, 210]);
    expect(paperSize(undefined, undefined, 100, 50)).toEqual([100, 50]);
  });

  it("converts hex to CMYK naively", () => {
    expect(hexToCmyk("#000000")).toEqual([0, 0, 0, 100]);
    expect(hexToCmyk("#FFFFFF")).toEqual([0, 0, 0, 0]);
    expect(hexToCmyk("#FF0000")).toEqual([0, 100, 100, 0]);
  });

  it("builds a print palette, preferring the kit's official CMYK", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kit-"));
    const kp = path.join(dir, "kit.json");
    fs.writeFileSync(
      kp,
      JSON.stringify({
        cliente: "x",
        status: "aprovado",
        cores: [
          { nome: "Azul", hex: "#0B2545", uso: "fundo", cmyk: [100, 80, 30, 40] },
          { nome: "Laranja", hex: "#F28C28", uso: "destaque" }
        ],
        tipos: {}
      })
    );
    const pal = printPalette(resolveKit({ kitPath: kp }));
    expect(pal.bg?.values).toEqual([100, 80, 30, 40]);
    expect(pal.accent.values).toEqual(hexToCmyk("#F28C28"));
    expect(pal.notes.join(" ")).toMatch(/Marca Destaque/);
    const paper = printPalette(resolveKit({ kitPath: kp }), { theme: "papel", space: "rgb" });
    expect(paper.bg).toBeNull();
    expect(paper.text.hex).toBe("#0B2545");
    expect(paper.text.values).toEqual([11, 37, 69]);
  });
});
