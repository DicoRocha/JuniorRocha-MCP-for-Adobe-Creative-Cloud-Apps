/**
 * Long media work (transcription, analysis of long files) runs as a job: the tool waits up to
 * `waitSeconds` and, if the work is not done, answers with a job id to poll. Keeps every call inside
 * the ~80 s window of a remote device link.
 */
import { randomUUID } from "node:crypto";

export interface Job<T = unknown> {
  id: string;
  kind: string;
  status: "running" | "done" | "failed";
  startedAt: number;
  finishedAt?: number;
  result?: T;
  error?: { code: string; message: string };
  label?: string;
}

const jobs = new Map<string, Job>();

export function startJob<T>(kind: string, work: () => Promise<T>, label?: string): { job: Job<T>; promise: Promise<void> } {
  const job: Job<T> = { id: randomUUID().slice(0, 8), kind, status: "running", startedAt: Date.now(), label };
  jobs.set(job.id, job as Job);
  const promise = work().then(
    (result) => {
      job.status = "done";
      job.result = result;
      job.finishedAt = Date.now();
    },
    (err: unknown) => {
      job.status = "failed";
      const e = err as { code?: string; message?: string };
      job.error = { code: e?.code || "MEDIA_JOB_FAILED", message: e?.message || String(err) };
      job.finishedAt = Date.now();
    }
  );
  // Forget finished jobs after an hour.
  promise.finally(() => setTimeout(() => jobs.delete(job.id), 60 * 60 * 1000).unref?.());
  return { job, promise };
}

/** Starts a job and waits up to waitMs for it. */
export async function runJob<T>(kind: string, work: () => Promise<T>, waitMs: number, label?: string): Promise<Job<T>> {
  const { job, promise } = startJob(kind, work, label);
  await Promise.race([promise, new Promise((r) => setTimeout(r, Math.max(0, waitMs)).unref?.())]);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function listJobs(): Job[] {
  return [...jobs.values()];
}

export function jobView(job: Job): Record<string, unknown> {
  const elapsed = ((job.finishedAt ?? Date.now()) - job.startedAt) / 1000;
  const base: Record<string, unknown> = { jobId: job.id, kind: job.kind, status: job.status, elapsedSeconds: Math.round(elapsed) };
  if (job.label) base.label = job.label;
  if (job.status === "done") base.result = job.result;
  if (job.status === "failed") base.error = job.error;
  if (job.status === "running") base.next = "Call media_job_status with this jobId in 20–60 s.";
  return base;
}
