import { describe, expect, it } from "vitest";
import { exposureDelta, syncKeys } from "../../src/tools/lightroom/recipe.js";

describe("lr_recipe_batch_develop helpers", () => {
  it("never syncs per-photo settings", () => {
    const all = ["Exposure2012", "Contrast2012", "CropTop", "CropAngle", "HasCrop", "Orientation", "RetouchInfo", "MaskGroupBasedCorrections", "GradientBasedCorrections", "PerspectiveVertical", "UprightTransformCount", "Temperature", "Tint", "WhiteBalance", "ToneCurvePV2012"];
    expect(syncKeys(all)).toEqual(["Exposure2012", "Contrast2012", "Temperature", "Tint", "WhiteBalance", "ToneCurvePV2012"]);
    expect(syncKeys(all, { whiteBalance: false, exclude: ["ToneCurvePV2012"] })).toEqual(["Exposure2012", "Contrast2012"]);
  });

  it("computes a damped, clamped exposure change from medians", () => {
    expect(exposureDelta(118, 118)).toBe(0);
    const up = exposureDelta(118, 80);
    expect(up).toBeGreaterThan(0.8);
    expect(up).toBeLessThan(1.2);
    expect(exposureDelta(118, 160)).toBeLessThan(0);
    expect(exposureDelta(200, 10, { maxEv: 1.5 })).toBe(1.5);
  });
});
