export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

class StderrLogger {
  private minLevel: LogLevel;

  constructor() {
    const envLevel = (process.env.JRADB_MCP_LOG_LEVEL || "info").toLowerCase() as LogLevel;
    this.minLevel = LEVEL_PRIORITY[envLevel] ? envLevel : "info";
  }

  public setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  public debug(msg: string, meta?: Record<string, unknown>): void {
    this.write("debug", msg, meta);
  }

  public info(msg: string, meta?: Record<string, unknown>): void {
    this.write("info", msg, meta);
  }

  public warn(msg: string, meta?: Record<string, unknown>): void {
    this.write("warn", msg, meta);
  }

  public error(msg: string, meta?: Record<string, unknown>): void {
    this.write("error", msg, meta);
  }

  private write(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
      return;
    }
    const ts = new Date().toISOString();
    const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
    // CRITICAL: Always write to stderr so stdio MCP JSON-RPC on stdout is never polluted
    process.stderr.write(`[${ts}] [${level.toUpperCase()}] [jr-mcp] ${msg}${suffix}\n`);
  }
}

export const logger = new StderrLogger();
