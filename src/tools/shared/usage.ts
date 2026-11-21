import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatSuccessResponse } from "../../core/image-helper.js";
import { getUsageRun, readUsage, setUsageRun, summarizeUsage, usageDir } from "../../core/usage-log.js";

export function registerUsageTool(server: McpServer): void {
  server.tool(
    "jradb_usage",
    "Token accounting of this MCP's tool calls (sizes only, logged per call). start: label the calls that follow " +
      "(e.g. 'fluxo-A-classico'); stop: end the label; report: totals and the heaviest tools for a label or since a time.",
    {
      operation: z.enum(["start", "stop", "report"]),
      run: z.string().optional().describe("Label (start) or label to report."),
      since: z.string().optional().describe("ISO time: report calls after it.")
    },
    async ({ operation, run, since }) => {
      if (operation === "start") {
        setUsageRun(run ?? `run-${new Date().toISOString().slice(0, 16)}`);
        return formatSuccessResponse({ run: getUsageRun(), log: usageDir() });
      }
      if (operation === "stop") {
        const was = getUsageRun();
        setUsageRun(null);
        return formatSuccessResponse({ stopped: was, ...summarizeUsage(readUsage({ run: was ?? undefined })) });
      }
      const label = run ?? getUsageRun() ?? undefined;
      return formatSuccessResponse({ run: label ?? null, since: since ?? null, ...summarizeUsage(readUsage({ run: label, since })) });
    }
  );
}
