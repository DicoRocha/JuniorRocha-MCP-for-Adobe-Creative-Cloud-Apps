import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { WsHub } from "../../src/core/ws-hub.js";
import { BridgeRouter } from "../../src/core/bridge-router.js";
import { BridgeCommandPacket } from "../../src/core/types.js";

describe("WsHub Leader/Follower Election & BridgeRouter FIFO Queue", () => {
  const hubsToCleanup: WsHub[] = [];
  const socketsToCleanup: WebSocket[] = [];

  afterEach(async () => {
    for (const s of socketsToCleanup) {
      try {
        s.close();
      } catch {
        // ignore
      }
    }
    socketsToCleanup.length = 0;

    for (const h of hubsToCleanup) {
      await h.stop();
    }
    hubsToCleanup.length = 0;
  });

  it("elects the 1st instance as LEADER and 2nd instance on same port as FOLLOWER, routing commands seamlessly", async () => {
    const leaderHub = new WsHub({ port: 0 });
    hubsToCleanup.push(leaderHub);
    const role1 = await leaderHub.start();
    expect(role1).toBe("leader");

    const boundPort = leaderHub.getPort();
    expect(boundPort).toBeGreaterThan(0);

    // Start second hub on the exact same port (simulating per-app MCP servers running concurrently)
    const followerHub = new WsHub({ port: boundPort });
    hubsToCleanup.push(followerHub);
    const role2 = await followerHub.start();
    expect(role2).toBe("follower");

    // Connect a mock Photoshop UXP plugin to the port
    const pluginWs = new WebSocket(`ws://127.0.0.1:${boundPort}/plugin`);
    socketsToCleanup.push(pluginWs);

    await new Promise<void>((resolve) => {
      pluginWs.on("open", () => {
        pluginWs.send(
          JSON.stringify({
            type: "hello",
            app: "photoshop",
            bridgeType: "uxp",
            appVersion: "26.4",
            pluginVersion: "1.0.0",
            capabilities: ["dom", "batchPlay"]
          })
        );
      });
      pluginWs.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "hello_ack") {
          resolve();
        }
        if (msg.type === "command") {
          const cmd = msg as BridgeCommandPacket;
          pluginWs.send(
            JSON.stringify({
              type: "response",
              id: cmd.id,
              app: "photoshop",
              bridgeType: "uxp",
              ok: true,
              data: { echoedAction: cmd.action, receivedFromFollower: true }
            })
          );
        }
      });
    });

    // Follower queries connected bridges through Leader
    const bridgesSeenByFollower = await followerHub.getConnectedBridges();
    expect(bridgesSeenByFollower.length).toBe(1);
    expect(bridgesSeenByFollower[0].app).toBe("photoshop");

    // Follower dispatches command to Photoshop plugin connected to Leader
    const followerRouter = new BridgeRouter({ wsHub: followerHub, enableOsFallback: false });
    const response = await followerRouter.dispatch("photoshop", "ps.doc.list", {});
    expect(response.ok).toBe(true);
    expect(response.data).toEqual({
      echoedAction: "ps.doc.list",
      receivedFromFollower: true
    });
  });

  it("serializes commands per application (FIFO) while running different applications in parallel", async () => {
    const hub = new WsHub({ port: 0 });
    hubsToCleanup.push(hub);
    await hub.start();
    const port = hub.getPort();

    const aeOrder: number[] = [];

    // Connect mock After Effects and Illustrator bridges
    for (const appId of ["after-effects", "illustrator"] as const) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/plugin`);
      socketsToCleanup.push(ws);
      await new Promise<void>((resolve) => {
        ws.on("open", () => {
          ws.send(
            JSON.stringify({
              type: "hello",
              app: appId,
              bridgeType: "cep",
              appVersion: "25.0",
              pluginVersion: "1.0.0",
              capabilities: ["dom"]
            })
          );
        });
        ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "hello_ack") resolve();
          if (msg.type === "command") {
            const delay = (msg.params?.delayMs as number) || 10;
            const seq = msg.params?.seq as number;
            setTimeout(() => {
              if (appId === "after-effects") {
                aeOrder.push(seq);
              }
              ws.send(
                JSON.stringify({
                  type: "response",
                  id: msg.id,
                  app: appId,
                  bridgeType: "cep",
                  ok: true,
                  data: { seq }
                })
              );
            }, delay);
          }
        });
      });
    }

    const router = new BridgeRouter({ wsHub: hub, enableOsFallback: false });

    // Dispatch 3 AE commands where the 1st is slower (60ms) than the 2nd (10ms) and 3rd (5ms)
    const [r1, r2, r3, rAi] = await Promise.all([
      router.dispatch("after-effects", "ae.test", { seq: 1, delayMs: 60 }),
      router.dispatch("after-effects", "ae.test", { seq: 2, delayMs: 10 }),
      router.dispatch("after-effects", "ae.test", { seq: 3, delayMs: 5 }),
      router.dispatch("illustrator", "ai.test", { seq: 99, delayMs: 10 })
    ]);

    expect(aeOrder).toEqual([1, 2, 3]);
    expect((r1.data as { seq: number }).seq).toBe(1);
    expect((r2.data as { seq: number }).seq).toBe(2);
    expect((r3.data as { seq: number }).seq).toBe(3);
    expect((rAi.data as { seq: number }).seq).toBe(99);
  });
});
