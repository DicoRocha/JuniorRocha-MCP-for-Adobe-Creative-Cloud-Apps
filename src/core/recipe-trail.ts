import * as fs from "node:fs";

/** Adds the recipe's progress trail (last steps and how long ago) to a timeout or bridge error. */
export function withTrail(err: unknown, logPath: string): Error {
  const e = err instanceof Error ? err : new Error(String(err));
  try {
    if (!fs.existsSync(logPath)) {
      e.message += " | Progress trail: the recipe never started inside the app (busy, a dialog open, or the panel did not run it).";
      return e;
    }
    const lines = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
    const now = Date.now();
    const steps = lines.slice(-4).map((l) => {
      const [t, ...rest] = l.split(" ");
      return `${rest.join(" ")} (${Math.round((now - Number(t)) / 1000)} s atrás)`;
    });
    const done = lines.some((l) => / (fim|done)$/.test(l));
    e.message += ` | Progress trail: ${steps.join(" → ")}${done ? " — the recipe FINISHED in the app; only the reply was lost: check the open document." : ""}`;
  } catch {
    /* keep the original error */
  }
  return e;
}
