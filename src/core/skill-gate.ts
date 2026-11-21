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
}

const state: GateState = { consulted: false, loaded: [], searches: [] };

export function skillGateMode(): SkillGateMode {
  const v = String(process.env.JRADB_MCP_SKILLS_GATE || "strict").toLowerCase();
  return v === "off" || v === "notice" ? v : "strict";
}

/** Called by jradb_get_skill (name = the skill loaded, or "studio-router") and jradb_find_skills (search text). */
export function markSkillsConsulted(entry: { skill?: string; search?: string }): void {
  state.consulted = true;
  if (entry.skill && !state.loaded.includes(entry.skill)) state.loaded.push(entry.skill);
  if (entry.search) state.searches.push(entry.search.slice(0, 120));
}

export function skillGateState(): { mode: SkillGateMode; consulted: boolean; loaded: string[]; searches: string[] } {
  return { mode: skillGateMode(), consulted: state.consulted, loaded: [...state.loaded], searches: [...state.searches] };
}

/** Test helper: back to a fresh session. */
export function resetSkillGate(): void {
  state.consulted = false;
  state.loaded = [];
  state.searches = [];
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

/** Returns an error to answer with, or null when the tool may run. */
export function checkSkillGate(name: string): Error | null {
  if (state.consulted || !isGatedTool(name) || skillGateMode() !== "strict") return null;
  return Object.assign(new Error(`${SKILLS_REQUIRED_MESSAGE} (blocked: ${name})`), { code: "SKILLS_REQUIRED" });
}

/** "notice" mode: text appended to the answer of a gated tool run before any skill lookup. */
export function skillGateNotice(name: string): string | null {
  if (state.consulted || !isGatedTool(name) || skillGateMode() !== "notice") return null;
  return `Notice: ${name} ran before any skill was looked up. ${SKILLS_REQUIRED_MESSAGE}`;
}
