/**
 * Premiere timeline edits (checked live in Premiere 2027, frame-compared): moving a clip's start alone slides the
 * picture, so trim shifts the source In by the same amount; slip keeps the timeline position; linked audio follows.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

class Time {
  seconds = 0;
}
function item(mediaType: string, start: number, end: number, inPt: number) {
  const it: Record<string, unknown> = {
    name: "clip.mp4",
    mediaType,
    parentTrackIndex: 0,
    start: { seconds: start },
    end: { seconds: end },
    inPoint: { seconds: inPt },
    outPoint: { seconds: inPt + (end - start) },
    moved: 0,
    move(d: number) {
      (this.start as Time).seconds += d;
      (this.end as Time).seconds += d;
      this.moved = d;
    }
  };
  return it;
}

function setup() {
  const v = item("Video", 10, 20, 5);
  const a = item("Audio", 10, 20, 5);
  const links = { numItems: 2, 0: v, 1: a };
  v.getLinkedItems = () => links;
  a.getLinkedItems = () => links;
  const vTrack = { clips: { numItems: 1, 0: v } };
  const aTrack = { clips: { numItems: 1, 0: a } };
  const seq = {
    videoTracks: { numTracks: 1, 0: vTrack },
    audioTracks: { numTracks: 1, 0: aTrack },
    pos: "0",
    getPlayerPosition() {
      return { ticks: this.pos };
    },
    setPlayerPosition(t: string) {
      this.pos = t;
    }
  };
  const sandbox: Record<string, unknown> = { Time, app: { project: { activeSequence: seq } } };
  vm.createContext(sandbox);
  vm.runInContext(`${read("src/extendscript/es3-runtime.jsx")}\n${read("src/extendscript/pr-handlers.jsx")}`, sandbox);
  const run = (params: unknown) =>
    JSON.parse(vm.runInContext(`__mcpExecuteWithUndo("x","t",function(){return __mcpDispatch("pr.timeline.edit", ${JSON.stringify(params)}, {});})`, sandbox) as string);
  return { v, a, run };
}
const sec = (o: unknown) => (o as Time).seconds;

describe("pr.timeline.edit", () => {
  it("trims the head of a clip and its linked audio, moving the source In with the start", () => {
    const { v, a, run } = setup();
    const r = run({ operation: "trim", atSeconds: 12, startSeconds: 11.5, endSeconds: 18 });
    expect(r.ok).toBe(true);
    for (const it of [v, a]) {
      expect(sec(it.start)).toBe(11.5);
      expect(sec(it.end)).toBe(18);
      expect(sec(it.inPoint)).toBe(6.5);
    }
    expect(r.data.linkedItems).toBe(2);
  });

  it("slips the source without moving the clip, and refuses to slip before the media start", () => {
    const { v, a, run } = setup();
    expect(run({ operation: "slip", clipIndex: 0, offsetSeconds: 0.4 }).ok).toBe(true);
    for (const it of [v, a]) {
      expect(sec(it.start)).toBe(10);
      expect(sec(it.inPoint)).toBeCloseTo(5.4);
      expect(sec(it.outPoint)).toBeCloseTo(15.4);
    }
    expect(run({ operation: "slip", clipIndex: 0, offsetSeconds: -9 }).error.message).toMatch(/before the beginning/);
  });

  it("moves the clip with its linked audio, or alone with linked: false", () => {
    const { v, a, run } = setup();
    run({ operation: "move", clipIndex: 0, toSeconds: 12 });
    expect([sec(v.start), sec(a.start)]).toEqual([12, 12]);
    run({ operation: "move", clipIndex: 0, offsetSeconds: -1, linked: false });
    expect([sec(v.start), sec(a.start)]).toEqual([11, 12]);
    expect(run({ operation: "move", clipIndex: 0, offsetSeconds: -50 }).error.message).toMatch(/before 0/);
  });
});

import { speechOnTimeline } from "../../src/tools/premiere/reel.js";

describe("pr_assemble_reel helpers", () => {
  it("maps a clip's speech through its cut plan onto the timeline", () => {
    // speech 1–3 s and 5–6 s; the pause 3.1–4.9 is cut; clip placed at 10 s
    const keep = [{ start: 0.9, end: 3.1 }, { start: 4.9, end: 6.1 }];
    const r = speechOnTimeline([{ start: 1, end: 3 }, { start: 5, end: 6 }], keep, 10);
    expect(r).toEqual([{ start: 10.1, end: 12.1 }, { start: 12.3, end: 13.3 }]);
  });
});
