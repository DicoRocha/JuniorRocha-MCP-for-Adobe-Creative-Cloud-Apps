import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { normalizeText, queryEffects, suggestEffects, EffectEntry } from "../../src/core/effect-catalog.js";
import { buildLiveEffectXml, formatLiveEffectColor } from "../../src/tools/illustrator/live-effects.js";
import { buildAdjustmentLayer, buildSmartObject } from "../../src/tools/photoshop/descriptors.js";
import { createAdobeMcpServer } from "../../src/server.js";
import { AdobeBridgeError, BridgeResponsePacket } from "../../src/core/types.js";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

function es3(files: string[], globals: Record<string, unknown> = {}, extra = ""): vm.Context {
  const sandbox: Record<string, unknown> = { JSON: undefined, ...globals };
  vm.createContext(sandbox);
  vm.runInContext(files.map((f) => read(`src/extendscript/${f}`)).join("\n") + "\n" + extra, sandbox);
  return sandbox;
}

const EFFECTS: EffectEntry[] = [
  { displayName: "Gaussian Blur", matchName: "ADBE Gaussian Blur 2", category: "Blur & Sharpen" },
  { displayName: "Desfoque de Câmera", matchName: "ADBE Camera Lens Blur", category: "Blur & Sharpen" },
  { displayName: "Glow", matchName: "ADBE Glo2", category: "Stylize" },
  { displayName: "Internal Thing", matchName: "ADBE Hidden", category: "" }
];

describe("effect catalog", () => {
  it("filters by words ignoring accents and case, hides internal effects and counts categories", () => {
    expect(normalizeText("Desfoque de CÂMERA")).toBe("desfoque de camera");
    const res = queryEffects(EFFECTS, { search: "camera desfoque" });
    expect(res.effects.map((e) => e.matchName)).toEqual(["ADBE Camera Lens Blur"]);
    const all = queryEffects(EFFECTS, {});
    expect(all.matched).toBe(3);
    expect(all.categories).toEqual([
      { category: "Blur & Sharpen", count: 2 },
      { category: "Stylize", count: 1 }
    ]);
    expect(queryEffects(EFFECTS, { includeInternal: true }).matched).toBe(4);
  });

  it("suggests the closest effects for a misspelled name", () => {
    expect(suggestEffects(EFFECTS, "gausian blur", 1)[0].matchName).toBe("ADBE Gaussian Blur 2");
    expect(suggestEffects(EFFECTS, "glo2", 1)[0].matchName).toBe("ADBE Glo2");
  });
});

describe("Illustrator live effects", () => {
  it("builds drop shadow and offset path XML with the right types and colour", () => {
    const shadow = buildLiveEffectXml("dropShadow", { offsetX: 4, color: "#FF0000", opacity: 0.5 });
    expect(shadow).toContain('<LiveEffect name="Adobe Drop Shadow">');
    expect(shadow).toContain("R horz 4 ");
    expect(shadow).toContain("R opac 0.5 ");
    expect(shadow).toContain('<Fill color="5 1 0 0"/>');
    expect(buildLiveEffectXml("offsetPath", { offset: -3, joinType: "round" })).toContain("R ofst -3 I jntp 0 ");
    expect(formatLiveEffectColor([0, 0, 0, 100], [0])).toBe("1 0 0 0 1");
    expect(() => buildLiveEffectXml("nope")).toThrow(/Unknown live effect/);
  });
});

describe("Photoshop descriptors", () => {
  it("builds a clipped adjustment layer above a named layer, with readback", () => {
    const d = buildAdjustmentLayer({ type: "brightnessContrast", settings: { brightness: 20 }, clipToBelow: true, layerName: "Foto", name: "Brilho" });
    expect(d[0]).toEqual({ _obj: "select", _target: [{ _ref: "layer", _name: "Foto" }], makeVisible: false });
    expect(d[1]).toMatchObject({
      _obj: "make",
      using: { _obj: "adjustmentLayer", name: "Brilho", group: true, type: { _obj: "brightnessEvent", brightness: 20, useLegacy: false } }
    });
    expect(d.slice(-2).every((x) => x._obj === "get")).toBe(true);
    expect(() => buildAdjustmentLayer({ type: "bogus" })).toThrow(/Unknown adjustment type/);
  });

  it("requires a file for replaceContents", () => {
    expect(() => buildSmartObject("replaceContents", {})).toThrow(/filePath/);
    expect(buildSmartObject("replaceContents", { layerId: 3 }, "C:\\a.png")[1]).toEqual({
      _obj: "placedLayerReplaceContents",
      null: { _path: "C:\\a.png", _kind: "local" }
    });
  });
});

