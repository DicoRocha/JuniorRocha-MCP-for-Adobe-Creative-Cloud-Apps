import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeRouter, captureDispatches } from "../../core/bridge-router.js";
import { ToolCatalog } from "../../core/tool-catalog.js";
import { AdobeAppId } from "../../core/types.js";
import { formatErrorResponse, formatSuccessResponse } from "../../core/image-helper.js";

/** Tool-name prefix (ps_) and bridge action prefix (ps.) per app. */
export const APP_PREFIX: Record<AdobeAppId, string> = {
  photoshop: "ps",
  "after-effects": "ae",
  premiere: "pr",
  illustrator: "ai",
  indesign: "id",
  lightroom: "lr"
};

/** Tools whose result is an image or that need several bridge calls: run them on their own. */
export const BATCH_EXCLUDED_TOOLS = new Set<string>([
  "ps_get_canvas_snapshot",
  "ae_get_comp_frame_preview",
  "ai_get_artboard_preview",
  "id_get_page_preview",
  "lr_get_photo_preview",
  "lr_export_photos"
]);

export const MAX_BATCH_OPERATIONS = 100;

export interface PreparedBatchOperation {
  tool: string;
  action: string;
  params: Record<string, unknown>;
}

export interface BatchPreparationResult {
  operations: PreparedBatchOperation[];
  errors: string[];
}

/**
 * Validates each {tool, args} against the tool's own schema and replays the tool with bridge calls
 * captured, so the batch sends exactly the same action + params the tool would have sent.
 */
export async function prepareBatchOperations(
  catalog: ToolCatalog,
  app: AdobeAppId,
  operations: Array<{ tool: string; args?: Record<string, unknown> }>
): Promise<BatchPreparationResult> {
  const prefix = APP_PREFIX[app];
  const prepared: PreparedBatchOperation[] = [];
  const errors: string[] = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const label = `operations[${i}] (${op.tool})`;

    if (!op.tool.startsWith(`${prefix}_`)) {
      errors.push(`${label}: only ${prefix}_* tools can run in a ${app} batch.`);
      continue;
    }
    if (BATCH_EXCLUDED_TOOLS.has(op.tool)) {
      errors.push(`${label}: returns an image; call it on its own after the batch.`);
      continue;
    }
    const entry = catalog.get(op.tool);
    if (!entry) {
      const near = catalog.suggest(op.tool, `${prefix}_`);
      errors.push(`${label}: unknown tool.${near.length ? ` Did you mean: ${near.join(", ")}?` : ""}`);
      continue;
    }

    const parsed = z.object(entry.shape).safeParse(op.args ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`)
        .join("; ");
      errors.push(`${label}: invalid args — ${issues}`);
      continue;
    }

    let handlerResult: unknown = null;
    const captured = await captureDispatches(async () => {
      handlerResult = await entry.handler(parsed.data);
    });

    if (captured.length !== 1) {
      const why = captured.length === 0 ? describeHandlerFailure(handlerResult) : `makes ${captured.length} bridge calls`;
      errors.push(`${label}: cannot run inside a batch (${why}).`);
      continue;
    }
    if (captured[0].app !== app) {
      errors.push(`${label}: targets ${captured[0].app}, not ${app}.`);
      continue;
    }
    prepared.push({ tool: op.tool, action: captured[0].action, params: captured[0].params });
  }

  return { operations: prepared, errors };
}

function describeHandlerFailure(result: unknown): string {
  const text = (result as { content?: Array<{ text?: string }> } | null)?.content?.[0]?.text;
  return text ? `the tool rejected the arguments: ${text.slice(0, 300)}` : "it does not call Adobe";
}

export function registerBatchTool(
  server: McpServer,
  router: BridgeRouter,
  catalog: ToolCatalog,
  enabledApps: AdobeAppId[]
): void {
  server.tool(
    "jradb_batch",
    "Run many operations on ONE Adobe app in a single round-trip and as a single undo step (After Effects undo group; " +
      "one Photoshop history state). Each operation is {tool, args} using any ps_/ae_/pr_/ai_ tool name and exactly the " +
      "args that tool accepts. All operations are validated before anything runs. Returns one result per operation. " +
      "Illustrator and Premiere have no grouped undo: there each operation is its own undo step. " +
      "Image tools (snapshots/previews) are not allowed inside a batch.",
    {
      app: z.enum(enabledApps as [AdobeAppId, ...AdobeAppId[]]).describe("Adobe app that runs every operation."),
      operations: z
        .array(
          z.object({
            tool: z.string().describe("Tool name, e.g. ae_modify_layer."),
            args: z.record(z.string(), z.unknown()).optional().default({}).describe("Arguments for that tool.")
          })
        )
        .min(1)
        .max(MAX_BATCH_OPERATIONS),
      stopOnError: z
        .boolean()
        .optional()
        .default(true)
        .describe("Stop at the first failing operation (default). false = run all and report each failure."),
      undoName: z.string().optional().describe("Name of the undo step / history state."),
      timeoutMs: z.number().int().positive().optional().describe("Overall timeout; default grows with the number of operations.")
    },
    async ({ app, operations, stopOnError, undoName, timeoutMs }) => {
      try {
        const { operations: prepared, errors } = await prepareBatchOperations(catalog, app, operations);
        if (errors.length > 0) {
          return formatErrorResponse(
            new Error(`Batch rejected before running anything (${errors.length} problem(s)):\n- ${errors.join("\n- ")}`)
          );
        }

        const prefix = APP_PREFIX[app];
        const label = undoName || `MCP: Batch (${prepared.length} ops)`;
        const res = await router.dispatch(
          app,
          `${prefix}.batch`,
          {
            operations: prepared.map((op) => ({ action: op.action, params: op.params })),
            stopOnError,
            undoName: label
          },
          { undoGroup: label, timeoutMs: timeoutMs ?? Math.min(600000, 30000 + prepared.length * 5000) }
        );

        const data = (res.data || {}) as { results?: Array<Record<string, unknown>> };
        if (Array.isArray(data.results)) {
          data.results = data.results.map((r) => {
            const idx = typeof r.index === "number" ? r.index : -1;
            return { tool: prepared[idx]?.tool ?? null, ...r };
          });
        }
        return formatSuccessResponse({ app, bridge: res.bridgeType, undoName: label, ...data });
      } catch (err) {
        return formatErrorResponse(err);
      }
    }
  );
}
