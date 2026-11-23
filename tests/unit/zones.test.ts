import { describe, expect, it } from "vitest";
import { rgbToLab, zoneReport, ZONE_SRGB } from "../../src/media/zones.js";

const fill = (n: number, rgb: [number, number, number]) => Array.from({ length: n }, () => rgb).flat();

describe("zone report", () => {
  it("the zone greys sit at L* = 10 × zone", () => {
    ZONE_SRGB.forEach((v, z) => expect(Math.abs(rgbToLab(v, v, v)[0] - z * 10)).toBeLessThan(1.2));
  });

  it("counts zones, clipping and key", () => {
    const img = new Uint8Array([...fill(10, [255, 255, 255]), ...fill(90, [119, 119, 119])]);
    const r = zoneReport(img);
    expect(r.zones[10].percent).toBe(10);
    expect(r.zones[5].percent).toBe(90);
    expect(r.clipping.highlightsPercent).toBe(10);
    expect(r.diagnosis.some((d) => d.startsWith("HIGHLIGHTS_CLIPPED"))).toBe(true);
    expect(r.key).toBe("mid-key");
  });

  it("finds a warm cast in the midtones and a flat picture", () => {
    const r = zoneReport(new Uint8Array(fill(100, [150, 115, 90])));
    expect(r.midtoneCast.direction).toMatch(/warm/);
    expect(r.diagnosis.some((d) => d.startsWith("FLAT"))).toBe(true);
    expect(r.diagnosis.some((d) => d.startsWith("NO_BLACK"))).toBe(true);
  });

  it("neutral greys have no cast", () => {
    expect(zoneReport(new Uint8Array(fill(50, [119, 119, 119]))).midtoneCast.direction).toBeNull();
  });
});
