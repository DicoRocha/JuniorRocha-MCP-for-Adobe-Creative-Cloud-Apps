import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatErrorResponse, formatSuccessResponse } from "../../core/image-helper.js";
import { appsOfSkill, markSkillsConsulted, skillGateState } from "../../core/skill-gate.js";

/**
 * Serves the skills in <project>/skills over MCP, so every client (Claude Desktop, Codex, Cursor…)
 * gets the same craft knowledge without installing anything else. Layout:
 *   skills/index.md                      router (returned when no name is given)
 *   skills/<area>/<name>/SKILL.md        one skill, with YAML frontmatter (name, description)
 *   skills/<area>/<name>/references/*.md loaded only on request
 */

export interface SkillEntry {
  name: string;
  description: string;
  area: string;
  dir: string;
  references: string[];
}

/** <project>/skills, from dist/tools/shared or src/tools/shared; JRADB_MCP_SKILLS_DIR overrides. */
export function resolveSkillsRoot(): string {
  if (process.env.JRADB_MCP_SKILLS_DIR) {
    return path.resolve(process.env.JRADB_MCP_SKILLS_DIR);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..", "skills");
}

export function parseFrontmatter(text: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const out: Record<string, string> = {};
  if (!m) {
    return out;
  }
  let key = "";
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) {
      key = kv[1];
      out[key] = kv[2].replace(/^["']|["']$/g, "").replace(/^>-?\s*$/, "").trim();
    } else if (key && /^\s+\S/.test(line)) {
      out[key] = `${out[key]} ${line.trim()}`.trim();
    }
  }
  return out;
}

export function listSkills(root: string): SkillEntry[] {
  const found: SkillEntry[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || !fs.existsSync(dir)) {
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "references") {
        continue;
      }
      const full = path.join(dir, entry.name);
      const skillFile = path.join(full, "SKILL.md");
      if (fs.existsSync(skillFile)) {
        const fm = parseFrontmatter(fs.readFileSync(skillFile, "utf8"));
        const refDir = path.join(full, "references");
        found.push({
          name: fm.name || entry.name,
          description: fm.description || "",
          area: path.relative(root, dir).split(path.sep).join("/") || ".",
          dir: full,
          references: fs.existsSync(refDir)
            ? fs.readdirSync(refDir).filter((f) => f.endsWith(".md") || f.endsWith(".json")).sort()
            : []
        });
      }
      walk(full, depth + 1);
    }
  };
  walk(root, 0);
  return found.sort((a, b) => (a.area + a.name).localeCompare(b.area + b.name));
}

export interface SkillMatch {
  name: string;
  area: string;
  score: number;
  description: string;
  references: string[];
}

/** Lower case, no accents, words of 3+ letters (Portuguese and English stop words dropped). */
export function skillTerms(text: string): string[] {
  const stop = new Set(
    "para com uma umas uns que por dos das nos nas del the and for with from this that into como mais sem sua seu suas seus ser sao esta este isso essa esse fazer quero preciso".split(" ")
  );
  return [
    ...new Set(
      text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 && !stop.has(w))
    )
  ];
}

/**
 * Ranks the skills for a task described in plain words. Name and area weigh most, then the description, then the
 * body of SKILL.md; prefix matches count ("anima" finds "animacao"), so the person's wording does not have to match.
 */
export function findSkills(root: string, task: string, limit = 6): SkillMatch[] {
  const terms = skillTerms(task);
  if (!terms.length) return [];
  const out: SkillMatch[] = [];
  for (const s of listSkills(root)) {
    const name = skillTerms(`${s.name} ${s.area}`);
    const desc = skillTerms(s.description);
    let body: string[] = [];
    try {
      body = skillTerms(fs.readFileSync(path.join(s.dir, "SKILL.md"), "utf8"));
    } catch {
      body = [];
    }
    const hit = (words: string[], t: string) => words.some((w) => w === t || (t.length >= 4 && (w.startsWith(t) || t.startsWith(w) && w.length >= 4)));
    let score = 0;
    for (const t of terms) {
      if (hit(name, t)) score += 5;
      if (hit(desc, t)) score += 3;
      if (hit(body, t)) score += 1;
    }
    // A skill whose name is mostly about something else ranks lower on a tie ("post" alone does not make an animation).
    if (score > 0) score -= 0.5 * name.filter((w) => !terms.some((t) => hit([w], t))).length;
    if (score > 0) out.push({ name: s.name, area: s.area, score, description: s.description, references: s.references });
  }
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return out.slice(0, Math.max(1, limit));
}

