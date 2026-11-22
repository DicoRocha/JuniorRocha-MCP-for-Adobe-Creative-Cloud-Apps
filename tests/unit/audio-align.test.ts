/**
 * 22/11/2026: cuts planned from a phone video landed 0,34 s late (the first syllable of each phrase was lost):
 * the audio stream started before the first video frame and the analysis counted from the first audio sample.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { audioLeadSeconds, decodeToPcm, findFfmpeg } from "../../src/media/ffmpeg.js";

const ff = findFfmpeg();
describe.skipIf(!ff)("audio aligned to the first video frame", () => {
  it("measures the lead and decodes from the first frame", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-align-"));
    const f = path.join(dir, "phone.mp4");
    // video starts 0,4 s after the audio; a 1 kHz beep sits at audio time 1,0-1,2 s (= 0,6 s of clip time)
    const v = path.join(dir, "v.mp4"), a = path.join(dir, "a.wav");
    execFileSync(ff as string, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=30:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", v]);
    execFileSync(ff as string, ["-v", "error", "-y", "-f", "lavfi", "-i", "aevalsrc='if(between(t,1,1.2),0.8*sin(2*PI*1000*t),0)':s=16000:d=3.4", a]);
    execFileSync(ff as string, ["-v", "error", "-y", "-itsoffset", "0.4", "-i", v, "-i", a, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", f]);
    const lead = await audioLeadSeconds(f);
    expect(lead).toBeGreaterThan(0.3);
    expect(lead).toBeLessThan(0.5);
    const pcm = await decodeToPcm(f, 16000);
    const onset = pcm.findIndex((v) => Math.abs(v) > 0.2) / 16000;
    expect(onset).toBeGreaterThan(0.5);
    expect(onset).toBeLessThan(0.7);
    const raw = await decodeToPcm(f, 16000, undefined, { alignToVideo: false });
    const rawOnset = raw.findIndex((v) => Math.abs(v) > 0.2) / 16000;
    expect(rawOnset).toBeGreaterThan(0.9);
    fs.rmSync(dir, { recursive: true, force: true });
  }, 30000);
});

import { detectSilences } from "../../src/media/audio-analysis.js";
describe("pauses end where the soft onset begins", () => {
  it("keeps a quiet first syllable inside the speech", () => {
    const sr = 16000, x = new Float32Array(sr * 3);
    const amp = (db: number) => Math.pow(10, db / 20) * Math.SQRT2;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const db = t < 1.85 ? -70 : t < 2.0 ? -42 : -14; // pause, soft "ex" (below the -45..-30 threshold band), loud word
      x[i] = amp(db) * Math.sin(2 * Math.PI * 220 * t);
    }
    // a loud word before the pause so the floor is the pause
    for (let i = 0; i < sr * 0.5; i++) x[i] = amp(-14) * Math.sin(2 * Math.PI * 220 * (i / sr));
    const { silences } = detectSilences(x, sr, { minSilence: 0.4 });
    const pause = silences.find((s) => s.start < 1 && s.end > 1.5)!;
    expect(pause.end).toBeLessThan(1.9);
  });
});

describe("pr_apply_cut_plan leaves no 1-frame gaps", () => {
  it("places each piece where the previous one really ended", () => {
    for (const p of ["src/extendscript/pr-handlers.jsx", "bridges/cep-universal-bridge/jsx/pr-handlers.jsx"]) {
      const s = fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
      const block = s.slice(s.indexOf('action === "pr.cut.assemble"'), s.indexOf('action === "pr.audio.keyframes"'));
      expect(block, p).toContain("at = realEnd;");
      expect(block, p).not.toContain("at += len;");
    }
  });
});
