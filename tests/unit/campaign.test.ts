import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ToolCatalog } from "../../src/core/tool-catalog.js";
import { checkPlan, filesIn, gateApplies, orderPieces, PIECE_TYPES, registerCampaignTool, resolvePaths, type Plan } from "../../src/tools/campaign/index.js";

/** Fake tools: record calls, write a file when asked, fail on demand. */
function fakeCatalog(calls: string[]) {
  const cat = new ToolCatalog();
  const mk = (name: string, shape: z.ZodRawShape) =>
    cat.record([
      name,
      "fake",
      shape,
      async (a: Record<string, unknown>) => {
        calls.push(`${name}${a.kitPath ? "+kit" : ""}`);
        if (a.fail) return { isError: true, content: [{ type: "text", text: "boom" }] };
        if (typeof a.outputPath === "string") fs.writeFileSync(a.outputPath, "x");
        return { content: [{ type: "text", text: JSON.stringify({ outputPath: a.outputPath ?? null }) }] };
      }
    ]);
  mk("ps_recipe_product_shot", { filePath: z.string(), outputPath: z.string().optional(), kitPath: z.string().optional(), fail: z.boolean().optional() });
  mk("ps_recipe_social_set", { documentName: z.string().optional(), outputFolder: z.string().optional() });
  mk("ae_create_lower_third", { name: z.string(), role: z.string().optional(), kitPath: z.string().optional() });
  mk("id_recipe_flyer", { title: z.string(), kitPath: z.string().optional(), pdfPath: z.string().optional() });
  // the tool under test
  const server = { tool: (...args: unknown[]) => cat.record(args) } as never;
  registerCampaignTool(server, cat);
  return cat;
}

function campaign(plan: Plan, withKit = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "camp-"));
  fs.mkdirSync(path.join(root, "00_briefing"), { recursive: true });
  fs.mkdirSync(path.join(root, "02_design"), { recursive: true });
  fs.writeFileSync(path.join(root, "01_foto.jpg"), "x");
  fs.writeFileSync(path.join(root, "00_briefing", "plano-de-pecas.json"), JSON.stringify(plan));
  if (withKit) fs.writeFileSync(path.join(root, "00_briefing", "kit-de-marca.json"), JSON.stringify({ cores: [], tipos: {} }));
  return root;
}

const PLAN: Plan = {
  campanha: "Teste",
  pecas: [
    { id: "P04", tipo: "flyer", params: { title: "Flyer" } },
    { id: "P02", tipo: "formatos", params: { outputFolder: "@/02_design" }, depende: ["P01"] },
    { id: "P01", tipo: "produto", params: { filePath: "@/01_foto.jpg", outputPath: "@/02_design/produto.png" } },
    { id: "P03", tipo: "lower-third", params: { name: "Ana" } },
    { id: "P05", tipo: "a-mao", observacao: "foto de equipe no estúdio" }
  ]
};

async function call(cat: ToolCatalog, args: Record<string, unknown>) {
  const e = cat.get("jradb_campaign_run")!;
  const res = (await e.handler(z.object(e.shape).parse(args))) as { content: Array<{ text: string }>; isError?: boolean };
  return JSON.parse(res.content[0].text);
}

describe("jradb_campaign_run helpers", () => {
  it("orders pieces by production stage and dependencies", () => {
    expect(orderPieces(PLAN).map((p) => p.id)).toEqual(["P01", "P05", "P02", "P03", "P04"]);
    expect(() => orderPieces({ pecas: [{ id: "A", tipo: "flyer", depende: ["B"] }, { id: "B", tipo: "flyer", depende: ["A"] }] })).toThrow(/cycle/);
    expect(() => orderPieces({ pecas: [{ id: "A", tipo: "flyer", depende: ["Z"] }] })).toThrow(/unknown piece Z/);
  });

  it("resolves @/ paths and finds output files", () => {
    expect(resolvePaths({ a: "@/x/y.png", b: ["@/z"], c: 3 }, "/r")).toEqual({ a: path.join("/r", "x/y.png"), b: [path.join("/r", "z")], c: 3 });
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fi-")), "a.png");
    fs.writeFileSync(f, "x");
    expect(filesIn({ result: { files: [{ path: f }], note: "a.png" } })).toEqual([f]);
  });

  it("applies gates only when there is something to approve", () => {
    expect(gateApplies("conceito", PLAN)).toBe(true);
    expect(gateApplies("arte-chave", PLAN)).toBe(true);
    expect(gateApplies("arte-chave", { pecas: [{ id: "A", tipo: "flyer" }] })).toBe(false);
    expect(gateApplies("video", PLAN)).toBe(true);
  });

  it("every piece type maps to a registered tool name pattern", () => {
    for (const [t, v] of Object.entries(PIECE_TYPES)) if (v.tool) expect(v.tool, t).toMatch(/^(jradb|ps|ai|id|ae|pr|lr)_[a-z_]+$/);
  });
});

