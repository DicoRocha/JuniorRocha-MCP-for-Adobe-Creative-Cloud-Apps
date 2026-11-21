/**
 * Phase 2 InDesign tools: sections, text threading (with pages added until the story fits),
 * table/cell styles and table of contents — run against a small fake InDesign DOM.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
function sandboxFor(extra: Record<string, unknown>) {
  const sandbox: Record<string, unknown> = { Units: { PIXELS: "PIXELS" }, DialogModes: { NO: "NO" }, ...extra };
  vm.createContext(sandbox);
  vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read("src/extendscript/id-handlers.jsx")}`, sandbox);
  return (action: string, params: unknown) =>
    JSON.parse(
      vm.runInContext(
        `__mcpExecuteWithUndo("x", "t", function() { return __mcpDispatch(${JSON.stringify(action)}, ${JSON.stringify(params)}, {}); })`,
        sandbox
      ) as string
    );
}

const enums = {
  LocationOptions: { AFTER: "after", AT_END: "end" },
  NothingEnum: { NOTHING: null },
  PageSideOptions: { LEFT_HAND: "left", RIGHT_HAND: "right", SINGLE_SIDED: "single" },
  PageNumberStyle: { ARABIC: "1", UPPER_ROMAN: "I", LOWER_ROMAN: "i", UPPER_LETTERS: "A", LOWER_LETTERS: "a" },
  PageNumberPosition: { AFTER_ENTRY: "after", BEFORE_ENTRY: "before", NONE: "none" },
  AlternatingFillsTypes: { ALTERNATING_ROWS: "rows" },
  VerticalJustification: { TOP_ALIGN: "t", CENTER_ALIGN: "c", BOTTOM_ALIGN: "b", JUSTIFY_ALIGN: "j" }
};

describe("id.section.manage", () => {
  function makeDoc() {
    const pages = [1, 2, 3, 4].map((n) => ({ id: 100 + n, name: String(n), documentOffset: n - 1 }));
    const sections: Array<Record<string, unknown>> = [];
    const mk = (page: (typeof pages)[0]) => ({
      name: "",
      pageStart: page,
      length: 1,
      continueNumbering: true,
      pageNumberStart: 1,
      pageNumberStyle: "1",
      sectionPrefix: "",
      marker: "",
      remove() {
        sections.splice(sections.indexOf(this), 1);
      }
    });
    sections.push(mk(pages[0]));
    const coll = Object.assign(sections, {
      add(page: (typeof pages)[0]) {
        const s = mk(page);
        sections.push(s);
        return s;
      }
    });
    return { pages, sections: coll };
  }

  it("starts a roman-numbered section and a new arabic section at 1, refuses to remove the first", () => {
    const doc = makeDoc();
    const run = sandboxFor({ ...enums, app: { activeDocument: doc, documents: { length: 1 } } });
    const a = run("id.section.manage", { operation: "set", page: 1, numbering: "romanLower", startNumber: 1 });
    expect(a.ok).toBe(true);
    expect(a.data.created).toBe(false);
    expect(a.data.numbering).toBe("romanLower");
    const b = run("id.section.manage", { operation: "set", page: 3, numbering: "arabic", startNumber: 1, marker: "Produtos" });
    expect(b.data.created).toBe(true);
    expect(b.data.marker).toBe("Produtos");
    expect(b.data.startNumber).toBe(1);
    expect(run("id.section.manage", { operation: "list" }).data.count).toBe(2);
    expect(run("id.section.manage", { operation: "remove", page: 1 }).error.message).toMatch(/first section/);
    expect(run("id.section.manage", { operation: "remove", page: 3 }).data.removed).toBe(true);
    expect(run("id.section.manage", { operation: "set", page: 2, numbering: "greek" }).error.message).toMatch(/Unknown numbering/);
  });
});

describe("id.text.thread", () => {
  it("threads frames in order and adds mirrored pages until a long story fits", () => {
    const CAP = 100;
    const story = { length: 450, frames: [] as Frame[] };
    const storyObj = {
      get overflows() {
        return story.frames.length * CAP < story.length;
      },
      get characters() {
        return { length: story.length };
      }
    };
    let nextId = 1;
    class Frame {
      id = nextId++;
      name = "";
      isValid = true;
      contents = "";
      previousTextFrame: Frame | null = null;
      _next: Frame | null = null;
      textFramePreferences = { textColumnCount: 2, textColumnGutter: 5 };
      appliedObjectStyle = null;
      constructor(public geometricBounds: number[], public parentPage: Page) {}
      get nextTextFrame() {
        return this._next;
      }
      set nextTextFrame(f: Frame | null) {
        this._next = f;
        if (f) f.previousTextFrame = this;
        story.frames = [];
        let x: Frame | null = this;
        while (x && x.previousTextFrame) x = x.previousTextFrame;
        while (x) {
          story.frames.push(x);
          x = x._next;
        }
      }
      get parentStory() {
        return storyObj;
      }
      get characters() {
        const i = story.frames.indexOf(this);
        const n = Math.max(0, Math.min(CAP, story.length - i * CAP));
        return { length: n, lastItem: () => ({ index: i * CAP + n - 1 }) };
      }
    }
    Object.defineProperty(Frame, "name", { value: "TextFrame" });
    const all: Frame[] = [];
    class Page {
      appliedMaster = "A-Parent";
      textFrames = {
        add: (props: { geometricBounds: number[] }) => {
          const f = new Frame(props.geometricBounds, this);
          all.push(f);
          return f;
        }
      };
      constructor(public name: string, public side: string) {}
    }
    const p1 = new Page("1", "right");
    const p2 = new Page("2", "left");
    const pages = [p1, p2];
    const f1 = new Frame([20, 20, 280, 190], p1);
    f1.name = "corpo1";
    const f2 = new Frame([20, 20, 280, 190], p2);
    f2.name = "corpo2";
    all.push(f1, f2);
    story.frames = [f1];
    const doc = {
      allPageItems: all,
      documentPreferences: { pageWidth: 210 },
      pages: Object.assign(pages, {
        add(_where: string, after: Page) {
          const side = after.side === "left" ? "right" : "left";
          const p = new Page(String(pages.length + 1), side);
          pages.splice(pages.indexOf(after) + 1, 0, p);
          return p;
        }
      }),
      pageItems: { itemByID: (id: number) => ({ getElements: () => [all.find((f) => f.id === id)] }) }
    };
    const run = sandboxFor({ ...enums, app: { activeDocument: doc, documents: { length: 1 }, selection: [] } });
    const r = run("id.text.thread", { names: ["corpo1", "corpo2"], addPagesUntilFits: true });
    expect(r.ok).toBe(true);
    expect(r.data.chain.map((c: { page: string }) => c.page)).toEqual(["1", "2", "3", "4", "5"]);
    expect(r.data.addedPages).toEqual(["3", "4", "5"]);
    expect(r.data.overset).toBe(false);
    // page 3 is a right page after a left one: the frame mirrors across the page width
    const f3 = all.find((f) => f.parentPage.name === "3")!;
    expect(f3.geometricBounds).toEqual([20, 20, 280, 190]);
    expect(f3.textFramePreferences.textColumnCount).toBe(2);
    const st = run("id.text.thread", { names: ["corpo1"], operation: "status" });
    expect(st.data.chain).toHaveLength(5);
  });
});

describe("table and cell styles", () => {
  it("builds zebra table styles from cell styles and reports refused properties as warnings", () => {
    const made: Record<string, Record<string, unknown>> = {};
    const coll = (kind: string) => ({
      itemByName: (n: string) => made[`${kind}:${n}`] ?? { isValid: false },
      add: (o: { name: string }) => (made[`${kind}:${o.name}`] = { isValid: true, name: o.name })
    });
    const doc = {
      paragraphStyles: coll("p"),
      characterStyles: coll("c"),
      objectStyles: coll("o"),
      tableStyles: coll("t"),
      cellStyles: coll("cell"),
      swatches: { itemByName: (n: string) => ({ isValid: true, name: n }) },
      colors: { itemByName: (n: string) => ({ isValid: true, name: n }) }
    };
    made["p:Tabela"] = { isValid: true, name: "Tabela" };
    const run = sandboxFor({ ...enums, app: { activeDocument: doc, documents: { length: 1 } } });
    const c = run("id.style.manage", { kind: "cell", operation: "create", name: "Cabeçalho", properties: { fillColor: "Black", paragraphStyle: "Tabela", inset: 2, verticalAlign: "center" } });
    expect(c.ok).toBe(true);
    expect(made["cell:Cabeçalho"].topInset).toBe(2);
    expect(made["cell:Cabeçalho"].verticalJustification).toBe("c");
    const t = run("id.style.manage", { kind: "table", operation: "create", name: "Preços", properties: { headerCellStyle: "Cabeçalho", alternateRowFill: "Black", alternateRowTint: 10, borderWeight: 0.5 } });
    expect(t.ok).toBe(true);
    expect(made["t:Preços"].alternatingFills).toBeUndefined();
    expect(made["t:Preços"].endRowFillColor).toEqual({ isValid: true, name: "Black" });
    expect(made["t:Preços"].endRowFillTint).toBe(10);
    expect(made["t:Preços"].topBorderStrokeWeight).toBe("0.5pt");
    expect(made["t:Preços"].headerRegionCellStyle).toBe(made["cell:Cabeçalho"]);
    const bad = run("id.style.manage", { kind: "table", operation: "create", name: "X", properties: { bodyCellStyle: "Nada" } });
    expect(bad.error.message).toMatch(/Cell style 'Nada' not found/);
  });
});

describe("id.toc.create", () => {
  it("collects existing heading styles, skips missing ones and places the frame on the page", () => {
    const entries: Array<Record<string, unknown>> = [];
    const tocStyle = {
      isValid: true,
      title: "",
      tocStyleEntries: Object.assign(entries, {
        add: (o: Record<string, unknown>) => {
          const e = { ...o };
          entries.push(e);
          return e;
        },
        everyItem: () => ({ remove: () => entries.splice(0) })
      })
    };
    const page = { id: 7, name: "2", marginPreferences: { left: 15, top: 15 } };
    const frame: Record<string, unknown> = {
      isValid: true,
      id: 55,
      name: "",
      parentPage: { id: 1 },
      geometricBounds: [0, 0, 10, 10],
      moved: null,
      move(p: unknown) {
        this.moved = p;
        this.parentPage = p;
      },
      parentStory: { paragraphs: { length: 6 }, overflows: false }
    };
    const styles: Record<string, boolean> = { "Título 1": true, "Título 2": true };
    const doc = {
      pages: [{ id: 6, name: "1" }, page],
      tocStyles: { itemByName: () => ({ isValid: false }), add: () => tocStyle },
      paragraphStyles: { itemByName: (n: string) => ({ isValid: !!styles[n], name: n }) },
      createTOC: (_s: unknown, _r: boolean, _b: unknown, place: number[]) => {
        frame.place = place;
        return [{ textContainers: [frame] }];
      }
    };
    const run = sandboxFor({ ...enums, app: { activeDocument: doc, documents: { length: 1 }, activeWindow: {} } });
    const r = run("id.toc.create", {
      page: 2,
      title: "Sumário",
      rect: { x: 20, y: 30, width: 120, height: 200 },
      entries: [
        { paragraphStyle: "Título 1", level: 1 },
        { paragraphStyle: "Título 2", level: 2, pageNumber: "none" },
        { paragraphStyle: "Título 3", level: 3 }
      ]
    });
    expect(r.ok).toBe(true);
    expect(entries.map((e) => e.name)).toEqual(["Título 1", "Título 2"]);
    expect(entries[1].pageNumberPosition).toBe("none");
    expect(frame.moved).toBe(page);
    expect(frame.geometricBounds).toEqual([30, 20, 230, 140]);
    expect(r.data.warnings.join(" ")).toMatch(/Título 3/);
    expect(tocStyle.title).toBe("Sumário");
  });
});
