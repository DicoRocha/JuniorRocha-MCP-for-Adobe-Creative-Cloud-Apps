import { editDistance } from "./tool-catalog.js";

export interface EffectEntry {
  displayName: string;
  matchName: string;
  category: string;
  [extra: string]: unknown;
}

export interface EffectQuery {
  search?: string;
  category?: string;
  includeInternal?: boolean;
  limit?: number;
}

export interface EffectQueryResult {
  installed: number;
  matched: number;
  truncated: boolean;
  categories: Array<{ category: string; count: number }>;
  effects: EffectEntry[];
}

/** Lower case without accents, so "Desfoque" matches "desfoque" and "Composição" matches "composicao". */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Effects with no category are hidden/internal (After Effects lists many of these). */
export function isInternalEffect(entry: EffectEntry): boolean {
  return !entry.category || entry.category.trim() === "" || entry.category.startsWith("_");
}

export function queryEffects(all: EffectEntry[], query: EffectQuery): EffectQueryResult {
  const tokens = normalizeText(query.search || "")
    .split(/\s+/)
    .filter(Boolean);
  const wantedCategory = query.category ? normalizeText(query.category) : null;

  const visible = query.includeInternal ? all : all.filter((e) => !isInternalEffect(e));
  const matched = visible.filter((e) => {
    if (wantedCategory && !normalizeText(e.category).includes(wantedCategory)) {
      return false;
    }
    if (tokens.length === 0) {
      return true;
    }
    const haystack = normalizeText(`${e.displayName} ${e.matchName} ${e.category}`);
    return tokens.every((t) => haystack.includes(t));
  });

  matched.sort((a, b) => a.category.localeCompare(b.category) || a.displayName.localeCompare(b.displayName));

  const counts = new Map<string, number>();
  for (const e of matched) {
    const key = e.category || "(sem categoria)";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const limit = query.limit ?? 200;

  return {
    installed: all.length,
    matched: matched.length,
    truncated: matched.length > limit,
    categories: [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category)),
    effects: matched.slice(0, limit)
  };
}

/** Closest effects to a name that failed: substring hits first, then smallest edit distance. */
export function suggestEffects(all: EffectEntry[], wanted: string, limit = 5): EffectEntry[] {
  const w = normalizeText(wanted);
  const scored = all.map((e) => {
    const d = normalizeText(e.displayName);
    const m = normalizeText(e.matchName);
    const contains = d.includes(w) || m.includes(w) || (w.length > 3 && (w.includes(d) || w.includes(m)));
    const distance = Math.min(editDistance(w, d), editDistance(w, m));
    return { e, score: (contains ? 0 : 1000) + distance };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.e);
}

/** Small time-boxed cache: catalogs only change when plugins are installed or the app updates. */
export class CatalogCache<T> {
  private readonly entries = new Map<string, { at: number; value: T }>();

  constructor(private readonly ttlMs = 30 * 60 * 1000) {}

  public async get(key: string, loader: () => Promise<T>, refresh = false): Promise<T> {
    const hit = this.entries.get(key);
    if (!refresh && hit && Date.now() - hit.at < this.ttlMs) {
      return hit.value;
    }
    const value = await loader();
    this.entries.set(key, { at: Date.now(), value });
    return value;
  }

  public peek(key: string): T | undefined {
    return this.entries.get(key)?.value;
  }
}
