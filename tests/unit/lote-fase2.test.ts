/**
 * Phase 2 batch production: records (CSV/JSON), InDesign data merge and Photoshop variations.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vm from "node:vm";
import { parseCsv, detectDelimiter, loadRecords, fillPattern } from "../../src/core/records.js";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
function sandboxFor(file: string, extra: Record<string, unknown>) {
  const sandbox: Record<string, unknown> = { Units: { PIXELS: "PIXELS" }, DialogModes: { NO: "NO" }, ...extra };
  vm.createContext(sandbox);
  vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read(`src/extendscript/${file}`)}`, sandbox);
  return (action: string, params: unknown) =>
    JSON.parse(vm.runInContext(`__mcpExecuteWithUndo("x", "t", function() { return __mcpDispatch(${JSON.stringify(action)}, ${JSON.stringify(params)}, {}); })`, sandbox) as string);
}

describe("records", () => {
  it("parses CSV with BOM, quotes, semicolons and line breaks in cells", () => {
    const csv = '\uFEFFProduto;Preço;Texto\r\n"Gaita ""Blues""";R$ 199;"linha 1\nlinha 2"\r\nCromática;R$ 899;\r\n\r\n';
    expect(detectDelimiter("a;b;c")).toBe(";");
    const rows = parseCsv(csv);
    expect(rows).toEqual([
      { Produto: 'Gaita "Blues"', Preço: "R$ 199", Texto: "linha 1\nlinha 2" },
      { Produto: "Cromática", Preço: "R$ 899", Texto: "" }
    ]);
  });

  it("loads JSON and inline records as strings and fills name patterns", () => {
    const f = path.join(os.tmpdir(), `rec-${Date.now()}.json`);
    fs.writeFileSync(f, JSON.stringify({ records: [{ a: 1, b: null }] }));
    expect(loadRecords({ jsonPath: f })).toEqual([{ a: "1", b: "" }]);
    fs.unlinkSync(f);
    expect(loadRecords({ records: [{ x: true }] })).toEqual([{ x: "true" }]);
    expect(() => loadRecords({})).toThrow(/records/);
    expect(fillPattern("{{#}}_{{Produto}}/{{Formato}}", { Produto: "Gaita: Blues", Formato: "4x5" }, 2)).toBe("03_Gaita_ Blues_4x5");
  });
});

describe("InDesign data merge", () => {
  it("copies the template page per record, fills {{fields}} and images, removes the template", () => {
    class TextFrame {
      name = "";
      constructor(public content: string) {}
      get texts() {
        const self = this;
        return [
          {
            findGrep() {
              const out: Array<{ contents: string }> = [];
              const re = /\{\{\s*[^}]+?\s*\}\}/g;
              let m: RegExpExecArray | null;
              const parts: Array<{ contents: string; idx: number }> = [];
              while ((m = re.exec(self.content))) parts.push({ contents: m[0], idx: m.index });
              for (const p of parts) {
                const hit = {
                  _v: p.contents,
                  get contents() {
                    return this._v;
                  },
                  set contents(v: string) {
                    self.content = self.content.replace(p.contents, v);
                    this._v = v;
                  }
                };
                out.push(hit);
              }
              return out;
            }
          }
        ];
      }
    }
    class Rect {
      placed = "";
      constructor(public name: string) {}
      place(f: { fsName: string }) {
        this.placed = f.fsName;
      }
      fit() {}
    }
    const pages: Array<Record<string, unknown>> = [];
    const mkPage = (name: string, items: unknown[]) => {
      const p: Record<string, unknown> = {
        name,
        allPageItems: items,
        removed: false,
        duplicate() {
          const clone = items.map((it) =>
            it instanceof TextFrame ? new TextFrame((it as TextFrame).content) : new Rect((it as Rect).name)
          );
          const np = mkPage(String(pages.length + 1), clone);
          pages.push(np);
          return np;
        },
        remove() {
          pages.splice(pages.indexOf(p), 1);
        }
      };
      Object.defineProperty(p, "documentOffset", { get: () => pages.indexOf(p) });
      return p;
    };
    const tpl = mkPage("1", [new TextFrame("{{Produto}} – {{Preço}}"), new Rect("{{Foto}}")]);
    pages.push(tpl);
    const doc = { pages, stories: Object.assign([], { length: 0 }) };
    const run = sandboxFor("id-handlers.jsx", {
      TextFrame,
      File: class {
        exists = true;
        constructor(public fsName: string) {}
      },
      FitOptions: { FILL_PROPORTIONALLY: 1, PROPORTIONALLY: 2, CONTENT_AWARE_FIT: 3, FRAME_TO_CONTENT: 4, CENTER_CONTENT: 5 },
      LocationOptions: { AFTER: 1 },
      NothingEnum: { NOTHING: null },
      app: (() => {
        // Assigning NothingEnum.NOTHING resets the preferences in InDesign; the object itself stays.
        const prefs = { findWhat: "" };
        const a: Record<string, unknown> = { activeDocument: doc, documents: { length: 1 } };
        for (const k of ["findTextPreferences", "changeTextPreferences", "findGrepPreferences"]) {
          Object.defineProperty(a, k, { get: () => prefs, set: () => {} });
        }
        return a;
      })()
    });
    const r = run("id.dataMerge", {
      records: [
        { Produto: "Blues", Preço: "R$ 199", Foto: "D:/f/blues.jpg" },
        { Produto: "Cromática", Preço: "R$ 899" }
      ]
    });
    expect(r.ok).toBe(true);
    expect(pages).toHaveLength(2);
    expect((pages[0].allPageItems as TextFrame[])[0].content).toBe("Blues – R$ 199");
    expect((pages[0].allPageItems as Rect[])[1].placed).toBe("D:/f/blues.jpg");
    expect((pages[1].allPageItems as TextFrame[])[0].content).toBe("Cromática – R$ 899");
    expect(r.data.missingFields).toEqual(["Foto"]);
  });
});

describe("Photoshop variations", () => {
  it("fills text and Smart Object layers by name, exports one file per record and restores the state", () => {
    const saved: string[] = [];
    const replaced: string[] = [];
    const LayerKind = { TEXT: "TEXT", SMARTOBJECT: "SO", NORMAL: "N" };
    const head = { name: "Headline", kind: "TEXT", typename: "ArtLayer", textItem: { contents: "" } };
    const photo = { name: "Foto", kind: "SO", typename: "ArtLayer" };
    const badge = { name: "Selo", kind: "N", typename: "ArtLayer", visible: true };
    const group = { name: "Grupo", typename: "LayerSet", layers: [badge] };
    const doc: Record<string, unknown> = {
      name: "Ad_4x5.psd",
      layers: [head, photo, group],
      activeHistoryState: "S0",
      saveAs: (f: { fsName: string }) => saved.push(`${f.fsName}|${head.textItem.contents}|${badge.visible}`)
    };
    const run = sandboxFor("ps-handlers.jsx", {
      LayerKind,
      File: class {
        exists = true;
        constructor(public fsName: string) {}
      },
      Folder: class {
        exists = true;
        constructor(public fsName: string) {}
        create() {
          return true;
        }
      },
      PNGSaveOptions: class {},
      JPEGSaveOptions: class {},
      PhotoshopSaveOptions: class {},
      Extension: { LOWERCASE: 1 },
      ActionDescriptor: class {
        putPath(_k: unknown, f: { fsName: string }) {
          replaced.push(f.fsName);
        }
      },
      charIDToTypeID: () => 1,
      stringIDToTypeID: () => 2,
      executeAction: () => {},
      app: { activeDocument: doc, documents: { length: 1, getByName: () => doc } }
    });
    const r = run("ps.variants", {
      outputFolder: "D:/out",
      records: [
        { Headline: "Gaita Blues", Foto: "D:/f/a.jpg", Selo: "hide", __file: "01_blues", Extra: "x" },
        { Headline: "Cromática", __file: "02_cromatica" }
      ]
    });
    expect(r.ok).toBe(true);
    expect(saved).toEqual(["D:/out/01_blues.png|Gaita Blues|false", "D:/out/02_cromatica.png|Cromática|false"]);
    expect(replaced).toContain("D:/f/a.jpg");
    expect(r.data.columnsWithoutLayer).toEqual(["Extra"]);
    expect(doc.activeHistoryState).toBe("S0");
  });
});
