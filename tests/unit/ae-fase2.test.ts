/**
 * After Effects phase 2: PNG codec + contact sheet, easing on existing keyframes, markers (fake AE DOM).
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import * as zlib from "node:zlib";
import { contactSheet, decodePng, encodePng, resizeRgb } from "../../src/core/png.js";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

describe("png", () => {
  it("round-trips RGB, composites RGBA over the background and reads 16-bit", () => {
    const img = { width: 3, height: 2, data: Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30, 40, 50, 60, 70, 80, 90]) };
    expect(Array.from(decodePng(encodePng(img)).data)).toEqual(Array.from(img.data));
    // hand-made RGBA PNG: one half-transparent white pixel (filter 0)
    const crc = (b: Buffer) => {
      let c = 0xffffffff;
      for (const x of b) {
        c ^= x;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (t: string, body: Buffer) => {
      const tb = Buffer.concat([Buffer.from(t), body]);
      const l = Buffer.alloc(4);
      l.writeUInt32BE(body.length);
      const c = Buffer.alloc(4);
      c.writeUInt32BE(crc(tb));
      return Buffer.concat([l, tb, c]);
    };
    const ihdr = (depth: number, type: number) => {
      const h = Buffer.alloc(13);
      h.writeUInt32BE(1, 0);
      h.writeUInt32BE(1, 4);
      h[8] = depth;
      h[9] = type;
      return h;
    };
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const rgba = Buffer.concat([sig, chunk("IHDR", ihdr(8, 6)), chunk("IDAT", zlib.deflateSync(Buffer.from([0, 255, 255, 255, 128]))), chunk("IEND", Buffer.alloc(0))]);
    expect(Array.from(decodePng(rgba, [0, 0, 0]).data)).toEqual([128, 128, 128]);
    const rgb16 = Buffer.concat([sig, chunk("IHDR", ihdr(16, 2)), chunk("IDAT", zlib.deflateSync(Buffer.from([0, 0xab, 0xcd, 0x12, 0x34, 0xff, 0xff]))), chunk("IEND", Buffer.alloc(0))]);
    expect(Array.from(decodePng(rgb16).data)).toEqual([0xab, 0x12, 0xff]);
    expect(() => decodePng(Buffer.from("nope"))).toThrow(/Not a PNG/);
  });

  it("averages when shrinking and lays frames out in a grid", () => {
    const white = { width: 4, height: 4, data: new Uint8Array(48).fill(255) };
    expect(Array.from(resizeRgb(white, 2, 2).data)).toEqual(new Array(12).fill(255));
    const sheet = contactSheet([white, white, white], { columns: 2, cellWidth: 16, gap: 2, background: [0, 0, 0] });
    expect([sheet.width, sheet.height]).toEqual([2 * 16 + 3 * 2, 2 * 16 + 3 * 2]);
    const px = (x: number, y: number) => sheet.data[(y * sheet.width + x) * 3];
    expect(px(0, 0)).toBe(0); // gap
    expect(px(2, 2)).toBe(255); // first frame
    expect(px(30, 30)).toBe(0); // empty fourth cell
  });
});

describe("After Effects easing and markers", () => {
  function fakeAe() {
    class KeyframeEase {
      constructor(public speed: number, public influence: number) {}
    }
    class MarkerValue {
      duration = 0;
      chapter = "";
      url = "";
      label = 0;
      constructor(public comment: string) {}
    }
    const mkProp = (name: string, matchName: string, valueType: string, keyTimes: number[]) => {
      const keys = keyTimes.map((t) => ({ t, inType: "LIN", outType: "LIN", inEase: [new KeyframeEase(0, 16.7)], outEase: [new KeyframeEase(0, 16.7)], value: null as unknown }));
      return {
        name,
        matchName,
        propertyType: "PROPERTY",
        propertyValueType: valueType,
        parentProperty: { name: "Transform", parentProperty: { name: "L", parentProperty: null } },
        get numKeys() {
          return keys.length;
        },
        keys,
        keyTime: (k: number) => keys[k - 1].t,
        keyInInterpolationType: (k: number) => keys[k - 1].inType,
        keyOutInterpolationType: (k: number) => keys[k - 1].outType,
        keyInTemporalEase: (k: number) => keys[k - 1].inEase,
        keyOutTemporalEase: (k: number) => keys[k - 1].outEase,
        keyValue: (k: number) => keys[k - 1].value,
        setInterpolationTypeAtKey(k: number, i: string, o: string) {
          keys[k - 1].inType = i;
          keys[k - 1].outType = o;
        },
        setTemporalEaseAtKey(k: number, i: KeyframeEase[], o: KeyframeEase[]) {
          keys[k - 1].inEase = i;
          keys[k - 1].outEase = o;
        },
        setValueAtTime(t: number, v: unknown) {
          keys.push({ t, inType: "", outType: "", inEase: [], outEase: [], value: v });
          keys.sort((a, b) => a.t - b.t);
        },
        nearestKeyIndex(t: number) {
          let best = 1;
          keys.forEach((k, i) => {
            if (Math.abs(k.t - t) < Math.abs(keys[best - 1].t - t)) best = i + 1;
          });
          return best;
        },
        removeKey(k: number) {
          keys.splice(k - 1, 1);
        }
      };
    };
    const pos = mkProp("Position", "ADBE Position", "TwoD_SPATIAL", [0, 1, 2]);
    const scale = mkProp("Scale", "ADBE Scale", "ThreeD", [0, 1]);
    const marker = mkProp("Marker", "ADBE Marker", "MARKER", []);
    const layer = {
      name: "Titel",
      index: 1,
      numProperties: 3,
      property(i: number | string) {
        if (i === "ADBE Marker") return marker;
        if (i === "Position" || i === "ADBE Position") return pos;
        if (typeof i === "string") return null;
        return [pos, scale, marker][(i as number) - 1];
      }
    };
    class CompItem {
      name = "Main";
      numLayers = 1;
      selectedLayers: unknown[] = [];
      markerProperty = mkProp("Marker", "ADBE Marker", "MARKER", []);
      layer() {
        return layer;
      }
    }
    const comp = new CompItem();
    const sandbox: Record<string, unknown> = {
      KeyframeEase,
      MarkerValue,
      CompItem,
      PropertyType: { PROPERTY: "PROPERTY", INDEXED_GROUP: "IG", NAMED_GROUP: "NG" },
      PropertyValueType: { TwoD: "TwoD", ThreeD: "ThreeD", TwoD_SPATIAL: "TwoD_SPATIAL" },
      KeyframeInterpolationType: { LINEAR: "LIN", BEZIER: "BEZ", HOLD: "HOLD" },
      app: { project: { numItems: 1, item: () => comp, activeItem: comp } }
    };
    vm.createContext(sandbox);
    vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read("src/extendscript/ae-handlers.jsx")}`, sandbox);
    const run = (action: string, params: unknown) =>
      JSON.parse(vm.runInContext(`__mcpExecuteWithUndo("x","t",function(){return __mcpDispatch(${JSON.stringify(action)}, ${JSON.stringify(params)}, {});})`, sandbox) as string);
    return { pos, scale, comp, run };
  }

  it("eases every animated property with one ease entry per dimension for Scale, skipping markers", () => {
    const { pos, scale, run } = fakeAe();
    const r = run("ae.anim.ease", { preset: "strong" });
    expect(r.ok).toBe(true);
    expect(r.data.keys).toBe(5);
    expect(pos.keys[1].inType).toBe("BEZ");
    expect(pos.keys[1].inEase.map((e) => e.influence)).toEqual([85]);
    expect(scale.keys[0].outEase.map((e) => e.influence)).toEqual([85, 85, 85]);
  });

  it("keeps the untouched side, filters by time and supports hold", () => {
    const { pos, run } = fakeAe();
    expect(run("ae.anim.ease", { layerNames: ["Titel"], propertyPath: ["Position"], preset: "custom", influenceIn: 90, side: "in", fromTime: 0.5 }).data.keys).toBe(2);
    expect(pos.keys[0].inType).toBe("LIN");
    expect(pos.keys[1].inEase[0].influence).toBe(90);
    expect(pos.keys[1].outType).toBe("LIN");
    expect(pos.keys[1].outEase[0].influence).toBeCloseTo(16.7);
    run("ae.anim.ease", { preset: "hold", keyIndices: [3], propertyPath: ["Position"], layerNames: ["Titel"] });
    expect([pos.keys[2].inType, pos.keys[2].outType]).toEqual(["HOLD", "HOLD"]);
    expect(run("ae.anim.ease", { preset: "custom", influenceIn: 0 }).error.message).toMatch(/Influence/);
  });

  it("adds, lists and removes comp and layer markers", () => {
    const { run } = fakeAe();
    const a = run("ae.marker.manage", { operation: "add", markers: [{ time: 2, comment: "Gancho", duration: 1.5 }, { time: 0.5, comment: "Batida" }] });
    expect(a.data.owner).toBe("comp Main");
    expect(a.data.markers.map((m: { comment: string }) => m.comment)).toEqual(["Batida", "Gancho"]);
    expect(a.data.markers[1].duration).toBe(1.5);
    expect(run("ae.marker.manage", { operation: "remove", times: [2] }).data.count).toBe(1);
    expect(run("ae.marker.manage", { operation: "add", layerName: "Titel", markers: [{ time: 1, comment: "CTA" }] }).data.owner).toBe("layer Titel");
  });
});

describe("ae.vector.importAsShapes", () => {
  it("imports the .ai as layers, converts each footage layer and removes the originals", () => {
    class FootageItem {}
    class CompItem {
      name = "logo.ai";
      width = 500;
      height = 500;
      layers: Array<Record<string, unknown>> = [];
      get numLayers() {
        return this.layers.length;
      }
      layer(i: number) {
        return this.layers[i - 1];
      }
      openInViewer() {}
    }
    const comp = new CompItem();
    const mkLayer = (name: string, source: unknown) => {
      const l: Record<string, unknown> = { name, source, selected: false };
      Object.defineProperty(l, "index", { get: () => comp.layers.indexOf(l) + 1 });
      l.remove = () => comp.layers.splice(comp.layers.indexOf(l), 1);
      return l;
    };
    comp.layers.push(mkLayer("Simbolo", new FootageItem()), mkLayer("Texto", new FootageItem()), mkLayer("Fundo", {}));
    class ImportOptions {
      importAs = "";
      constructor(public file: unknown) {}
      canImportAs() {
        return true;
      }
    }
    class File {
      exists = true;
      constructor(public fsName: string) {}
    }
    const sandbox: Record<string, unknown> = {
      FootageItem,
      CompItem,
      ImportOptions,
      File,
      ImportAsType: { COMP_CROPPED_LAYERS: "ccl" },
      app: {
        project: { importFile: () => comp, numItems: 0 },
        findMenuCommandId: () => 3973,
        executeCommand(id: number) {
          expect(id).toBe(3973);
          const sel = comp.layers.find((l) => l.selected);
          if (!sel || sel.name === "Texto") return; // pretend text fails
          comp.layers.splice(comp.layers.indexOf(sel), 0, mkLayer(`${sel.name} Outlines`, null));
        }
      }
    };
    vm.createContext(sandbox);
    vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read("src/extendscript/ae-handlers.jsx")}`, sandbox);
    const r = JSON.parse(
      vm.runInContext(`__mcpExecuteWithUndo("x","t",function(){return __mcpDispatch("ae.vector.importAsShapes", {filePath:"D:/logo.ai", compName:"Logo"}, {});})`, sandbox) as string
    );
    expect(r.ok).toBe(true);
    expect(r.data.shapeLayers.map((s: { shapeLayer: string }) => s.shapeLayer)).toEqual(["Simbolo Outlines"]);
    expect(r.data.failed).toEqual(["Texto"]);
    expect(comp.layers.map((l) => l.name)).toEqual(["Simbolo Outlines", "Texto", "Fundo"]);
    expect(comp.name).toBe("Logo");
  });
});
