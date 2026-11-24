import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { kitCaptionTerms } from "../../src/core/brand-kit.js";
import { buildCues } from "../../src/media/captions.js";

describe("caption spelling from the brand kit", () => {
  it("reads client, termos and glossario, and fixes the captions with them", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kit-")), "kit.json");
    fs.writeFileSync(f, JSON.stringify({ cliente: "Junior Rocha", termos: ["Photoshop"], glossario: { Roche: "Rocha" } }));
    const k = kitCaptionTerms(f);
    expect(k.terms).toEqual(["Junior Rocha", "Photoshop"]);
    const cues = buildCues({ segments: [{ start: 0, end: 3, text: "Eu sou o Junior Roche e uso o fotoshop" }] }, { glossary: k.glossary, terms: k.terms });
    const text = cues.map((c) => c.text).join(" ");
    expect(text).toContain("Rocha");
  });
});
