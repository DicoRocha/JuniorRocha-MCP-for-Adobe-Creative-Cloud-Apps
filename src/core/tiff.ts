/**
 * Minimal baseline TIFF reader for small exports (Lightroom): first image, chunky RGB/grey, 8 or 16 bits,
 * uncompressed or Deflate (with or without horizontal predictor). Returns 8-bit RGB.
 */
import * as zlib from "node:zlib";
import type { RgbImage } from "./png.js";

export function decodeTiff(buf: Buffer): RgbImage {
  if (buf.length < 8) throw new Error("Not a TIFF file.");
  const order = buf.toString("latin1", 0, 2);
  const le = order === "II";
  if (!le && order !== "MM") throw new Error("Not a TIFF file.");
  const u16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (u16(2) !== 42) throw new Error("BigTIFF and unknown TIFF variants are not supported.");
  const ifd = u32(4);
  const n = u16(ifd);
  const tags = new Map<number, number[]>();
  const SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 16: 8 };
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    const tag = u16(e);
    const type = u16(e + 2);
    const count = u32(e + 4);
    const size = (SIZES[type] ?? 1) * count;
    const at = size <= 4 ? e + 8 : u32(e + 8);
    const vals: number[] = [];
    if (type === 3) for (let k = 0; k < count; k++) vals.push(u16(at + k * 2));
    else if (type === 4) for (let k = 0; k < count; k++) vals.push(u32(at + k * 4));
    else if (type === 1 || type === 7) for (let k = 0; k < Math.min(count, 64); k++) vals.push(buf[at + k]);
    tags.set(tag, vals);
  }
  const get = (t: number, d?: number) => (tags.get(t)?.[0] ?? d) as number;
  const width = get(256);
  const height = get(257);
  if (!width || !height) throw new Error("TIFF without size.");
  const bits = get(258, 1);
  const compression = get(259, 1);
  const photometric = get(262, 2);
  const spp = get(277, 1);
  const rowsPerStrip = get(278, height);
  const planar = get(284, 1);
  const predictor = get(317, 1);
  const offsets = tags.get(273) ?? [];
  const counts = tags.get(279) ?? [];
  if (tags.has(322)) throw new Error("Tiled TIFFs are not supported; export a striped TIFF.");
  if (planar !== 1) throw new Error("Planar TIFFs are not supported.");
  if (bits !== 8 && bits !== 16) throw new Error(`Unsupported TIFF bit depth ${bits}.`);
  if (compression !== 1 && compression !== 8 && compression !== 32946) {
    throw new Error(`Unsupported TIFF compression ${compression} (use none or ZIP).`);
  }
  if (photometric !== 1 && photometric !== 2 && photometric !== 0) throw new Error(`Unsupported TIFF photometric ${photometric}.`);
  const bps = bits / 8;
  const rowBytes = width * spp * bps;
  const out = new Uint8Array(width * height * 3);
  let row = 0;
  for (let s = 0; s < offsets.length && row < height; s++) {
    let strip = buf.subarray(offsets[s], offsets[s] + counts[s]);
    if (compression !== 1) strip = zlib.inflateSync(strip);
    const rows = Math.min(rowsPerStrip, height - row);
    for (let r = 0; r < rows; r++, row++) {
      const base = r * rowBytes;
      if (predictor === 2) {
        // horizontal differencing, per sample
        if (bps === 1) {
          for (let x = spp; x < width * spp; x++) strip[base + x] = (strip[base + x] + strip[base + x - spp]) & 0xff;
        } else {
          for (let x = spp; x < width * spp; x++) {
            const o = base + x * 2;
            const p = base + (x - spp) * 2;
            const cur = le ? strip.readUInt16LE(o) : strip.readUInt16BE(o);
            const prev = le ? strip.readUInt16LE(p) : strip.readUInt16BE(p);
            const v = (cur + prev) & 0xffff;
            if (le) strip.writeUInt16LE(v, o);
            else strip.writeUInt16BE(v, o);
          }
        }
      }
      for (let x = 0; x < width; x++) {
        const sample = (c: number) => {
          const o = base + (x * spp + c) * bps;
          return bps === 1 ? strip[o] : le ? strip[o + 1] : strip[o];
        };
        const o3 = (row * width + x) * 3;
        if (spp >= 3) {
          out[o3] = sample(0);
          out[o3 + 1] = sample(1);
          out[o3 + 2] = sample(2);
        } else {
          let g = sample(0);
          if (photometric === 0) g = 255 - g;
          out[o3] = out[o3 + 1] = out[o3 + 2] = g;
        }
      }
    }
  }
  return { width, height, data: out };
}

export interface ImageStats {
  width: number;
  height: number;
  /** Luminance histogram in `bins` buckets, as % of pixels. */
  histogram: number[];
  mean: { r: number; g: number; b: number; luma: number };
  percentiles: { p1: number; p5: number; p50: number; p95: number; p99: number };
  clippedHighlightsPct: number;
  crushedShadowsPct: number;
  /** Mean of (R−B) in the middle tones: >0 warm, <0 cool. */
  warmth: number;
  /** Mean colourfulness 0–255 (max−min channel). */
  saturation: number;
}

export function imageStats(img: RgbImage, bins = 32): ImageStats {
  const hist = new Array(256).fill(0);
  let sr = 0, sg = 0, sb = 0, sat = 0, clip = 0, crush = 0, warm = 0, warmN = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const r = img.data[i * 3];
    const g = img.data[i * 3 + 1];
    const b = img.data[i * 3 + 2];
    const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    hist[y]++;
    sr += r;
    sg += g;
    sb += b;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    sat += mx - mn;
    if (mx >= 254) clip++;
    if (y <= 2) crush++;
    if (y > 40 && y < 215) {
      warm += r - b;
      warmN++;
    }
  }
  const pct = (q: number) => {
    let acc = 0;
    const target = q * n;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  };
  const per = 256 / bins;
  const condensed = Array.from({ length: bins }, (_, k) => {
    let s = 0;
    for (let v = Math.floor(k * per); v < Math.floor((k + 1) * per); v++) s += hist[v];
    return Math.round((s / n) * 1000) / 10;
  });
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const mr = sr / n, mg = sg / n, mb = sb / n;
  return {
    width: img.width,
    height: img.height,
    histogram: condensed,
    mean: { r: r1(mr), g: r1(mg), b: r1(mb), luma: r1(0.2126 * mr + 0.7152 * mg + 0.0722 * mb) },
    percentiles: { p1: pct(0.01), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) },
    clippedHighlightsPct: r1((clip / n) * 100),
    crushedShadowsPct: r1((crush / n) * 100),
    warmth: r1(warmN ? warm / warmN : 0),
    saturation: r1(sat / n)
  };
}

/** Bar chart of a histogram (values in %) as an RGB image, for a quick look. */
export function histogramImage(hist: number[], width = 512, height = 160): RgbImage {
  const data = new Uint8Array(width * height * 3).fill(28);
  const max = Math.max(...hist, 0.0001);
  const bw = width / hist.length;
  hist.forEach((v, k) => {
    const h = Math.round((v / max) * (height - 4));
    for (let x = Math.floor(k * bw); x < Math.floor((k + 1) * bw) - 1; x++) {
      for (let y = height - h; y < height; y++) {
        const o = (y * width + x) * 3;
        data[o] = data[o + 1] = data[o + 2] = 210;
      }
    }
  });
  return { width, height, data };
}
