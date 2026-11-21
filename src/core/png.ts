/**
 * Minimal PNG reader/writer (no dependencies): enough to shrink frames and build contact sheets.
 * Reads non-interlaced 8/16-bit greyscale, grey+alpha, RGB, RGBA and 8-bit palette PNGs; writes 8-bit RGB.
 */
import * as zlib from "node:zlib";

export interface RgbImage {
  width: number;
  height: number;
  /** RGB, 3 bytes per pixel, row by row. */
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decodes a PNG into 8-bit RGB; transparent pixels are composited over `background` (default black). */
export function decodePng(buf: Buffer, background: [number, number, number] = [0, 0, 0]): RgbImage {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("Not a PNG file.");
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === "PLTE") palette = Buffer.from(body);
    else if (type === "tRNS") trns = Buffer.from(body);
    else if (type === "IDAT") idat.push(Buffer.from(body));
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!width || !height) throw new Error("PNG without IHDR.");
  if (interlace) throw new Error("Interlaced PNGs are not supported.");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType as 0 | 2 | 3 | 4 | 6];
  if (!channels) throw new Error(`Unsupported PNG colour type ${colorType}.`);
  if (colorType === 3 ? depth !== 8 : depth !== 8 && depth !== 16) throw new Error(`Unsupported PNG bit depth ${depth}.`);
  const bpp = channels * (depth / 8);
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length < height * (stride + 1)) throw new Error("Truncated PNG data.");
  const cur = new Uint8Array(stride);
  let prev = new Uint8Array(stride);
  const out = new Uint8Array(width * height * 3);
  const [br, bg, bb] = background;
  for (let y = 0; y < height; y++) {
    const off = y * (stride + 1);
    const filter = raw[off];
    for (let x = 0; x < stride; x++) {
      const v = raw[off + 1 + x];
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let r: number;
      if (filter === 0) r = v;
      else if (filter === 1) r = v + a;
      else if (filter === 2) r = v + b;
      else if (filter === 3) r = v + ((a + b) >> 1);
      else if (filter === 4) r = v + paeth(a, b, c);
      else throw new Error(`Bad PNG filter ${filter}.`);
      cur[x] = r & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp;
      const sample = (i: number) => cur[s + i * (depth / 8)]; // high byte for 16-bit
      let r: number, g: number, bl: number, alpha = 255;
      if (colorType === 0) r = g = bl = sample(0);
      else if (colorType === 4) {
        r = g = bl = sample(0);
        alpha = sample(1);
      } else if (colorType === 2) {
        r = sample(0);
        g = sample(1);
        bl = sample(2);
      } else if (colorType === 6) {
        r = sample(0);
        g = sample(1);
        bl = sample(2);
        alpha = sample(3);
      } else {
        const idx = cur[s];
        if (!palette || idx * 3 + 2 >= palette.length) throw new Error("PNG palette index out of range.");
        r = palette[idx * 3];
        g = palette[idx * 3 + 1];
        bl = palette[idx * 3 + 2];
        if (trns && idx < trns.length) alpha = trns[idx];
      }
      const o = (y * width + x) * 3;
      if (alpha === 255) {
        out[o] = r;
        out[o + 1] = g;
        out[o + 2] = bl;
      } else {
        out[o] = Math.round((r * alpha + br * (255 - alpha)) / 255);
        out[o + 1] = Math.round((g * alpha + bg * (255 - alpha)) / 255);
        out[o + 2] = Math.round((bl * alpha + bb * (255 - alpha)) / 255);
      }
    }
    prev = Uint8Array.from(cur);
  }
  return { width, height, data: out };
}

function chunk(type: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, "latin1"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}

/** Encodes 8-bit RGB as PNG (filter "up" per row, good enough for photos and flat colour). */
export function encodePng(img: RgbImage): Buffer {
  const { width, height, data } = img;
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1);
    raw[o] = 2;
    for (let x = 0; x < stride; x++) {
      const up = y > 0 ? data[(y - 1) * stride + x] : 0;
      raw[o + 1 + x] = (data[y * stride + x] - up) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

/** Area-average resize (downscale) or nearest (upscale) to width × height. */
export function resizeRgb(img: RgbImage, width: number, height: number): RgbImage {
  const out = new Uint8Array(width * height * 3);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(img.height, Math.floor((y + 1) * sy)));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(img.width, Math.floor((x + 1) * sx)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 3;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          n++;
        }
      }
      const o = (y * width + x) * 3;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
    }
  }
  return { width, height, data: out };
}

/** Lays images out in a grid (each scaled to cellWidth, keeping aspect), with gaps and a background colour. */
export function contactSheet(
  images: RgbImage[],
  opts: { columns?: number; cellWidth?: number; gap?: number; background?: [number, number, number] } = {}
): RgbImage {
  if (!images.length) throw new Error("No frames for the contact sheet.");
  const columns = Math.max(1, Math.min(opts.columns ?? 4, images.length));
  const cellW = Math.max(16, Math.round(opts.cellWidth ?? 360));
  const gap = Math.max(0, Math.round(opts.gap ?? 8));
  const bg = opts.background ?? [32, 32, 32];
  const cellH = Math.max(...images.map((im) => Math.round((im.height / im.width) * cellW)));
  const rows = Math.ceil(images.length / columns);
  const W = columns * cellW + (columns + 1) * gap;
  const H = rows * cellH + (rows + 1) * gap;
  const data = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    data[i * 3] = bg[0];
    data[i * 3 + 1] = bg[1];
    data[i * 3 + 2] = bg[2];
  }
  images.forEach((im, k) => {
    const h = Math.round((im.height / im.width) * cellW);
    const t = resizeRgb(im, cellW, h);
    const cx = gap + (k % columns) * (cellW + gap);
    const cy = gap + Math.floor(k / columns) * (cellH + gap) + Math.floor((cellH - h) / 2);
    for (let y = 0; y < h; y++) {
      const src = y * cellW * 3;
      data.set(t.data.subarray(src, src + cellW * 3), ((cy + y) * W + cx) * 3);
    }
  });
  return { width: W, height: H, data };
}