describe("jradb_campaign_run end to end (fake tools, no apps)", () => {
  it("validates the plan without calling tools", async () => {
    const calls: string[] = [];
    const cat = fakeCatalog(calls);
    const root = campaign({ pecas: [...PLAN.pecas, { id: "P09", tipo: "nada" }, { id: "P10", tipo: "flyer", params: {} }] });
    const r = await call(cat, { campaignFolder: root, operation: "plan" });
    expect(calls).toEqual([]);
    expect(r.ready).toBe(false);
    expect(r.problems.join(" ")).toMatch(/P09: unknown tipo/);
    expect(r.problems.join(" ")).toMatch(/P10 \(id_recipe_flyer\): title/);
  });

  it("stops at each approval point, injects the kit and writes the report", async () => {
    const calls: string[] = [];
    const cat = fakeCatalog(calls);
    const root = campaign(PLAN);
    let r = await call(cat, { campaignFolder: root, operation: "run" });
    expect(r.stoppedAt.gate).toBe("conceito");
    expect(calls).toEqual([]);
    await call(cat, { campaignFolder: root, operation: "approve", gate: "conceito" });
    r = await call(cat, { campaignFolder: root, operation: "run" });
    expect(calls).toEqual(["ps_recipe_product_shot+kit"]);
    expect(r.stoppedAt.gate).toBe("arte-chave");
    expect(r.ran[0].files[0]).toMatch(/produto\.png$/);
    expect(r.handMade[0]).toMatch(/P05/);
    await call(cat, { campaignFolder: root, operation: "approve", gate: "arte-chave", note: "ok do cliente" });
    r = await call(cat, { campaignFolder: root, operation: "run" });
    expect(calls).toEqual(["ps_recipe_product_shot+kit", "ps_recipe_social_set", "ae_create_lower_third+kit"]);
    expect(r.stoppedAt.gate).toBe("video");
    await call(cat, { campaignFolder: root, operation: "approve", gate: "video" });
    r = await call(cat, { campaignFolder: root, operation: "run" });
    expect(calls.at(-1)).toBe("id_recipe_flyer+kit");
    expect(r.stoppedAt).toBeNull();
    expect(r.left).toEqual([]);
    const rep = await call(cat, { campaignFolder: root, operation: "report" });
    const md = fs.readFileSync(rep.report, "utf8");
    expect(md).toMatch(/arte-chave: aprovado em .* ok do cliente/);
    expect(md).toMatch(/\| P05 \| a-mao \|/);
  });

  it("keeps going after a failure, skips dependants and retries on request", async () => {
    const calls: string[] = [];
    const cat = fakeCatalog(calls);
    const plan: Plan = {
      aprovacoes: [],
      pecas: [
        { id: "A", tipo: "produto", params: { filePath: "@/01_foto.jpg", fail: true } },
        { id: "B", tipo: "formatos", depende: ["A"] },
        { id: "C", tipo: "lower-third", params: { name: "x" } }
      ]
    };
    const root = campaign(plan, false);
    let r = await call(cat, { campaignFolder: root, operation: "run" });
    expect(r.ran.map((x: { id: string; status: string }) => `${x.id}:${x.status}`)).toEqual(["A:falhou", "B:aguardando", "C:feito"]);
    expect(calls).toEqual(["ps_recipe_product_shot", "ae_create_lower_third"]);
    await call(cat, { campaignFolder: root, operation: "mark", pieceId: "A", status: "feito", note: "refeito à mão" });
    r = await call(cat, { campaignFolder: root, operation: "run" });
    expect(r.ran.map((x: { id: string; status: string }) => `${x.id}:${x.status}`)).toEqual(["B:feito"]);
    const st = await call(cat, { campaignFolder: root, operation: "status" });
    expect(st.counts).toEqual({ feito: 3 });
  });
});
