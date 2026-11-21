/**
 * Claude Desktop extension manifest (.mcpb, manifest_version 0.3) for the Junior Rocha MCP: one-click install with
 * settings for the Hub port, the tool mode (full / code) and the apps to load.
 */
export interface McpbInput {
  version: string;
  tools: Array<{ name: string; description: string }>;
}

export function buildMcpbManifest(input: McpbInput): Record<string, unknown> {
  return {
    manifest_version: "0.3",
    name: "jr-adb-mcp-bridge",
    display_name: "JuniorRocha MCP for Adobe Creative Cloud",
    version: input.version,
    description: "Photoshop, Illustrator, InDesign, Lightroom Classic, After Effects and Premiere Pro on this computer, with recipes, audits and agency skills.",
    long_description:
      "Local MCP server that drives Photoshop, Illustrator, InDesign, Lightroom Classic, After Effects and Premiere Pro through small bridges loaded by each app, with typed tools, one-call recipes (social set, product shot, out-of-bounds portrait, flyer, catalogue, manual, logo package, reels, transitions), audits, brand templates, a campaign runner and 87 workflow skills loaded on demand. After installing this extension, run SETUP once and install the three .ccx plug-ins so the apps connect. Independent project, not affiliated with or endorsed by Adobe.",
    author: { name: "Junior Rocha" },
    license: "MIT",
    server: {
      type: "node",
      entry_point: "dist/index.js",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/dist/index.js", "--port", "${user_config.port}", "--tools", "${user_config.tool_mode}"],
        env: { JRADB_MCP_APPS: "${user_config.apps}" }
      }
    },
    user_config: {
      port: { type: "number", title: "Hub port", description: "Port the app panels connect to (the panels use 31001).", default: 31001, min: 1024, max: 65535, required: false },
      tool_mode: {
        type: "string",
        title: "Tool mode",
        description: "'code' shows 6 tools (jradb_code runs the others; ~1k tokens of tool list instead of ~69k). 'full' shows every tool.",
        default: "code",
        required: false
      },
      apps: { type: "string", title: "Apps", description: "Comma-separated subset (photoshop,illustrator,indesign,lightroom,after-effects,premiere); empty = all.", default: "", required: false }
    },
    tools: input.tools.map((t) => ({ name: t.name, description: t.description.split(/(?<=[.!?])\s/)[0].slice(0, 200) })),
    compatibility: { platforms: ["win32", "darwin"], runtimes: { node: ">=20.0.0" } },
    keywords: ["adobe", "photoshop", "illustrator", "indesign", "after effects", "premiere", "lightroom", "design", "video"]
  };
}
