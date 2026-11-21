import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { landingReport, cameraReport, type LandingRow, type CameraSample } from "../../src/media/landing";
import { classifyComError } from "../../src/core/com-runner";
import { buildMaskPresetXmp, MASK_PARTS, PORTRAIT_SET, presetFileName, cameraRawSettingsFolder } from "../../src/tools/lightroom/mask-presets";
import { regionP50 } from "../../src/tools/lightroom/recipe";

const row = (i: number, cx: number, cy: number, inkW = 400): LandingRow => ({ id: "L1." + i, time: i * 0.5, cx, cy, inkW, inkH: 120 });

describe("landingReport (lyric-video camera gate)", () => {
  it("fails when every word lands on the same spot", () => {
    const rep = landingReport(Array.from({ length: 12 }, (_, i) => row(i, 540, 880)), { width: 1080, height: 1920 });
    expect(rep.pass).toBe(false);
    expect(rep.blocksFailed).toBeGreaterThan(0);
    expect(rep.sameSpotPairs.length).toBe(11);
    expect(rep.worstBlock?.sdX).toBe(0);
  });

  it("passes a spread sequence with different sizes inside the safe zone", () => {
    const xs = [230, 690, 720, 300, 780, 430, 800, 320, 760, 280, 600, 790];
    const ys = [420, 1100, 1400, 380, 900, 620, 1380, 400, 1200, 760, 500, 1300];
    const ws = [300, 520, 380, 420, 330, 700, 300, 480, 360, 410, 660, 320];
    const rep = landingReport(xs.map((x, i) => row(i, x, ys[i], ws[i])), { width: 1080, height: 1920 });
    expect(rep.sameSpotPairs).toEqual([]);
    expect(rep.outsideSafeZone).toEqual([]);
    expect(rep.blocksFailed).toBe(0);
    expect(rep.pass).toBe(true);
  });

  it("flags ink outside the safe zone and scales the floors with the frame", () => {
    const rep = landingReport([row(0, 100, 880, 400), row(1, 600, 300, 300), row(2, 400, 1400, 300)], { width: 1080, height: 1920 });
    expect(rep.outsideSafeZone).toEqual(["L1.0"]);
    const half = landingReport(Array.from({ length: 10 }, (_, i) => row(i, 270, 440, 200)), { width: 540, height: 960 });
    expect(half.worstBlock?.floorX).toBe(75);
    expect(half.worstBlock?.floorY).toBe(125);
  });

  it("uses the lower x floor when a block holds a wide word", () => {
    const rep = landingReport(Array.from({ length: 10 }, (_, i) => row(i, 540, 880, i === 3 ? 700 : 300)), { width: 1080, height: 1920 });
    expect(rep.worstBlock?.floorX).toBe(120);
  });
});

describe("cameraReport", () => {
  const moving = (n: number, still?: [number, number]): CameraSample[] =>
    Array.from({ length: n }, (_, i) => {
      const t = i / 60;
      const frozen = still && t >= still[0] && t <= still[1];
      const x = frozen ? still[0] * 300 : t * 300;
      return [t, x, 0, 0, 0, 0, 1] as CameraSample;
    });

  it("passes a camera that keeps travelling", () => {
    const rep = cameraReport(moving(120));
    expect(rep.pass).toBe(true);
    expect(rep.staticStretches).toEqual([]);
  });

  it("reports a standstill of 0.25 s or more, not a shorter one", () => {
    const long = cameraReport(moving(180, [1, 1.5]));
    expect(long.pass).toBe(false);
    expect(long.staticStretches.length).toBe(1);
    expect(long.staticStretches[0].seconds).toBeGreaterThanOrEqual(0.25);
    const short = cameraReport(moving(180, [1, 1.1]));
    expect(short.staticStretches).toEqual([]);
  });

  it("reports a jump unless it is a declared cut", () => {
    const s = moving(120).map((v) => [...v] as CameraSample);
    for (let i = 60; i < s.length; i++) s[i][1] += 5000;
    expect(cameraReport(s).jumps.length).toBe(1);
    expect(cameraReport(s, { cuts: [1.0] }).jumps).toEqual([]);
  });
});

describe("COM fallback (B41)", () => {
  it("tells a lost answer (timeout) apart from a real failure", () => {
    expect(classifyComError(Object.assign(new Error("Command failed"), { killed: true, signal: "SIGTERM" }), 60000).code).toBe("COM_TIMEOUT_PANEL_DISCONNECTED");
    expect(classifyComError(new Error("Script execution failed on every COM ProgID"), 60000).code).toBe("COM_EXECUTION_FAILED");
  });
  it("has a hint that forbids repeating blindly", () => {
    const hints = fs.readFileSync("src/core/error-hints.ts", "utf8");
    expect(hints).toContain("COM_TIMEOUT_PANEL_DISCONNECTED");
    expect(hints).toContain("Never repeat a command");
  });
});

