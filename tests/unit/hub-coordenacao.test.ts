import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { WsHub } from "../../src/core/ws-hub.js";

/**
 * 19/11/2026: each MCP process serialises its own commands, but several processes share one Hub. The leader now
 * lets one command at a time reach an application, whichever process sent it.
 */
describe("Hub: one command at a time per app across MCP processes", () => {
  const hubs: WsHub[] = [];
  const sockets: WebSocket[] = [];
  afterEach(async () => {
    for (const s of sockets.splice(0)) s.terminate();
    for (const h of hubs.splice(0)) await h.stop();
  });

  /** A bridge that answers each command after `delayMs` and records how many ran at the same time. */
  function slowBridge(port: number, app: string, delayMs: number, stats: { running: number; maxRunning: number; order: string[] }): Promise<void> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/plugin`);
    sockets.push(ws);
    return new Promise<void>((resolve, reject) => {
      ws.on("error", reject);
      ws.on("open", () => ws.send(JSON.stringify({ type: "hello", app, bridgeType: "cep", appVersion: "27.0", pluginVersion: "1.0.0", capabilities: [] })));
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "hello_ack") resolve();
        if (msg.type === "command") {
          stats.running++;
          stats.maxRunning = Math.max(stats.maxRunning, stats.running);
          stats.order.push(msg.action);
          setTimeout(() => {
            stats.running--;
            ws.send(JSON.stringify({ type: "response", id: msg.id, app, bridgeType: "cep", ok: true, data: { action: msg.action } }));
          }, delayMs);
        }
      });
    });
  }

  const cmd = (id: string, app: string, action: string) => ({ type: "command" as const, id, app: app as never, action, params: {}, options: {} });

  it("queues a command from another process behind the one in flight", async () => {
    const leader = new WsHub({ port: 0 });
    hubs.push(leader);
    await leader.start();
    const follower = new WsHub({ port: leader.getPort() });
    hubs.push(follower);
    expect(await follower.start()).toBe("follower");
    const stats = { running: 0, maxRunning: 0, order: [] as string[] };
    await slowBridge(leader.getPort(), "photoshop", 150, stats);

    const [a, b] = await Promise.all([
      leader.sendCommand(cmd("a1", "photoshop", "from.leader"), 5000),
      follower.sendCommand(cmd("b1", "photoshop", "from.follower"), 5000)
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(stats.maxRunning).toBe(1);
    expect(stats.order.length).toBe(2);
  });

  it("does not hold back commands for a different app", async () => {
    const leader = new WsHub({ port: 0 });
    hubs.push(leader);
    await leader.start();
    const ps = { running: 0, maxRunning: 0, order: [] as string[] };
    const ai = { running: 0, maxRunning: 0, order: [] as string[] };
    await slowBridge(leader.getPort(), "photoshop", 200, ps);
    await slowBridge(leader.getPort(), "illustrator", 20, ai);
    const t0 = Date.now();
    const slow = leader.sendCommand(cmd("p1", "photoshop", "slow"), 5000);
    await leader.sendCommand(cmd("i1", "illustrator", "fast"), 5000);
    expect(Date.now() - t0).toBeLessThan(150);
    await slow;
  });

  it("fails with APP_BUSY, without sending, when the app stays busy", async () => {
    const leader = new WsHub({ port: 0 });
    hubs.push(leader);
    await leader.start();
    const stats = { running: 0, maxRunning: 0, order: [] as string[] };
    await slowBridge(leader.getPort(), "premiere", 2500, stats);
    const first = leader.sendCommand(cmd("x1", "premiere", "long"), 6000);
    await new Promise((r) => setTimeout(r, 50));
    await expect(leader.sendCommand(cmd("x2", "premiere", "second"), 2000)).rejects.toMatchObject({ code: "APP_BUSY" });
    expect(stats.order).toEqual(["long"]);
    await first;
  });

  it("frees the app after a timeout, so the next command is sent", async () => {
    const leader = new WsHub({ port: 0 });
    hubs.push(leader);
    await leader.start();
    const stats = { running: 0, maxRunning: 0, order: [] as string[] };
    await slowBridge(leader.getPort(), "indesign", 700, stats);
    await expect(leader.sendCommand(cmd("t1", "indesign", "too.slow"), 200)).rejects.toMatchObject({ code: "BRIDGE_TIMEOUT" });
    const r = await leader.sendCommand(cmd("t2", "indesign", "next"), 3000);
    expect(r.ok).toBe(true);
    expect(stats.order).toEqual(["too.slow", "next"]);
  });
});
