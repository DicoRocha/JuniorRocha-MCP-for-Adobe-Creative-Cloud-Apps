import { describe, expect, it } from "vitest";
import { pngScale, slug } from "../../src/tools/illustrator/recipe.js";

describe("ai_recipe_logo_package helpers", () => {
  it("slugs file names", () => {
    expect(slug("Clínica São José.ai")).toBe("clinica-sao-jose");
    expect(slug("  LEVATIO  ")).toBe("levatio");
  });
  it("computes PNG scales and reports Illustrator's 776 % cap", () => {
    expect(pngScale(1024, 512)).toEqual({ scale: 200, px: 1024, capped: false });
    expect(pngScale(32, 512).px).toBe(32);
    const big = pngScale(2048, 200);
    expect(big.capped).toBe(true);
    expect(big.px).toBe(1552);
  });
});
