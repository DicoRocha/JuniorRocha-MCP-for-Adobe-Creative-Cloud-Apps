import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AdobeAppId, ALL_ADOBE_APPS } from "./core/types.js";
import { WsHub } from "./core/ws-hub.js";
import { BridgeRouter } from "./core/bridge-router.js";
import { detectInstalledAdobeApps } from "./core/adobe-detector.js";
import { registerSharedTools } from "./tools/shared/index.js";
import { registerSkillTools } from "./tools/shared/skills.js";
import { registerPhotoshopTools } from "./tools/photoshop/index.js";
import { registerPhotoshopRecipes } from "./tools/photoshop/recipes.js";
import { registerAfterEffectsTools } from "./tools/after-effects/index.js";
import { registerPremiereTools } from "./tools/premiere/index.js";
import { registerReelTool } from "./tools/premiere/reel.js";
import { registerIllustratorTools } from "./tools/illustrator/index.js";
import { registerIllustratorRecipe } from "./tools/illustrator/recipe.js";
import { registerBatchTool } from "./tools/batch/index.js";
import { registerInDesignTools } from "./tools/indesign/index.js";
import { registerInDesignRecipes } from "./tools/indesign/recipes.js";
import { registerLightroomTools } from "./tools/lightroom/index.js";
import { registerLightroomRecipe } from "./tools/lightroom/recipe.js";
import { registerLightroomMaskPresets } from "./tools/lightroom/mask-presets.js";
import { registerMediaTools } from "./tools/media/index.js";
import { ToolCatalog } from "./core/tool-catalog.js";
import { registerUsageTool } from "./tools/shared/usage.js";
import { registerCodeTools } from "./tools/code/index.js";
import { registerTemplatesTool } from "./tools/shared/templates.js";
import { registerCampaignTool } from "./tools/campaign/index.js";
import * as fsNode from "node:fs";
import * as pathNode from "node:path";
import { fileURLToPath as fileUrlToPath } from "node:url";

/** The MCP version announced to clients is the one in package.json (it used to be a fixed "1.0.0"). */
const PACKAGE_VERSION: string = (() => {
  try {
    const here = pathNode.dirname(fileUrlToPath(import.meta.url));
    return String(JSON.parse(fsNode.readFileSync(pathNode.resolve(here, "..", "package.json"), "utf8")).version || "0.0.0");
  } catch {
    return "0.0.0";
  }
})();

export interface CreateAdobeMcpServerOptions {
  enabledApps?: AdobeAppId[];
  /** "full" (default): every tool plus jradb_code; "code": only the code-mode set, everything else reachable from jradb_code. */
  toolMode?: ToolMode;
  wsPort?: number;
  enableOsFallback?: boolean;
}

export interface AdobeMcpRuntime {
  server: McpServer;
  hub: WsHub;
  router: BridgeRouter;
  enabledApps: AdobeAppId[];
  startHub: () => Promise<"leader" | "follower" | "offline">;
  stop: () => Promise<void>;
}

const REFERENCE_MATCH_NAMES = {
  afterEffects: {
    transform: {
      group: "ADBE Transform Group",
      anchorPoint: "ADBE Anchor Point",
      position: "ADBE Position",
      scale: "ADBE Scale",
      rotation: "ADBE Rotate Z",
      opacity: "ADBE Opacity"
    },
    commonEffects: {
      gaussianBlur: "ADBE Gaussian Blur 2",
      directionalBlur: "ADBE Directional Blur",
      cameraLensBlur: "ADBE Camera Lens Blur",
      glow: "ADBE Glo2",
      dropShadow: "ADBE Drop Shadow",
      fill: "ADBE Fill",
      tint: "ADBE Tint",
      curves: "ADBE CurvesCustom",
      levels: "ADBE Easy Levels2",
      hueSaturation: "ADBE HUE SATURATION",
      lumetriColor: "ADBE Lumetri",
      fractalNoise: "ADBE Fractal Noise",
      turbulentDisplace: "ADBE Turbulent Displace"
    },
    shapeVectors: {
      rootGroup: "ADBE Root Vectors Group",
      vectorGroup: "ADBE Vector Group",
      vectorsGroup: "ADBE Vectors Group",
      rect: "ADBE Vector Shape - Rect",
      ellipse: "ADBE Vector Shape - Ellipse",
      polystar: "ADBE Vector Shape - Star",
      path: "ADBE Vector Shape - Group",
      fill: "ADBE Vector Graphic - Fill",
      stroke: "ADBE Vector Graphic - Stroke",
      trimPaths: "ADBE Vector Filter - Trim",
      repeater: "ADBE Vector Filter - Repeater"
    }
  },
  photoshop: {
    batchPlayExamples: {
      gaussianBlur: {
        _obj: "gaussianBlur",
        radius: { _unit: "pixelsUnit", _value: 10 }
      },
      selectSubject: {
        _obj: "autoCutout",
        sampleAllLayers: false
      }
    }
  },
  illustrator: {
    commonMenuCommands: [
      "Live Pathfinder Add",
      "Live Pathfinder Subtract",
      "Live Pathfinder Intersect",
      "Live Pathfinder Exclude",
      "expandStyle",
      "group",
      "ungroup",
      "makeMask",
      "releaseMask",
      "outline"
    ]
  }
};

