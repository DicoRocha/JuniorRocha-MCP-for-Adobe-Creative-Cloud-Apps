/**
 * Measures used by the lyric-video gates (skill motion-lyric-video, 18/11/2026).
 *  - landingReport: where the words land on screen (spread per block of consecutive words, pairs on the
 *    same spot and size, framings, safe zone).
 *  - cameraReport: stretches where the camera stands still and unplanned jumps.
 * Thresholds are for a 1080x1920 frame and scale with the frame size.
 */

export interface LandingRow {
  id: string;
  layer?: string;
  time: number;
  frame?: number;
  cx: number;
  cy: number;
  inkW: number;
  inkH: number;
}

export interface LandingOptions {
  width: number;
  height: number;
  blockSize?: number;
  /** Safe zone in 1080x1920 pixels (scaled to the frame). */
  safe?: { x0: number; x1: number; y0: number; y1: number };
}

export interface LandingBlock {
  from: string;
  to: string;
  sdX: number;
  sdY: number;
  floorX: number;
  floorY: number;
  framings: number;
  pass: boolean;
  problems: string[];
}

function sd(v: number[]): number {
  if (!v.length) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length);
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function landingReport(rowsIn: LandingRow[], o: LandingOptions) {
  const rows = [...rowsIn].sort((a, b) => a.time - b.time);
  const kx = o.width / 1080;
  const ky = o.height / 1920;
  const safe = o.safe ?? { x0: 60, x1: 960, y0: 220, y1: 1540 };
  const size = Math.max(2, o.blockSize ?? 10);
  const sizeClass = (w: number) => {
    const n = w / kx;
    return n < 450 ? "S" : n < 650 ? "M" : n < 800 ? "L" : "XL";
  };
  const cell = (r: LandingRow) => `${Math.min(1, Math.floor((r.cx / o.width) * 2))}${Math.min(1, Math.floor((r.cy / o.height) * 2))}`;
  const framing = (r: LandingRow) => `${sizeClass(r.inkW)}${cell(r)}`;

  const blocks: LandingBlock[] = [];
  const n = rows.length;
  const starts = n <= size ? [0] : Array.from({ length: n - size + 1 }, (_, i) => i);
  for (const s of n ? starts : []) {
    const b = rows.slice(s, s + size);
    const wide = b.some((r) => r.inkW / kx >= 600);
    const floorX = (wide ? 120 : 150) * kx;
    const floorY = 250 * ky;
    const sdX = sd(b.map((r) => r.cx));
    const sdY = sd(b.map((r) => r.cy));
    const framings = new Set(b.map(framing)).size;
    const needFramings = b.length >= 10 ? 5 : Math.min(3, b.length);
    const problems: string[] = [];
    if (b.length >= 3 && sdX < floorX) problems.push(`spread in x ${r1(sdX)} px < ${r1(floorX)} px`);
    if (b.length >= 3 && sdY < floorY) problems.push(`spread in y ${r1(sdY)} px < ${r1(floorY)} px`);
    if (framings < needFramings) problems.push(`${framings} framings < ${needFramings}`);
    blocks.push({ from: b[0].id, to: b[b.length - 1].id, sdX: r1(sdX), sdY: r1(sdY), floorX: r1(floorX), floorY: r1(floorY), framings, pass: !problems.length, problems });
  }

  // two consecutive words on the same spot AND the same size
  const pairs: { a: string; b: string; distance: number; widthRatio: number }[] = [];
  for (let i = 1; i < n; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    const dist = Math.hypot(b.cx - a.cx, b.cy - a.cy);
    const big = Math.max(a.inkW, b.inkW, 1);
    const ratio = Math.abs(a.inkW - b.inkW) / big;
    if (dist < 250 * Math.min(kx, ky) && ratio < 0.25) pairs.push({ a: a.id, b: b.id, distance: r1(dist), widthRatio: Math.round(ratio * 100) / 100 });
  }

  // ink inside the safe zone (15 px tolerance) at the landing
  const tol = 15;
  const unsafe = rows
    .filter(
      (r) =>
        r.cx - r.inkW / 2 < (safe.x0 - tol) * kx ||
        r.cx + r.inkW / 2 > (safe.x1 + tol) * kx ||
        r.cy - r.inkH / 2 < (safe.y0 - tol) * ky ||
        r.cy + r.inkH / 2 > (safe.y1 + tol) * ky
    )
    .map((r) => r.id);

  const failed = blocks.filter((b) => !b.pass);
  const worst = blocks.reduce<LandingBlock | null>((w, b) => (!w || b.sdX / b.floorX < w.sdX / w.floorX ? b : w), null);
  return {
    words: n,
    blockSize: Math.min(size, n),
    pass: n > 0 && !failed.length && !pairs.length && !unsafe.length,
    blocksChecked: blocks.length,
    blocksFailed: failed.length,
    worstBlock: worst,
    failedBlocks: failed.slice(0, 12),
    sameSpotPairs: pairs,
    outsideSafeZone: unsafe,
    note:
      "Positions are read before any lens warp applied on an adjustment layer (Optics Compensation moves them towards the edges). " +
      "A wide word cannot reach the x floor inside the safe zone: record the exception instead of leaving the zone."
  };
}

