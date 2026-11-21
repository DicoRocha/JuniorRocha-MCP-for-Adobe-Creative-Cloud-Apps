import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Windows COM fallback (DoJavaScript/DoScript) reads the handlers in the ANSI code page: any non-ASCII
// character in code turns into mojibake ("Ã¡"). Strings must use \uXXXX escapes; comments may stay accented.
describe("ExtendScript handlers are ASCII in code", () => {
  const dir = path.join(__dirname, "../../src/extendscript");
  for (const f of fs.readdirSync(dir).filter((n) => /-handlers\.jsx$/.test(n))) {
    it(f, () => {
      const bad = fs
        .readFileSync(path.join(dir, f), "utf8")
        .split("\n")
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => !/^\s*(\/\/|\/\*|\*)/.test(l) && /[^\x00-\x7f]/.test(l.split(" // ")[0]))
        .map(([n, l]) => `${n}: ${l.trim().slice(0, 80)}`);
      expect(bad).toEqual([]);
    });
  }
});
