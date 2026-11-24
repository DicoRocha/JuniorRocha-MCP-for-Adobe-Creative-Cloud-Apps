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
