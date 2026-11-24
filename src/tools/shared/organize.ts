/**
 * ai_organize_objects / id_organize_objects: the semantic grouping of ps_organize_layers for Illustrator and
 * InDesign (src/core/grouping.ts). The app answers its item tree in top-left coordinates; the plan comes back
 * with the item ids to group.
 */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter } from "../../core/bridge-router.js";
import { formatErrorResponse, formatSuccessResponse } from "../../core/image-helper.js";
import { countLeaves, planTree, type TreeNode } from "../../core/grouping.js";
import type { AdobeAppId } from "../../core/types.js";

export function registerOrganizeTool(
  server: McpServer,
  router: BridgeRouter,
  o: { app: AdobeAppId; tool: string; infoAction: string; planAction: string; what: string; extra: Record<string, z.ZodTypeAny>; fixed?: Record<string, unknown> }
): void {
  server.tool(
    o.tool,
    `Organise ${o.what} in groups by meaning: text on a shape becomes a label group, an icon with its text (and the lines ` +
      "under it) an item group, repeated items/labels in a column or row one list group holding them. Lone objects and the " +
      "background stay as they are; a group that would change the stacking is skipped. apply: false (default) only reports " +
      "the plan; apply: true creates the groups (work on a copy of the user's file).",
    {
      ...o.extra,
      apply: z.boolean().optional().default(false),
      language: z.enum(["pt", "en"]).optional().default("pt").describe("Language of the group names.")
    },
    async (params: Record<string, unknown>) => {
      try {
        const { apply, language, ...rest } = params as { apply?: boolean; language?: "pt" | "en" } & Record<string, unknown>;
        return formatSuccessResponse(await runOrganize(router, o, rest, { apply, language }));
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}

/** Plans (and with apply: true creates) the semantic groups through an app's layout actions. */
export async function runOrganize(
  router: BridgeRouter,
  o: { app: AdobeAppId; infoAction: string; planAction: string; fixed?: Record<string, unknown> },
  target: Record<string, unknown>,
  opts: { apply?: boolean; language?: "pt" | "en" } = {}
): Promise<Record<string, unknown>> {
  const info = await router.dispatch(o.app, o.infoAction, { ...target, ...(o.fixed ?? {}) });
  const d = (info.data || {}) as { documentName?: string; width?: number; height?: number; layers?: TreeNode[] };
  const plan = planTree(d.layers ?? [], { width: Number(d.width) || 1, height: Number(d.height) || 1 }, { language: opts.language });
  const groups = plan.plans.flatMap((p) => p.proposals.map((g) => ({ container: p.container || "(top)", name: g.name, children: g.children.map((c) => c.name), items: countLeaves(g) })));
  if (!opts.apply || !plan.plans.length) {
    return {
      documentName: d.documentName,
      applied: false,
      groups,
      skipped: plan.skipped,
      ...(plan.plans.length ? { next: "Call again with apply: true to create these groups." } : { verdict: "nothing to group" })
    };
  }
  const res = await router.dispatch(o.app, o.planAction, { ...target, ...(o.fixed ?? {}), groups: plan.plans.flatMap((p) => p.proposals) }, { undoGroup: "MCP: Organize", timeoutMs: 60000 });
  return { documentName: d.documentName, applied: true, groups, skipped: plan.skipped, ...((res.data || {}) as object) };
}

export const ID_ORGANIZE = { app: "indesign" as AdobeAppId, infoAction: "id.layout.info", planAction: "id.layout.groupPlan", fixed: { units: "pt" } };
