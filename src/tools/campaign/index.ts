/**
 * jradb_campaign_run (phase 4): runs a campaign from 00_briefing/plano-de-pecas.json, piece by piece, in production
 * order (photos → vectors → key art → derivations → motion → video → print → package), stopping at the approval
 * points the plan lists (conceito, arte-chave, video). State lives in 00_briefing/campanha-estado.json, so a run can
 * stop (approval, error, time budget) and continue in a later call or session. Every piece calls an existing tool
 * through the catalog, with the same validation as jradb_batch.
 */
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolCatalog } from "../../core/tool-catalog.js";
import { formatErrorResponse, formatSuccessResponse } from "../../core/image-helper.js";
import { unpackResult, type ToolResult } from "../code/index.js";

export const STAGES = ["fotos", "vetores", "arte-chave", "derivacoes", "motion", "video", "impressos", "pacote"] as const;
export type Stage = (typeof STAGES)[number];
export const GATES = ["conceito", "arte-chave", "video"] as const;
export type Gate = (typeof GATES)[number];

/** Gate checked before a stage runs: "conceito" before anything, the others after their stage. */
export const GATE_BEFORE: Record<Stage, Gate | null> = {
  fotos: "conceito",
  vetores: "conceito",
  "arte-chave": "conceito",
  derivacoes: "arte-chave",
  motion: "arte-chave",
  video: "arte-chave",
  impressos: "video",
  pacote: "video"
};

/** Piece type → tool and production stage. "tool" uses the piece's own `ferramenta`; "manual" is done by a person. */
export const PIECE_TYPES: Record<string, { tool: string | null; stage: Stage }> = {
  "fotos-lote": { tool: "lr_recipe_batch_develop", stage: "fotos" },
  "pacote-logo": { tool: "ai_recipe_logo_package", stage: "vetores" },
  templates: { tool: "jradb_templates_build", stage: "vetores" },
  "remover-fundo": { tool: "ps_recipe_remove_background", stage: "arte-chave" },
  produto: { tool: "ps_recipe_product_shot", stage: "arte-chave" },
  formatos: { tool: "ps_recipe_social_set", stage: "derivacoes" },
  "lote-variantes": { tool: "ps_batch_variants", stage: "derivacoes" },
  "lote-vetor": { tool: "ai_batch_variants", stage: "derivacoes" },
  "lower-third": { tool: "ae_create_lower_third", stage: "motion" },
  titulo: { tool: "ae_create_title_card", stage: "motion" },
  contador: { tool: "ae_create_counter", stage: "motion" },
  "logo-reveal": { tool: "ae_create_logo_reveal", stage: "motion" },
  transicao: { tool: "ae_create_transition", stage: "motion" },
  reel: { tool: "pr_assemble_reel", stage: "video" },
  flyer: { tool: "id_recipe_flyer", stage: "impressos" },
  catalogo: { tool: "id_recipe_catalog", stage: "impressos" },
  manual: { tool: "id_recipe_manual_skeleton", stage: "impressos" },
  mesclagem: { tool: "id_data_merge", stage: "impressos" },
  "folha-contato": { tool: "jradb_contact_sheet", stage: "pacote" },
  "pacote-grafica": { tool: "id_package", stage: "pacote" },
  tool: { tool: null, stage: "arte-chave" },
  "a-mao": { tool: null, stage: "arte-chave" }
};

export const PieceSchema = z.object({
  id: z.string().min(1),
  tipo: z.string(),
  nome: z.string().optional(),
  etapa: z.string().optional().describe("Funnel stage (atencao, consideracao, conversao, relacionamento) — for the report."),
  canal: z.string().optional(),
  etapaProducao: z.enum(STAGES).optional().describe("Overrides the stage of the type."),
  ferramenta: z.string().optional().describe("tipo 'tool': any MCP tool name."),
  params: z.record(z.unknown()).optional(),
  depende: z.array(z.string()).optional(),
  observacao: z.string().optional()
});
export type Piece = z.infer<typeof PieceSchema>;

export const PlanSchema = z.object({
  cliente: z.string().optional(),
  campanha: z.string().optional(),
  aprovacoes: z.array(z.enum(GATES)).optional().describe("Approval points to stop at (default all three)."),
  pecas: z.array(PieceSchema).min(1)
});
export type Plan = z.infer<typeof PlanSchema>;

