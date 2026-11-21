/**
 * Regressions from the 13/11/2026 campaign test (Levatio aligners): saves into missing folders that
 * opened modal dialogs (Illustrator, After Effects) or failed vaguely (Photoshop), a print PDF without
 * bleed, Lightroom preview errors right after a Develop change, and the gaps filled along the way
 * (InDesign feather, Premiere new project / Dynamic Link / frame at a time).
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { resolveTimeoutMs, TIMEOUTS } from "../../src/core/timeouts.js";
import { getErrorHint } from "../../src/core/error-hints.js";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

/** ExtendScript File/Folder over a Set of existing paths; parent of a drive root is null. */
function fileWorld(existing: string[] = []) {
  const exists = new Set(existing);
  const log: string[] = [];
  class F {
    fsName: string;
    name: string;
    constructor(p: string) {
      this.fsName = String(p).replace(/\\/g, "/");
      this.name = this.fsName.split("/").pop() || "";
    }
    get exists() {
      return exists.has(this.fsName);
    }
    get parent(): F | null {
      const parts = this.fsName.split("/");
      return parts.length <= 1 ? null : new Fo(parts.slice(0, -1).join("/"));
    }
  }
  class Fo extends F {
    static temp = new Fo("C:/tmp");
    create() {
      exists.add(this.fsName);
      log.push(`mkdir ${this.fsName}`);
      return true;
    }
  }
  /** Marks a file as written (what a successful host save does). */
  const write = (p: string) => {
    exists.add(String(p).replace(/\\/g, "/"));
    log.push(`write ${p}`);
  };
  exists.add("D:");
  return { File: F, Folder: Fo, exists, log, write };
}

