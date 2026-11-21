/**
 * Phase 2 Lightroom and Illustrator: TIFF reader + photo statistics, tone curves, Illustrator variations.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import * as zlib from "node:zlib";
import { decodeTiff, imageStats } from "../../src/core/tiff.js";
import { TONE_CURVES, flattenCurve } from "../../src/tools/lightroom/index.js";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

/** Little TIFF writer for the tests: RGB chunky, one strip. */
function tiff(width: number, height: number, pixels: number[], opts: { bits?: number; deflate?: boolean; predictor?: boolean } = {}) {
  const bits = opts.bits ?? 8;
  let data: Buffer;
  if (bits === 8) data = Buffer.from(pixels);
  else {
    data = Buffer.alloc(pixels.length * 2);
    pixels.forEach((v, i) => data.writeUInt16LE(v * 257, i * 2));
  }
  if (opts.predictor) {
    const row = width * 3;
    const out = Buffer.from(data);
    for (let y = 0; y < height; y++) for (let x = row - 1; x >= 3; x--) out[y * row + x] = (data[y * row + x] - data[y * row + x - 3]) & 0xff;
    data = out;
  }
  if (opts.deflate) data = zlib.deflateSync(data);
  const entries: Array<[number, number, number[]]> = [
    [256, 3, [width]],
    [257, 3, [height]],
    [258, 3, [bits, bits, bits]],
    [259, 3, [opts.deflate ? 8 : 1]],
    [262, 3, [2]],
    [273, 4, [0]],
    [277, 3, [3]],
    [278, 3, [height]],
    [279, 4, [data.length]],
    [284, 3, [1]],
    [317, 3, [opts.predictor ? 2 : 1]]
  ];
  const ifdStart = 8;
  const extraStart = ifdStart + 2 + entries.length * 12 + 4;
  const extra = Buffer.alloc(6);
  extra.writeUInt16LE(bits, 0);
  extra.writeUInt16LE(bits, 2);
  extra.writeUInt16LE(bits, 4);
  const dataStart = extraStart + extra.length;
  const head = Buffer.alloc(dataStart);
  head.write("II", 0, "latin1");
  head.writeUInt16LE(42, 2);
  head.writeUInt32LE(ifdStart, 4);
  head.writeUInt16LE(entries.length, ifdStart);
  entries.forEach(([tag, type, vals], i) => {
    const e = ifdStart + 2 + i * 12;
    head.writeUInt16LE(tag, e);
    head.writeUInt16LE(type, e + 2);
    head.writeUInt32LE(vals.length, e + 4);
    if (tag === 258) head.writeUInt32LE(extraStart, e + 8);
    else if (tag === 273) head.writeUInt32LE(dataStart, e + 8);
    else if (type === 3) head.writeUInt16LE(vals[0], e + 8);
    else head.writeUInt32LE(vals[0], e + 8);
  });
  extra.copy(head, extraStart);
  return Buffer.concat([head, data]);
}

describe("TIFF + stats", () => {
  const px = [255, 255, 255, 0, 0, 0, 200, 100, 50, 10, 20, 30];
  it("reads plain, Deflate+predictor and 16-bit TIFFs the same", () => {
    const a = decodeTiff(tiff(2, 2, px));
    expect(Array.from(a.data)).toEqual(px);
    expect(Array.from(decodeTiff(tiff(2, 2, px, { deflate: true, predictor: true })).data)).toEqual(px);
    expect(Array.from(decodeTiff(tiff(2, 2, px, { bits: 16 })).data)).toEqual(px);
    expect(() => decodeTiff(Buffer.from("nope nope"))).toThrow(/Not a TIFF/);
  });

  it("reports clipping, crushed shadows, percentiles and warmth", () => {
    const st = imageStats(decodeTiff(tiff(2, 2, px)), 8);
    expect(st.clippedHighlightsPct).toBe(25);
    expect(st.crushedShadowsPct).toBe(25);
    expect(st.percentiles.p99).toBe(255);
    expect(st.percentiles.p1).toBe(0);
    expect(st.warmth).toBe(150);
    expect(st.histogram.reduce((x, y) => x + y, 0)).toBeCloseTo(100, 0);
  });
});