export interface PieceState {
  status: "pendente" | "feito" | "falhou" | "a-mao" | "pulado";
  startedAt?: string;
  finishedAt?: string;
  seconds?: number;
  files?: string[];
  summary?: string;
  error?: string;
  note?: string;
}

export interface CampaignState {
  pecas: Record<string, PieceState>;
  aprovacoes: Partial<Record<Gate, { at: string; note?: string }>>;
  log: Array<{ at: string; msg: string }>;
}

export function stageOf(p: Piece): Stage {
  return p.etapaProducao ?? PIECE_TYPES[p.tipo]?.stage ?? "arte-chave";
}

export function toolOf(p: Piece): string | null {
  if (p.tipo === "tool") return p.ferramenta ?? null;
  return PIECE_TYPES[p.tipo]?.tool ?? null;
}

/** "@/02_design/x.png" → <campaign>/02_design/x.png, recursively; other values pass through. */
export function resolvePaths<T>(v: T, root: string): T {
  if (typeof v === "string") return (v.startsWith("@/") ? path.join(root, v.slice(2)) : v) as T;
  if (Array.isArray(v)) return v.map((x) => resolvePaths(x, root)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolvePaths(x, root)])) as T;
  return v;
}

/** Topological order inside production order; throws on unknown dependencies and cycles. */
export function orderPieces(plan: Plan): Piece[] {
  const byId = new Map(plan.pecas.map((p) => [p.id, p]));
  if (byId.size !== plan.pecas.length) throw new Error("Duplicate piece ids in the plan.");
  for (const p of plan.pecas) for (const d of p.depende ?? []) if (!byId.has(d)) throw new Error(`Piece ${p.id} depends on unknown piece ${d}.`);
  const sorted = [...plan.pecas].sort((a, b) => STAGES.indexOf(stageOf(a)) - STAGES.indexOf(stageOf(b)));
  const out: Piece[] = [];
  const mark = new Map<string, 1 | 2>();
  const visit = (p: Piece, trail: string[]) => {
    const m = mark.get(p.id);
    if (m === 2) return;
    if (m === 1) throw new Error(`Dependency cycle: ${[...trail, p.id].join(" → ")}.`);
    mark.set(p.id, 1);
    for (const d of p.depende ?? []) visit(byId.get(d)!, [...trail, p.id]);
    mark.set(p.id, 2);
    out.push(p);
  };
  for (const p of sorted) visit(p, []);
  return out;
}

