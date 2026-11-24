import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { planCarousel, seamBoxesFromTree, seamIssues, suggestCardCount, CAROUSEL_KIND_QUESTION } from "../../src/core/carousel.js";

describe("seamless carousel plan", () => {
  it("makes the canvas an exact multiple of the card and cuts at whole pixels", () => {
    const p = planCarousel({ count: 5, ratio: "4:5" });
    expect(p.canvasWidth).toBe(5400);
    expect(p.canvasHeight).toBe(1350);
    expect(p.seams).toEqual([1080, 2160, 3240, 4320]);
    expect(p.cards[4]).toEqual([4320, 5400]);
    const widths = p.cards.map(([l, r]) => r - l);
    expect(new Set(widths)).toEqual(new Set([1080]));
    expect(p.verticalGuides).toContain(80);
    expect(p.verticalGuides).toContain(1000);
    expect(p.verticalGuides).toContain(1160);
    expect(p.horizontalGuides).toEqual([80, 1270]);
    expect(p.fileNames[0]).toBe("carrossel_01.png");
    expect(p.fileNames[4]).toBe("carrossel_05.png");
  });

  it("defaults to 3:4 (1080x1440) and decides the count from the content", () => {
    expect(planCarousel({ count: 4 }).canvasHeight).toBe(1440);
    expect(planCarousel({ count: 20 }).canvasWidth).toBe(21600);
    expect(suggestCardCount(5)).toBe(7);
    expect(suggestCardCount(30)).toBe(20);
    expect(suggestCardCount(0)).toBe(2);
    expect(CAROUSEL_KIND_QUESTION).toMatch(/quantos cards/);
  });

  it("marks the 3:4 grid crop of a 4:5 first card and none for 3:4", () => {
    expect(planCarousel({ count: 3, ratio: "4:5" }).gridCropSide).toBe(34);
    expect(planCarousel({ count: 3, ratio: "3:4" }).gridCropSide).toBe(0);
    expect(planCarousel({ count: 3, ratio: "3:4" }).canvasHeight).toBe(1440);
  });

  it("refuses more than 20 cards and warns on Save for Web width and few cards", () => {
    expect(() => planCarousel({ count: 21 })).toThrow(/20/);
    expect(() => planCarousel({ count: 1 })).toThrow();
    expect(planCarousel({ count: 10 }).warnings.join(" ")).toMatch(/8192/);
    expect(planCarousel({ count: 3 }).warnings.join(" ")).toMatch(/fewer than 4/);
    expect(planCarousel({ count: 5 }).warnings.join(" ")).toMatch(/4:5 at most/);
    expect(planCarousel({ count: 5, cardWidth: 1200, cardHeight: 1500 }).warnings.join(" ")).toMatch(/1080/);
  });

  it("finds text crossing a seam or inside its margin", () => {
    const p = planCarousel({ count: 3 });
    const issues = seamIssues(
      [
        { name: "Titulo", bounds: [900, 100, 1300, 200] },
        { name: "Logo", bounds: [1100, 1200, 1200, 1260] },
        { name: "Texto ok", bounds: [1200, 400, 2000, 600] }
      ],
      p
    );
    expect(issues).toEqual([
      { name: "Titulo", seam: 1, problem: "crosses" },
      { name: "Logo", seam: 1, problem: "margin" }
    ]);
  });

  it("reads text and logo boxes from both layer-tree shapes", () => {
    const es = seamBoxesFromTree([
      { name: "Fundo", kind: "LayerKind.NORMAL", visible: true, bounds: [0, 0, 5400, 1440] },
      { name: "Card 03 - textos", children: [{ name: "Erro", kind: "LayerKind.TEXT", visible: true, bounds: [3000, 1200, 3500, 1260] }] },
      { name: "Logo", children: [{ name: "simbolo", kind: "LayerKind.NORMAL", visible: true, bounds: [10, 10, 50, 50] }], bounds: [10, 10, 50, 50] }
    ]);
    expect(es.maxRight).toBe(5400);
    expect(es.boxes.map((b) => b.name)).toEqual(["Erro", "Logo"]);
    const uxp = seamBoxesFromTree([{ name: "T", kind: "text", visible: true, bounds: { left: 1000, top: 0, right: 1200, bottom: 50 } }]);
    expect(seamIssues(uxp.boxes, { seams: [1080], margin: 80 })[0].problem).toBe("crosses");
  });

  it("asks which kind of carousel in the skill and the router", () => {
    expect(CAROUSEL_KIND_QUESTION).toMatch(/individuais/);
    const skill = fs.readFileSync("skills/social/social-carrossel-seamless/SKILL.md", "utf8");
    expect(skill).toMatch(/ps_recipe_carousel_setup/);
    expect(skill).toMatch(/ps_recipe_carousel_split/);
    expect(skill).toMatch(/ai_recipe_carousel_artboards/);
    const index = fs.readFileSync("skills/index.md", "utf8");
    expect(index).toMatch(/social-carrossel-seamless/);
    expect(index).toMatch(/individuais ou sem emendas/);
    expect(fs.readFileSync("skills/social/social-carrossel/SKILL.md", "utf8")).toMatch(/social-carrossel-seamless/);
  });

  it("splits by duplicate + crop, never with slices", () => {
    const es = fs.readFileSync("src/extendscript/ps-handlers.jsx", "utf8");
    const start = es.indexOf('action === "ps.recipe.carouselSplit"');
    const block = es.slice(start, es.indexOf("\n  if (action ===", start + 10));
    expect(block).toMatch(/\.crop\(/);
    expect(block).not.toMatch(/slice/i);
  });

  it("InDesign layout info reads the stacking order, not the by-type pageItems", () => {
    const id = fs.readFileSync("src/extendscript/id-handlers.jsx", "utf8");
    expect(id).toContain("function __idStackOrder");
    const start = id.indexOf('action === "id.layout.info"');
    expect(id.slice(start, start + 2500)).toContain("__idStackOrder(pageLI");
  });

  it("Photoshop and Illustrator handlers exist", () => {
    expect(fs.readFileSync("src/extendscript/ps-handlers.jsx", "utf8")).toContain('action === "ps.recipe.carouselSplit"');
    expect(fs.readFileSync("src/extendscript/ps-handlers.jsx", "utf8")).toContain('action === "ps.recipe.carouselSetup"');
    const ai = fs.readFileSync("src/extendscript/ai-handlers.jsx", "utf8");
    expect(ai).toContain('action === "ai.recipe.carouselArtboards"');
    expect(ai).toMatch(/preA\.width = 20000/);
    expect(ai).toMatch(/scaleFactor/);
  });
});