describe("Lightroom mask presets (B61)", () => {
  it("uses the part codes read from the user's XMP", () => {
    expect(MASK_PARTS.teeth.id).toBe(12);
    expect(MASK_PARTS.facialSkin.id).toBe(2);
    expect(MASK_PARTS.irisAndPupil.id).toBe(3);
    expect(MASK_PARTS.clothes.id).toBe(11);
    expect(MASK_PARTS.background.id).toBe(22);
  });

  it("writes the teeth recipe as the XMP stores it", () => {
    const xmp = buildMaskPresetXmp(PORTRAIT_SET[0]);
    expect(xmp).toContain('crs:PresetType="Normal"');
    expect(xmp).toContain('crs:MaskSubCategoryID="12"');
    expect(xmp).toContain('crs:LocalSaturation="-0.39"');
    expect(xmp).toContain('crs:LocalTemperature="-0.07"');
    expect(xmp).toContain('crs:What="Mask/Image"');
    expect(xmp).not.toContain("MaskDigest");
    expect(xmp).toContain("<rdf:li xml:lang=\"x-default\">MCP Dentes - clarear</rdf:li>");
  });

  it("stores exposure as stops / 4 and gives stable ids", () => {
    const spec = { name: "Teste", part: "background" as const, adjustments: { exposure: -1 } };
    const a = buildMaskPresetXmp(spec);
    expect(a).toContain('crs:LocalExposure2012="-0.25"');
    expect(buildMaskPresetXmp(spec)).toBe(a);
  });

  it("rejects unknown sliders, out-of-range values and empty presets", () => {
    expect(() => buildMaskPresetXmp({ name: "x", part: "teeth", adjustments: { brilho: 3 } })).toThrow(/Unknown adjustment/);
    expect(() => buildMaskPresetXmp({ name: "x", part: "teeth", adjustments: { saturation: -390 } })).toThrow(/between/);
    expect(() => buildMaskPresetXmp({ name: "x", part: "teeth", adjustments: {} })).toThrow(/at least one/);
  });

  it("builds safe file names and the Camera Raw folder", () => {
    expect(presetFileName('MCP: Dentes "A"/B')).toBe("MCP- Dentes -A-B.xmp");
    expect(cameraRawSettingsFolder({ APPDATA: "C:\\Users\\x\\AppData\\Roaming" }, "win32").replace(/\\/g, "/")).toContain("Adobe/CameraRaw/Settings");
  });
});

describe("regionP50 (exposure match on a region)", () => {
  it("measures only the region", () => {
    const w = 4, h = 2;
    const data = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.fill(x < 2 ? 40 : 200, (y * w + x) * 3, (y * w + x) * 3 + 3);
    const img = { width: w, height: h, data } as never;
    expect(regionP50(img, [0, 0, 0.5, 1])).toBe(40);
    expect(regionP50(img, [0.5, 0, 0.5, 1])).toBe(200);
    expect([40, 200]).toContain(regionP50(img));
  });
});

