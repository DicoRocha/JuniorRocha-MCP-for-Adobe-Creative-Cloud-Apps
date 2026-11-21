/**
 * pr.clip.speed on a clip cut out of a longer source, in a simulated Premiere that behaves as measured live on
 * 21/11/2026: setSpeed changes the rate but keeps the clip's length on the timeline, so the handler has to bring
 * the end to where the same content ends at the new speed and move the clips after it.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

class Time {
  seconds = 0;
}

type Clip = {
  name: string;
  nodeId: string;
  start: Time;
  _end: Time;
  end: Time;
  speed: number;
  maxEnd: number; // furthest end Premiere accepts for this clip
  getSpeed(): number;
  isSpeedReversed(): boolean;
  move(d: number): void;
};

function clip(id: string, start: number, end: number, maxEnd = Infinity): Clip {
  const c = {
    name: id,
    nodeId: id,
    start: { seconds: start } as Time,
    _end: { seconds: end } as Time,
    speed: 1,
    maxEnd,
    getSpeed() {
      return this.speed;
    },
    isSpeedReversed() {
      return false;
    },
    move(d: number) {
      this.start.seconds += d;
      this._end.seconds += d;
      this.maxEnd += d;
    }
  } as unknown as Clip;
  Object.defineProperty(c, "end", {
    get() {
      return c._end;
    },
    set(t: Time) {
      c._end = { seconds: Math.min(t.seconds, c.maxEnd) } as Time;
    }
  });
  return c;
}

function setup(clips: Clip[], appliedRate?: (asked: number) => number) {
  const track = { clips: { numItems: clips.length } as Record<string, unknown> };
  clips.forEach((c, i) => (track.clips[i] = c));
  const seq = { videoTracks: { numTracks: 1, 0: track }, audioTracks: { numTracks: 0 } };
  const qeTrack = {
    numItems: clips.length,
    getItemAt(i: number) {
      const c = clips[i];
      return {
        type: "Clip",
        setSpeed(rate: number) {
          // measured: the rate changes, the length on the timeline does not
          c.speed = appliedRate ? appliedRate(rate) : rate;
        },
        setTimeInterpolationType() {}
      };
    }
  };
  const sandbox: Record<string, unknown> = {
    Time,
    app: { project: { activeSequence: seq }, enableQE() {} },
    qe: { project: { getActiveSequence: () => ({ getVideoTrackAt: () => qeTrack, getAudioTrackAt: () => qeTrack }) } }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read("src/extendscript/pr-handlers.jsx")}`, sandbox);
  return (params: unknown) =>
    JSON.parse(vm.runInContext(`JSON.stringify(__mcpDispatch("pr.clip.speed", ${JSON.stringify(params)}, {}))`, sandbox) as string);
}

const span = (c: Clip) => [Math.round(c.start.seconds * 1000) / 1000, Math.round(c.end.seconds * 1000) / 1000];

describe("pr.clip.speed on a cut clip", () => {
  it("speeding up shortens the clip and moves the next ones up", () => {
    const a = clip("a", 0, 2), b = clip("b", 2, 4), c = clip("c", 4, 6);
    const run = setup([a, b, c]);
    const res = run({ trackIndex: 0, clipIndex: 1, speedPercent: 200 });
    expect(span(b)).toEqual([2, 3]);
    expect(span(c)).toEqual([3, 5]);
    expect(res.trimmedToNewSpeed).toBe(true);
  });

  it("slowing down lengthens the clip and pushes the next ones later, so no content is cut off", () => {
    const a = clip("a", 0, 2), b = clip("b", 2, 6);
    const run = setup([a, b]);
    const res = run({ trackIndex: 0, clipIndex: 0, speedPercent: 50 });
    expect(span(a)).toEqual([0, 4]);
    expect(span(b)).toEqual([4, 8]);
    expect(res.trimmedToNewSpeed).toBe(true);
    expect(res.warnings).toEqual([]);
  });

  it("slowing down the last clip lengthens it too", () => {
    const a = clip("a", 0, 2);
    const run = setup([a]);
    run({ trackIndex: 0, clipIndex: 0, speedPercent: 25 });
    expect(span(a)).toEqual([0, 8]);
  });

  it("without ripple a slower clip keeps its length (it would cover the next one) and says so", () => {
    const a = clip("a", 0, 2), b = clip("b", 2, 6);
    const run = setup([a, b]);
    const res = run({ trackIndex: 0, clipIndex: 0, speedPercent: 50, ripple: false });
    expect(span(a)).toEqual([0, 2]);
    expect(span(b)).toEqual([2, 6]);
    expect(res.warnings.join(" ")).toMatch(/ripple/);
  });

  it("keepDuration keeps the length whatever the speed", () => {
    const a = clip("a", 0, 2), b = clip("b", 2, 6);
    const run = setup([a, b]);
    run({ trackIndex: 0, clipIndex: 0, speedPercent: 50, keepDuration: true });
    expect(span(a)).toEqual([0, 2]);
    expect(span(b)).toEqual([2, 6]);
  });

  it("when Premiere cannot lengthen the clip that far, the next clips close the gap and the tool warns", () => {
    // Premiere stops the end at 3 s instead of the 4 s asked
    const a = clip("a", 0, 2, 3), b = clip("b", 2, 6);
    const run = setup([a, b]);
    const res = run({ trackIndex: 0, clipIndex: 0, speedPercent: 50 });
    const [, endA] = span(a);
    expect(endA).toBe(3);
    expect(span(b)[0]).toBe(endA); // no gap left
    expect(res.warnings.join(" ")).toMatch(/source/);
  });

  it("uses the speed Premiere really applied (150 % when 200 % was asked, measured) and warns", () => {
    const a = clip("a", 0, 2), b = clip("b", 2, 4), c = clip("c", 4, 6);
    const run = setup([a, b, c], (r) => (r === 2 ? 1.5 : r));
    const res = run({ trackIndex: 0, clipIndex: 1, speedPercent: 200 });
    expect(span(b)).toEqual([2, 3.333]);
    expect(span(c)[0]).toBe(3.333);
    expect(res.speedPercent).toBe(150);
    expect(res.warnings.join(" ")).toMatch(/Premiere applied 150/);
  });
});
