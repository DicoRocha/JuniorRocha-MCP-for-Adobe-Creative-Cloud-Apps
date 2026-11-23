import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { applyArgs, normalizeLoudness, parseLoudnorm } from "../../src/media/loudnorm.js";
import { findFfmpeg } from "../../src/media/ffmpeg.js";

const ff = findFfmpeg();

describe("loudness normalisation", () => {
  it("maps streams by type, never by index", () => {
    const m = { input_i: "-20", input_tp: "-3", input_lra: "5", input_thresh: "-30", target_offset: "0.2" };
    const a = applyArgs("in.mp4", "out.mp4", { lufs: -14, truePeak: -1.5, lra: 11 }, m);
    expect(a).toContain("0:v?");
    expect(a).toContain("0:a:0");
    expect(a.join(" ")).not.toMatch(/-map 0:0|-map 0:1/);
    expect(a).toContain("copy");
  });

  it("reads loudnorm's JSON block", () => {
    const m = parseLoudnorm('noise\n[Parsed_loudnorm_0 @ x]\n{\n "input_i" : "-23.1",\n "input_tp" : "-4.0",\n "input_lra" : "6.1",\n "input_thresh" : "-33.5",\n "target_offset" : "0.4"\n}\n');
    expect(m.input_i).toBe("-23.1");
  });

  it.skipIf(!ff)("brings a quiet video to -14 LUFS with audio as the first stream (Media Encoder order)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ln-"));
    const src = path.join(dir, "src.mp4");
    execFileSync(ff!, [
      "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=4,volume=0.05", "-f", "lavfi", "-i", "color=black:s=64x64:d=4:r=10",
      "-map", "0:a", "-map", "1:v", "-c:a", "aac", "-c:v", "libx264", "-preset", "ultrafast", src
    ]);
    const out = path.join(dir, "norm.mp4");
    const r = await normalizeLoudness(src, out);
    expect(r.before.lufs).toBeLessThan(-25);
    expect(Math.abs(r.after.lufs + 14)).toBeLessThan(1.5);
    expect(r.after.truePeak).toBeLessThanOrEqual(-1.0);
    let info = "";
    try {
      execFileSync(ff!, ["-hide_banner", "-i", out], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      info = String((e as { stderr?: Buffer }).stderr);
    }
    expect(info).toMatch(/Video: h264/);
    expect(info).toMatch(/Audio: aac/);
  }, 60000);
});
