/**
 * Compact TypeScript-like signatures from zod shapes, for jradb_api: a script author reads only what it needs
 * (`ps_audit_document(a: { documentName?: string; format?: "feed4x5" | ... })`) instead of every tool's JSON schema.
 */
import { z } from "zod";

// zod 4: the definition lives in `_zod.def` and its kind in `def.type` ("string", "optional", "pipe", ...).
type ZodDef = Record<string, unknown> & { type?: string };
type AnyZod = { _zod: { def: ZodDef }; description?: string; minValue?: number | null; maxValue?: number | null; isInt?: boolean };

const def = (t: AnyZod): ZodDef => t._zod.def;

function inner(t: AnyZod): { type: AnyZod; optional: boolean; def?: unknown } {
  let cur = t;
  let optional = false;
  let dflt: unknown;
  for (let i = 0; i < 10; i++) {
    const d = def(cur);
    if (d.type === "optional" || d.type === "nullable") {
      optional = true;
      cur = d.innerType as AnyZod;
    } else if (d.type === "default" || d.type === "prefault") {
      optional = true;
      dflt = d.defaultValue;
      cur = d.innerType as AnyZod;
    } else if (d.type === "pipe") {
      // preprocess: in = transform, out = the schema; .transform(): in = the schema, out = transform
      const out = d.out as AnyZod;
      cur = def(out).type === "transform" ? (d.in as AnyZod) : out;
    } else break;
  }
  return { type: cur, optional, def: dflt };
}

/** Bounds as a comment; the safe-integer limits that .int() adds by itself are not real bounds. */
function range(t: AnyZod): string {
  const real = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) !== Number.MAX_SAFE_INTEGER;
  const min = real(t.minValue) ? t.minValue : undefined;
  const max = real(t.maxValue) ? t.maxValue : undefined;
  const parts: string[] = [];
  if (t.isInt) parts.push("int");
  if (min !== undefined && max !== undefined) parts.push(`${min}–${max}`);
  else if (min !== undefined) parts.push(`≥${min}`);
  else if (max !== undefined) parts.push(`≤${max}`);
  return parts.length ? `/*${parts.join(" ")}*/` : "";
}

export function typeToTs(t: AnyZod, depth = 0): string {
  const { type } = inner(t);
  const d = def(type);
  switch (d.type) {
    case "string":
      return "string";
    case "number":
      return `number${range(type)}`;
    case "boolean":
      return "boolean";
    case "literal":
      return (d.values as unknown[]).map((v) => JSON.stringify(v)).join(" | ");
    case "enum":
      return Object.values(d.entries as Record<string, string | number>).map((v) => JSON.stringify(v)).join(" | ");
    case "array": {
      const el = typeToTs(d.element as AnyZod, depth + 1);
      return /[|&]/.test(el) && !el.startsWith("{") ? `(${el})[]` : `${el}[]`;
    }
    case "tuple":
      return `[${(d.items as AnyZod[]).map((i) => typeToTs(i, depth + 1)).join(", ")}]`;
    case "union":
      return (d.options as AnyZod[]).map((o) => typeToTs(o, depth + 1)).join(" | ");
    case "record":
      return `Record<string, ${typeToTs(d.valueType as AnyZod, depth + 1)}>`;
    case "object":
      if (depth > 3) return "object";
      return shapeToTs(d.shape as z.ZodRawShape, depth + 1, false);
    default:
      return "any";
  }
}

/** `{ a?: string; b: number }` — with `docs`, a short comment per field (default value, first sentence). */
export function shapeToTs(shape: z.ZodRawShape, depth = 0, docs = true): string {
  const fields = Object.entries(shape).map(([k, v]) => {
    const z0 = v as unknown as AnyZod;
    const { optional, def } = inner(z0);
    const desc = docs ? firstSentence(z0.description ?? inner(z0).type.description) : "";
    const notes = [def !== undefined ? `default ${JSON.stringify(def)}` : "", desc].filter(Boolean).join("; ");
    return `${k}${optional ? "?" : ""}: ${typeToTs(z0, depth)}${notes ? ` // ${notes}` : ""}`;
  });
  if (!fields.length) return "{}";
  if (!docs) return `{ ${fields.join("; ")} }`;
  return `{\n${fields.map((f) => `  ${f};`).join("\n")}\n}`;
}

export function firstSentence(s?: string, max = 140): string {
  if (!s) return "";
  const one = s.replace(/\s+/g, " ").trim();
  // end at the first . ! ? followed by a space — but not after an abbreviation (e.g., i.e., etc., ex., vs.) or a number
  const abbrev = /(?:\b(?:e\.g|i\.e|etc|ex|vs|approx|aprox|p\.ex|cf)\.|\d\.)$/i;
  let out = one;
  for (const m of one.matchAll(/[.!?](?=\s|$)/g)) {
    const head = one.slice(0, (m.index ?? 0) + 1);
    if (abbrev.test(head)) continue;
    out = head;
    break;
  }
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}
