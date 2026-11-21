/**
 * Writes the tool reference from the server's own tool list, so the pages never drift from the code:
 *   docs/tools/README.md (index) and docs/tools/<group>.md (every tool with its parameters).
 *
 *   npm run build && npm run docs
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface Tool {
  name: string;
  description: string;
  inputSchema: { properties?: Record<string, Record<string, unknown>>; required?: string[] };
}

const GROUPS: Array<{ prefix: string[]; file: string; title: string; intro: string }> = [
  { prefix: ["jradb"], file: "shared", title: "Shared tools", intro: "Status, code mode, skills, checkpoints, templates and campaigns. They work across apps." },
  { prefix: ["ps"], file: "photoshop", title: "Photoshop", intro: "Documents, layers, masks, smart objects, adjustments, artboards, recipes and audits." },
  { prefix: ["ai"], file: "illustrator", title: "Illustrator", intro: "Shapes, paths, pathfinder, gradients, live effects, swatches, artboards and export." },
  { prefix: ["id"], file: "indesign", title: "InDesign", intro: "Documents, text frames, styles, tables, links, data merge, preflight and export." },
  { prefix: ["lr"], file: "lightroom-classic", title: "Lightroom Classic", intro: "Finding photos, develop settings, presets, snapshots, collections and export." },
  { prefix: ["ae"], file: "after-effects", title: "After Effects", intro: "Compositions, layers, keyframes, easing, effects, text animators, transitions and audits." },
  { prefix: ["pr"], file: "premiere-pro", title: "Premiere Pro", intro: "Projects, sequences, clips, effects, transitions, captions, markers and export." },
  { prefix: ["media", "text"], file: "media", title: "Media and text", intro: "Analysis of audio and video files outside the apps (beats, silence, transcription) and text helpers." }
];

async function toolList(): Promise<Tool[]> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const { createAdobeMcpServer } = await import("../src/server.js");
  const rt = createAdobeMcpServer({ enableOsFallback: false, toolMode: "full" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await rt.server.connect(a);
  const c = new Client({ name: "docs", version: "1" });
  await c.connect(b);
  const tools = (await c.listTools()).tools as unknown as Tool[];
  await c.close();
  return tools;
}

const cell = (s: string): string => s.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();

function typeOf(p: Record<string, unknown>): string {
  if (Array.isArray(p.enum)) return (p.enum as unknown[]).map((v) => `\`${String(v)}\``).join(" · ");
  const any = (p.anyOf ?? p.oneOf) as Array<Record<string, unknown>> | undefined;
  if (any) return [...new Set(any.map(typeOf))].join(" or ");
  if (p.type === "array") return `${p.items ? typeOf(p.items as Record<string, unknown>) : "any"}[]`;
  if (Array.isArray(p.type)) return (p.type as string[]).join(" or ");
  return typeof p.type === "string" ? p.type : "any";
}

function firstSentence(d: string): string {
  const s = d.replace(/\s+/g, " ").trim().split(/(?<=\.)\s/)[0];
  return s.length > 180 ? `${s.slice(0, 177).replace(/\s\S*$/, "")}…` : s;
}

function toolSection(t: Tool): string {
  const out = [`## \`${t.name}\``, "", t.description.replace(/\s+/g, " ").trim(), ""];
  const props = t.inputSchema?.properties ?? {};
  const required = new Set(t.inputSchema?.required ?? []);
  const names = Object.keys(props);
  if (names.length === 0) {
    out.push("No parameters.", "");
    return out.join("\n");
  }
  out.push("| Parameter | Type | Required | Description |", "|---|---|:---:|---|");
  for (const n of names) {
    const p = props[n];
    const extra = p.default !== undefined ? ` Default: \`${JSON.stringify(p.default)}\`.` : "";
    out.push(`| \`${n}\` | ${cell(typeOf(p))} | ${required.has(n) ? "yes" : ""} | ${cell(String(p.description ?? ""))}${extra} |`);
  }
  out.push("");
  return out.join("\n");
}

async function main() {
  const tools = await toolList();
  const dir = path.join(root, "docs", "tools");
  fs.mkdirSync(dir, { recursive: true });
  const index = [
    "# Tool reference",
    "",
    `All ${tools.length} tools, generated from the server's own tool list by \`npm run docs\`.`,
    "",
    "In the default **code** mode the client sees six tools and reaches the rest through `jradb_code` and `jradb_api`.",
    "Start the server with `--tools full` to expose every tool directly.",
    "",
    "| Page | Tools | What it covers |",
    "|---|---:|---|"
  ];
  const pages: string[] = [];
  let seen = 0;
  for (const g of GROUPS) {
    const mine = tools.filter((t) => g.prefix.includes(t.name.split("_")[0]));
    seen += mine.length;
    index.push(`| [${g.title}](${g.file}.md) | ${mine.length} | ${g.intro} |`);
    const page = [`# ${g.title}`, "", g.intro, "", `[← All tools](README.md)`, "", "| Tool | What it does |", "|---|---|"];
    for (const t of mine) page.push(`| [\`${t.name}\`](#${t.name}) | ${cell(firstSentence(t.description))} |`);
    page.push("");
    for (const t of mine) page.push(toolSection(t));
    fs.writeFileSync(path.join(dir, `${g.file}.md`), page.join("\n"));
    pages.push(`${g.file}.md (${mine.length})`);
  }
  if (seen !== tools.length) throw new Error(`${tools.length - seen} tools belong to no group: add their prefix to GROUPS.`);
  index.push("");
  fs.writeFileSync(path.join(dir, "README.md"), index.join("\n"));
  console.log(`docs/tools: ${pages.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
