/**
 * jradb_contact_sheet: natural file order, skipped "_" files/folders, and (when ffmpeg exists) decoding images and video.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { sheetFiles } from "../../src/tools/shared/index.js";
import { decodeImageRgb, findFfmpeg } from "../../src/media/ffmpeg.js";
import { encodePng } from "../../src/core/png.js";

describe("contact sheet files", () => {
  it("orders 1, 2, 10 naturally, skips _files, _folders and other types, filters by name", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sheet-"));
    for (const n of ["10_story.png", "2_feed.jpg", "1_feed.png", "_folha.png", "notas.txt"]) fs.writeFileSync(path.join(dir, n), "x");
    fs.mkdirSync(path.join(dir, "_to_delete"));
    fs.writeFileSync(path.join(dir, "_to_delete", "3_old.png"), "x");
    fs.mkdirSync(path.join(dir, "video"));
    fs.writeFileSync(path.join(dir, "video", "4_reel.mp4"), "x");
    const names = (l: string[]) => l.map((f) => path.relative(dir, f).replace(/\\/g, "/"));
    expect(names(sheetFiles(dir))).toEqual(["1_feed.png", "2_feed.jpg", "10_story.png"]);
    expect(names(sheetFiles(dir, true))).toEqual(["1_feed.png", "2_feed.jpg", "10_story.png", "video/4_reel.mp4"]);
    expect(names(sheetFiles(dir, true, "feed"))).toEqual(["1_feed.png", "2_feed.jpg"]);
  });

  it.skipIf(!findFfmpeg())("decodes a PNG and a video frame at the requested width", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sheet-"));
    const png = path.join(dir, "a.png");
    fs.writeFileSync(png, encodePng({ width: 40, height: 80, data: new Uint8Array(40 * 80 * 3).fill(200) }));
    const img = await decodeImageRgb(png, 20);
    expect([img.width, img.height]).toEqual([20, 40]);
    expect(img.data[0]).toBe(200);
    const mp4 = path.join(dir, "v.mp4");
    execFileSync(findFfmpeg()!, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:size=64x36:rate=10:duration=1", "-pix_fmt", "yuv420p", mp4]);
    const fr = await decodeImageRgb(mp4, 32, 0.5);
    expect([fr.width, fr.height]).toEqual([32, 18]);
    expect(fr.data[0]).toBeGreaterThan(200);
  });
});
