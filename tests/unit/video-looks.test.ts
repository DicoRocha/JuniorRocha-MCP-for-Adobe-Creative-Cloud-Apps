import { describe, expect, it } from "vitest";
import { lookSettings } from "../../src/core/video-looks.js";
import { hotSpots } from "../../src/tools/premiere/index.js";

describe("video looks and peaks", () => {
  it("scales a look from neutral (saturation neutral at 100) and lets settings override", () => {
    const s = lookSettings("pb-contraste", 0.5, { exposure: 0.2 });
    expect(s.saturation).toBe(50);
    expect(s.contrast).toBe(10);
    expect(s.exposure).toBe(0.2);
    expect(() => lookSettings("nope")).toThrow(/Looks:/);
  });

  it("finds the moments where the audio passes -1 dBFS", () => {
    const sr = 1000;
    const a = new Float32Array(sr * 5).fill(0.2);
    a[2100] = 0.99;
    a[2200] = 0.99;
    a[4500] = 0.95;
    expect(hotSpots(a, sr, -1)).toEqual([2, 4.5]);
  });
});

import { REFERENCE_LOOKS } from "../../src/core/looks.js";
import { VIDEO_LOOKS } from "../../src/core/video-looks.js";
import { scaleDevelopSettings } from "../../src/media/legacy-preset.js";

describe("reference looks in every app", () => {
  it("each look has Lightroom keys, a Photoshop stack and pr_color values, and pr_color knows it", () => {
    for (const [name, l] of Object.entries(REFERENCE_LOOKS)) {
      expect(Object.keys(l.lightroom).length, name).toBeGreaterThan(5);
      expect(Object.keys(l.photoshop).length, name).toBeGreaterThan(1);
      expect(VIDEO_LOOKS[name], name).toBeTruthy();
    }
  });

  it("intensity scales strength, keeps switches and hues", () => {
    const s = scaleDevelopSettings(REFERENCE_LOOKS["pb-vintage"].lightroom, 0.5);
    expect(s.ConvertToGrayscale).toBe(true);
    expect(s.SplitToningShadowHue).toBe(35);
    expect(s.PostCropVignetteAmount).toBe(-25);
    expect(s.Exposure2012).toBeCloseTo(-0.22, 2);
  });
});