describe("tone curves", () => {
  it("flattens named and custom curves and rejects bad points", () => {
    expect(flattenCurve(TONE_CURVES.linear)).toEqual([0, 0, 255, 255]);
    expect(flattenCurve(TONE_CURVES.fadedBlacks)[1]).toBe(22);
    expect(() => flattenCurve([[0, 0]])).toThrow(/2 points/);
    expect(() => flattenCurve([[0, 0], [128, 300]])).toThrow(/outside/);
    expect(() => flattenCurve([[0, 0], [128, 100], [100, 120]])).toThrow(/increasing/);
  });

  it("the Lightroom plug-in honours bitDepth and tiffCompression for TIFF exports", () => {
    const lua = read("bridges/lightroom-classic/JrAdbMcpBridge.lrplugin/Handlers.lua");
    expect(lua).toMatch(/compressionMethod_None/);
    expect(lua).toMatch(/tonumber\(p\.bitDepth\) == 8/);
  });
});

describe("Illustrator variations", () => {
  it("fills text, recolours paths, hides items, exports per record and restores the template", () => {
    class TextFrame {
      typename = "TextFrame";
      hidden = false;
      constructor(public name: string, public contents: string) {}
    }
    class PathItem {
      typename = "PathItem";
      hidden = false;
      fillColor: unknown = "orig";
      constructor(public name: string) {}
    }
    const titel = new TextFrame("Titel", "Original");
    const badge = new PathItem("Badge");
    const selo = new PathItem("Selo");
    const exported: Array<{ file: string; titel: string; hidden: boolean }> = [];
    class RGBColor {
      red = 0;
      green = 0;
      blue = 0;
    }
    class Folder {
      exists = true;
      constructor(public fsName: string) {}
    }
    const sandbox: Record<string, unknown> = {
      RGBColor,
      Folder,
      app: { documents: { length: 1 }, activeDocument: { pageItems: Object.assign([titel, badge, selo], {}) }, redraw() {} }
    };
    vm.createContext(sandbox);
    vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read("src/extendscript/ai-handlers.jsx")}`, sandbox);
    // stub the exporter: record what the document looked like at export time
    vm.runInContext(
      `var __realDispatch = __mcpDispatch; __mcpDispatch = function (a, p, o) { if (a === "ai.export.file") { __exp(p.filePath); return { filePath: p.filePath }; } return __realDispatch(a, p, o); };`,
      Object.assign(sandbox, { __exp: (f: string) => exported.push({ file: f, titel: titel.contents, hidden: selo.hidden }) })
    );
    const out = JSON.parse(
      vm.runInContext(
        `__mcpExecuteWithUndo("x","t",function(){ return __mcpDispatch("ai.variants", ${JSON.stringify({
          outputFolder: "C:/out",
          format: "png",
          records: [
            { Titel: "Gaita Blues\\nR$ 199", Badge: "#C8553D", Selo: "hide", Extra: "x", __file: "01_blues" },
            { Titel: "Cromática", Badge: "2D6A4F", Selo: "show", Extra: "y", __file: "02_cromatica" }
          ]
        })}, {}); })`,
        sandbox
      ) as string
    );
    expect(out.ok).toBe(true);
    expect(out.data.exported).toBe(2);
    expect(out.data.columnsWithoutItem).toEqual(["Extra"]);
    expect(exported.map((e) => e.file)).toEqual(["C:/out/01_blues.png", "C:/out/02_cromatica.png"]);
    expect(exported[0].titel).toBe("Gaita Blues\rR$ 199");
    expect(exported[0].hidden).toBe(true);
    expect(exported[1].hidden).toBe(false);
    expect(titel.contents).toBe("Original");
    expect(badge.fillColor).toBe("orig");
  });
});
