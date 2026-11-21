import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAdobeMcpServer, AdobeMcpRuntime } from "../../src/server.js";
import { ALL_ADOBE_APPS, BridgeCommandPacket, BridgeType } from "../../src/core/types.js";

// Valid 1x1 transparent PNG in base64 for testing multimodal snapshot responses
const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("Full-Stack MCP Server + 4-App Adobe Cluster Simulator", () => {
  let runtime: AdobeMcpRuntime;
  let client: Client;
  let mockPluginSockets: WebSocket[] = [];
  const recordedCommands: BridgeCommandPacket[] = [];

  beforeEach(async () => {
    recordedCommands.length = 0;
    mockPluginSockets = [];

    runtime = createAdobeMcpServer({
      enabledApps: ALL_ADOBE_APPS,
      wsPort: 0,
      enableOsFallback: false
    });

    await runtime.startHub();
    const port = runtime.hub.getPort();

    // Connect 4 simulated Adobe host bridges (Photoshop UXP, Premiere UXP, After Effects CEP, Illustrator CEP)
    const bridgeMap: Record<string, BridgeType> = {
      photoshop: "uxp",
      premiere: "uxp",
      "after-effects": "cep",
      illustrator: "cep"
    };

    for (const appId of ALL_ADOBE_APPS) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/plugin`);
      mockPluginSockets.push(ws);

      await new Promise<void>((resolve) => {
        ws.on("open", () => {
          ws.send(
            JSON.stringify({
              type: "hello",
              app: appId,
              bridgeType: bridgeMap[appId],
              appVersion: "26.0.0",
              pluginVersion: "1.0.0",
              capabilities: ["dom", "batchPlay", "executeUxp", "extendscript", "snapshot"]
            })
          );
        });

        ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "hello_ack") {
            resolve();
          } else if (msg.type === "command") {
            const cmd = msg as BridgeCommandPacket;
            recordedCommands.push(cmd);

            const isSnapshot =
              cmd.action === "ps.doc.snapshot" ||
              cmd.action === "ae.comp.getFramePreview" ||
              cmd.action === "ai.export.artboardPreview" ||
              (cmd.action === "pr.export.frameOrSequence" && cmd.params.mode === "frame");

            ws.send(
              JSON.stringify({
                type: "response",
                id: cmd.id,
                app: appId,
                bridgeType: bridgeMap[appId],
                ok: true,
                durationMs: 4,
                data: {
                  simulated: true,
                  app: appId,
                  action: cmd.action,
                  receivedParams: cmd.params,
                  previewBase64: isSnapshot ? MOCK_PNG_BASE64 : undefined,
                  previewMimeType: isSnapshot ? "image/png" : undefined
                },
                previewBase64: isSnapshot ? MOCK_PNG_BASE64 : undefined,
                previewMimeType: isSnapshot ? "image/png" : undefined
              })
            );
          }
        });
      });
    }

    // Connect official MCP Client via InMemoryTransport
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await runtime.server.connect(serverTransport);

    client = new Client({
      name: "adobe-mcp-test-client",
      version: "1.0.0"
    });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    for (const ws of mockPluginSockets) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    await runtime.stop();
  });

  it("exposes all 4 application tool suites + shared tools when started in unified mode (--apps all)", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    // Shared
    expect(names).toContain("jradb_get_status");
    expect(names).toContain("jradb_inspect_dom");
    expect(names).toContain("jradb_bridge_transfer");

    // Photoshop
    expect(names).toContain("ps_create_document");
    expect(names).toContain("ps_get_canvas_snapshot");
    expect(names).toContain("ps_batch_play");
    expect(names).toContain("ps_execute_uxp_script");

    // After Effects
    expect(names).toContain("ae_create_composition");
    expect(names).toContain("ae_create_shape_layer");
    expect(names).toContain("ae_set_keyframes");
    expect(names).toContain("ae_set_expression");
    expect(names).toContain("ae_get_comp_frame_preview");
    expect(names).toContain("ae_execute_extendscript");

    // Premiere Pro
    expect(names).toContain("pr_get_sequence_state");
    expect(names).toContain("pr_place_clip_on_timeline");
    expect(names).toContain("pr_apply_transition");
    expect(names).toContain("pr_execute_uxp_script");
    expect(names).toContain("pr_execute_extendscript");

    // Illustrator
    expect(names).toContain("ai_create_shape");
    expect(names).toContain("ai_create_bezier_path");
    expect(names).toContain("ai_get_artboard_preview");
    expect(names).toContain("ai_send_cpp_script_message");
    expect(names).toContain("ai_execute_extendscript");
  });

  it("executes Photoshop, After Effects, Premiere Pro, and Illustrator tools end-to-end including multimodal snapshots", async () => {
    // 1. Photoshop batchPlay
    const psRes = await client.callTool({
      name: "ps_batch_play",
      arguments: {
        descriptors: [{ _obj: "gaussianBlur", radius: { _unit: "pixelsUnit", _value: 15 } }],
        commandName: "Blur Test"
      }
    });
    expect(psRes.isError).toBeFalsy();

    // 2. After Effects Keyframes
    const aeRes = await client.callTool({
      name: "ae_set_keyframes",
      arguments: {
        compName: "Main Comp",
        layerIndex: 1,
        propertyPath: ["ADBE Transform Group", "ADBE Position"],
        keyframes: [
          { time: 0, value: [960, 540], easing: "easeOut" },
          { time: 2, value: [960, 200], easing: "easeInOut" }
        ]
      }
    });
    expect(aeRes.isError).toBeFalsy();

    // 3. After Effects multimodal frame preview (must return both text JSON + image base64)
    const aePreview = await client.callTool({
      name: "ae_get_comp_frame_preview",
      arguments: {
        compName: "Main Comp",
        time: 1.5
      }
    });
    const contentItems = aePreview.content as Array<{ type: string; data?: string; mimeType?: string }>;
    expect(contentItems.length).toBe(2);
    expect(contentItems[0].type).toBe("text");
    expect(contentItems[1].type).toBe("image");
    expect(contentItems[1].mimeType).toBe("image/png");
    expect(contentItems[1].data).toBe(MOCK_PNG_BASE64);

    // 4. Cross-app transfer (Illustrator -> After Effects)
    const transferRes = await client.callTool({
      name: "jradb_bridge_transfer",
      arguments: {
        sourceApp: "illustrator",
        targetApp: "after-effects",
        exchangeFilePath: "C:/temp/logo_vector.png",
        format: "png"
      }
    });
    expect(transferRes.isError).toBeFalsy();

    // 5. Illustrator C++ SDK ScriptMessage bridge
    const cppRes = await client.callTool({
      name: "ai_send_cpp_script_message",
      arguments: {
        pluginName: "ScriptMessage",
        selector: "Send Text",
        payload: { action: "customNativeSuiteCall" }
      }
    });
    expect(cppRes.isError).toBeFalsy();

    expect(recordedCommands.length).toBe(6); // 1 PS + 2 AE + 2 Transfer (AI export + AE import) + 1 AI C++
  });

  it("supports single-app mode (--apps after-effects) exposing only After Effects and shared tools", async () => {
    const aeOnlyRuntime = createAdobeMcpServer({
      enabledApps: ["after-effects"],
      wsPort: runtime.hub.getPort(), // joins as follower!
      enableOsFallback: false
    });
    await aeOnlyRuntime.startHub();
    expect(aeOnlyRuntime.hub.getRole()).toBe("follower");

    const [cTrans, sTrans] = InMemoryTransport.createLinkedPair();
    await aeOnlyRuntime.server.connect(sTrans);
    const aeClient = new Client({ name: "ae-only-client", version: "1.0.0" });
    await aeClient.connect(cTrans);

    const { tools } = await aeClient.listTools();
    const names = tools.map((t) => t.name);

    expect(names.some((n) => n.startsWith("ae_"))).toBe(true);
    expect(names.some((n) => n.startsWith("ps_"))).toBe(false);
    expect(names.some((n) => n.startsWith("pr_"))).toBe(false);
    expect(names.some((n) => n.startsWith("ai_"))).toBe(false);

    await aeOnlyRuntime.stop();
  });
});
