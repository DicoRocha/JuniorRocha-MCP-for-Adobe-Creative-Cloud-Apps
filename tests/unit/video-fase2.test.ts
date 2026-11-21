/**
 * Phase 2 video block: audio analysis, captions, music bed, and the Premiere / After Effects handlers
 * for captions, cut plans, volume keyframes, MOGRT placement and MOGRT export.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vm from "node:vm";
import {
  rmsEnvelope,
  measureLoudness,
  detectSilences,
  invertRanges,
  buildCutPlan,
  mapTimeThroughCuts,
  detectBeats,
  duckingKeyframes,
  musicBedKeys,
  dbToPremiereLevel,
  premiereLevelToDb
} from "../../src/media/audio-analysis.js";
import { applyGlossary, buildCues, toSrt, parseSrt, srtTime, balanceLines, segmentToCues } from "../../src/media/captions.js";
import { writeWav, readWav, resampleLinear, findFfmpeg, resetFfmpegCache } from "../../src/media/ffmpeg.js";
import { whisperFiles, modelsDir, loadSherpa } from "../../src/media/transcribe.js";
import { runJob, getJob, jobView } from "../../src/media/jobs.js";

const SR = 16000;
function tone(sec: number, amp = 0.3, hz = 220): Float32Array {
  const n = Math.round(sec * SR);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR);
  return a;
}
function silence(sec: number, noise = 0.0005): Float32Array {
  const n = Math.round(sec * SR);
  const a = new Float32Array(n);
  let x = 1;
  for (let i = 0; i < n; i++) {
    x = (x * 16807) % 2147483647;
    a[i] = noise * ((x / 2147483647) * 2 - 1);
  }
  return a;
}
function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe("audio analysis", () => {
  // 1 s speech, 0.8 s pause, 1.5 s speech, 0.2 s breath, 1 s speech, 1 s tail
  const sig = concat(tone(1), silence(0.8), tone(1.5), silence(0.2), tone(1), silence(1));

  it("measures levels", () => {
    const l = measureLoudness(sig, SR);
    expect(l.duration).toBeCloseTo(5.5, 2);
    expect(l.peakDb).toBeCloseTo(-10.5, 0);
    expect(l.noiseFloorDb).toBeLessThan(-60);
    expect(rmsEnvelope(sig, SR).db.length).toBeGreaterThan(500);
  });

  it("finds the pauses but not the short breath, and inverts them into speech", () => {
    const { silences, thresholdDb } = detectSilences(sig, SR, { minSilence: 0.4 });
    expect(thresholdDb).toBeLessThanOrEqual(-30);
    expect(silences).toHaveLength(2);
    expect(silences[0].start).toBeCloseTo(1, 1);
    expect(silences[0].end).toBeCloseTo(1.8, 1);
    expect(silences[1].start).toBeCloseTo(4.5, 1);
    const speech = invertRanges(silences, 5.5);
    expect(speech).toHaveLength(2);
    expect(speech[1].end).toBeCloseTo(4.5, 1);
  });

  it("builds a cut plan with padding, keeps short gaps, maps times through it", () => {
    const plan = buildCutPlan(
      [
        { start: 0, end: 1 },
        { start: 1.8, end: 3.3 },
        { start: 3.5, end: 4.5 }
      ],
      5.5,
      { padding: 0.1, minGap: 0.35 }
    );
    expect(plan.keep).toEqual([
      { start: 0, end: 1.1 },
      { start: 1.7, end: 4.6 }
    ]);
    expect(plan.remove[0]).toEqual({ start: 1.1, end: 1.7 });
    expect(plan.newDuration).toBeCloseTo(4, 3);
    expect(mapTimeThroughCuts(2, plan.keep)).toBeCloseTo(1.4, 3);
    expect(mapTimeThroughCuts(1.5, plan.keep)).toBeNull();
  });

  it("finds the tempo of a click track", () => {
    const beat = 60 / 120;
    const parts: Float32Array[] = [];
    for (let i = 0; i < 24; i++) parts.push(tone(0.08, 0.6, 1000), silence(beat - 0.08));
    const r = detectBeats(concat(...parts), SR);
    expect(r.bpm).not.toBeNull();
    expect(Math.abs((r.bpm as number) - 120)).toBeLessThan(4);
    expect(r.beats.length).toBeGreaterThan(15);
    expect(r.onsets.length).toBeGreaterThan(15);
  });

  it("ducks a music bed under speech with fades and Premiere's level scale", () => {
    const keys = duckingKeyframes([{ start: 2, end: 4 }], { duckDb: 12, attack: 0.2, release: 0.5 });
    expect(keys).toEqual([
      { time: 1.8, db: 0 },
      { time: 2, db: -12 },
      { time: 4, db: -12 },
      { time: 4.5, db: 0 }
    ]);
    const bed = musicBedKeys([{ start: 2, end: 4 }], { baseDb: -6, duckDb: 12, fadeIn: 0.5, fadeOut: 1, endSeconds: 10 });
    expect(bed[0]).toEqual({ time: 0, db: -60 });
    expect(bed[1]).toEqual({ time: 0.5, db: -6 });
    expect(bed.find((k) => k.time === 2)?.db).toBe(-18);
    expect(bed[bed.length - 2]).toEqual({ time: 9, db: -6 });
    expect(bed[bed.length - 1]).toEqual({ time: 10, db: -60 });
    expect(bed.every((k, i) => i === 0 || k.time > bed[i - 1].time)).toBe(true);
    expect(bed.every((k) => k.db <= -6)).toBe(true);
    expect(dbToPremiereLevel(0)).toBeCloseTo(0.177828, 5);
    expect(premiereLevelToDb(1)).toBe(15);
  });
});

describe("captions", () => {
  const t = {
    segments: [
      { start: 0.17, end: 1.67, text: "quem nunca recebeu." },
      { start: 2.12, end: 6.4, text: "uma arte feita no chat de apt do seu cliente para você ter que refazer." },
      { start: 7.05, end: 15.14, text: "Isso é algo que está se tornando cada vez mais comum. Imagina agora que essa arte tem muito texto e você tem que refazer essa arte." }
    ]
  };

  it("applies a glossary on word boundaries", () => {
    expect(applyGlossary("feita no chat de apt do cliente", { "chat de apt": "ChatGPT" })).toBe("feita no ChatGPT do cliente");
    expect(applyGlossary("encamadas e camadas", { encamadas: "em camadas" })).toBe("em camadas e camadas");
    expect(applyGlossary("Photoshop", { shop: "X" })).toBe("Photoshop");
  });

  it("splits into short balanced cues that never cross a sentence end", () => {
    const cues = buildCues(t, { maxChars: 28, maxLines: 2, glossary: { "chat de apt": "ChatGPT" } });
    for (const c of cues) {
      for (const line of c.text.split("\n")) expect(line.length).toBeLessThanOrEqual(30);
      expect(c.text.split("\n").length).toBeLessThanOrEqual(2);
      expect(c.end).toBeGreaterThan(c.start);
    }
    const joined = cues.map((c) => c.text.replace(/\n/g, " ")).join(" | ");
    expect(joined).toContain("ChatGPT");
    expect(joined).toMatch(/comum\. \|/); // the sentence ends the cue
    expect(cues.every((c, i) => i === 0 || c.start >= cues[i - 1].end)).toBe(true);
    expect(cues.some((c) => c.text.split(/\s+/).length === 1 && !/[!?.]$/.test(c.text))).toBe(false);
  });

  it("balances two lines", () => {
    expect(balanceLines("Isso é algo que está se tornando cada vez".split(" "), 2, 24)).toEqual(["Isso é algo que está", "se tornando cada vez"]);
    expect(balanceLines(["curto"], 2, 24)).toEqual(["curto"]);
  });

  it("re-times cues to an edited clip and drops cues that were cut", () => {
    const cues = buildCues(
      { segments: [{ start: 0, end: 1, text: "eins zwei" }, { start: 2, end: 3, text: "drei vier" }, { start: 5, end: 6, text: "fünf sechs" }] },
      { keep: [{ start: 0, end: 1.1 }, { start: 4.9, end: 6.2 }], minDuration: 0.5 }
    );
    expect(cues.map((c) => c.text)).toEqual(["eins zwei", "fünf sechs"]);
    expect(cues[1].start).toBeCloseTo(1.2, 2);
  });

  it("writes and reads SRT", () => {
    expect(srtTime(3723.0456)).toBe("01:02:03,046");
    const cues = buildCues(t, { maxChars: 32 });
    const back = parseSrt("\uFEFF" + toSrt(cues).replace(/\n/g, "\r\n"));
    expect(back.length).toBe(cues.length);
    expect(back[0].text).toBe(cues[0].text);
    expect(back[2].start).toBeCloseTo(cues[2].start, 3);
  });

  it("estimates word timing when the engine gave none", () => {
    const c = segmentToCues({ start: 10, end: 12, text: "a b c d" }, { maxChars: 3, maxLines: 1 });
    expect(c[0].start).toBe(10);
    expect(c[c.length - 1].end).toBeCloseTo(12, 3);
  });
});

describe("audio files and engine plumbing", () => {
  it("round-trips a WAV and resamples", () => {
    const f = path.join(os.tmpdir(), `mcp-test-${Date.now()}.wav`);
    writeWav(f, tone(0.5), SR);
    const w = readWav(f);
    expect(w.sampleRate).toBe(SR);
    expect(w.samples.length).toBe(8000);
    expect(Math.abs(w.samples[100] - tone(0.5)[100])).toBeLessThan(0.001);
    expect(resampleLinear(w.samples, 16000, 8000).length).toBe(4000);
    fs.unlinkSync(f);
  });

  it("finds ffmpeg through JRADB_MCP_FFMPEG", () => {
    const f = path.join(os.tmpdir(), "fake-ffmpeg.exe");
    fs.writeFileSync(f, "");
    const before = process.env.JRADB_MCP_FFMPEG;
    process.env.JRADB_MCP_FFMPEG = f;
    resetFfmpegCache();
    expect(findFfmpeg()).toBe(f);
    process.env.JRADB_MCP_FFMPEG = before;
    resetFfmpegCache();
    fs.unlinkSync(f);
  });

  it("keeps Whisper models in the models folder and explains a missing engine", () => {
    const before = process.env.JRADB_MCP_MODELS;
    process.env.JRADB_MCP_MODELS = "/tmp/models";
    expect(modelsDir()).toBe("/tmp/models");
    expect(whisperFiles("small").encoder).toBe(path.join("/tmp/models", "sherpa-onnx-whisper-small", "small-encoder.int8.onnx"));
    process.env.JRADB_MCP_MODELS = before;
    let installed = true;
    try {
      loadSherpa();
    } catch (e) {
      installed = false;
      expect((e as { code: string }).code).toBe("TRANSCRIBER_NOT_INSTALLED");
    }
    expect(typeof installed).toBe("boolean");
  });

  it("returns a job id when the work outlives the wait, then the result", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const job = await runJob("t", async () => {
      await gate;
      return 42;
    }, 10);
    expect(jobView(job).status).toBe("running");
    release();
    await new Promise((r) => setTimeout(r, 5));
    expect(jobView(getJob(job.id)!).result).toBe(42);
  });
});

// ---------------------------------------------------------------- ExtendScript handlers
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
function sandboxFor(file: string, extra: Record<string, unknown>) {
  const sandbox: Record<string, unknown> = { Units: { PIXELS: "PIXELS" }, DialogModes: { NO: "NO" }, ...extra };
  vm.createContext(sandbox);
  vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read(`src/extendscript/${file}`)}`, sandbox);
  return (action: string, params: unknown) =>
    JSON.parse(
      vm.runInContext(`__mcpExecuteWithUndo("x", "t", function() { return __mcpDispatch(${JSON.stringify(action)}, ${JSON.stringify(params)}, {}); })`, sandbox) as string
    );
}
class FakeFile {
  fsName: string;
  exists: boolean;
  length = 10;
  name: string;
  parent: { fsName: string; exists: boolean; create: () => boolean };
  constructor(p: string) {
    this.fsName = p;
    this.exists = !/missing/.test(p);
    this.name = p.split("/").pop() || p;
    this.parent = { fsName: p.split("/").slice(0, -1).join("/"), exists: true, create: () => true };
  }
  remove() {
    return true;
  }
  rename() {
    return true;
  }
}
class Time {
  seconds = 0;
}

describe("Premiere handlers", () => {
  it("imports an SRT and creates a caption track", () => {
    const items: Array<{ name: string; type: number; getMediaPath: () => string }> = [];
    const created: unknown[] = [];
    const seq = {
      captionTracks: { numTracks: 0 },
      createCaptionTrack: (item: unknown, start: number, fmt: number) => {
        created.push([item, start, fmt]);
        seq.captionTracks.numTracks++;
        return true;
      }
    };
    const run = sandboxFor("pr-handlers.jsx", {
      File: FakeFile,
      ProjectItemType: { BIN: 2 },
      Sequence: { CAPTION_FORMAT_SUBTITLE: 7, CAPTION_FORMAT_608: 1 },
      app: {
        project: {
          activeSequence: seq,
          rootItem: { children: Object.assign(items, { numItems: 0 }) },
          getInsertionBin: () => ({}),
          importFiles: (paths: string[]) => {
            items.push({ name: "reel.srt", type: 1, getMediaPath: () => paths[0] });
            (items as unknown as { numItems: number }).numItems = items.length;
          }
        }
      }
    });
    const r = run("pr.captions.import", { filePath: "D:/v/reel.srt", startSeconds: 1.5 });
    expect(r.ok).toBe(true);
    expect(r.data.captionTracksAfter).toBe(1);
    expect(created[0]).toEqual([items[0], 1.5, 7]);
    expect(run("pr.captions.import", { filePath: "D:/v/missing.srt" }).ok).toBe(false);
  });

  it("assembles the kept ranges back to back and restores the clip's in/out", () => {
    const calls: string[] = [];
    const item = {
      name: "VID.mp4",
      type: 1,
      getMediaPath: () => "D:/v/VID.mp4",
      getInPoint: () => ({ seconds: 0 }),
      getOutPoint: () => ({ seconds: 0 }),
      setInPoint: (t: string, m: number) => calls.push(`in ${t} ${m}`),
      setOutPoint: (t: string, m: number) => calls.push(`out ${t} ${m}`),
      clearOutPoint: () => calls.push("clearOut")
    };
    const run = sandboxFor("pr-handlers.jsx", {
      File: FakeFile,
      ProjectItemType: { BIN: 2 },
      app: {
        project: {
          rootItem: { children: Object.assign([item], { numItems: 1 }) },
          activeSequence: { videoTracks: [{ overwriteClip: (_i: unknown, t: string) => calls.push(`place ${t}`) }] }
        }
      }
    });
    const r = run("pr.cut.assemble", { clipNameOrPath: "VID.mp4", keep: [{ start: 0, end: 1.1 }, { start: 1.7, end: 4.6 }], timeSeconds: 2 });
    expect(r.ok).toBe(true);
    expect(r.data.placed.map((p: { timelineStart: number }) => p.timelineStart)).toEqual([2, 3.1]);
    expect(r.data.endSeconds).toBeCloseTo(6, 3);
    const T = 254016000000;
    expect(calls).toContain(`in ${Math.round(1.7 * T)} 4`);
    expect(calls).toContain(`place ${Math.round(3.1 * T)}`);
    expect(calls[calls.length - 1]).toBe("clearOut");
  });

  it("writes volume keyframes in clip media time with Premiere's level scale", () => {
    const keys: Array<[number, number]> = [];
    const level = {
      displayName: "Level",
      tv: false,
      isTimeVarying() {
        return this.tv;
      },
      setTimeVarying(v: boolean) {
        this.tv = v;
      },
      addKey() {},
      setValueAtKey(t: { seconds: number }, v: number) {
        keys.push([t.seconds, v]);
      }
    };
    const clip = {
      name: "music.wav",
      start: { seconds: 10 },
      end: { seconds: 40 },
      inPoint: { seconds: 5 },
      components: Object.assign([{ matchName: "audioVolume", displayName: "Volume", properties: Object.assign([{ displayName: "Bypass" }, level], { numItems: 2 }) }], { numItems: 1 })
    };
    const run = sandboxFor("pr-handlers.jsx", {
      Time,
      app: { project: { activeSequence: { audioTracks: [{ clips: Object.assign([clip], { numItems: 1 }) }], videoTracks: [] } } }
    });
    const r = run("pr.audio.keyframes", { trackIndex: 0, clipIndex: 0, keys: [{ time: 5, db: 0 }, { time: 12, db: -6 }, { time: 20, db: -20 }] });
    expect(r.ok).toBe(true);
    expect(r.data.clips[0].keysSet).toBe(2); // 5 s is before the clip
    expect(keys[0][0]).toBeCloseTo(7, 6); // 12 − 10 + 5
    expect(keys[0][1]).toBeCloseTo(Math.pow(10, -21 / 20), 6);
  });

  it("places a MOGRT and fills its text fields", () => {
    let textValue = JSON.stringify({ textEditValue: "Titel", fontTextRunLength: [5] });
    const params = Object.assign(
      [
        { displayName: "Titel", getValue: () => textValue, setValue: (v: string) => (textValue = v) },
        { displayName: "Größe", getValue: () => 50, setValue: () => {} }
      ],
      { numItems: 2 }
    );
    const ti = {
      name: "Lower Third",
      start: { seconds: 3 },
      end: { seconds: 8 },
      getMGTComponent: () => ({ properties: Object.assign(params, { getParamForDisplayName: (n: string) => params.find((p) => p.displayName === n) || null }) })
    };
    const run = sandboxFor("pr-handlers.jsx", {
      File: FakeFile,
      Time,
      app: { project: { activeSequence: { videoTracks: { numTracks: 3 }, importMGT: () => ti } } }
    });
    const r = run("pr.mogrt.insert", { filePath: "D:/m/lt.mogrt", timeSeconds: 3, durationSeconds: 4, values: { Titel: "Junior Rocha", Fehlt: "x" } });
    expect(r.ok).toBe(true);
    expect(JSON.parse(textValue).textEditValue).toBe("Junior Rocha");
    expect(JSON.parse(textValue).fontTextRunLength).toEqual([12]);
    expect(r.data.set).toEqual([{ name: "Titel", ok: true }, { name: "Fehlt", ok: false, reason: "not in the template" }]);
    expect(r.data.parameters).toEqual(["Titel", "Größe"]);
  });

  it("queues a sequence export in Media Encoder without blocking", () => {
    const calls: unknown[] = [];
    const run = sandboxFor("pr-handlers.jsx", {
      File: FakeFile,
      Folder: class {
        exists = true;
        constructor(public fsName: string) {}
        create() {
          return true;
        }
      },
      app: {
        encoder: {
          ENCODE_ENTIRE: 0,
          launchEncoder: () => {
            calls.push("launch");
            throw new Error("Unknown error exception"); // AME already running
          },
          encodeSequence: () => {
            calls.push("encode");
            return "job-7";
          },
          startBatch: () => calls.push("start")
        },
        project: { activeSequence: { exportAsMediaDirect: () => calls.push("direct") } }
      }
    });
    const r = run("pr.export.frameOrSequence", { mode: "sequence", outputPath: "D:/out/reel.mp4", presetPath: "x.epr", queueInAME: true });
    expect(r.ok).toBe(true);
    expect(r.data.jobId).toBe("job-7");
    expect(calls).toEqual(["launch", "encode", "start"]);
  });
});

describe("After Effects MOGRT export", () => {
  it("adds the properties to Essential Graphics and exports", () => {
    const added: string[] = [];
    const sourceText = {
      name: "Source Text",
      addToMotionGraphicsTemplateAs: (_c: unknown, n: string) => {
        added.push(n);
        return true;
      }
    };
    const layer = {
      name: "Titel",
      property: (k: string) => (k === "ADBE Text Properties" ? { property: (k2: string) => (k2 === "ADBE Text Document" ? sourceText : null) } : null)
    };
    let exportedTo = "";
    const comp = {
      name: "LT",
      numLayers: 1,
      layer: () => layer,
      motionGraphicsTemplateName: "",
      motionGraphicsTemplateControllerCount: 1,
      exportAsMotionGraphicsTemplate: (_o: boolean, p: string) => {
        exportedTo = p;
        return true;
      }
    };
    class CompItem {}
    Object.setPrototypeOf(comp, CompItem.prototype);
    const run = sandboxFor("ae-handlers.jsx", {
      File: FakeFile,
      Folder: class {
        exists = true;
        constructor(public fsName: string) {}
        create() {
          return true;
        }
      },
      CompItem,
      app: { beginUndoGroup: () => {}, endUndoGroup: () => {}, project: { numItems: 1, item: () => comp, activeItem: comp, file: {}, dirty: false, save: () => {} } }
    });
    const r = run("ae.mogrt.export", { compName: "LT", outputPath: "D:/m/lt.mogrt", templateName: "LEVATIO Lower Third", properties: [{ layerName: "Titel", name: "Name" }] });
    expect(r.ok).toBe(true);
    expect(added).toEqual(["Name"]);
    expect(exportedTo).toBe("D:/m"); // AE takes the folder and names the file after the template
    expect(comp.motionGraphicsTemplateName).toBe("LEVATIO Lower Third");
  });
});

describe("undo group survives a runtime reload inside a command", () => {
  it("still closes the group when the runtime file is evaluated again mid-command", () => {
    const calls: string[] = [];
    const ctx: Record<string, unknown> = { app: { beginUndoGroup: () => calls.push("begin"), endUndoGroup: () => calls.push("end") } };
    (ctx as Record<string, unknown>).$ = { global: ctx };
    vm.createContext(ctx);
    const rt = read("src/extendscript/es3-runtime.jsx");
    vm.runInContext(rt, ctx);
    (ctx as Record<string, unknown>).__reload = () => vm.runInContext(rt, ctx);
    const out = JSON.parse(vm.runInContext(`__mcpExecuteWithUndo("after-effects", "t", function () { __reload(); return 1; })`, ctx) as string);
    expect(out.ok).toBe(true);
    expect(calls).toEqual(["begin", "end"]);
    // and an early close is still honoured exactly once
    calls.length = 0;
    vm.runInContext(`__mcpExecuteWithUndo("after-effects", "t", function () { __mcpCloseUndoGroup(); __reload(); return 1; })`, ctx);
    expect(calls).toEqual(["begin", "end"]);
  });
});
