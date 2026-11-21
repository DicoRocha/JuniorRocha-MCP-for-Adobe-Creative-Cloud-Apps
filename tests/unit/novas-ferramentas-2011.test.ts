import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildLrColorSettings } from "../../src/tools/lightroom/index.js";
import { ADJUSTMENT_TYPES } from "../../src/tools/photoshop/descriptors.js";

const root = path.resolve(__dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf-8");

describe("Lightroom colour panels by name", () => {
  it("maps HSL, Color Grading and Calibration to the develop keys validated live", () => {
    const s = buildLrColorSettings({
      hsl: { orange: { saturation: -10, luminance: 8 }, blue: { hue: -5 } },
      colorGrading: { shadows: { hue: 220, saturation: 15, luminance: -5 }, midtones: { hue: 30 }, highlights: { saturation: 10 }, global: { luminance: 2 }, blending: 60, balance: -10 },
      calibration: { shadowTint: 5, red: { hue: 5 }, blue: { saturation: 8 } }
    });
    expect(s).toEqual({
      SaturationAdjustmentOrange: -10,
      LuminanceAdjustmentOrange: 8,
      HueAdjustmentBlue: -5,
      SplitToningShadowHue: 220,
      SplitToningShadowSaturation: 15,
      ColorGradeShadowLum: -5,
      ColorGradeMidtoneHue: 30,
      SplitToningHighlightSaturation: 10,
      ColorGradeGlobalLum: 2,
      ColorGradeBlending: 60,
      SplitToningBalance: -10,
      ShadowTint: 5,
      RedHue: 5,
      BlueSaturation: 8
    });
  });

  it("leaves out what was not asked for", () => {
    expect(buildLrColorSettings({})).toEqual({});
    expect(buildLrColorSettings({ hsl: { red: {} } })).toEqual({});
  });
});

describe("Photoshop additions", () => {
  it("clarity and grain adjustment layers use the classes read back from Photoshop", () => {
    expect(ADJUSTMENT_TYPES.clarity).toMatchObject({ _obj: "clarity" });
    expect(ADJUSTMENT_TYPES.grain).toMatchObject({ _obj: "grainAdjustment" });
  });

  it("the UXP panel hands unknown styles and selection operations to the ExtendScript handlers", () => {
    const uxp = read("bridges/uxp-photoshop/main.js");
    expect(uxp).toMatch(/throw unsupported\(`Layer style '\$\{type\}' runs through the ExtendScript handlers\.`\)/);
    expect(uxp).toMatch(/throw unsupported\(`ps\.selection\.operate '\$\{op\}' runs through the ExtendScript handlers\.`\)/);
    const es = read("src/extendscript/ps-handlers.jsx");
    for (const style of ["innerShadow", "innerGlow", "bevelEmboss", "satin"]) expect(es).toContain(`type === "${style}"`);
    for (const op of ["expand", "contract", "smooth", "colorRange", "saveSelection", "loadSelection"]) expect(es).toContain(`"${op}"`);
  });
});

describe("Photoshop UXP: an action handed to ExtendScript must keep its error code", () => {
  it("the modal wrapper rethrows the original error (executeAsModal would drop err.code)", () => {
    const uxp = read("bridges/uxp-photoshop/main.js");
    expect(uxp).toMatch(/original = err;\s+throw err;/);
    expect(uxp).toMatch(/throw original \|\| errModal;/);
  });

  it("the router also recognises the message, so an older installed panel still falls back", async () => {
    const { isActionNotSupported } = await import("../../src/core/bridge-router.js");
    const packet = { type: "response", id: "x", app: "photoshop", bridgeType: "uxp", ok: false, error: { code: "PS_UXP_ERROR", message: "Error: Layer style 'bevelEmboss' runs through the ExtendScript handlers." } };
    expect(isActionNotSupported(packet as never)).toBe(true);
  });
});

describe("Photoshop layer styles stack on a layer or a group", () => {
  const jsx = read("src/extendscript/ps-handlers.jsx");
  const uxp = read("bridges/uxp-photoshop/main.js");

  it("ExtendScript reads the current layerEffects and puts the new effect into it", () => {
    expect(jsx).toMatch(/gotFx\.getObjectValue\(idFx\)/);
    expect(jsx).toMatch(/allFx\.putObject\(stringIDToTypeID\(fx\.key\)/);
    expect(jsx).toMatch(/allFx\.erase\(idMulti\)/);
    expect(jsx).not.toMatch(/replaces the styles already on the layer/);
  });

  it("UXP merges into the current layerEffects and drops the matching Multi list", () => {
    expect(uxp).toMatch(/_property: "layerEffects" \}, \{ _ref: "layer"/);
    expect(uxp).toMatch(/delete layerEffects\[fx\.key \+ "Multi"\]/);
    expect(uxp).not.toMatch(/replaces the styles already on the layer/);
  });

  it("UXP lists only real effects in styles (no scale, no Multi lists)", () => {
    expect(uxp).toMatch(/!Array\.isArray\(v\) && typeof v\._obj === "string" && v\.enabled !== false/);
  });

  it("replaceExisting starts clean on both paths, and the tool accepts a layer or group name", () => {
    expect(jsx).toMatch(/params\.replaceExisting !== true/);
    expect(uxp).toMatch(/params\.replaceExisting !== true/);
    const tool = read("src/tools/photoshop/index.ts");
    expect(tool).toMatch(/replaceExisting: z/);
    expect(tool).toMatch(/group \(folder\) name/);
  });

  it("creating a document from the Home screen does not fail when createDocument resolves with null", () => {
    expect(uxp).toMatch(/created \|\| \(await waitForActiveDocument\(\)\)/);
  });
});

describe("pop-out (out of bounds) recipe", () => {
  const jsx = read("src/extendscript/ps-handlers.jsx");
  const tool = read("src/tools/photoshop/recipes.ts");

  it("works on a duplicate and builds shape, clipped subject and unclipped top copy", () => {
    const body = jsx.slice(jsx.indexOf('action === "ps.recipe.popOut"'), jsx.indexOf('action === "ps.recipe.productShot"'));
    expect(body).toMatch(/RO\.duplicate\(/);
    expect(body).toMatch(/subjO\.grouped = true/);
    expect(body).toMatch(/topLO\.grouped = false/);
    expect(body).toMatch(/charIDToTypeID\("Msk "\)/);
    expect(body).toMatch(/__psRecipeCloseSource\(srcO\)/);
    expect(body).not.toMatch(/DialogModes\.ALL/);
  });

  it("Photoshop: in-place mode on a named layer and keepBackground", () => {
    const body = jsx.slice(jsx.indexOf('action === "ps.recipe.popOut"'), jsx.indexOf('action === "ps.recipe.productShot"'));
    expect(body).toMatch(/inPlaceO \? String\(subjO\.name\) \+ " top"/);
    expect(body).toMatch(/grpO\.move\(subjO, ElementPlacement\.PLACEBEFORE\)/);
    expect(body).toMatch(/params\.keepBackground === true/);
    expect(tool).toMatch(/layerName: z\.string\(\)\.optional\(\)\.describe\("Photo layer/);
  });

  it("Illustrator: the shape is the clipping path, painted after masking; the top clip is tight on the subject", () => {
    const ai = read("src/extendscript/ai-handlers.jsx");
    const body = ai.slice(ai.indexOf('action === "ai.recipe.popOut"'), ai.indexOf('action === "ai.stroke"'));
    expect(body.indexOf("bodyP.clipped = true")).toBeGreaterThan(-1);
    expect(body.indexOf("clipBody.fillColor")).toBeGreaterThan(body.indexOf("bodyP.clipped = true"));
    expect(body).toMatch(/topP\.pathItems\.rectangle\(sT, sL, sW2/);
    expect(body).toMatch(/backgroundFilePath/);
    const rec = read("src/tools/illustrator/recipe.ts");
    expect(rec).toContain('"ai_recipe_pop_out"');
    expect(rec).toMatch(/cropToSubject: !params\.keepBackground/);
    expect(read("skills/app/app-illustrator/SKILL.md")).toContain("ai_recipe_pop_out");
  });

  it("previews: files past 300 KB are not base64-encoded inside the app (it froze Illustrator)", () => {
    for (const f of ["ai", "id", "ae"]) expect(read(`src/extendscript/${f}-handlers.jsx`)).toMatch(/fileObj\.length > 300000\) return null/);
  });

  it("is exposed as ps_recipe_pop_out and described in the skills", () => {
    expect(tool).toContain('"ps_recipe_pop_out"');
    expect(tool).toContain('"ps.recipe.popOut"');
    expect(read("skills/foto/foto-recorte-e-composicao/SKILL.md")).toContain("ps_recipe_pop_out");
    expect(read("skills/app/app-photoshop/SKILL.md")).toContain("ps_recipe_pop_out");
  });
});

describe("Windows routine of 21/11/2026", () => {
  it("Photoshop: layer.kind is read through a guard (it throws on Clarity and Grain adjustment layers)", () => {
    const jsx = read("src/extendscript/ps-handlers.jsx");
    expect(jsx).toMatch(/function __psKindOf\(layer\)/);
    const unguarded = jsx.split("\n").filter((l) => /\.kind (===|!==) LayerKind\./.test(l) && !/__psKindOf/.test(l));
    expect(unguarded).toEqual([]);
  });

  it("Premiere: a speed change keeps the content, reports the speed applied and warns when it differs", () => {
    const pr = read("src/extendscript/pr-handlers.jsx");
    expect(pr).toMatch(/trimmedToNewSpeed: trimmedSp/);
    expect(pr).toMatch(/Premiere applied /);
  });

  it("Photoshop: 'select no layers' names the target (a bare call is refused by Photoshop 2027)", () => {
    for (const f of ["src/extendscript/ps-handlers.jsx", "bridges/uxp-photoshop/jsx/ps-handlers.jsx", "bridges/cep-universal-bridge/jsx/ps-handlers.jsx"]) {
      const jsx = read(f);
      expect(jsx, f).not.toMatch(/selectNoLayers"\), new ActionDescriptor\(\)/);
      expect(jsx, f).toMatch(/function __psSelectNoLayers\(\)/);
    }
  });

  it("Photoshop social set: the key art group swallowed by the first artboard is left out of the audit", () => {
    for (const f of ["src/extendscript/ps-handlers.jsx", "bridges/uxp-photoshop/jsx/ps-handlers.jsx", "bridges/cep-universal-bridge/jsx/ps-handlers.jsx"]) {
      const jsx = read(f);
      expect(jsx, f).toMatch(/var srcPath = A\.f\.name \+ " \/ " \+ String\(src\.name\);/);
      expect(jsx, f).toMatch(/layersAu = keptAu;/);
    }
  });

  it("previews: the server reads the file when the image did not come with the answer", () => {
    expect(read("src/core/image-helper.ts")).toMatch(/for \(const key of \["outputPath", "previewPath"\]\)/);
    expect(read("src/tools/indesign/recipes.ts")).toMatch(/previewRes\.previewBase64/);
  });
});

describe("no command may open a blocking dialog", () => {
  it("Premiere never calls createNewSequence, which opens the New Sequence dialog", () => {
    const code = read("src/extendscript/pr-handlers.jsx").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/\.createNewSequence\(/);
    expect(code).toMatch(/qe\.project\.newSequence\(/);
  });
});
