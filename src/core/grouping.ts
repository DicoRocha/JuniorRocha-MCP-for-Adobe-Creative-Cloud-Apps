/**
 * Semantic grouping of the layers/objects of a layout (Photoshop, Illustrator, InDesign).
 *
 * A file built by the MCP used to come out as a flat stack of layers (23/11/2026: icon + text lists with no group).
 * Rules (the user's): what belongs together by meaning forms a group, a lone object does not.
 *  - text on a shape (button, tag, badge)            -> "Rótulo"
 *  - icon next to (or above) its text, plus the text lines stacked under that text -> "Item"
 *  - a shape holding two or more items (image, texts) above it                      -> "Card"
 *  - two or more items/labels/cards of the same size aligned in a column or a row  -> "Lista" / "Botões" / "Cards"
 *  - background (covers most of the canvas), adjustment layers and lone objects stay as they are.
 * A group is not proposed when a layer outside it sits between its members in the stack and overlaps it:
 * grouping would move that layer above or below and change the picture.
 *
 * Coordinates: top-left origin, Y down, [left, top, right, bottom]. Stack order: index 0 = top.
 */

export type ItemKind = "text" | "shape" | "pixel" | "smart" | "adjustment" | "group" | "other";

export interface LayoutItem {
  id: number | string;
  name: string;
  kind: ItemKind;
  bounds: [number, number, number, number];
  /** Position in the stack of its container, 0 = top. Defaults to the array index. */
  z?: number;
  text?: string;
}

export interface GroupProposal {
  name: string;
  role: "label" | "item" | "card" | "list" | "row";
  /** Item ids (leaves) directly in this group. */
  members: Array<number | string>;
  children: GroupProposal[];
  bounds: [number, number, number, number];
}

export interface GroupingResult {
  proposals: GroupProposal[];
  skipped: Array<{ name: string; reason: string }>;
  ungroupedRelated: number;
}

