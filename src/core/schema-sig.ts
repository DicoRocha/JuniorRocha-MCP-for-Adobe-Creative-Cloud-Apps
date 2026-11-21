/**
 * Compact TypeScript-like signatures from zod shapes, for jradb_api: a script author reads only what it needs
 * (`ps_audit_document(a: { documentName?: string; format?: "feed4x5" | ... })`) instead of every tool's JSON schema.
 */
import { z } from "zod";

type AnyZod = z.ZodTypeAny & { _def: Record<string, unknown> & { typeName?: string } };

function inner(t: AnyZod): { type: AnyZod; optional: boolean; def?: unknown } {
  let cur = t;
  let optional = false;
  let def: unknown;
  for (let i = 0; i < 10; i++) {
    const tn = cur._def.typeName;
    if (tn === "ZodOptional" || tn === "ZodNullable") {
      optional = true;
      cur = cur._def.innerType as AnyZod;
    } else if (tn === "ZodDefault") {
      optional = true;
      def = (cur._def.defaultValue as () => unknown)();
      cur = cur._def.innerType as AnyZod;
    } else if (tn === "ZodEffects") {
      cur = cur._def.schema as AnyZod;
    } else break;
  }
  return { type: cur, optional, def };
}

function range(t: AnyZod): string {
  const checks = (t._def.checks as Array<{ kind: string; value?: number; inclusive?: boolean }>) ?? [];
  const min = checks.find((c) => c.kind === "min");
  const max = checks.find((c) => c.kind === "max");
  const isInt = checks.some((c) => c.kind === "int");
  const parts: string[] = [];
  if (isInt) parts.push("int");
  if (min && max) parts.push(`${min.value}–${max.value}`);
  else if (min) parts.push(`≥${min.value}`);
  else if (max) parts.push(`≤${max.value}`);
  return parts.length ? `/*${parts.join(" ")}*/` : "";
}

export function typeToTs(t: AnyZod, depth = 0): string {
  const { type } = inner(t);
  const tn = type._def.typeName;
  switch (tn) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return `number${range(type)}`;
    case "ZodBoolean":
      return "boolean";
    case "ZodLiteral":
      return JSON.stringify(type._def.value);
    case "ZodEnum":
      return (type._def.values as string[]).map((v) => JSON.stringify(v)).join(" | ");
    case "ZodNativeEnum":
      return Object.values(type._def.values as Record<string, string>).map((v) => JSON.stringify(v)).join(" | ");
    case "ZodArray": {
      const el = typeToTs(type._def.type as AnyZod, depth + 1);
      return /[|&]/.test(el) && !el.startsWith("{") ? `(${el})[]` : `${el}[]`;
    }
    case "ZodTuple":
      return `[${(type._def.items as AnyZod[]).map((i) => typeToTs(i, depth + 1)).join(", ")}]`;
    case "ZodUnion":
      return (type._def.options as AnyZod[]).map((o) => typeToTs(o, depth + 1)).join(" | ");
    case "ZodRecord":
      return `Record<string, ${typeToTs(type._def.valueType as AnyZod, depth + 1)}>`;
    case "ZodObject":
      if (depth > 3) return "object";
      return shapeToTs((type._def.shape as () => z.ZodRawShape)(), depth + 1, false);
    default:
      return "any";
  }
}

/** `{ a?: string; b: number }` — with `docs`, a short comment per field (default value, first sentence). */
export function shapeToTs(shape: z.ZodRawShape, depth = 0, docs = true): string {
  const fields = Object.entries(shape).map(([k, v]) => {
    const z0 = v as AnyZod;
    const { optional, def } = inner(z0);
    const desc = docs ? firstSentence(z0.description ?? (inner(z0).type.description as string | undefined)) : "";
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
