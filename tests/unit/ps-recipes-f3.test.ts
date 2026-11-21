import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { productBackground, productCanvas, tint } from "../../src/tools/photoshop/recipes.js";

describe("Photoshop phase 3 recipes", () => {
  it("tints towards white or black", () => {
    expect(tint("#000000", 1)).toBe("#FFFFFF");
    expect(tint("#FFFFFF", -1)).toBe("#000000");
    expect(tint("#808080", 0)).toBe("#808080");
    expect(tint("#204060", 0.5)).toBe("#90A0B0");
  });

  it("resolves the product canvas from a format or a custom size", () => {
    const sq = productCanvas();
    expect([sq.width, sq.height, sq.format]).toEqual([1080, 1080, "square1x1"]);
    expect(sq.safe.left).toBeGreaterThan(0);
    const st = productCanvas("story9x16");
    expect(st.safe.bottom).toBeGreaterThan(st.safe.top);
    const c = productCanvas(undefined, 2000, 1000);
    expect(c.safe).toEqual({ top: 60, right: 60, bottom: 60, left: 60 });
    expect(() => productCanvas("nope")).toThrow(/Unknown format/);
  });

  it("builds a lighter gradient centre, stronger on light backgrounds", () => {
    const light = productBackground({ background: "#E0E0E0" });
    expect(light.style).toBe("gradient");
    expect(light.center > light.edge).toBe(true);
    const dark = productBackground({ background: "101418", style: "solid" });
    expect(dark.edge).toBe("#101418");
    expect(dark.style).toBe("solid");
  });

  it("ships the jsx handlers in the CEP bridge copy", () => {
    const src = fs.readFileSync("src/extendscript/ps-handlers.jsx", "utf8");
    for (const a of ["ps.recipe.removeBackground", "ps.recipe.productShot", "ps.recipe.popOut"]) expect(src).toContain(`"${a}"`);
  });
});

describe("Phase 3 closing: recipes, templates and handlers", async () => {
  const { kitSlug, TEMPLATE_APPS } = await import("../../src/tools/shared/templates.js");
  const { resolveKit } = await import("../../src/core/brand-kit.js");
  const os = await import("node:os");
  const path = await import("node:path");

  it("names the template folder after the client folder of the kit", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tpl-"));
    const kp = path.join(dir, "Clínica Sorriso", "00_briefing", "kit-de-marca.json");
    fs.mkdirSync(path.dirname(kp), { recursive: true });
    fs.writeFileSync(kp, JSON.stringify({ cores: [], tipos: {} }));
    expect(kitSlug(resolveKit({ kitPath: kp }))).toBe("clinica-sorriso");
    expect(kitSlug(resolveKit())).toBe("neutro");
    expect(kitSlug(resolveKit(), "x")).toBe("x");
    expect(TEMPLATE_APPS).toEqual(["photoshop", "indesign", "illustrator", "after-effects"]);
  });

  it("has every new action in src and in the CEP bridge copy", () => {
    const want: Record<string, string[]> = {
      ps: ["ps.recipe.removeBackground", "ps.recipe.productShot", "ps.template.socialPost"],
      ae: ["ae.recipe.transition"],
      id: ["id.recipe.manual"],
      ai: ["ai.template.brand"]
    };
    for (const [app, actions] of Object.entries(want)) {
      const src = fs.readFileSync(`src/extendscript/${app}-handlers.jsx`, "utf8");
      const cep = fs.readFileSync(`bridges/cep-universal-bridge/jsx/${app}-handlers.jsx`, "utf8");
      for (const a of actions) {
        expect(src, `${app}: ${a}`).toContain(`"${a}"`);
        expect(cep, `${app} (CEP): ${a}`).toContain(`"${a}"`);
      }
    }
  });
});
