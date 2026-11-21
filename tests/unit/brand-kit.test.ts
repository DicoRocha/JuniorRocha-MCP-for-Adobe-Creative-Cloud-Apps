import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { hexToAe, resolveKit } from "../../src/core/brand-kit.js";

describe("brand kit", () => {
  it("maps colour uses and type roles from kit-de-marca.json, with inline overrides", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kit-")), "kit-de-marca.json");
    fs.writeFileSync(
      f,
      JSON.stringify({
        cores: [
          { nome: "Nacht", hex: "#0F1B2D", uso: "fundo" },
          { nome: "Sand", hex: "e8d9c0", uso: "destaque" },
          { nome: "Weiss", hex: "#FFFFFF", uso: "texto" }
        ],
        tipos: { titulo: { familia: "Cormorant Garamond", estilo: "Bold" }, corpo: { familia: "Inter", postscript: "Inter-Regular" } }
      })
    );
    const k = resolveKit({ kitPath: f, colors: { texto: "#F5F5F5" } });
    expect(k.colors.fundo).toBe("#0F1B2D");
    expect(k.colors.superficie).toBe("#0F1B2D");
    expect(k.colors.destaque).toBe("#E8D9C0");
    expect(k.colors.texto).toBe("#F5F5F5");
    expect(k.fonts).toEqual({ titulo: "CormorantGaramond-Bold", corpo: "Inter-Regular", rotulo: "CormorantGaramond-Bold" });
    expect(k.source).toMatch(/valores na chamada/);
    expect(resolveKit().source).toMatch(/neutro/);
    expect(hexToAe("#FF8000")).toEqual([1, 0.502, 0]);
  });
});
