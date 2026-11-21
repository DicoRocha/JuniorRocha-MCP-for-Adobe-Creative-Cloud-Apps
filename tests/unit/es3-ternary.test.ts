/**
 * ExtendScript evaluates chained conditionals left to right: `x === 1 ? "a" : x === 2 ? "b" : "c"` returns "b"
 * for x === 1 (checked live in Photoshop and InDesign 2027). Every nested conditional in the .jsx files must be
 * wrapped in parentheses: `x === 1 ? "a" : (x === 2 ? "b" : "c")`.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

const dir = path.resolve(__dirname, "../../src/extendscript");

describe("ExtendScript sources", () => {
  it("have no unparenthesised nested conditional expressions", () => {
    const hits: string[] = [];
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".jsx"))) {
      const sf = ts.createSourceFile(f, fs.readFileSync(path.join(dir, f), "utf8"), ts.ScriptTarget.ES5, true, ts.ScriptKind.JS);
      const visit = (n: ts.Node): void => {
        if (ts.isConditionalExpression(n)) {
          for (const part of [n.whenTrue, n.whenFalse]) {
            if (ts.isConditionalExpression(part)) hits.push(`${f}:${sf.getLineAndCharacterOfPosition(part.getStart(sf)).line + 1}`);
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(hits).toEqual([]);
  });
});
