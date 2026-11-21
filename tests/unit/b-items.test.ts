import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { fitInside, downscaleBase64 } from "../../src/media/downscale.js";
import { findFfmpeg, run } from "../../src/media/ffmpeg.js";
import { imageSize } from "../../src/core/usage-log.js";
import * as os from "node:os";
import * as path from "node:path";

describe("B6: previews shrink to the size asked", () => {
  it("fits inside the longest side with even sizes", () => {
    expect(fitInside(400, 300, 800)).toBeNull();
    expect(fitInside(805, 536, 400)).toEqual({ w: 400, h: 266 });
    expect(fitInside(1000, 2000, 500)).toEqual({ w: 250, h: 500 });
  });

  it.skipIf(!findFfmpeg())("downscales a real JPEG with ffmpeg", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shr-"));
    const f = path.join(dir, "a.jpg");
    await run(findFfmpeg()!, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=805x536", "-frames:v", "1", f]);
    const b64 = fs.readFileSync(f).toString("base64");
    const r = await downscaleBase64(b64, 400);
    expect(r.resized).toBe(true);
    expect(imageSize(r.base64)).toEqual({ w: 400, h: 266 });
    const same = await downscaleBase64(r.base64, 800);
    expect(same.resized).toBe(false);
  });

  it("returns the input unchanged when it is not an image", async () => {
    const r = await downscaleBase64(Buffer.from("not an image").toString("base64"), 100);
    expect(r.resized).toBe(false);
  });
});

describe("B3 / B9 small additions", () => {
  it("ae_create_layer handler sets justification and leading", () => {
    const src = fs.readFileSync("src/extendscript/ae-handlers.jsx", "utf8");
    expect(src).toContain("params.justification");
    expect(src).toContain("textDoc.autoLeading = false");
  });

  it("names an open tool for every app jradb_launch_app knows", async () => {
    const { OPEN_TOOL } = await import("../../src/tools/shared/index.js");
    expect(Object.keys(OPEN_TOOL).sort()).toEqual(["after-effects", "illustrator", "indesign", "lightroom", "photoshop", "premiere"]);
  });
});

describe("B10: fuzzy terms fix names the speech engine heard wrong", async () => {
  const { applyTerms, buildCues } = await import("../../src/media/captions.js");
  it("fixes split, accented and misspelled names and keeps punctuation", () => {
    expect(applyTerms("Bem-vindo à leva tio, tudo bem?", ["Levatio"])).toBe("Bem-vindo à Levatio, tudo bem?");
    expect(applyTerms("Na Levátio usamos alinhadores", ["Levatio"])).toBe("Na Levatio usamos alinhadores");
    expect(applyTerms("pergunte ao chat gpt.", ["ChatGPT"])).toBe("pergunte ao ChatGPT.");
    expect(applyTerms("o invisaline é transparente", ["Invisalign"])).toBe("o Invisalign é transparente");
  });
  it("leaves unrelated words and short terms alone", () => {
    expect(applyTerms("a escova e o fio dental", ["Levatio", "ABC"])).toBe("a escova e o fio dental");
    expect(applyTerms("", ["Levatio"])).toBe("");
  });
  it("is applied by buildCues", () => {
    const cues = buildCues({ language: "pt", duration: 3, segments: [{ start: 0, end: 3, text: "bem vindo à leva tio" }] }, { terms: ["Levatio"] });
    expect(cues.map((c) => c.text).join(" ")).toContain("Levatio");
  });
});

describe("B1: render watch", async () => {
  const { waitForRender } = await import("../../src/media/render-watch.js");
  it("resolves when the file stops growing", async () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rw-")), "out.mp4");
    let n = 0;
    const timer = setInterval(() => {
      if (n++ < 3) fs.appendFileSync(f, Buffer.alloc(1000));
    }, 30);
    const r = await waitForRender(f, { stableMs: 150, intervalMs: 20 });
    clearInterval(timer);
    expect(r.bytes).toBe(3000);
  });
  it("fails when nothing is written", async () => {
    await expect(waitForRender(path.join(os.tmpdir(), "nunca.mp4"), { startTimeoutMs: 60, intervalMs: 20 })).rejects.toThrow(/did not start writing/);
  });
});

describe("Phase 4: format table review date", async () => {
  const { FORMATS_REVIEWED, formatsReviewAge } = await import("../../src/core/formats.js");
  it("matches the date written in craft-formatos and counts days", () => {
    const ref = fs.readFileSync("skills/fundamentos/craft-formatos/references/formatos.md", "utf8");
    const [y, m, d] = FORMATS_REVIEWED.split("-");
    expect(ref).toContain(`Revisado em ${d}/${m}/${y}`);
    expect(formatsReviewAge(new Date(`${FORMATS_REVIEWED}T12:00:00Z`))).toBe(0);
    expect(formatsReviewAge(new Date("2027-03-01T00:00:00Z"))).toBeGreaterThan(92);
  });
});
