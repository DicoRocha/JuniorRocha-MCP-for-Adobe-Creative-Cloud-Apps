import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";

const EXTENDSCRIPT_DIR = path.resolve(__dirname, "../../src/extendscript");

const JSX_FILES = [
  "es3-runtime.jsx",
  "ae-handlers.jsx",
  "ai-handlers.jsx",
  "pr-handlers.jsx",
  "ps-handlers.jsx",
  "id-handlers.jsx"
];

describe("ExtendScript ES3 Compatibility & VM Sandbox", () => {
  it("enforces strict ECMAScript 3 syntax across all .jsx files (no const, let, arrow functions, or template literals)", () => {
    for (const fileName of JSX_FILES) {
      const fullPath = path.join(EXTENDSCRIPT_DIR, fileName);
      expect(fs.existsSync(fullPath)).toBe(true);
      const raw = fs.readFileSync(fullPath, "utf8");

      // Strip block and line comments before checking tokens
      const stripped = raw
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      expect(stripped, `${fileName} must not contain 'const '`).not.toMatch(/\bconst\s+/);
      expect(stripped, `${fileName} must not contain 'let '`).not.toMatch(/\blet\s+/);
      expect(stripped, `${fileName} must not contain arrow functions '=>'`).not.toMatch(/=>/);
      expect(stripped, `${fileName} must not contain template literals '\`'`).not.toMatch(/`/);
    }
  });


  it("never uses ES3 reserved words as unquoted keys or after a dot (ExtendScript rejects the whole script)", () => {
    // e.g. `{ in: "INCHES" }` made every InDesign command fail with a bare "EvalScript error.".
    const RESERVED =
      "break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|" +
      "function|if|import|in|instanceof|new|null|return|super|switch|this|throw|true|try|typeof|var|void|while|with";
    const keyRx = new RegExp("[{,]\\s*(" + RESERVED + ")\\s*:(?!:)");
    const dotRx = new RegExp("\\.\\s*(" + RESERVED + ")\\b");
    for (const fileName of JSX_FILES) {
      const stripped = fs
        .readFileSync(path.join(EXTENDSCRIPT_DIR, fileName), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
        .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
      expect(stripped, `${fileName}: quote reserved-word keys, e.g. { "in": ... }`).not.toMatch(keyRx);
      expect(stripped, `${fileName}: use obj["word"] instead of obj.word for reserved words`).not.toMatch(dotRx);
    }
  });
  it("serializes complex strings, Windows paths, and special characters in es3-runtime.jsx JSON polyfill", () => {
    const runtimeCode = fs.readFileSync(path.join(EXTENDSCRIPT_DIR, "es3-runtime.jsx"), "utf8");
    const sandbox: Record<string, unknown> = {
      JSON: undefined
    };
    vm.createContext(sandbox);
    vm.runInContext(runtimeCode, sandbox);

    const testPayload = {
      winPath: "D:\\INTELIGENCIA ARTIFICIAL\\DESENVOLVIMENTO\\MCPS ADOBE\\arquivo.aep",
      accents: "Composição Ação Vetorial 100%",
      numbers: [0, -42, 3.1415, NaN, Infinity],
      nested: { ok: true, empty: null }
    };

    const jsonStr = vm.runInContext(
      `JSON.stringify(${JSON.stringify(testPayload)})`,
      sandbox
    ) as string;

    const parsedBack = JSON.parse(jsonStr);
    expect(parsedBack.winPath).toBe(testPayload.winPath);
    expect(parsedBack.accents).toBe(testPayload.accents);
    expect(parsedBack.numbers).toEqual([0, -42, 3.1415, null, null]);
    expect(parsedBack.nested).toEqual({ ok: true, empty: null });
  });

  it("guarantees app.beginUndoGroup and app.endUndoGroup pairing on both success and exception in After Effects", () => {
    const runtimeCode = fs.readFileSync(path.join(EXTENDSCRIPT_DIR, "es3-runtime.jsx"), "utf8");
    const aeCode = fs.readFileSync(path.join(EXTENDSCRIPT_DIR, "ae-handlers.jsx"), "utf8");

    const undoEvents: string[] = [];

    function CompItemMock(this: Record<string, unknown>, name: string, w: number, h: number, pa: number, dur: number, fps: number) {
      this.id = 101;
      this.name = name;
      this.width = w;
      this.height = h;
      this.pixelAspect = pa;
      this.duration = dur;
      this.frameRate = fps;
      this.numLayers = 0;
      this.bgColor = [0, 0, 0];
      this.openInViewer = function () {};
    }

    const sandbox: Record<string, unknown> = {
      CompItem: CompItemMock,
      FolderItem: function () {},
      TextLayer: function () {},
      ShapeLayer: function () {},
      CameraLayer: function () {},
      LightLayer: function () {},
      app: {
        version: "25.2",
        beginUndoGroup: (name: string) => undoEvents.push(`begin:${name}`),
        endUndoGroup: () => undoEvents.push("end"),
        project: {
          numItems: 0,
          bitsPerChannel: 16,
          items: {
            addComp: (name: string, w: number, h: number, pa: number, dur: number, fps: number) =>
              new (CompItemMock as unknown as new (...args: unknown[]) => unknown)(name, w, h, pa, dur, fps)
          }
        }
      }
    };

    vm.createContext(sandbox);
    vm.runInContext(`${runtimeCode}\n${aeCode}`, sandbox);

    // 1. Successful execution
    const resSuccessRaw = vm.runInContext(
      `__mcpExecuteWithUndo("after-effects", "Create Comp Test", function() {
        return __mcpDispatch("ae.comp.create", { name: "Hero Comp", width: 1920, height: 1080, duration: 8, frameRate: 60 }, {});
      })`,
      sandbox
    ) as string;

    const resSuccess = JSON.parse(resSuccessRaw);
    expect(resSuccess.ok).toBe(true);
    expect(resSuccess.data.name).toBe("Hero Comp");
    expect(undoEvents).toEqual(["begin:Create Comp Test", "end"]);

    // 2. Failing execution must still call endUndoGroup!
    undoEvents.length = 0;
    const resErrorRaw = vm.runInContext(
      `__mcpExecuteWithUndo("after-effects", "Failing Action", function() {
        return __mcpDispatch("ae.unknown.action", {}, {});
      })`,
      sandbox
    ) as string;

    const resError = JSON.parse(resErrorRaw);
    expect(resError.ok).toBe(false);
    expect(resError.error.message).toContain("Unknown After Effects action");
    expect(undoEvents).toEqual(["begin:Failing Action", "end"]);
  });
});