export type ToolMode = "full" | "code";

/** Tools the client still sees in code mode. */
export const CODE_MODE_TOOLS = ["jradb_code", "jradb_api", "jradb_get_status", "jradb_get_skill", "jradb_usage", "jradb_launch_app"];

export function createAdobeMcpServer(options: CreateAdobeMcpServerOptions = {}): AdobeMcpRuntime {
  const enabledApps =
    options.enabledApps && options.enabledApps.length > 0 ? options.enabledApps : ALL_ADOBE_APPS;

  const serverName =
    enabledApps.length === ALL_ADOBE_APPS.length
      ? "jr-adb-mcp-bridge"
      : `jr-adb-${enabledApps.join("-")}-mcp`;

  const server = new McpServer({
    name: serverName,
    version: PACKAGE_VERSION
  });

  const hub = new WsHub({ port: options.wsPort });
  const router = new BridgeRouter({
    wsHub: hub,
    enableOsFallback: options.enableOsFallback ?? true
  });

  // Every tool registered through `tools` is also recorded in the catalog (used by jradb_batch).
  const catalog = new ToolCatalog();
  const toolMode: ToolMode = options.toolMode ?? (process.env.JRADB_MCP_TOOLS === "full" ? "full" : "code");
  if (toolMode === "code") catalog.setExposure((name) => CODE_MODE_TOOLS.includes(name));
  const tools = catalog.wrap(server);

  // Register global cross-app tools
  registerSharedTools(tools, router, enabledApps);
  registerUsageTool(tools);
  registerSkillTools(tools);
  registerMediaTools(tools);

  // Register app-specific modules based on --apps filter
  if (enabledApps.includes("photoshop")) {
    registerPhotoshopTools(tools, router);
    registerPhotoshopRecipes(tools, router);
  }
  if (enabledApps.includes("after-effects")) {
    registerAfterEffectsTools(tools, router);
  }
  if (enabledApps.includes("premiere")) {
    registerPremiereTools(tools, router);
    registerReelTool(tools, router);
  }
  if (enabledApps.includes("illustrator")) {
    registerIllustratorTools(tools, router);
    registerIllustratorRecipe(tools, router);
  }
  if (enabledApps.includes("indesign")) {
    registerInDesignTools(tools, router);
    registerInDesignRecipes(tools, router);
  }
  if (enabledApps.includes("lightroom")) {
    registerLightroomTools(tools, router);
    registerLightroomRecipe(tools, router);
    registerLightroomMaskPresets(tools);
  }

  registerTemplatesTool(tools, router, enabledApps);
  registerBatchTool(tools, router, catalog, enabledApps);
  registerCodeTools(tools, catalog);
  registerCampaignTool(tools, catalog);

  // Register MCP Resources
  server.resource("adobe-status", "adobe://status", async (uri) => {
    const installed = await detectInstalledAdobeApps(false);
    const bridges = await router.getConnectedBridges();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              hubRole: hub.getRole(),
              hubError: hub.getLastError(),
              port: hub.getPort(),
              enabledApps,
              connectedBridges: bridges,
              installed
            },
            null,
            2
          )
        }
      ]
    };
  });

  server.resource("adobe-match-names", "adobe://docs/match-names", async (uri) => {
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(REFERENCE_MATCH_NAMES, null, 2)
        }
      ]
    };
  });

  // Register MCP Prompts
  server.prompt(
    "adobe-creative-workflow",
    "Guided multi-app Adobe Creative Cloud automation workflow with visual verification.",
    {
      goal: z.string().describe("What you want to design, animate, or edit across Photoshop, Illustrator, After Effects, or Premiere Pro.")
    },
    async ({ goal }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `You are controlling Adobe Creative Cloud locally to achieve the following goal: "${goal}".`,
              "Follow these best practices:",
              "1. Call `jradb_get_skill` with no arguments: it returns the router that says which craft skills to load for this deliverable.",
              "2. Call `jradb_get_status` to check which apps and bridges are active.",
              "3. Save a named iteration with `jradb_checkpoint` before structural changes, renders and heavy previews.",
              "4. Use structured high-level tools (`ps_*`, `ae_*`, `pr_*`, `ai_*`, `id_*`, `lr_*`) for standard creation and edits.",
              "5. For features not covered by high-level tools, use `jradb_inspect_dom`, `ps_batch_play`, `ae_get_property_tree`, or `*_execute_extendscript` / `*_execute_uxp_script`.",
              "6. Verify visual output after key steps (`ps_get_canvas_snapshot`, `ae_get_comp_frame_preview`, `pr_export_frame_or_sequence`, `ai_get_artboard_preview`, `id_get_page_preview`) and run the skill's exit gate before delivering."
            ].join("\n")
          }
        }
      ]
    })
  );

  return {
    server,
    hub,
    router,
    enabledApps,
    startHub: () => hub.start(),
    stop: () => hub.stop()
  };
}
