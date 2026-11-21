import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

function sandbox(extra: string): vm.Context {
  const ctx: Record<string, unknown> = { JSON: undefined };
  vm.createContext(ctx);
  vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read("src/extendscript/id-handlers.jsx")}\n${extra}`, ctx);
  return ctx;
}

const FAKE_APP = `
  var MeasurementUnits = { MILLIMETERS: "mm", POINTS: "pt", PIXELS: "px", CENTIMETERS: "cm", INCHES: "in", PICAS: "pica" };
  var UserInteractionLevels = { NEVER_INTERACT: "never" };
  var RulerOrigin = { PAGE_ORIGIN: "page", SPREAD_ORIGIN: "spread" };
  var trail = [];
  var app = {
    scriptPreferences: { measurementUnit: "pt", userInteractionLevel: "all" },
    documents: { length: 1 },
    activeDocument: { isValid: true, zeroPoint: [5, 5], viewPreferences: { rulerOrigin: "spread" } }
  };
`;

describe("InDesign handlers", () => {
  it("converts between geometricBounds and page rectangles", () => {
    const ctx = sandbox("");
    expect(JSON.parse(vm.runInContext("JSON.stringify(__idBounds({ x: 10, y: 20, width: 100, height: 50 }))", ctx) as string)).toEqual([20, 10, 70, 110]);
    expect(JSON.parse(vm.runInContext("JSON.stringify(__idBox([20, 10, 70, 110]))", ctx) as string)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("runs every command in the requested unit with page origin and no dialogs, then restores the user's settings", () => {
    const ctx = sandbox(FAKE_APP);
    vm.runInContext(
      `function __idDispatch(a, p) { trail.push([app.scriptPreferences.measurementUnit, app.scriptPreferences.userInteractionLevel, app.activeDocument.viewPreferences.rulerOrigin, app.activeDocument.zeroPoint.join(",")].join("|")); return { ok: true }; }`,
      ctx
    );
    vm.runInContext(`__mcpDispatch("id.x", { units: "px" })`, ctx);
    expect(vm.runInContext("trail[0]", ctx)).toBe("px|never|page|0,0");
    expect(vm.runInContext("[app.scriptPreferences.measurementUnit, app.scriptPreferences.userInteractionLevel, app.activeDocument.viewPreferences.rulerOrigin, app.activeDocument.zeroPoint.join(',')].join('|')", ctx)).toBe("pt|all|spread|5,5");
    vm.runInContext(`__mcpDispatch("id.x", {})`, ctx);
    expect(vm.runInContext("trail[1]", ctx)).toMatch(/^mm\|/);
    expect(() => vm.runInContext(`__mcpDispatch("id.x", { units: "furlong" })`, ctx)).toThrow(/Unknown units/);
  });

  it("refuses named targets that do not exist instead of using the selection", () => {
    const ctx = sandbox(`var app = { selection: [{ geometricBounds: [0,0,1,1], id: 9 }] }; var doc = { allPageItems: [] };`);
    expect(vm.runInContext(`(function(){ try { __idTargets(doc, { ids: [42] }); return "no error"; } catch (e) { return e.message; } })()`, ctx)).toMatch(/No object matches/);
    expect(vm.runInContext(`__idTargets(doc, {})[0].id`, ctx)).toBe(9);
  });
});
