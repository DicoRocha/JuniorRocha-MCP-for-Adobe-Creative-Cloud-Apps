import { describe, expect, it } from "vitest";
import * as fs from "node:fs";

const ps = fs.readFileSync("src/extendscript/ps-handlers.jsx", "utf8");

describe("montagem a partir de referência (25/11/2026)", () => {
  it("place into a group/artboard and cut out", () => {
    expect(ps).toMatch(/params\.into[\s\S]{0,400}docPl\.activeLayer = intoPl\.layers\.length/);
    expect(ps).toMatch(/if \(params\.cutout\)[\s\S]{0,200}__psCutout\(docPl, plLayer/);
  });
  it("duplicates a whole artboard into another format, names without ' copy'", () => {
    expect(ps).toContain('if (opA === "duplicate")');
    expect(ps).toContain("editArtboardEvent");
    expect(ps).toMatch(/\(copy\|c\\u00f3pia\|copia\)/);
  });
  it("artboard background is a solid fill layer and the empty Layer 1 goes", () => {
    expect(ps).toMatch(/__psSolidFillLayer\(docA, sp\.backgroundColor, "Fundo"\)/);
    expect(ps).toMatch(/\(Layer\|Camada\) \\d\+\$/);
  });
  it("motion trail, price phrase and centring a set measure without effects", () => {
    expect(ps).toContain('action === "ps.recipe.motionTrail"');
    expect(ps).toContain('action === "ps.text.arrangePrice"');
    expect(ps).toMatch(/params\.layerNames && params\.layerNames\.length[\s\S]{0,900}boundsNoEffects/);
  });
  it("Save for Web hyphens are renamed back to the asked name", () => {
    expect(ps).toMatch(/replace\(\/ \/g, "-"\)[\s\S]{0,80}hyph\.rename\(wanted\)/);
  });
  it("skills point to the new recipes", () => {
    const d = fs.readFileSync("skills/fundamentos/craft-desconstrucao-referencia/SKILL.md", "utf8");
    for (const t of ["ps_recipe_motion_trail", "ps_recipe_price_tag", "media_download_url", "cutout: true"]) expect(d).toContain(t);
    expect(fs.readFileSync("skills/prompts/prompt-imagem/SKILL.md", "utf8")).toMatch(/cor dominante do cenário/);
  });
});

describe("aprendizados do robô (25/11/2026)", () => {
  it("path shapes combine components with the shape modes and support open lines", () => {
    expect(ps).toContain('action === "ps.shape.path"');
    expect(ps).toMatch(/ShapeOperation\.SHAPESUBTRACT/);
    expect(ps).toMatch(/strokeStyleVersion/);
    expect(ps).toMatch(/fillEnabled"\), fillOn/);
    // Photoshop: leftDirection is the outgoing handle (rounded corners came out chamfered the other way round)
    expect(ps).toMatch(/p\.leftDirection = r \|\| a;\s*p\.rightDirection = l \|\| a;/);
    expect(ps).toMatch(/p\.leftDirection = rr;\s*p\.rightDirection = l;/);
  });
  it("callout line with a double dot, grouped with its tag", () => {
    expect(ps).toContain('action === "ps.recipe.callout"');
    expect(ps).toMatch(/"Ponto " \+ nmCo \+ " anel"/);
    expect(ps).toMatch(/__psGroupLayers\(docCo, all/);
  });
  it("background as a rectangle with a gradient overlay and a sharp sun", () => {
    expect(ps).toContain('action === "ps.recipe.gradientBackground"');
    expect(ps).toMatch(/__psGradientOverlayFx\(stopsBg/);
    expect(ps).toMatch(/blurS = typeof params\.sun\.blur === "number" \? params\.sun\.blur : 1/);
  });
  it("layer lookup can be scoped to an artboard; clearing a style keeps mode and fill", () => {
    expect(ps).toMatch(/if \(params\.artboard\) \{\s*try \{\s*scope = doc\.layerSets\.getByName\(params\.artboard\)/);
    expect(ps).toMatch(/disableLayerStyle[\s\S]{0,200}lyrC\.blendMode = keepMode/);
  });
  it("mask from the background by magic wand (subject + ground)", () => {
    expect(ps).toContain('opS === "maskFromBackground"');
    const uxp = fs.readFileSync("bridges/uxp-photoshop/main.js", "utf8");
    expect(uxp).toMatch(/maskFromBackground runs in ExtendScript/);
    expect(uxp).toMatch(/ps\.effects\.apply with artboard\/clear runs in ExtendScript/);
  });
  it("handler copies in the bridges are identical", () => {
    expect(fs.readFileSync("bridges/cep-universal-bridge/jsx/ps-handlers.jsx", "utf8")).toBe(ps);
    expect(fs.readFileSync("bridges/uxp-photoshop/jsx/ps-handlers.jsx", "utf8")).toBe(ps);
  });
});

describe("janela com todos os cantos arredondados (25/11/2026)", () => {
  it("polygon type rounds every vertex (fillet), convex and concave", () => {
    expect(ps).toContain("function __psRoundPolygon(points, defR)");
    expect(ps).toMatch(/if \(t === "polygon"\)[\s\S]{0,600}pp\.leftDirection = rp\[q\]\.o/);
  });
  it("skill: no blur under a cutout copy of the subject", () => {
    const s = fs.readFileSync("skills/foto/foto-recorte-e-composicao/SKILL.md", "utf8");
    expect(s).toMatch(/não desfoque o cenário/);
  });
});

describe("vinheta e fundo desfocado sem halo (ensinados 25/11/2026)", () => {
  it("vignette: inverse selection, adjustment layer, feather in the mask properties", () => {
    expect(ps).toContain('action === "ps.recipe.vignette"');
    expect(ps).toMatch(/docV\.selection\.invert\(\)/);
    expect(ps).toMatch(/userMaskFeather/);
  });
  it("clean background blur: expand, content-aware fill on a copy, blur, subject on top", () => {
    expect(ps).toContain('action === "ps.recipe.backgroundBlurClean"');
    expect(ps).toMatch(/contentAware/);
    expect(ps).toMatch(/scene\.visible = false/);
  });
});

describe("Remover (IA) só com consentimento (25/11/2026)", () => {
  it("method remove refuses without allowGenerativeCredits and works in two steps", () => {
    expect(ps).toMatch(/methodB === "remove"[\s\S]{0,400}CONSENT_REQUIRED/);
    expect(ps).toMatch(/step: "prepare", hiddenLayerIds/);
    expect(ps).toMatch(/cB\("Mrg2"\)/);
  });
});

describe("Vinheta escurece só o fundo (25/11/2026)", () => {
  it("puts a cutout copy of the subject above the vignette by default", () => {
    expect(ps).toMatch(/protectSubject !== false[\s\S]{0,600}duplicate\(LV, ElementPlacement\.PLACEBEFORE\)/);
    expect(ps).toMatch(/Assunto sobre a vinheta/);
  });
});