function host(handler: string, globals: Record<string, unknown>): vm.Context {
  const ctx: Record<string, unknown> = { JSON: undefined, ...globals };
  vm.createContext(ctx);
  vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read(`src/extendscript/${handler}`)}`, ctx);
  return ctx;
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect((e as Error).name).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

// ---------------------------------------------------------------------------------------------
describe("runtime helpers", () => {
  it("creates every missing parent folder and stops at the drive root", () => {
    const w = fileWorld();
    const ctx = host("ps-handlers.jsx", { File: w.File, Folder: w.Folder });
    const f = vm.runInContext(`__mcpPrepareOutputFile("D:\\\\job\\\\02_design\\\\psd\\\\post.psd").fsName`, ctx);
    expect(f).toBe("D:/job/02_design/psd/post.psd");
    expect(w.log).toEqual(["mkdir D:/job", "mkdir D:/job/02_design", "mkdir D:/job/02_design/psd"]);
  });

  it("reports a save that landed elsewhere or not at all", () => {
    const w = fileWorld(["D:/job/a.ai"]);
    const ctx = host("ps-handlers.jsx", { File: w.File, Folder: w.Folder });
    expectCode(() => vm.runInContext(`__mcpVerifySaved(new File("D:/job/a.ai"), "D:/Windows/Documentos/Documentos.ai")`, ctx), "SAVE_PATH_MISMATCH");
    expectCode(() => vm.runInContext(`__mcpVerifySaved(new File("D:/job/b.ai"), null)`, ctx), "SAVE_FAILED");
    expect(vm.runInContext(`__mcpVerifySaved(new File("D:/job/a.ai"), "d:\\\\JOB\\\\a.ai").fsName`, ctx)).toBe("D:/job/a.ai");
  });
});

// ---------------------------------------------------------------------------------------------
describe("saves never fall into a dialog", () => {
  it("Photoshop creates the folder, turns dialogs off during the save and restores them", () => {
    const w = fileWorld();
    const app: Record<string, unknown> = { displayDialogs: "ALL", documents: { length: 1 } };
    const seenDialogs: unknown[] = [];
    app.activeDocument = {
      name: "post",
      saveAs: (f: { fsName: string }) => {
        seenDialogs.push(app.displayDialogs);
        w.write(f.fsName);
      }
    };
    const ctx = host("ps-handlers.jsx", {
      File: w.File,
      Folder: w.Folder,
      PhotoshopSaveOptions: function () {},
      Extension: { LOWERCASE: "lower" },
      DialogModes: { NO: "NO", ALL: "ALL" },
      app
    });
    const res = vm.runInContext(`__psDispatch("ps.doc.save", { filePath: "D:/new/psd/post.psd", format: "psd" }, {})`, ctx) as Record<string, unknown>;
    expect(res.saved).toBe(true);
    expect(w.log[0]).toBe("mkdir D:/new");
    expect(seenDialogs).toEqual(["NO"]);
    expect(app.displayDialogs).toBe("ALL");
  });

  it("Illustrator saves silently into a new folder and refuses a stray location", () => {
    const w = fileWorld();
    const app: Record<string, unknown> = { userInteractionLevel: "DISPLAYALERTS", documents: { length: 1 } };
    let landedAt = "";
    const doc = {
      name: "Sem título-1",
      get fullName() {
        return landedAt ? new w.File(landedAt) : new w.File("C:/x/Sem título-1");
      },
      saveAs: (f: { fsName: string }) => {
        expect(app.userInteractionLevel).toBe("DONTDISPLAYALERTS");
        landedAt = f.fsName;
        w.write(f.fsName);
      }
    };
    app.activeDocument = doc;
    const ctx = host("ai-handlers.jsx", {
      File: w.File,
      Folder: w.Folder,
      IllustratorSaveOptions: function () {},
      UserInteractionLevel: { DONTDISPLAYALERTS: "DONTDISPLAYALERTS" },
      app
    });
    const ok = vm.runInContext(`__mcpDispatch("ai.doc.manage", { operation: "save", filePath: "D:/job/ai/selo.ai" }, {})`, ctx) as Record<string, unknown>;
    expect(ok.filePath).toBe("D:/job/ai/selo.ai");
    expect(app.userInteractionLevel).toBe("DISPLAYALERTS");

    doc.saveAs = (f: { fsName: string }) => {
      landedAt = "D:/Windows/Documentos/Documentos.ai";
      w.write(landedAt);
      void f;
    };
    expectCode(() => vm.runInContext(`__mcpDispatch("ai.doc.manage", { operation: "save", filePath: "D:/job/ai/selo2.ai" }, {})`, ctx), "SAVE_PATH_MISMATCH");
    expect(app.userInteractionLevel).toBe("DISPLAYALERTS");
  });

  it("Illustrator names a new document through a DocumentPreset", () => {
    const presets: Record<string, unknown>[] = [];
    const ctx = host("ai-handlers.jsx", {
      DocumentColorSpace: { RGB: "RGB", CMYK: "CMYK" },
      RulerUnits: { Points: "pt" },
      DocumentPreset: function (this: Record<string, unknown>) {
        presets.push(this);
      },
      app: {
        documents: {
          addDocument: (_s: string, pre: Record<string, unknown>) => ({
            name: pre.title,
            width: pre.width,
            height: pre.height,
            artboards: [{ artboardRect: [0, 600, 600, 0] }]
          })
        }
      }
    });
    const res = vm.runInContext(`__mcpDispatch("ai.doc.manage", { operation: "create", title: "selo_v01", width: 600, height: 600 }, {})`, ctx) as Record<string, unknown>;
    expect(res.name).toBe("selo_v01");
    expect(presets[0].numArtboards).toBe(1);
  });

  it("After Effects suppresses dialogs while saving into a new folder and refuses to drop unsaved work", () => {
    const w = fileWorld();
    const calls: string[] = [];
    const project: Record<string, unknown> = {
      file: null,
      dirty: true,
      save: (f: { fsName: string }) => {
        calls.push(`save ${f.fsName}`);
        w.write(f.fsName);
        project.file = new w.File(f.fsName);
      },
      close: () => calls.push("close")
    };
    const ctx = host("ae-handlers.jsx", {
      File: w.File,
      Folder: w.Folder,
      CloseOptions: { DO_NOT_SAVE_CHANGES: "dont" },
      app: {
        project,
        beginSuppressDialogs: () => calls.push("suppress"),
        endSuppressDialogs: () => calls.push("unsuppress"),
        newProject: () => calls.push("new")
      }
    });
    expectCode(() => vm.runInContext(`__mcpDispatch("ae.project.manage", { operation: "new" }, {})`, ctx), "PROJECT_DIRTY");
    expect(calls).toEqual([]);
    vm.runInContext(`__mcpDispatch("ae.project.manage", { operation: "save", filePath: "D:/job/03_motion/story.aep" }, {})`, ctx);
    expect(calls).toEqual(["suppress", "save D:/job/03_motion/story.aep", "unsuppress"]);
    expect(w.log[0]).toBe("mkdir D:/job");
    vm.runInContext(`__mcpDispatch("ae.project.manage", { operation: "new", discardChanges: true }, {})`, ctx);
    expect(calls.slice(-2)).toEqual(["close", "new"]);
  });

  it("InDesign verifies where a document was saved", () => {
    const w = fileWorld();
    let at = "";
    const doc = {
      saved: false,
      get fullName() {
        return at ? new w.File(at) : null;
      },
      save: (f: { fsName: string }) => {
        at = f.fsName;
        w.write(at);
      }
    };
    const ctx = host("id-handlers.jsx", { File: w.File, Folder: w.Folder, app: { documents: { length: 1 }, activeDocument: doc } });
    const res = vm.runInContext(`__idDispatch("id.doc.manage", { operation: "save", filePath: "D:/job/05/flyer.indd" }, {})`, ctx) as Record<string, unknown>;
    expect(res.filePath).toBe("D:/job/05/flyer.indd");
  });
});

// ---------------------------------------------------------------------------------------------
describe("InDesign print PDF", () => {
  function pdfHost(bleedMm: number) {
    const w = fileWorld();
    const prefs: Record<string, unknown> = {};
    const exports: unknown[][] = [];
    const preset = {
      isValid: true,
      name: "[PDF/X-4:2008]",
      properties: { name: "[PDF/X-4:2008]", useDocumentBleedWithPDF: false, standardsCompliance: "PDFX42008", cropMarks: false }
    };
    const doc = {
      documentPreferences: {
        documentBleedTopOffset: bleedMm,
        documentBleedBottomOffset: bleedMm,
        documentBleedInsideOrLeftOffset: bleedMm
      },
      exportFile: (...a: unknown[]) => {
        exports.push(a);
        w.write((a[1] as { fsName: string }).fsName);
      }
    };
    const ctx = host("id-handlers.jsx", {
      File: w.File,
      Folder: w.Folder,
      ExportFormat: { PDF_TYPE: "pdf" },
      PageRange: { ALL_PAGES: "all" },
      app: {
        documents: { length: 1 },
        activeDocument: doc,
        pdfExportPreferences: prefs,
        pdfExportPresets: { itemByName: () => preset }
      }
    });
    return { ctx, prefs, exports };
  }

  it("copies the preset, keeps the document bleed and exports without the preset argument", () => {
    const { ctx, prefs, exports } = pdfHost(3);
    const res = vm.runInContext(
      `__idDispatch("id.export", { format: "pdf", pdfPreset: "[PDF/X-4:2008]", filePath: "D:/job/05/flyer_X4.pdf" }, {})`,
      ctx
    ) as { pdf: Record<string, unknown> };
    expect(prefs.standardsCompliance).toBe("PDFX42008");
    expect(prefs.useDocumentBleedWithPDF).toBe(true);
    expect(prefs.cropMarks).toBe(false);
    expect(exports[0].length).toBe(3); // no preset argument: it would override the preferences
    expect(res.pdf).toMatchObject({ preset: "[PDF/X-4:2008]", bleed: true, cropMarks: false });
  });

  it("adds crop and bleed marks outside the bleed on request, and honours bleed: false", () => {
    const a = pdfHost(3);
    vm.runInContext(`__idDispatch("id.export", { format: "pdf", pdfPreset: "x", cropMarks: true, filePath: "D:/j/a.pdf" }, {})`, a.ctx);
    expect(a.prefs).toMatchObject({ cropMarks: true, bleedMarks: true, pageMarksOffset: 3 });
    const b = pdfHost(3);
    vm.runInContext(`__idDispatch("id.export", { format: "pdf", bleed: false, filePath: "D:/j/b.pdf" }, {})`, b.ctx);
    expect(b.prefs.useDocumentBleedWithPDF).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe("InDesign feather effects", () => {
  function item() {
    return {
      transparencySettings: {
        gradientFeatherSettings: {
          applied: false,
          angle: 0,
          type: null as unknown,
          opacityGradientStops: [
            { location: 0, opacity: 100 },
            { location: 100, opacity: 0 }
          ]
        },
        featherSettings: { mode: "none", width: 0 },
        directionalFeatherSettings: { applied: false, topWidth: 0, bottomWidth: 0, leftWidth: 0, rightWidth: 0 }
      }
    };
  }
  const globals = {
    GradientType: { LINEAR: "lin", RADIAL: "rad" },
    FeatherMode: { NONE: "none", STANDARD: "std" },
    FollowShapeModeOptions: { NONE: "none", LEADING_EDGE: "leading", ALL_EDGES: "all" }
  };

  it("fades toward a side from a start percentage", () => {
    const ctx = host("id-handlers.jsx", globals);
    const it1 = item();
    (ctx as Record<string, unknown>).it1 = it1;
    vm.runInContext(`__idApplyFeather(it1, { type: "gradient", fadeTo: "bottom", start: 65 })`, ctx);
    const g = it1.transparencySettings.gradientFeatherSettings;
    expect(g.applied).toBe(true);
    expect(g.angle).toBe(-90);
    expect(g.opacityGradientStops[0]).toEqual({ location: 65, opacity: 100 });
    expect(g.opacityGradientStops[1]).toEqual({ location: 100, opacity: 0 });
  });

  it("supports soft edges, per-side feather and removal", () => {
    const ctx = host("id-handlers.jsx", globals);
    const it2 = item();
    (ctx as Record<string, unknown>).it2 = it2;
    vm.runInContext(`__idApplyFeather(it2, { type: "basic", width: 4 }); __idApplyFeather(it2, { type: "directional", sides: { bottom: 12 } })`, ctx);
    expect(it2.transparencySettings.featherSettings).toEqual({ mode: "std", width: 4 });
    expect(it2.transparencySettings.directionalFeatherSettings).toMatchObject({
      applied: true,
      bottomWidth: 12,
      topWidth: 0,
      followShapeMode: "leading"
    });
    vm.runInContext(`__idApplyFeather(it2, { type: "none" })`, ctx);
    expect(it2.transparencySettings.directionalFeatherSettings.applied).toBe(false);
    expect(it2.transparencySettings.featherSettings.mode).toBe("none");
  });
});

// ---------------------------------------------------------------------------------------------
describe("Premiere", () => {
  it("creates a new project in a new folder and closes the previous one so the new one is active", () => {
    const w = fileWorld();
    const closed: string[] = [];
    const old = { path: "D:/old/a.prproj", closeDocument: () => closed.push("D:/old/a.prproj") };
    const list: Record<string | number, unknown> & { numProjects: number } = { numProjects: 1, 0: old };
    const app: Record<string, unknown> = { project: old, projects: list };
    app.newProject = (p: string) => {
      // Premiere keeps the old project active (13/11/2026)
      list[1] = { path: p, closeDocument: () => closed.push(p) };
      list.numProjects = 2;
      return true;
    };
    app.openDocument = (p: string) => {
      app.project = { path: p };
    };
    const ctx = host("pr-handlers.jsx", { File: w.File, Folder: w.Folder, app });
    const res = vm.runInContext(`__mcpDispatch("pr.project.manage", { operation: "new", filePath: "D:/job/04_video/story.prproj" }, {})`, ctx) as Record<string, unknown>;
    expect(res.path).toBe("D:/job/04_video/story.prproj");
    expect(res.previousProject).toBe("D:/old/a.prproj");
    expect(closed).toEqual(["D:/old/a.prproj"]);
    expect(res.active).toBe(true);
    expect(w.log).toContain("mkdir D:/job/04_video");
  });

  it("brings After Effects comps in through Dynamic Link instead of importFiles (which opens a dialog)", () => {
    const w = fileWorld(["D:/job/03/story.aep"]);
    const calls: unknown[][] = [];
    const project = {
      rootItem: {},
      importAEComps: (...a: unknown[]) => calls.push(["comps", ...a]) && true,
      importAllAEComps: (...a: unknown[]) => calls.push(["all", ...a]) && true,
      importFiles: (...a: unknown[]) => calls.push(["files", ...a]) && true
    };
    const ctx = host("pr-handlers.jsx", { File: w.File, Folder: w.Folder, app: { project } });
    const res = vm.runInContext(
      `__mcpDispatch("pr.media.import", { filePaths: ["D:/job/03/story.aep", "D:/job/01/foto.jpg"], aeCompNames: ["story_9x16"] }, {})`,
      ctx
    ) as Record<string, unknown>;
    expect(calls[0][0]).toBe("comps");
    expect(calls[0][2]).toEqual(["story_9x16"]);
    expect(calls[1][0]).toBe("files");
    expect(calls[1][1]).toEqual(["D:/job/01/foto.jpg"]);
    expect(res.dynamicLink).toBeTruthy();
    vm.runInContext(`__mcpDispatch("pr.media.import", { filePaths: ["D:/job/03/story.aep"] }, {})`, ctx);
    expect(calls[2][0]).toBe("all");
    expect(calls.length).toBe(3);
  });

  it("the UXP plugin leaves .aep imports to CEP", () => {
    expect(read("bridges/uxp-premiere/main.js")).toMatch(/\\\.aep\$\/i\.test/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("timeouts fit inside the linked-device window", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("heavy + probe stays under 80 s", () => {
    expect(TIMEOUTS.heavy + TIMEOUTS.probe).toBeLessThan(80_000);
    expect(resolveTimeoutMs("ae.project.manage", undefined, { operation: "save" })).toBe(TIMEOUTS.heavy);
  });
});

// ---------------------------------------------------------------------------------------------
describe("hints for the new errors", () => {
  it("covers the new codes and Photoshop's vague save error", () => {
    for (const code of ["FOLDER_CREATE_FAILED", "SAVE_PATH_MISMATCH", "SAVE_FAILED", "PROJECT_DIRTY", "PREVIEW_FAILED"]) {
      expect(getErrorHint(code)?.hint, code).toBeTruthy();
    }
    const ps = getErrorHint("Error", 'General Photoshop error occurred.\n- The parameters for command "Save" are not currently valid.');
    expect(ps?.hint).toMatch(/folder/);
    expect(getErrorHint("ReferenceError", "__mcpPrepareOutputFile is not defined")?.hint).toMatch(/install-bridges/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("installed copies", () => {
  it("the CEP bridge ships the same .jsx as src/extendscript", () => {
    for (const f of ["es3-runtime", "ps-handlers", "ai-handlers", "ae-handlers", "id-handlers", "pr-handlers"]) {
      expect(read(`bridges/cep-universal-bridge/jsx/${f}.jsx`), f).toBe(read(`src/extendscript/${f}.jsx`));
    }
  });

  it("the InDesign UXP plugin ships the same .jsx (hybrid by design)", () => {
    for (const f of ["es3-runtime", "id-handlers"]) {
      expect(read(`bridges/uxp-indesign/jsx/${f}.jsx`), f).toBe(read(`src/extendscript/${f}.jsx`));
    }
  });

  it("the Photoshop UXP panel ships the same .jsx (hybrid mode)", () => {
    for (const f of ["es3-runtime", "ps-handlers"]) {
      expect(read(`bridges/uxp-photoshop/jsx/${f}.jsx`), f).toBe(read(`src/extendscript/${f}.jsx`));
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("second campaign test (13/11/2026, Ohne Eile)", () => {
  it("Premiere undoes an effect that matched the wrong plug-in and reports EFFECT_AMBIGUOUS", () => {
    const comps: { displayName: string; matchName: string; properties: { numItems: number } }[] = [];
    const removed: string[] = [];
    const domClip = { name: "foto.jpg", components: { get numItems() { return comps.length; } } } as Record<string, unknown>;
    Object.defineProperty(domClip.components, "0", { get: () => comps[0] });
    const ctx = host("pr-handlers.jsx", {
      app: { project: { activeSequence: {} }, enableQE: () => {} },
      qe: { project: { getVideoEffectByName: () => ({ id: "fx" }) } }
    });
    const qeClip = {
      numComponents: 0,
      addVideoEffect: () => {
        comps.push({ displayName: "Gaussian Blur", matchName: "AE.Impact_Blur_FX", properties: { numItems: 0 } });
        qeClip.numComponents = 1;
      },
      getComponentAt: () => ({ name: "Gaussian Blur", remove: () => removed.push("Gaussian Blur") })
    };
    vm.runInContext(
      `__prRequireActiveSequence = function () { return {}; };
       __prGetTrack = function () { return {}; };
       __prQeTrack = function () { return {}; };
       __prCanonicalName = function (k, n) { return n; };
       __prClipIndices = function () { return [0]; };
       __prGetClip = function () { return DOMCLIP; };
       __prQeClipAt = function () { return QECLIP; };
       __prApplyComponentValues = function (c, v, k) { var out = []; for (var i = 0; i < k.length; i++) out.push({ key: k[i].parameter, reason: "parameter not found (keyframe)" }); return out; };
       __prDescribeComponents = function () { return []; };`,
      Object.assign(ctx, { DOMCLIP: domClip, QECLIP: qeClip })
    );
    let n = 0;
    domClip.components = {
      get numItems() {
        return n;
      }
    } as unknown as Record<string, unknown>;
    (domClip.components as Record<number, unknown>)[0] = { displayName: "Gaussian Blur", matchName: "AE.Impact_Blur_FX" };
    qeClip.addVideoEffect = () => {
      n = 1;
      qeClip.numComponents = 1;
    };
    expectCode(
      () =>
        vm.runInContext(
          `__mcpDispatch("pr.effect.apply", { effectName: "Gaussian Blur", keyframes: [{ parameter: "Blurriness", time: 3, value: 30 }, { parameter: "Blurriness", time: 4, value: 0 }] }, {})`,
          ctx
        ),
      "EFFECT_AMBIGUOUS"
    );
    expect(removed).toEqual(["Gaussian Blur"]);
  });

  it("Illustrator exports SVG through Export for Screens and leaves the document path alone", () => {
    const w = fileWorld(["D:/job/ai/selo.ai"]);
    const efs: unknown[][] = [];
    const doc = {
      fullName: new w.File("D:/job/ai/selo.ai"),
      artboards: { getActiveArtboardIndex: () => 1 },
      exportForScreens: (folder: { fsName: string }, ...rest: unknown[]) => {
        efs.push([folder.fsName, ...rest]);
        w.write(folder.fsName + "/SVG/mcp_selo-claro.svg");
      },
      exportFile: () => {
        throw new Error("legacy SVG export must not be used");
      }
    };
    class Fo extends w.Folder {
      getFiles() {
        const base = this.fsName + "/";
        return [...w.exists].filter((p) => p.startsWith(base) && !p.slice(base.length).includes("/")).map((p) => new w.File(p));
      }
    }
    const ctx = host("ai-handlers.jsx", {
      File: Object.assign(w.File, {}),
      Folder: Object.assign(Fo, { temp: new Fo("C:/tmp") }),
      ExportForScreensOptionsWebOptimizedSVG: function () {},
      ExportForScreensItemToExport: function () {},
      ExportForScreensType: { SE_SVG: "svg" },
      SVGFontType: { OUTLINEFONT: "outline" },
      app: { documents: { length: 1 }, activeDocument: doc }
    });
    vm.runInContext(
      `__aiFindFirstFile = function (folder, re) { var p = folder.fsName + "/SVG/mcp_selo-claro.svg"; return new File(p); };
       __mcpCopyFile = function (src, dest) { COPIES.push(src.fsName + " -> " + dest.fsName); return dest; };
       File.prototype.remove = function () { return true; };`,
      Object.assign(ctx, { COPIES: [] as string[] })
    );
    vm.runInContext(`File.prototype.remove = function () { return true; };`, ctx);
    w.write("D:/out/selo.svg");
    const res = vm.runInContext(`__mcpDispatch("ai.export.file", { filePath: "D:/out/selo.svg", format: "svg" }, {})`, ctx) as Record<string, unknown>;
    expect(res.exported).toBe(true);
    expect(efs.length).toBe(1);
    expect((ctx as Record<string, string[]>).COPIES[0]).toMatch(/mcp_selo-claro\.svg -> D:\/out\/selo\.svg$/);
    expect(doc.fullName.fsName).toBe("D:/job/ai/selo.ai");
  });

  it("After Effects raw scripts run with dialogs suppressed", () => {
    const calls: string[] = [];
    const ctx = host("ae-handlers.jsx", {
      app: { project: {}, beginSuppressDialogs: () => calls.push("on"), endSuppressDialogs: () => calls.push("off") }
    });
    const res = vm.runInContext(`__mcpDispatch("ae.raw.executeExtendScript", { code: "1 + 1" }, {})`, ctx) as Record<string, unknown>;
    expect(res.result).toBe(2);
    expect(calls).toEqual(["on", "off"]);
  });

  it("Lightroom copy-settings payloads have no metatable (mock rejects them like Lightroom)", () => {
    expect(read("tests/lua/mock-sdk.lua")).toMatch(/deepCopy does not support metatables/);
    expect(read("bridges/lightroom-classic/JrAdbMcpBridge.lrplugin/Handlers.lua")).toMatch(/plainCopy\(pick\(/);
  });
});
