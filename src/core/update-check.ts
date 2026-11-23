/**
 * Tells the user once when a newer release is on GitHub. Checks at most once a day, stays silent offline, never
 * downloads or installs anything (the user installs releases himself). Off with JRADB_MCP_UPDATE_CHECK=off.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export const RELEASES_API = "https://api.github.com/repos/DicoRocha/JuniorRocha-MCP-for-Adobe-Creative-Cloud-Apps/releases/latest";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface UpdateInfo {
  current: string;
  latest: string;
  url: string;
  publishedAt?: string;
}

interface Cache {
  checkedAt: number;
  latest?: string;
  url?: string;
  publishedAt?: string;
}

/** Compares dotted versions ("v1.11.0" works too): >0 when a is newer. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export class UpdateChecker {
  private memo: UpdateInfo | null = null;
  private announced = false;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly current: string,
    private readonly cacheFile: string,
    private readonly fetchFn: FetchLike | undefined = (globalThis as { fetch?: FetchLike }).fetch,
    private readonly now: () => number = Date.now
  ) {}

  static enabled(): boolean {
    return !/^(off|0|false|no)$/i.test(process.env.JRADB_MCP_UPDATE_CHECK || "");
  }

  private readCache(): Cache | null {
    try {
      return JSON.parse(fs.readFileSync(this.cacheFile, "utf8")) as Cache;
    } catch {
      return null;
    }
  }

  private fromCache(c: Cache | null): void {
    this.memo = c?.latest && c.url && compareVersions(c.latest, this.current) > 0 ? { current: this.current, latest: c.latest.replace(/^v/i, ""), url: c.url, publishedAt: c.publishedAt } : null;
  }

  /** Refreshes from GitHub when the cache is older than a day. Never throws. */
  async refresh(timeoutMs = 4000): Promise<void> {
    if (!UpdateChecker.enabled() || !this.fetchFn) return;
    const cache = this.readCache();
    if (cache && this.now() - cache.checkedAt < DAY_MS) {
      this.fromCache(cache);
      return;
    }
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await this.fetchFn!(RELEASES_API, { signal: ctl.signal, headers: { Accept: "application/vnd.github+json", "User-Agent": "jradb-mcp" } });
        if (!res.ok) return;
        const j = (await res.json()) as { tag_name?: string; html_url?: string; published_at?: string; draft?: boolean; prerelease?: boolean };
        if (!j.tag_name || j.draft || j.prerelease) return;
        const next: Cache = { checkedAt: this.now(), latest: j.tag_name, url: j.html_url, publishedAt: j.published_at };
        try {
          fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
          fs.writeFileSync(this.cacheFile, JSON.stringify(next));
        } catch {
          /* a read-only folder only costs a check per start */
        }
        this.fromCache(next);
      } catch {
        /* offline or GitHub down: stay silent */
      } finally {
        clearTimeout(timer);
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  /** The newer release, or null. `announce` is true only the first time it is reported in this process. */
  status(): (UpdateInfo & { announce: boolean }) | null {
    if (!this.memo) return null;
    const announce = !this.announced;
    this.announced = true;
    return { ...this.memo, announce };
  }

  /** Short line for the panels (Portuguese: the panels speak to the user). */
  panelNotice(): string | null {
    return this.memo ? `Nova versão ${this.memo.latest} disponível (você tem ${this.current}): ${this.memo.url}` : null;
  }
}
