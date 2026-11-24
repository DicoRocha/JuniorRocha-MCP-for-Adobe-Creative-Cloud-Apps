import { describe, expect, it } from "vitest";
import { parsePreset, translatePreset } from "../../src/media/legacy-preset.js";

// Synthetic presets in the formats of the old files (the user's own presets stay out of the repository).
const XMP_2010 = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/">
 <crs:ProcessVersion>5.7</crs:ProcessVersion><crs:Temperature>6000</crs:Temperature><crs:Exposure>-0.50</crs:Exposure>
 <crs:Brightness>+50</crs:Brightness><crs:Contrast>+45</crs:Contrast><crs:FillLight>40</crs:FillLight><crs:Recovery>20</crs:Recovery>
 <crs:Shadows>10</crs:Shadows><crs:Clarity>+60</crs:Clarity><crs:ConvertToGrayscale>True</crs:ConvertToGrayscale>
 <crs:GrainAmount>80</crs:GrainAmount><crs:SharpenRadius>+3.0</crs:SharpenRadius><crs:Sharpness>100</crs:Sharpness>
 <crs:ToneCurve><rdf:Seq><rdf:li>0, 0</rdf:li><rdf:li>128, 140</rdf:li><rdf:li>255, 255</rdf:li></rdf:Seq></crs:ToneCurve>
</rdf:Description></rdf:RDF></x:xmpmeta>`;

const LRT = `s = { title = "Teste | Forte", value = { settings = { Contrast2012 = 60, Clarity2012 = 80, Exposure2012 = -0.4,
  ProcessVersion = "6.7", ConvertToGrayscale = false, Saturation = -50, ToneCurvePV2012 = { 0, 0, 255, 255, }, }, uuid = "x" } }`;

describe("old presets", () => {
  it("translates a process 2010 .xmp and scales the strength controls", () => {
    const t = translatePreset(parsePreset(XMP_2010), { intensity: 0.5 });
    expect(t.sourceProcess).toBe("2010");
    expect(t.settings.Exposure).toBeUndefined();
    expect(t.settings.Exposure2012).toBe(-0.25);
    expect(t.settings.Contrast2012).toBe(5); // 0.5*(45-25)=10, ×0.5
    expect(t.settings.Shadows2012).toBe(12); // 0.6*40=24, ×0.5
    expect(t.settings.Highlights2012).toBe(-6);
    expect(t.settings.Clarity2012).toBe(15);
    expect(t.settings.ConvertToGrayscale).toBe(true);
    expect(t.settings.Temperature).toBe(6000);
    expect(t.settings.GrainAmount).toBe(40);
    expect(t.settings.SharpenRadius).toBe(1);
    expect(t.settings.ToneCurvePV2012).toEqual([0, 0, 128, 140, 255, 255]);
  });

  it("reads a .lrtemplate and keeps a 2012 preset's keys", () => {
    const p = parsePreset(LRT);
    expect(p.name).toBe("Teste | Forte");
    const t = translatePreset(p, { intensity: 1 });
    expect(t.sourceProcess).toBe("2012+");
    expect(t.settings).toMatchObject({ Contrast2012: 60, Clarity2012: 80, Exposure2012: -0.4, Saturation: -50, ConvertToGrayscale: false, ToneCurvePV2012: [0, 0, 255, 255] });
    expect(t.notes.join(" ")).toMatch(/Clarity 80 is strong/);
  });

  it("reads the attribute form of .xmp", () => {
    const p = parsePreset(`<x:xmpmeta><rdf:Description crs:ProcessVersion="6.7" crs:Contrast2012="+74" crs:WhiteBalance="Custom"/></x:xmpmeta>`);
    expect(p.settings).toMatchObject({ Contrast2012: 74, WhiteBalance: "Custom" });
  });
});