describe("handlers written without the apps open (18/11/2026)", () => {
  const ae = fs.readFileSync("src/extendscript/ae-handlers.jsx", "utf8");
  const ps = fs.readFileSync("src/extendscript/ps-handlers.jsx", "utf8");
  const ai = fs.readFileSync("src/extendscript/ai-handlers.jsx", "utf8");
  const rt = fs.readFileSync("src/extendscript/es3-runtime.jsx", "utf8");
  const body = (src: string, from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from) + 1));

  it("pop words: marker on the word time, 3D layer, scale reaches 1 at the marker", () => {
    const b = body(ae, 'action === "ae.words.pop"', 'action === "ae.words.measure"');
    expect(b).toContain("threeDLayer = true");
    expect(b).toContain('property("ADBE Marker").setValueAtTime(It.word.start');
    expect(b).toContain("marker.key(1).time");
    expect(b).toContain("addCamera");
    expect(b).not.toContain("Math.random");
  });

  it("measure and camera trace remove their temporary layer even on failure", () => {
    const m = body(ae, 'action === "ae.words.measure"', 'action === "ae.camera.trace"');
    const c = body(ae, 'action === "ae.camera.trace"', 'action === "ae.text.ring"');
    for (const b of [m, c]) {
      expect(b).toContain("} finally {");
      expect(b).toMatch(/probe[MK]\.remove\(\)/);
    }
    expect(m).toContain("toComp(");
    expect(c).toContain("activeCamera.toWorld");
  });

  it("text ring uses per-character 3D on a circular mask path", () => {
    const b = body(ae, 'action === "ae.text.ring"', 'action === "ae.render.queue"');
    expect(b).toContain("threeDPerChar = true");
    expect(b).toContain('"ADBE Text Path"');
    expect(b).toContain("MaskMode.NONE");
  });

  it("captions can live on one layer; glitch transition exists", () => {
    expect(ae).toContain("params.singleLayer");
    expect(ae).toContain('styleT === "glitch"');
  });

  it("After Effects rolls a failed command back with a marker, never an empty group (B2, measured live)", () => {
    const b = body(rt, "var rolledBack = false;", "__mcpUndoState.open = false;");
    const mark = b.indexOf('app.project.items.addFolder("__mcp_rollback")');
    const end = b.indexOf("app.endUndoGroup()");
    const undo = b.indexOf("app.executeCommand(16)");
    expect(mark).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(mark);
    expect(undo).toBeGreaterThan(end);
    expect(b).toContain("if (marked) {");
    expect(rt).toContain("rolledBack: rolledBack");
    expect(rt).not.toContain("findMenuCommandId(prefixes");
  });

  it("camera transition re-reads its properties after adding effects (live: Object is invalid)", () => {
    const b = body(ae, 'action === "ae.transition.camera"', 'action === "ae.words.pop"');
    expect(b).toContain("function reTf()");
    expect(b.match(/reTf\(\);/g)?.length).toBe(2);
    expect(b).toContain("lay.outPoint = styleT ===");
  });

  it("pop words groups fast words into stops (live: one camera move per word is a blur at speech rate)", () => {
    const b = body(ae, 'action === "ae.words.pop"', 'action === "ae.words.measure"');
    expect(b).toContain("Ip.word.start - runP[runP.length - 1].word.start >= minGapP");
    expect(b).toContain("function splitRun(run)");
  });

  it("Photoshop: text in artboards - no stale reference is ever used (B39, measured live)", () => {
    const b = body(ps, "function __psAddTextLayer", "function __psMakeArtboard");
    // the layer is taken from the set only when the set really grew by one empty layer
    expect(b).toContain("setB.layers.length === n0 + 1 && __psIsEmptyNewLayer(setB.layers[0])");
    // a stray layer is removed only when it is the active layer AND empty
    expect(b).toContain("if (__psIsEmptyNewLayer(actB)) actB.remove();");
    expect(b.match(/\.remove\(\)/g)?.length).toBe(1);
    expect(b).not.toContain(".move(");
    const c = body(ps, 'var addedT = __psAddTextLayer(docC, params.artboard, params.position);', 'if (action === "ps.layer.editText")');
    // the move is the last operation and nothing touches createdLayer after it
    const afterMove = c.slice(c.indexOf("createdLayer.move(moveToC, ElementPlacement.INSIDE);") + 10);
    expect(afterMove).not.toMatch(/createdLayer\./);
  });

  it("Photoshop: artboard export never deletes the other artboards before the crop (B40)", () => {
    const b = body(ps, "B40 (18/11/2026)", "app.activeDocument = docA;");
    expect(b).toContain('docA.duplicate("mcp_ab_" + xa, !keepAlpha)');
    expect(b).not.toContain(".remove()");
  });

  it("Photoshop and Illustrator centre text by the cap height and remove only their probes", () => {
    const p = body(ps, 'action === "ps.text.centerInShape"', 'action === "ps.logo.place"');
    expect(p).toContain('probeCt.textItem.contents = "H"');
    expect(p).toContain("probeCt.remove()");
    expect(p).not.toContain("activeLayer.remove");
    const a = body(ai, 'action === "ai.text.centerInShape"', 'action === "ai.export.screens"');
    expect(a).toContain("createOutline()");
    expect(a).toContain('outlineBounds(tfCs, "H")');
  });

  it("Illustrator preview honours artboardIndex and restores the active artboard (B36)", () => {
    const b = body(ai, 'action === "ai.export.artboardPreview"', 'action === "ai.text.centerInShape"');
    expect(b).toContain("setActiveArtboardIndex(wantAbIdx)");
    expect(b).toContain("setActiveArtboardIndex(prevAbIdx)");
  });

  it("the CEP bridge carries the same handlers", () => {
    for (const f of ["ae-handlers.jsx", "ps-handlers.jsx", "ai-handlers.jsx", "es3-runtime.jsx"]) {
      expect(fs.readFileSync("bridges/cep-universal-bridge/jsx/" + f, "utf8")).toBe(fs.readFileSync("src/extendscript/" + f, "utf8"));
    }
  });
});

describe("Lightroom handlers after the live session (18/11/2026)", () => {
  const lua = fs.readFileSync("bridges/lightroom-classic/JrAdbMcpBridge.lrplugin/Handlers.lua", "utf8");
  it("brings AI settings up to date before every export (no 'AI Updates Recommended' dialog)", () => {
    expect(lua).toContain("local function updateAISettingsFor(photos, maxSeconds)");
    const exp = lua.slice(lua.indexOf('handlers["lr.export"]'));
    expect(exp.indexOf("updateAISettingsFor(photos)")).toBeGreaterThan(0);
    expect(exp.indexOf("updateAISettingsFor(photos)")).toBeLessThan(exp.indexOf("session:doExportOnCurrentTask()"));
    expect(lua).toContain("AI_SETTINGS_PENDING");
  });
  it("pastes settings groups inside write access, with AI update, and checks the booleans", () => {
    const b = lua.slice(lua.indexOf('handlers["lr.develop.syncGroups"]'), lua.indexOf('handlers["lr.develop.snapshot"]'));
    expect(b).toContain('write("MCP: sync settings groups"');
    expect(b).toContain("photo:pasteSettings(p.updateAI ~= false, p.replaceMasks == true)");
    expect(b).toContain("copied == false");
  });
});
