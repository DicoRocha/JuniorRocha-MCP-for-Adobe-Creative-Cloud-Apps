#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AdobeAppId, ALL_ADOBE_APPS } from "./core/types.js";
import { logger, LogLevel } from "./core/logger.js";
import { createAdobeMcpServer } from "./server.js";

export function parseEnabledAppsArg(rawArg?: string): AdobeAppId[] {
  if (!rawArg || rawArg.trim().toLowerCase() === "all") {
    return [...ALL_ADOBE_APPS];
  }

  const aliases: Record<string, AdobeAppId> = {
    ps: "photoshop",
    photoshop: "photoshop",
    ae: "after-effects",
    aftereffects: "after-effects",
    "after-effects": "after-effects",
    pr: "premiere",
    ppro: "premiere",
    premiere: "premiere",
    "premiere-pro": "premiere",
    ai: "illustrator",
    illustrator: "illustrator",
    id: "indesign",
    indd: "indesign",
    indesign: "indesign",
    lr: "lightroom",
    lrc: "lightroom",
    lightroom: "lightroom"
  };

  const selected = new Set<AdobeAppId>();
  for (const part of rawArg.split(",")) {
    const key = part.trim().toLowerCase();
    if (aliases[key]) {
      selected.add(aliases[key]);
    }
  }

  return selected.size > 0 ? Array.from(selected) : [...ALL_ADOBE_APPS];
}

function parseCliArgs(argv: string[]) {
  let appsRaw = process.env.JRADB_MCP_APPS || "all";
  let port = Number(process.env.JRADB_MCP_PORT || 31001);
  let logLevel = (process.env.JRADB_MCP_LOG_LEVEL || "info") as LogLevel;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apps" && argv[i + 1]) {
      appsRaw = argv[++i];
    } else if (arg.startsWith("--apps=")) {
      appsRaw = arg.slice("--apps=".length);
    } else if (arg === "--port" && argv[i + 1]) {
      port = Number(argv[++i]) || 31001;
    } else if (arg.startsWith("--port=")) {
      port = Number(arg.slice("--port=".length));
    } else if (arg === "--tools" && argv[i + 1]) {
      process.env.JRADB_MCP_TOOLS = argv[++i];
    } else if (arg.startsWith("--tools=")) {
      process.env.JRADB_MCP_TOOLS = arg.slice("--tools=".length);
    } else if (arg === "--log-level" && argv[i + 1]) {
      logLevel = argv[++i] as LogLevel;
    }
  }


  // 3001 was the default until 1.8 and is still stored in older client configurations (for example the Claude
  // Desktop extension settings). The panels now connect to 31001, so the old default follows the new one.
  if (port === 3001) {
    process.stderr.write("[jr-mcp] Port 3001 is the old default; using 31001, the port the panels connect to since 1.9.0.\n");
    port = 31001;
  }
  return {
    enabledApps: parseEnabledAppsArg(appsRaw),
    port,
    logLevel
  };
}

async function main() {
  const { enabledApps, port, logLevel } = parseCliArgs(process.argv.slice(2));
  logger.setLevel(logLevel);

  const runtime = createAdobeMcpServer({
    enabledApps,
    wsPort: port
  });

  await runtime.startHub();

  const transport = new StdioServerTransport();
  await runtime.server.connect(transport);

  logger.info("Junior Rocha MCP server running on stdio", {
    enabledApps,
    wsPort: runtime.hub.getPort(),
    hubRole: runtime.hub.getRole()
  });

  const shutdown = async () => {
    await runtime.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Run main only if invoked directly
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("index.js") || process.argv[1].endsWith("index.ts"));

if (isMain) {
  main().catch((err) => {
    logger.error("Fatal startup error", { error: String(err) });
    process.exit(1);
  });
}