/** One sample per frame: [t, x, y, z, dx, dy, dz] (world position in px and view direction). */
export type CameraSample = [number, number, number, number, number, number, number];

export interface CameraOptions {
  /** Minimum length of a standstill to report, seconds (default 0.25). */
  minStatic?: number;
  /** Below both = standing still (default 20 px/s and 0.8 deg/s). */
  moveFloor?: number;
  turnFloor?: number;
  /** Ignore the first seconds (default 0.1). */
  grace?: number;
  /** Declared hidden cuts (seconds): a jump there is expected. */
  cuts?: number[];
}

export function cameraReport(samples: CameraSample[], o: CameraOptions = {}) {
  const minStatic = o.minStatic ?? 0.25;
  const moveFloor = o.moveFloor ?? 20;
  const turnFloor = o.turnFloor ?? 0.8;
  const grace = o.grace ?? 0.1;
  const cuts = o.cuts ?? [];
  const speeds: { t: number; move: number; turn: number }[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dt = b[0] - a[0];
    if (dt <= 0) continue;
    const move = Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3]) / dt;
    const la = Math.hypot(a[4], a[5], a[6]) || 1;
    const lb = Math.hypot(b[4], b[5], b[6]) || 1;
    const dot = Math.max(-1, Math.min(1, (a[4] * b[4] + a[5] * b[5] + a[6] * b[6]) / (la * lb)));
    const turn = (Math.acos(dot) * 180) / Math.PI / dt;
    speeds.push({ t: b[0], move, turn });
  }
  const staticStretches: { from: number; to: number; seconds: number }[] = [];
  let start: number | null = null;
  let prevT = samples.length ? samples[0][0] : 0;
  const close = (end: number) => {
    if (start !== null && end - start >= minStatic) staticStretches.push({ from: Math.round(start * 1000) / 1000, to: Math.round(end * 1000) / 1000, seconds: Math.round((end - start) * 1000) / 1000 });
    start = null;
  };
  for (const s of speeds) {
    const still = s.move < moveFloor && s.turn < turnFloor && s.t > grace;
    if (still) {
      if (start === null) start = prevT;
    } else {
      close(prevT);
    }
    prevT = s.t;
  }
  close(prevT);

  // jump = one step far above its neighbours (a cut that nobody declared)
  const jumps: { t: number; move: number; turn: number }[] = [];
  const sortedMove = speeds.map((s) => s.move).sort((a, b) => a - b);
  const median = sortedMove.length ? sortedMove[Math.floor(sortedMove.length / 2)] : 0;
  for (let i = 1; i < speeds.length - 1; i++) {
    const s = speeds[i];
    const around = Math.max(speeds[i - 1].move, speeds[i + 1].move, median, 1);
    const turnAround = Math.max(speeds[i - 1].turn, speeds[i + 1].turn, 1);
    const declared = cuts.some((c) => Math.abs(c - s.t) <= 0.05);
    if (!declared && (s.move > 8 * around || s.turn > 8 * turnAround) && (s.move > 400 || s.turn > 60)) {
      jumps.push({ t: Math.round(s.t * 1000) / 1000, move: Math.round(s.move), turn: Math.round(s.turn) });
    }
  }
  const maxTurn = speeds.reduce((m, s) => Math.max(m, s.turn), 0);
  return {
    samples: samples.length,
    pass: samples.length > 1 && !staticStretches.length && !jumps.length,
    staticStretches,
    jumps,
    medianSpeedPxPerSecond: Math.round(median),
    maxTurnDegPerSecond: Math.round(maxTurn),
    note: maxTurn > 600 ? "Turns above ~600 deg/s may show ghost copies instead of blur: raise the samples per frame of the comp or shorten the move." : undefined
  };
}