describe("Photoshop ExtendScript actionJSON converter", () => {
  const MOCKS = `
    var calls = [];
    function stringIDToTypeID(s) { return "s:" + s; }
    function charIDToTypeID(c) { return c === "null" ? "s:null" : "c:" + c; }
    function typeIDToStringID(id) { return String(id).replace(/^s:/, ""); }
    function typeIDToCharID(id) { return String(id); }
    function File(p) { this.fsName = p; }
    function ActionReference() { this.items = []; }
    ActionReference.prototype.putClass = function (c) { this.items.push(["class", c]); };
    ActionReference.prototype.putIdentifier = function (c, id) { this.items.push(["id", c, id]); };
    ActionReference.prototype.putName = function (c, n) { this.items.push(["name", c, n]); };
    ActionReference.prototype.putEnumerated = function (c, t, v) { this.items.push(["enum", c, t, v]); };
    ActionReference.prototype.putProperty = function (c, p) { this.items.push(["prop", c, p]); };
    ActionReference.prototype.putIndex = function (c, i) { this.items.push(["index", c, i]); };
    function ActionList() { this.items = []; }
    ActionList.prototype.putInteger = function (v) { this.items.push(["int", v]); };
    ActionList.prototype.putDouble = function (v) { this.items.push(["double", v]); };
    ActionList.prototype.putObject = function (c, d) { this.items.push(["obj", c, d]); };
    function ActionDescriptor() { this.items = {}; this.count = 0; }
    ActionDescriptor.prototype.putInteger = function (k, v) { this.items[k] = ["int", v]; };
    ActionDescriptor.prototype.putDouble = function (k, v) { this.items[k] = ["double", v]; };
    ActionDescriptor.prototype.putBoolean = function (k, v) { this.items[k] = ["bool", v]; };
    ActionDescriptor.prototype.putString = function (k, v) { this.items[k] = ["str", v]; };
    ActionDescriptor.prototype.putEnumerated = function (k, t, v) { this.items[k] = ["enum", t, v]; };
    ActionDescriptor.prototype.putUnitDouble = function (k, u, v) { this.items[k] = ["unit", u, v]; };
    ActionDescriptor.prototype.putPath = function (k, f) { this.items[k] = ["path", f.fsName]; };
    ActionDescriptor.prototype.putReference = function (k, r) { this.items[k] = ["ref", r.items]; };
    ActionDescriptor.prototype.putList = function (k, l) { this.items[k] = ["list", l.items]; };
    ActionDescriptor.prototype.putObject = function (k, c, d) { this.items[k] = ["obj", c, d.items]; };
    var DescValueType = { INTEGERTYPE: "INT" };
    function executeAction(ev, desc, mode) { calls.push({ ev: ev, desc: desc.items, mode: mode }); return null; }
    function executeActionGet(ref) {
      calls.push({ get: ref.items });
      return { count: 1, getKey: function () { return "s:layerID"; }, getType: function () { return "INT"; }, getInteger: function () { return 42; } };
    }
  `;

  it("turns actionJSON into ActionDescriptor calls and reads get results back", () => {
    const ctx = es3(["es3-runtime.jsx", "ps-handlers.jsx"], { app: { documents: { length: 1 }, preferences: {}, displayDialogs: "x" }, Units: { PIXELS: "PX" }, DialogModes: { NO: "NO", ALL: "ALL" } }, MOCKS);
    const descriptors = [
      { _obj: "make", _target: [{ _ref: "adjustmentLayer" }], using: { _obj: "adjustmentLayer", group: true, opacity: { _unit: "percentUnit", _value: 50 }, type: { _obj: "levels", presetKind: { _enum: "presetKindType", _value: "presetKindDefault" } } } },
      { _obj: "placedLayerReplaceContents", null: { _path: "C:\\img.png", _kind: "local" } },
      { _obj: "get", _target: [{ _property: "layerID" }, { _ref: "layer", _enum: "ordinal", _value: "targetEnum" }] }
    ];
    const out = JSON.parse(
      vm.runInContext(`JSON.stringify(__mcpDispatch("ps.raw.batchPlay", ${JSON.stringify({ descriptors })}, {}))`, ctx) as string
    );
    expect(out.errorCount).toBe(0);
    expect(out.results[2]).toEqual({ layerID: 42 });
    const calls = JSON.parse(vm.runInContext("JSON.stringify(calls)", ctx) as string);
    expect(calls[0].ev).toBe("s:make");
    expect(calls[0].desc["s:null"]).toEqual(["ref", [["class", "s:adjustmentLayer"]]]);
    const using = calls[0].desc["s:using"];
    expect(using[1]).toBe("s:adjustmentLayer");
    expect(using[2]["s:group"]).toEqual(["bool", true]);
    expect(using[2]["s:opacity"]).toEqual(["unit", "s:percentUnit", 50]);
    expect(using[2]["s:type"][2]["s:presetKind"]).toEqual(["enum", "s:presetKindType", "s:presetKindDefault"]);
    expect(calls[1].desc["s:null"]).toEqual(["path", "C:\\img.png"]);
    expect(calls[2].get).toEqual([["prop", "s:property", "s:layerID"], ["enum", "s:layer", "s:ordinal", "s:targetEnum"]]);
  });
});

