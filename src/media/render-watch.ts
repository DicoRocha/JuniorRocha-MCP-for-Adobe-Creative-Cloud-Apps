/**
 * Watches a render that Adobe Media Encoder writes in the background (B1): the file must appear, then stop growing
 * for `stableMs`. Runs as a media job, so the agent polls media_job_status instead of guessing.
 */
import * as fs from "node:fs";
import { startJob, type Job } from "./jobs.js";

export interface RenderWatchResult {
  outputPath: string;
  bytes: number;
  mb: number;
  seconds: number;
}

export async function waitForRender(
  outputPath: string,
  opts: { stableMs?: number; timeoutMs?: number; intervalMs?: number; startTimeoutMs?: number } = {}
): Promise<RenderWatchResult> {
  const stableMs = opts.stableMs ?? 6000;
  const timeoutMs = opts.timeoutMs ?? 3 * 60 * 60 * 1000;
  const startTimeoutMs = opts.startTimeoutMs ?? 10 * 60 * 1000;
  const interval = opts.intervalMs ?? 1000;
  const t0 = Date.now();
  let last = -1;
  let since = Date.now();
  for (;;) {
    const now = Date.now();
    let size = -1;
    try {
      size = fs.statSync(outputPath).size;
    } catch {
      size = -1;
    }
    if (size < 0 && now - t0 > startTimeoutMs) {
      throw new Error(`Media Encoder did not start writing ${outputPath} within ${Math.round(startTimeoutMs / 60000)} min: check its queue (paused, missing preset, or an error dialog).`);
    }
    if (size !== last) {
      last = size;
      since = now;
    } else if (size > 0 && now - since >= stableMs) {
      return { outputPath, bytes: size, mb: Math.round(size / 104857.6) / 10, seconds: Math.round((now - t0) / 1000) };
    }
    if (now - t0 > timeoutMs) throw new Error(`Render still growing after ${Math.round(timeoutMs / 60000)} min: ${outputPath}`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

/** Starts a background job that resolves when the render file is complete. */
export function watchRender(outputPath: string, label?: string): Job<RenderWatchResult> {
  return startJob("render", () => waitForRender(outputPath), label ?? outputPath).job;
}
