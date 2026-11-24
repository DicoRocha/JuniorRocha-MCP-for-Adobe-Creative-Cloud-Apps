/**
 * Skills first (21/11/2026, asked by the author): no task in the Adobe apps may start without the craft skills.
 * Every tool that creates or changes something passes this gate. Until the agent has looked up the skills in this
 * server session (jradb_find_skills or jradb_get_skill), such a tool answers SKILLS_REQUIRED and nothing runs.
 *
 * Modes (JRADB_MCP_SKILLS_GATE): "strict" (default) blocks; "notice" runs the tool and adds a reminder to the
 * answer; "off" disables the gate.
 */

export type SkillGateMode = "strict" | "notice" | "off";

interface GateState {
  consulted: boolean;
  loaded: string[];
  searches: string[];
  /** Apps covered by the skills looked up for the current request ("*" = every app). */
  apps: Set<string>;
  lastActivity: number;
}

const state: GateState = { consulted: false, loaded: [], searches: [], apps: new Set(), lastActivity: 0 };

/**
 * A new request must look its skills up again (23/11/2026, asked by the author). The server does not see the
 * messages, so it reads two signs: work moves to an app no looked-up skill covers (a photo session that turns to
 * video), or the session was idle for JRADB_MCP_SKILLS_IDLE_MIN minutes (default 60) since the last lookup or change.
 */
export function appsOfSkill(name: string): string[] {
  const n = name.toLowerCase();
  if (/^app-(code-mode)$|^pipeline-/.test(n)) return ["*"];
  const m = /^app-(photoshop|illustrator|indesign|lightroom|premiere|after-effects)$/.exec(n);
  if (m) return [m[1]];
  if (n.startsWith("foto-")) return ["lightroom", "photoshop"];
  if (n.startsWith("video-")) return ["premiere", "after-effects"];
  if (n.startsWith("motion-")) return ["after-effects"];
  if (n.startsWith("print-")) return ["indesign", "illustrator"];
  if (n.startsWith("vetor-")) return ["illustrator"];
  if (/^(craft|social|design|ads)-/.test(n)) return ["photoshop", "illustrator", "indesign"];
  return [];
}

const PREFIX_APP: Record<string, string> = { ps: "photoshop", ai: "illustrator", id: "indesign", lr: "lightroom", pr: "premiere", ae: "after-effects" };

export function appOfTool(name: string): string | null {
  return PREFIX_APP[name.split("_")[0]] ?? null;
}

function idleMs(): number {
  const v = Number(process.env.JRADB_MCP_SKILLS_IDLE_MIN);
  return (Number.isFinite(v) && v > 0 ? v : 60) * 60000;
}

/** Why a gated tool needs a fresh lookup now, or null. */
function freshLookupReason(name: string, now: number): string | null {
  if (!state.consulted) return "no skill has been looked up in this session yet";
  if (state.lastActivity && now - state.lastActivity > idleMs()) {
    return `the session was idle for more than ${Math.round(idleMs() / 60000)} min, so this is probably a new request`;
  }
  const app = appOfTool(name);
  if (app && !state.apps.has("*") && !state.apps.has(app)) {
    return `the work moved to ${app} and no skill looked up for this request covers it (looked up: ${state.loaded.join(", ") || "searches only"})`;
  }
  return null;
}

export function skillGateMode(): SkillGateMode {
  const v = String(process.env.JRADB_MCP_SKILLS_GATE || "strict").toLowerCase();
  return v === "off" || v === "notice" ? v : "strict";
}

/** Called by jradb_get_skill (name = the skill loaded, or "studio-router") and jradb_find_skills (search text). */
export function markSkillsConsulted(entry: { skill?: string; search?: string; matches?: string[] }, now: number = Date.now()): void {
  if (state.lastActivity && now - state.lastActivity > idleMs()) {
    // a lookup after a long pause starts a new request: coverage starts over
    state.apps = new Set();
    state.loaded = [];
  }
  state.consulted = true;
  state.lastActivity = now;
  if (entry.skill && !state.loaded.includes(entry.skill)) state.loaded.push(entry.skill);
  if (entry.skill) for (const a of appsOfSkill(entry.skill)) state.apps.add(a);
  for (const m of entry.matches ?? []) for (const a of appsOfSkill(m)) state.apps.add(a);
  if (entry.search) state.searches.push(entry.search.slice(0, 120));
}

/** A gated tool ran: the request is still going. */
export function markGatedActivity(now: number = Date.now()): void {
  state.lastActivity = now;
}

export function skillGateState(): { mode: SkillGateMode; consulted: boolean; loaded: string[]; searches: string[]; apps: string[] } {
  return { mode: skillGateMode(), consulted: state.consulted, loaded: [...state.loaded], searches: [...state.searches], apps: [...state.apps] };
}

/** Test helper: back to a fresh session. */
export function resetSkillGate(): void {
  state.consulted = false;
  state.loaded = [];
  state.searches = [];
  state.apps = new Set();
  state.lastActivity = 0;
}

/** Tools that only read, look, plan or manage the session: never gated. Everything else creates or changes work. */
const READ_ONLY =
  /^(jradb_(get_status|get_skill|find_skills|usage|api|code|batch|launch_app|checkpoint|inspect_dom|contact_sheet)|media_(job_status|analyze_audio)|pr_expect_project)$|_(get|list)_|^(ps|ae|pr|ai|id|lr)_list_|_find_|_audit_|_audit$|_info$|_preview$|_snapshot$|_contact_sheet$|_layer_tree$|_property_tree$|_stats$|_measure_landings$|_sequence_state$|_get_layers$|_list_documents$|_list_fonts$|_list_compositions$|_list_effects$|_list_presets$|_list_clip_effects$|_list_actions$|_list_develop_presets$/;

export function isGatedTool(name: string): boolean {
  return !READ_ONLY.test(name);
}

export const SKILLS_REQUIRED_MESSAGE =
  "Skills first: this tool creates or changes work, and no skill has been looked up in this session yet. " +
  "Call jradb_find_skills with the task in plain words (or jradb_get_skill with no arguments for the router), tell the " +
  "person which skills you will follow and ask whether to go ahead with them, load each one with jradb_get_skill " +
  "{ name }, then run this tool again following the skill's steps and exit gate.";

const NEW_REQUEST_MESSAGE =
  "Skills first, again for each new request: call jradb_find_skills with what the person asks for now, tell them which " +
  "skills you will follow, load them with jradb_get_skill { name } and run this tool again.";

/** Returns an error to answer with, or null when the tool may run. */
export function checkSkillGate(name: string, now: number = Date.now()): Error | null {
  if (!isGatedTool(name) || skillGateMode() !== "strict") return null;
  const why = freshLookupReason(name, now);
  if (!why) {
    markGatedActivity(now);
    return null;
  }
  const msg = state.consulted ? `${NEW_REQUEST_MESSAGE} Reason: ${why}. (blocked: ${name})` : `${SKILLS_REQUIRED_MESSAGE} (blocked: ${name})`;
  return Object.assign(new Error(msg), { code: "SKILLS_REQUIRED" });
}

/** "notice" mode: text appended to the answer of a gated tool run without the lookup the request needs. */
export function skillGateNotice(name: string, now: number = Date.now()): string | null {
  if (!isGatedTool(name) || skillGateMode() !== "notice") return null;
  const why = freshLookupReason(name, now);
  markGatedActivity(now);
  if (!why) return null;
  return state.consulted ? `Notice: ${name} ran although ${why}. ${NEW_REQUEST_MESSAGE}` : `Notice: ${name} ran before any skill was looked up. ${SKILLS_REQUIRED_MESSAGE}`;
}