/** Existing files named anywhere in a tool result (outputPath, file, files[].path…), up to 30. */
export function filesIn(data: unknown, found: Set<string> = new Set()): string[] {
  const walk = (v: unknown, key = "") => {
    if (found.size >= 30) return;
    if (typeof v === "string") {
      if (/(path|file|pdf|indd|psd|ai|srt|folder|output)/i.test(key) && /\.[a-z0-9]{2,5}$/i.test(v) && path.isAbsolute(v) && fs.existsSync(v)) found.add(v);
      return;
    }
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(data);
  return [...found];
}

export function loadState(file: string, plan: Plan): CampaignState {
  const st: CampaignState = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { pecas: {}, aprovacoes: {}, log: [] };
  for (const p of plan.pecas) st.pecas[p.id] ??= { status: p.tipo === "a-mao" ? "a-mao" : "pendente" };
  return st;
}

function saveState(file: string, st: CampaignState): void {
  st.log = st.log.slice(-200);
  fs.writeFileSync(file, JSON.stringify(st, null, 2), "utf8");
}

export interface PlanCheck {
  ordered: Array<{ id: string; tipo: string; stage: Stage; tool: string | null; depende: string[] }>;
  problems: string[];
  gates: Gate[];
}

/** Validates the plan without touching any app: types, tools, arguments (zod), dependencies, missing input files. */
export function checkPlan(plan: Plan, catalog: ToolCatalog, root: string, kitPath: string | null): PlanCheck {
  const problems: string[] = [];
  let ordered: Piece[] = [];
  try {
    ordered = orderPieces(plan);
  } catch (e) {
    problems.push((e as Error).message);
    ordered = plan.pecas;
  }
  for (const p of plan.pecas) {
    if (!PIECE_TYPES[p.tipo]) {
      problems.push(`${p.id}: unknown tipo '${p.tipo}' (use one of ${Object.keys(PIECE_TYPES).join(", ")}).`);
      continue;
    }
    const tool = toolOf(p);
    if (p.tipo === "a-mao") continue;
    if (!tool) {
      problems.push(`${p.id}: tipo 'tool' needs 'ferramenta'.`);
      continue;
    }
    if (["jradb_code", "jradb_batch", "jradb_campaign_run"].includes(tool)) {
      problems.push(`${p.id}: ${tool} cannot run inside a campaign.`);
      continue;
    }
    const entry = catalog.get(tool);
    if (!entry) {
      problems.push(`${p.id}: tool ${tool} is not available in this server (app disabled?).`);
      continue;
    }
    const args = withKit(resolvePaths(p.params ?? {}, root), entry.shape, kitPath);
    const parsed = z.object(entry.shape).safeParse(args);
    if (!parsed.success) problems.push(`${p.id} (${tool}): ${parsed.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; ")}`);
    for (const [k, v] of Object.entries(args)) {
      if (typeof v === "string" && /(filePath|csvPath|jsonPath|logoPath|imagePath|kitPath|audioPath|musicPath)$/i.test(k) && path.isAbsolute(v) && !fs.existsSync(v)) {
        problems.push(`${p.id}: ${k} not found: ${v}`);
      }
    }
  }
  return {
    ordered: ordered.map((p) => ({ id: p.id, tipo: p.tipo, stage: stageOf(p), tool: toolOf(p), depende: p.depende ?? [] })),
    problems,
    gates: plan.aprovacoes ?? [...GATES]
  };
}

/** A gate only applies when the plan has something for it to approve: arte-chave pieces, or motion/video. */
export function gateApplies(gate: Gate, plan: Plan): boolean {
  if (gate === "conceito") return true;
  const stages = plan.pecas.map(stageOf);
  if (gate === "arte-chave") return stages.includes("arte-chave");
  return stages.includes("motion") || stages.includes("video");
}

function withKit(args: Record<string, unknown>, shape: z.ZodRawShape, kitPath: string | null): Record<string, unknown> {
  if (kitPath && "kitPath" in shape && args.kitPath === undefined) return { ...args, kitPath };
  return args;
}

export function reportMarkdown(plan: Plan, st: CampaignState, root: string): string {
  const order = (() => {
    try {
      return orderPieces(plan);
    } catch {
      return plan.pecas;
    }
  })();
  const lines = [
    `# Relatório da campanha — ${plan.campanha ?? path.basename(root)}`,
    "",
    `Cliente: ${plan.cliente ?? "—"} · gerado em ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    "",
    "## Aprovações",
    "",
    ...(plan.aprovacoes ?? [...GATES]).map((g) => `- ${g}: ${st.aprovacoes[g] ? `aprovado em ${st.aprovacoes[g]!.at.slice(0, 16).replace("T", " ")}${st.aprovacoes[g]!.note ? ` — ${st.aprovacoes[g]!.note}` : ""}` : "**pendente**"}`),
    "",
    "## Peças",
    "",
    "| Peça | Tipo | Etapa | Situação | Arquivos | Observação |",
    "|---|---|---|---|---|---|",
    ...order.map((p) => {
      const s = st.pecas[p.id] ?? { status: "pendente" };
      const files = (s.files ?? []).map((f) => `\`${path.relative(root, f)}\``).join("<br>");
      return `| ${p.id}${p.nome ? ` ${p.nome}` : ""} | ${p.tipo} | ${stageOf(p)} | ${s.status}${s.seconds ? ` (${s.seconds} s)` : ""} | ${files || "—"} | ${(s.error ?? s.note ?? s.summary ?? "").replace(/\|/g, "/").slice(0, 160)} |`;
    }),
    "",
    "## O que não foi verificado aqui",
    "",
    "- Revisão visual humana de cada peça (use a folha de contato).",
    "- Textos, preços e dados contra a fonte do cliente.",
    "- Requisitos da gráfica e das plataformas no dia da entrega."
  ];
  return lines.join("\n");
}