describe("handler helpers", () => {
  it("After Effects resolves display names to matchNames and reports EFFECT_NOT_FOUND", () => {
    const ctx = es3(["es3-runtime.jsx", "ae-handlers.jsx"], {
      app: { effects: [{ displayName: "Gaussian Blur", matchName: "ADBE Gaussian Blur 2", category: "Blur" }] }
    });
    vm.runInContext(`var parade = { canAddProperty: function (n) { return n === "ADBE Gaussian Blur 2"; } };`, ctx);
    expect(vm.runInContext(`__aeResolveEffectMatchName(parade, "gaussian blur")`, ctx)).toBe("ADBE Gaussian Blur 2");
    expect(vm.runInContext(`(function(){ try { __aeResolveEffectMatchName(parade, "Nope"); } catch (e) { return e.name; } })()`, ctx)).toBe("EFFECT_NOT_FOUND");
  });

  it("Premiere maps DOM clip numbers to QE items, skipping gaps", () => {
    const ctx = es3(["es3-runtime.jsx", "pr-handlers.jsx"]);
    vm.runInContext(
      `var qeTrack = { numItems: 4, getItemAt: function (i) { return [{ type: "Empty" }, { type: "Clip", name: "A" }, { type: "Empty" }, { type: "Clip", name: "B" }][i]; } };`,
      ctx
    );
    expect(vm.runInContext(`__prQeClipAt(qeTrack, 1).name`, ctx)).toBe("B");
  });

  it("Illustrator never falls back to the selection when named items are missing", () => {
    const ctx = es3(["es3-runtime.jsx", "ai-handlers.jsx"]);
    vm.runInContext(`var doc = { pageItems: { length: 0 }, selection: [{ name: "selected" }] };`, ctx);
    expect(vm.runInContext(`(function(){ try { __aiCollectItems(doc, { itemNames: ["Logo"] }); return "no error"; } catch (e) { return e.message; } })()`, ctx)).toMatch(/No item matches/);
    expect(vm.runInContext(`__aiCollectItems(doc, {})[0].name`, ctx)).toBe("selected");
  });
});

describe("tool-level behaviour", () => {
  it("ae_apply_effect adds the closest installed effects to EFFECT_NOT_FOUND", async () => {
    const runtime = createAdobeMcpServer({ wsPort: 0, enableOsFallback: false });
    vi.spyOn(runtime.router, "dispatch").mockImplementation(async (app, action) => {
      if (action === "ae.effect.list") {
        const ok: BridgeResponsePacket = { type: "response", id: "x", app, bridgeType: "cep", ok: true, data: { effects: EFFECTS } };
        return ok;
      }
      throw new AdobeBridgeError(app, "EFFECT_NOT_FOUND", "Effect 'Gausian Blur' is not installed.");
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "1" });
    await Promise.all([runtime.server.connect(b), client.connect(a)]);
    try {
      const res = await client.callTool({ name: "ae_apply_effect", arguments: { effectMatchNameOrName: "Gausian Blur" } });
      expect(res.isError).toBe(true);
      expect((res.content as Array<{ text: string }>)[0].text).toContain("Gaussian Blur (ADBE Gaussian Blur 2)");
    } finally {
      await client.close();
    }
  });
});
