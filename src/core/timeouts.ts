/**
 * How long the router waits for a host to answer, by kind of action.
 *
 * A single default (20 s) was too short for saving, opening or exporting files (the Photoshop
 * "open + build + save" command of the campaign test finished in the app after the bridge had
 * already given up) and needlessly long for a status read. An explicit `options.timeoutMs`
 * always wins.
 */

function envMs(name: string, fallback: number): number {
  const raw = typeof process !== "undefined" ? process.env[name] : undefined;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/*
 * Heavy was 180 s. When Claude reaches this server through a linked device (cloud session ->
 * desktop app), the device link gives up after ~80 s, so a blocked save (modal dialog in After
 * Effects, 13/11/2026) surfaced as a bare "device did not respond" and the router's own timeout,
 * busy probe and hints never reached Claude. Timeout + probe now fit inside that window.
 * Long renders and exports should report progress asynchronously; override with the env vars.
 */
export const TIMEOUTS = {
  /** Cheap reads: status, lists, document info. */
  read: envMs("JRADB_MCP_TIMEOUT_READ_MS", 30_000),
  /** Raw scripts, previews, snapshots, batches, searches. */
  medium: envMs("JRADB_MCP_TIMEOUT_MEDIUM_MS", 60_000),
  /** File I/O and rendering: save, open, export, import, place, package, merge, checkpoint. */
  heavy: envMs("JRADB_MCP_TIMEOUT_HEAVY_MS", 70_000),
  /** Liveness probe sent after a timeout before the next command (see BridgeRouter). */
  probe: envMs("JRADB_MCP_TIMEOUT_PROBE_MS", 5_000)
} as const;

const HEAVY = /(^|\.)(save|open|export|import|render|package|place|merge|checkpoint|transfer)(\.|$)|\.(saveAs|doc\.open|doc\.save|render\w*|export\w*|import\w*)$/i;
const MEDIUM = /(^|\.)(raw|preview|snapshot|batch|find|preflight|list|search|getFramePreview|inspectDom)(\.|$)|Preview$|Snapshot$/i;

/** `*.manage` actions open, save, import or export depending on their `operation` parameter. */
const HEAVY_OPERATIONS = /^(save|saveAs|open|import|export|render|package|close)$/i;

export function resolveTimeoutMs(action: string, explicit?: number, params?: Record<string, unknown>): number {
  if (typeof explicit === "number" && explicit > 0) {
    return explicit;
  }
  const operation = params && typeof params.operation === "string" ? params.operation : "";
  if (HEAVY.test(action) || (operation && HEAVY_OPERATIONS.test(operation))) {
    return TIMEOUTS.heavy;
  }
  if (MEDIUM.test(action)) {
    return TIMEOUTS.medium;
  }
  return TIMEOUTS.read;
}