type B = [number, number, number, number];
const W = (b: B) => b[2] - b[0];
const H = (b: B) => b[3] - b[1];
const area = (b: B) => Math.max(0, W(b)) * Math.max(0, H(b));
const union = (bs: B[]): B => [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
const inter = (a: B, b: B) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
const cx = (b: B) => (b[0] + b[2]) / 2;
const cy = (b: B) => (b[1] + b[3]) / 2;

interface Unit {
  role: "single" | "label" | "item" | "card";
  ids: Array<number | string>;
  child?: Unit;
  bounds: B;
  title: string;
  zs: number[];
}

function short(s: string, n = 28): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function proposeGroups(itemsIn: LayoutItem[], canvas: { width: number; height: number }, opts: { language?: "pt" | "en" } = {}): GroupingResult {
  const pt = (opts.language ?? "pt") === "pt";
  const canvasArea = Math.max(1, canvas.width * canvas.height);
  const items = itemsIn.map((it, i) => ({ ...it, z: it.z ?? i })).filter((it) => area(it.bounds) > 0);
  const isBackground = (it: LayoutItem) => area(it.bounds) >= 0.85 * canvasArea;
  const candidates = items.filter((it) => it.kind !== "adjustment" && !isBackground(it));
  const used = new Set<number | string>();
  const label = (it: LayoutItem) => short(it.text || it.name);

  const units: Unit[] = [];
  const texts = candidates.filter((it) => it.kind === "text");
  const graphics = candidates.filter((it) => it.kind !== "text" && it.kind !== "group");

  // 0. Card: a shape (not the background) holding two or more other items above it, at least one a text.
  const cards: Unit[] = [];
  for (const s0 of [...graphics].sort((a, b) => area(a.bounds) - area(b.bounds))) {
    if (used.has(s0.id) || area(s0.bounds) > 0.4 * canvasArea) continue;
    const inside = candidates.filter((o) => o.id !== s0.id && !used.has(o.id) && o.z < s0.z! && inter(o.bounds, s0.bounds) >= 0.9 * area(o.bounds) && area(o.bounds) < 0.8 * area(s0.bounds));
    if (inside.length < 2 || !inside.some((o) => o.kind === "text")) continue;
    for (const o of inside) used.add(o.id);
    used.add(s0.id);
    const firstText = inside.filter((o) => o.kind === "text").sort((a, b) => a.bounds[1] - b.bounds[1])[0];
    cards.push({ role: "card", ids: [...inside.map((o) => o.id), s0.id], bounds: s0.bounds, title: label(firstText), zs: [...inside.map((o) => o.z!), s0.z!] });
  }

  // 1. Text on a shape.
  for (const t of texts) {
    const hosts = graphics
      .filter((s) => !used.has(s.id) && s.z! > t.z!)
      .filter((s) => inter(t.bounds, s.bounds) >= 0.9 * area(t.bounds))
      .filter((s) => area(s.bounds) <= 0.4 * canvasArea && area(s.bounds) <= 25 * area(t.bounds))
      .sort((a, b) => area(a.bounds) - area(b.bounds));
    const s = hosts[0];
    if (!s) continue;
    used.add(s.id);
    used.add(t.id);
    units.push({ role: "label", ids: [t.id, s.id], bounds: union([t.bounds, s.bounds]), title: label(t), zs: [t.z!, s.z!] });
  }

  // 2. Icon next to / above its text (the text may already be a label).
  const textUnits: Unit[] = [
    ...units,
    ...texts.filter((t) => !used.has(t.id)).map((t) => ({ role: "single" as const, ids: [t.id], bounds: t.bounds, title: label(t), zs: [t.z!] }))
  ];
  const icons = graphics.filter((g) => !used.has(g.id));
  const items2: Unit[] = [];
  for (const tu of textUnits) {
    const th = Math.min(H(tu.bounds), 120);
    const best = icons
      .filter((ic) => !used.has(ic.id))
      .map((ic) => {
        const side = Math.max(W(ic.bounds), H(ic.bounds));
        const aspect = W(ic.bounds) / Math.max(1, H(ic.bounds));
        if (aspect < 0.4 || aspect > 2.5 || side > 3 * th || area(ic.bounds) > 0.03 * canvasArea) return null;
        const vOverlap = Math.min(ic.bounds[3], tu.bounds[3]) - Math.max(ic.bounds[1], tu.bounds[1]);
        const hGap = ic.bounds[2] <= tu.bounds[0] + 2 ? tu.bounds[0] - ic.bounds[2] : ic.bounds[0] >= tu.bounds[2] - 2 ? ic.bounds[0] - tu.bounds[2] : NaN;
        if (!Number.isNaN(hGap) && hGap >= -2 && hGap <= Math.max(3 * side, 24) && vOverlap >= 0.4 * Math.min(H(ic.bounds), H(tu.bounds))) return { ic, d: hGap };
        const vGap = tu.bounds[1] - ic.bounds[3];
        if (vGap >= -2 && vGap <= 2 * side && Math.abs(cx(ic.bounds) - cx(tu.bounds)) <= 0.25 * Math.max(W(tu.bounds), side)) return { ic, d: vGap };
        return null;
      })
      .filter((x): x is { ic: LayoutItem & { z: number }; d: number } => x !== null)
      .sort((a, b) => a.d - b.d)[0];
    if (!best) continue;
    used.add(best.ic.id);
    for (const id of tu.ids) used.add(id);
    const ids = tu.role === "label" ? [best.ic.id] : [best.ic.id, ...tu.ids];
    items2.push({ role: "item", ids, child: tu.role === "label" ? tu : undefined, bounds: union([best.ic.bounds, tu.bounds]), title: tu.title, zs: [best.ic.z, ...tu.zs] });
  }
  // Text lines stacked under an item's text (title + description) join the item.
  for (const u of items2) {
    for (;;) {
      const lh = Math.max(12, Math.min(...u.ids.map((id) => candidates.find((c) => c.id === id)).filter((c) => c?.kind === "text").map((c) => H(c!.bounds)), 80));
      const textLeft = Math.min(...u.ids.map((id) => candidates.find((c) => c.id === id)).filter((c) => c?.kind === "text").map((c) => c!.bounds[0]));
      const next = texts.find(
        (t) => !used.has(t.id) && Math.abs(t.bounds[0] - textLeft) <= Math.max(4, 0.01 * canvas.width) && t.bounds[1] >= u.bounds[3] - 2 && t.bounds[1] - u.bounds[3] <= 1.5 * lh
      );
      if (!next) break;
      used.add(next.id);
      u.ids.push(next.id);
      u.zs.push(next.z!);
      u.bounds = union([u.bounds, next.bounds]);
    }
  }
  const labelsLeft = units.filter((u) => !items2.some((it) => it.child === u));
  const all: Unit[] = [...cards, ...items2, ...labelsLeft];

  // 3. Repeated units aligned in a column or a row.
  const lists: Array<{ role: "list" | "row"; members: Unit[] }> = [];
  const inList = new Set<Unit>();
  for (const role of ["card", "item", "label"] as const) {
    const pool = all.filter((u) => u.role === role);
    const similar = (a: Unit, b: Unit) => Math.abs(H(a.bounds) - H(b.bounds)) <= 0.35 * Math.max(H(a.bounds), H(b.bounds));
    for (const seed of pool) {
      if (inList.has(seed)) continue;
      const col = pool.filter((u) => !inList.has(u) && similar(u, seed) && Math.abs(u.bounds[0] - seed.bounds[0]) <= Math.max(6, 0.02 * canvas.width));
      const row = pool.filter((u) => !inList.has(u) && similar(u, seed) && Math.abs(cy(u.bounds) - cy(seed.bounds)) <= Math.max(6, 0.02 * canvas.height));
      const pick = col.length >= row.length ? { role: "list" as const, m: col } : { role: "row" as const, m: row };
      if (pick.m.length < 2) continue;
      pick.m.sort((a, b) => (pick.role === "list" ? a.bounds[1] - b.bounds[1] : a.bounds[0] - b.bounds[0]));
      // the gaps must be regular-ish: no member farther than 3x the smallest gap
      const gaps = pick.m.slice(1).map((u, i) => (pick.role === "list" ? u.bounds[1] - pick.m[i].bounds[3] : u.bounds[0] - pick.m[i].bounds[2]));
      const g0 = Math.max(4, Math.min(...gaps));
      if (gaps.some((g) => g > 3 * g0 + 40 || g < -2)) continue;
      for (const u of pick.m) inList.add(u);
      lists.push({ role: pick.role, members: pick.m });
    }
  }

  // 4. Proposals, with the stacking check.
  const skipped: GroupingResult["skipped"] = [];
  const crossesStack = (ids: Array<number | string>, zs: number[], bounds: B) => {
    const lo = Math.min(...zs);
    const hi = Math.max(...zs);
    return items.some((o) => !ids.includes(o.id) && o.z > lo && o.z < hi && inter(o.bounds, bounds) > 0 && !isBackground(o));
  };
  const leafIds = (u: Unit): Array<number | string> => [...u.ids, ...(u.child ? leafIds(u.child) : [])];
  const allZs = (u: Unit): number[] => [...u.zs];
  const toProposal = (u: Unit): GroupProposal => ({
    name: u.role === "label" ? `${pt ? "Rótulo" : "Label"} – ${u.title}` : u.role === "card" ? `Card – ${u.title}` : `Item – ${u.title}`,
    role: u.role === "label" ? "label" : u.role === "card" ? "card" : "item",
    members: u.ids,
    children: u.child ? [toProposal(u.child)] : [],
    bounds: u.bounds
  });
  const proposals: GroupProposal[] = [];
  for (const l of lists) {
    const ids = l.members.flatMap(leafIds);
    const zs = l.members.flatMap(allZs);
    const b = union(l.members.map((m) => m.bounds));
    const isButtons = l.members.every((m) => m.role === "label");
    const isCards = l.members.every((m) => m.role === "card");
    const name = isCards
      ? `Cards (${l.members.length})`
      : pt
        ? `${isButtons ? "Botões" : "Lista"} (${l.members.length} ${isButtons ? "botões" : "itens"})`
        : `${isButtons ? "Buttons" : "List"} (${l.members.length})`;
    if (crossesStack(ids, zs, b)) {
      skipped.push({ name, reason: "another layer sits between its members in the stack and overlaps them" });
      continue;
    }
    proposals.push({ name, role: l.role, members: [], children: l.members.map(toProposal), bounds: b });
  }
  for (const u of all.filter((x) => !inList.has(x))) {
    const p = toProposal(u);
    if (crossesStack(leafIds(u), allZs(u), u.bounds)) {
      skipped.push({ name: p.name, reason: "another layer sits between its members in the stack and overlaps them" });
      continue;
    }
    proposals.push(p);
  }
  const ungroupedRelated = proposals.reduce((n, p) => n + countLeaves(p), 0);
  return { proposals, skipped, ungroupedRelated };
}

export function countLeaves(p: GroupProposal): number {
  return p.members.length + p.children.reduce((n, c) => n + countLeaves(c), 0);
}

/** A layer/object tree node as the apps report it (Photoshop layer tree, Illustrator/InDesign page items). */
export interface TreeNode {
  id: number | string;
  name: string;
  kind: ItemKind;
  bounds: [number, number, number, number] | null;
  text?: string;
  visible?: boolean;
  children?: TreeNode[];
}

/** Runs proposeGroups on every container of a tree (top level and each existing group). */
export function planTree(nodes: TreeNode[], canvas: { width: number; height: number }, opts: { language?: "pt" | "en" } = {}): {
  plans: Array<{ container: string; proposals: GroupProposal[] }>;
  skipped: GroupingResult["skipped"];
  ungroupedRelated: number;
} {
  const plans: Array<{ container: string; proposals: GroupProposal[] }> = [];
  const skipped: GroupingResult["skipped"] = [];
  let ungrouped = 0;
  // Inside an artboard or a group, sizes are judged against that container, not the whole canvas (a document
  // with four artboards would otherwise see each artboard's background as a small shape).
  const walk = (list: TreeNode[], container: string, box: { width: number; height: number } = canvas) => {
    const items: LayoutItem[] = list
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.bounds && n.visible !== false)
      .map(({ n, i }) => ({ id: n.id, name: n.name, kind: n.kind, bounds: n.bounds as [number, number, number, number], z: i, text: n.text }));
    const r = proposeGroups(items, box, opts);
    if (r.proposals.length) plans.push({ container, proposals: r.proposals });
    skipped.push(...r.skipped);
    ungrouped += r.ungroupedRelated;
    for (const n of list) {
      if (n.kind !== "group" || !n.children?.length) continue;
      const b = n.bounds;
      const inner = b && b[2] - b[0] > 0 && b[3] - b[1] > 0 ? { width: b[2] - b[0], height: b[3] - b[1] } : box;
      walk(n.children, `${container}/${n.name}`, inner);
    }
  };
  walk(nodes, "");
  return { plans, skipped, ungroupedRelated: ungrouped };
}

/** Photoshop layer tree (ps.layers.layoutInfo) -> TreeNode. */
export function psTreeToNodes(layers: Array<Record<string, unknown>>): TreeNode[] {
  return layers.map((l) => {
    const typename = String(l.typename ?? "");
    const k = String(l.kind ?? "");
    const kind: ItemKind =
      typename === "LayerSet"
        ? "group"
        : /TEXT/.test(k)
          ? "text"
          : /SOLIDFILL|GRADIENTFILL|PATTERNFILL/.test(k)
            ? "shape"
            : /SMARTOBJECT/.test(k)
              ? "smart"
              : /NORMAL/.test(k)
                ? "pixel"
                : k
                  ? "adjustment"
                  : "other";
    const b = Array.isArray(l.bounds) ? (l.bounds as number[]).map(Number) : null;
    return {
      id: Number(l.id),
      name: String(l.name ?? ""),
      kind,
      bounds: b && b.length === 4 ? ([b[0], b[1], b[2], b[3]] as [number, number, number, number]) : null,
      text: typeof l.text === "string" ? l.text : undefined,
      visible: l.visible !== false,
      children: Array.isArray(l.children) ? psTreeToNodes(l.children as Array<Record<string, unknown>>) : undefined
    };
  });
}