export function registerCampaignTool(server: McpServer, catalog: ToolCatalog): void {
  server.tool(
    "jradb_campaign_run",
    "Run a whole campaign from <campaignFolder>/00_briefing/plano-de-pecas.json (schema: skills/_shared/" +
      "plano-de-pecas.schema.json) with kit-de-marca.json: each piece calls a recipe/tool (tipo → tool table), in " +
      "production order and respecting 'depende', and the run STOPS at the approval points (conceito, arte-chave, " +
      "video) until operation 'approve'. State is saved in 00_briefing/campanha-estado.json, so runs continue later. " +
      "Operations: plan (validate, no app calls), run, approve, mark (a hand-made or redone piece), status, report " +
      "(06_entrega/relatorio-campanha.md). Long: call from jradb_code with background, or with timeBudgetSeconds.",
    {
      campaignFolder: z.string().describe("CLIENTE/ANO_CAMPANHA folder (has 00_briefing/)."),
      operation: z.enum(["plan", "run", "approve", "mark", "status", "report"]).default("plan"),
      gate: z.enum(GATES).optional().describe("approve: which approval point."),
      note: z.string().optional(),
      pieceId: z.string().optional().describe("mark: piece id."),
      status: z.enum(["feito", "pendente", "pulado"]).optional().describe("mark: new status ('pendente' runs it again)."),
      only: z.array(z.string()).optional().describe("run: only these piece ids (dependencies must be done)."),
      timeBudgetSeconds: z.number().int().min(10).max(7200).optional().describe("run: stop starting new pieces after this many seconds (default 600)."),
      retryFailed: z.boolean().optional().describe("run: run failed pieces again.")
    },
    async (params) => {
      try {
        const root = params.campaignFolder;
        const brief = path.join(root, "00_briefing");
        const planFile = path.join(brief, "plano-de-pecas.json");
        if (!fs.existsSync(planFile)) throw new Error(`Plan not found: ${planFile}. Write it with plan-campanha (schema skills/_shared/plano-de-pecas.schema.json).`);
        const plan = PlanSchema.parse(JSON.parse(fs.readFileSync(planFile, "utf8")));
        const kit = path.join(brief, "kit-de-marca.json");
        const kitPath = fs.existsSync(kit) ? kit : null;
        const stateFile = path.join(brief, "campanha-estado.json");
        const st = loadState(stateFile, plan);
        const gates = plan.aprovacoes ?? [...GATES];
        const now = () => new Date().toISOString();

        if (params.operation === "plan") {
          const chk = checkPlan(plan, catalog, root, kitPath);
          return formatSuccessResponse({ campaign: plan.campanha, kit: kitPath ?? "sem kit (cores neutras)", pieces: chk.ordered.length, order: chk.ordered, gates: chk.gates, problems: chk.problems, ready: chk.problems.length === 0 });
        }

        if (params.operation === "approve") {
          if (!params.gate) throw new Error("approve needs gate (conceito, arte-chave or video).");
          st.aprovacoes[params.gate] = { at: now(), note: params.note };
          st.log.push({ at: now(), msg: `aprovado: ${params.gate}${params.note ? ` (${params.note})` : ""}` });
          saveState(stateFile, st);
          return formatSuccessResponse({ approved: params.gate, next: "Call operation 'run' to continue." });
        }

        if (params.operation === "mark") {
          if (!params.pieceId || !st.pecas[params.pieceId]) throw new Error("mark needs a pieceId from the plan.");
          st.pecas[params.pieceId] = { ...st.pecas[params.pieceId], status: params.status ?? "feito", note: params.note, finishedAt: now() };
          st.log.push({ at: now(), msg: `${params.pieceId}: marcado ${params.status ?? "feito"}` });
          saveState(stateFile, st);
          return formatSuccessResponse({ piece: params.pieceId, status: st.pecas[params.pieceId].status });
        }

        if (params.operation === "status" || params.operation === "report") {
          const counts: Record<string, number> = {};
          for (const s of Object.values(st.pecas)) counts[s.status] = (counts[s.status] ?? 0) + 1;
          const out: Record<string, unknown> = {
            campaign: plan.campanha,
            counts,
            approvals: Object.fromEntries(gates.map((g) => [g, st.aprovacoes[g]?.at ?? "pendente"])),
            pieces: Object.fromEntries(Object.entries(st.pecas).map(([id, s]) => [id, s.status + (s.error ? `: ${s.error.slice(0, 120)}` : "")]))
          };
          if (params.operation === "report") {
            const dir = path.join(root, "06_entrega");
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, "relatorio-campanha.md");
            fs.writeFileSync(file, reportMarkdown(plan, st, root), "utf8");
            out.report = file;
          }
          return formatSuccessResponse(out);
        }

        // run
        const chk = checkPlan(plan, catalog, root, kitPath);
        const blocking = chk.problems.filter((p) => !/not found:/.test(p));
        if (blocking.length) return formatSuccessResponse({ stopped: "plan has problems", problems: chk.problems });
        const order = orderPieces(plan);
        const budget = (params.timeBudgetSeconds ?? 600) * 1000;
        const t0 = Date.now();
        const ran: Array<{ id: string; status: string; seconds?: number; files?: string[]; error?: string }> = [];
        let stoppedAt: { gate: Gate; reason: string } | null = null;
        let outOfTime = false;
        for (const p of order) {
          const s = st.pecas[p.id];
          if (params.only && !params.only.includes(p.id)) continue;
          if (s.status === "feito" || s.status === "pulado" || s.status === "a-mao") continue;
          if (s.status === "falhou" && !params.retryFailed) continue;
          const stage = stageOf(p);
          const gate = GATE_BEFORE[stage];
          if (gate && gates.includes(gate) && !st.aprovacoes[gate] && gateApplies(gate, plan)) {
            stoppedAt = { gate, reason: `${p.id} (${stage}) waits for approval '${gate}'.` };
            break;
          }
          const unmet = (p.depende ?? []).filter((d) => !["feito", "pulado"].includes(st.pecas[d]?.status));
          if (unmet.length) {
            ran.push({ id: p.id, status: "aguardando", error: `depends on ${unmet.join(", ")}` });
            continue;
          }
          if (Date.now() - t0 > budget) {
            outOfTime = true;
            break;
          }
          const tool = toolOf(p)!;
          const entry = catalog.get(tool)!;
          const args = withKit(resolvePaths(p.params ?? {}, root), entry.shape, kitPath);
          const started = Date.now();
          st.pecas[p.id] = { status: "pendente", startedAt: now() };
          try {
            const parsed = z.object(entry.shape).parse(args);
            const res = (await entry.handler(parsed, undefined)) as ToolResult;
            const u = unpackResult(res);
            const seconds = Math.round((Date.now() - started) / 1000);
            if (u.isError) {
              st.pecas[p.id] = { status: "falhou", startedAt: st.pecas[p.id].startedAt, finishedAt: now(), seconds, error: u.text.slice(0, 600) };
            } else {
              const files = filesIn(u.data);
              st.pecas[p.id] = { status: "feito", startedAt: st.pecas[p.id].startedAt, finishedAt: now(), seconds, files, summary: u.text.slice(0, 300) };
            }
          } catch (e) {
            st.pecas[p.id] = { status: "falhou", finishedAt: now(), seconds: Math.round((Date.now() - started) / 1000), error: (e as Error).message.slice(0, 600) };
          }
          const r = st.pecas[p.id];
          ran.push({ id: p.id, status: r.status, seconds: r.seconds, files: r.files, error: r.error });
          st.log.push({ at: now(), msg: `${p.id}: ${r.status}` });
          saveState(stateFile, st);
        }
        saveState(stateFile, st);
        const left = order.filter((p) => ["pendente", "falhou"].includes(st.pecas[p.id].status)).map((p) => p.id);
        const handMade = order.filter((p) => st.pecas[p.id].status === "a-mao").map((p) => `${p.id}${p.observacao ? ` (${p.observacao})` : ""}`);
        let next = "Campaign complete: run operation 'report'.";
        if (stoppedAt) next = `Show the pieces to the person (jradb_contact_sheet on the output folders), then operation 'approve' gate '${stoppedAt.gate}' and 'run' again.`;
        else if (outOfTime) next = "Time budget used: call 'run' again to continue.";
        else if (left.length) next = `Fix the failed pieces (see errors), then 'run' with retryFailed, or 'mark' them.`;
        return formatSuccessResponse({ ran, stoppedAt, outOfTime, left, handMade, next });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}