export function registerSkillTools(server: McpServer, root: string = resolveSkillsRoot()): void {
  server.tool(
    "jradb_find_skills",
    "Skills first: call this BEFORE any task in the Adobe apps, with the task in plain words (any language). Returns " +
      "the skills that fit, best first, plus the exit-gate skills every delivery needs. Then tell the person which skills you will " +
      "follow and ask once whether to go ahead with them; load each with jradb_get_skill { name } and follow its steps " +
      "and exit gate. Tools that create or change work stay blocked (SKILLS_REQUIRED) until skills were looked up.",
    {
      task: z.string().min(2).describe("What the person asked for, e.g. 'carrossel para Instagram sobre o curso'."),
      limit: z.number().int().min(1).max(15).optional().default(6)
    },
    async ({ task, limit }) => {
      try {
        if (!fs.existsSync(root)) {
          throw Object.assign(new Error(`Skills folder not found: ${root}. Set JRADB_MCP_SKILLS_DIR or reinstall the project.`), {
            code: "SKILLS_NOT_FOUND"
          });
        }
        const matches = findSkills(root, task, limit);
        // The three best matches open their apps; a cross-app skill (pipeline) only when it is loaded.
        markSkillsConsulted({ search: task, matches: matches.slice(0, 3).map((m) => m.name).filter((n) => !appsOfSkill(n).includes("*")) });
        // The exit gate applies to every deliverable (router rule 5); motion and video add their own review.
        const names = new Set(listSkills(root).map((s) => s.name));
        const always = ["qa-revisao-visual", ...(matches.some((m) => /^(motion|video)/.test(m.area)) ? ["qa-revisao-video"] : [])].filter(
          (n) => names.has(n) && !matches.some((m) => m.name === n)
        );
        return formatSuccessResponse({
          task,
          matches: matches.map((m) => ({ name: m.name, area: m.area, score: m.score, description: m.description, references: m.references })),
          alsoLoad: always,
          next:
            matches.length > 0
              ? "Tell the person which of these skills you will follow (names and one line each) and ask whether to go ahead with them. Then load each with jradb_get_skill { name } before the first tool that creates or changes work."
              : "No skill matched these words. Call jradb_get_skill with no arguments for the router, or list: true, and choose from there; tell the person if no skill covers the task.",
          gate: skillGateState()
        });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );


  server.tool(
    "jradb_get_skill",
    "Craft knowledge for marketing and advertising work in the Adobe apps (planning, scripts, prompts for external AI, " +
      "design fundamentals, photo, social, vector, motion, video, print, QA). Call with no arguments FIRST for any " +
      "creative deliverable: it returns the router (studio-router) that says which skills to load and in what order. " +
      "Then call with `name` to load a skill, and with `name` + `reference` for one of its reference files. " +
      "`list: true` lists every skill with its description.",
    {
      name: z.string().optional().describe("Skill name, e.g. 'social-post'. Omit to get the router."),
      reference: z.string().optional().describe("File in the skill's references/ folder, e.g. 'formatos.md'."),
      list: z.boolean().optional().default(false).describe("List every skill (name, area, description, references).")
    },
    async ({ name, reference, list }) => {
      try {
        if (!fs.existsSync(root)) {
          throw Object.assign(new Error(`Skills folder not found: ${root}. Set JRADB_MCP_SKILLS_DIR or reinstall the project.`), {
            code: "SKILLS_NOT_FOUND"
          });
        }
        const skills = listSkills(root);
        markSkillsConsulted({ skill: name || (list ? "list" : "studio-router") });
        if (list) {
          return formatSuccessResponse({
            root,
            count: skills.length,
            skills: skills.map((s) => ({ name: s.name, area: s.area, description: s.description, references: s.references }))
          });
        }
        if (!name) {
          const indexFile = path.join(root, "index.md");
          const index = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, "utf8") : "# Skills\n";
          const short = (d: string) => {
            const first = d.split(/ — |\. /)[0];
            return first.length > 150 ? `${first.slice(0, 147)}...` : first;
          };
          const catalog = skills.map((s) => `- \`${s.name}\` (${s.area}) — ${short(s.description)}`).join("\n");
          return formatSuccessResponse(`${index.trim()}\n\n## Skills disponíveis agora (${skills.length})\n\n${catalog}\n`);
        }
        const skill = skills.find((s) => s.name === name || path.basename(s.dir) === name);
        if (!skill) {
          const close = skills
            .map((s) => s.name)
            .filter((n) => n.includes(name) || name.includes(n.split("-")[0]))
            .slice(0, 5);
          throw Object.assign(
            new Error(`Unknown skill '${name}'.${close.length ? ` Did you mean: ${close.join(", ")}?` : ""} Call with list: true.`),
            { code: "INVALID_PARAMS" }
          );
        }
        if (reference) {
          if (!/^[\w.-]+$/.test(reference) || reference.includes("..")) {
            throw Object.assign(new Error(`Invalid reference name '${reference}'.`), { code: "INVALID_PARAMS" });
          }
          const refFile = path.join(skill.dir, "references", reference);
          if (!fs.existsSync(refFile)) {
            throw Object.assign(
              new Error(`'${skill.name}' has no reference '${reference}'. Available: ${skill.references.join(", ") || "none"}.`),
              { code: "INVALID_PARAMS" }
            );
          }
          return formatSuccessResponse(fs.readFileSync(refFile, "utf8"));
        }
        const body = fs.readFileSync(path.join(skill.dir, "SKILL.md"), "utf8");
        const refs = skill.references.length
          ? `\n\n---\nReferências desta skill (carregar com reference): ${skill.references.join(", ")}\n`
          : "";
        return formatSuccessResponse(body + refs);
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}
