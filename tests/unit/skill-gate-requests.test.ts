import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appsOfSkill, checkSkillGate, markSkillsConsulted, resetSkillGate, skillGateNotice } from "../../src/core/skill-gate.js";

describe("skills again for each new request", () => {
  beforeEach(() => {
    resetSkillGate();
    process.env.JRADB_MCP_SKILLS_GATE = "strict";
  });
  afterEach(() => {
    process.env.JRADB_MCP_SKILLS_GATE = "off";
    delete process.env.JRADB_MCP_SKILLS_IDLE_MIN;
  });

  it("maps skills to the apps they cover", () => {
    expect(appsOfSkill("foto-retrato")).toEqual(["lightroom", "photoshop"]);
    expect(appsOfSkill("motion-logo-e-vinheta")).toEqual(["after-effects"]);
    expect(appsOfSkill("app-premiere")).toEqual(["premiere"]);
    expect(appsOfSkill("qa-revisao-visual")).toEqual([]);
  });

  it("photo skills open Lightroom and Photoshop, not Premiere: a move to video asks for its skills", () => {
    const t0 = 1_000_000;
    markSkillsConsulted({ skill: "foto-revelacao" }, t0);
    expect(checkSkillGate("lr_apply_develop_settings", t0 + 1000)).toBeNull();
    const e = checkSkillGate("pr_apply_cut_plan", t0 + 2000) as Error & { code?: string };
    expect(e.code).toBe("SKILLS_REQUIRED");
    expect(e.message).toMatch(/moved to premiere/);
    markSkillsConsulted({ search: "cortar a fala no premiere", matches: ["video-fala-limpa"] }, t0 + 3000);
    expect(checkSkillGate("pr_apply_cut_plan", t0 + 4000)).toBeNull();
  });

  it("after a long pause the next change needs a fresh lookup, and the old coverage is dropped", () => {
    process.env.JRADB_MCP_SKILLS_IDLE_MIN = "30";
    const t0 = 5_000_000;
    markSkillsConsulted({ skill: "social-post" }, t0);
    expect(checkSkillGate("ps_create_layer", t0 + 10 * 60000)).toBeNull();
    const e = checkSkillGate("ps_create_layer", t0 + 50 * 60000) as Error;
    expect(e.message).toMatch(/idle for more than 30 min/);
    markSkillsConsulted({ skill: "motion-fundamentos" }, t0 + 51 * 60000);
    expect(checkSkillGate("ae_create_shape_layer", t0 + 52 * 60000)).toBeNull();
    expect((checkSkillGate("ps_create_layer", t0 + 53 * 60000) as Error).message).toMatch(/moved to photoshop/);
  });

  it("tools of no app (media, campaign) only need some lookup; read-only tools never wait", () => {
    const t0 = 9_000_000;
    expect(checkSkillGate("ae_get_layers", t0)).toBeNull();
    markSkillsConsulted({ skill: "plan-briefing" }, t0);
    expect(checkSkillGate("media_normalize_loudness", t0 + 1000)).toBeNull();
  });

  it("notice mode says why", () => {
    process.env.JRADB_MCP_SKILLS_GATE = "notice";
    markSkillsConsulted({ skill: "foto-retrato" }, 1);
    expect(skillGateNotice("ae_create_shape_layer", 2)).toMatch(/moved to after-effects/);
  });
});
