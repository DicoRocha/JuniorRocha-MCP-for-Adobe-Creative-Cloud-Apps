/**
 * Shrinks a preview image (base64 JPEG/PNG) so its longest side fits maxDim, with ffmpeg. Used where an app returns
 * a bigger preview than asked (Lightroom thumbnails, B6): a bigger image only costs context tokens.
 * Without ffmpeg, or on any failure, the original is returned unchanged.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findFfmpeg, run } from "./ffmpeg.js";
import { imageSize } from "../core/usage-log.js";

export function fitInside(w: number, h: number, maxDim: number): { w: number; h: number } | null {
  if (w <= maxDim && h <= maxDim) return null;
  const k = maxDim / Math.max(w, h);
  // even sizes keep every encoder happy
  return { w: Math.max(2, Math.round((w * k) / 2) * 2), h: Math.max(2, Math.round((h * k) / 2) * 2) };
}

export async function downscaleBase64(b64: string, maxDim: number, mimeType = "image/jpeg"): Promise<{ base64: string; resized: boolean; from?: string; to?: string }> {
  const size = imageSize(b64);
  if (!size) return { base64: b64, resized: false };
  const target = fitInside(size.w, size.h, maxDim);
  if (!target) return { base64: b64, resized: false };
  const ff = findFfmpeg();
  if (!ff) return { base64: b64, resized: false };
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-shrink-"));
  const inF = path.join(dir, `in.${ext}`);
  const outF = path.join(dir, `out.${ext}`);
  try {
    fs.writeFileSync(inF, Buffer.from(b64, "base64"));
    const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", inF, "-vf", `scale=${target.w}:${target.h}:flags=lanczos`];
    if (ext === "jpg") args.push("-q:v", "3");
    args.push(outF);
    const r = await run(ff, args, { timeoutMs: 20000 });
    if (r.code !== 0 || !fs.existsSync(outF)) return { base64: b64, resized: false };
    return { base64: fs.readFileSync(outF).toString("base64"), resized: true, from: `${size.w}x${size.h}`, to: `${target.w}x${target.h}` };
  } catch {
    return { base64: b64, resized: false };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
