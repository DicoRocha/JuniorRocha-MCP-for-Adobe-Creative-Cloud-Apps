import { describe, it, expect, afterEach } from "vitest";
import * as http from "node:http";
import { WebSocket } from "ws";
import { WsHub } from "../../src/core/ws-hub.js";
import { BridgeRouter } from "../../src/core/bridge-router.js";
import { BridgeType } from "../../src/core/types.js";

type Responder = (cmd: { id: string; action: string }) => Record<string, unknown>;

function connectMockBridge(
  port: number,
  app: string,
  bridgeType: BridgeType,
  responder: Responder,
  sockets: WebSocket[]
): Promise<void> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/plugin`);
  sockets.push(ws);
  return new Promise<void>((resolve, reject) => {
    ws.on("error", reject);
    ws.on("open", () => {
      ws.send(
        JSON.stringify({ type: "hello", app, bridgeType, appVersion: "26.0", pluginVersion: "1.0.0", capabilities: [] })
      );
    });
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "hello_ack") resolve();
      if (msg.type === "command") {
        ws.send(JSON.stringify({ type: "response", id: msg.id, app, bridgeType, ...responder(msg) }));
      }
    });
  });
}

function tryConnect(port: number, origin?: string): Promise<"open" | "rejected"> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/plugin`, origin ? { headers: { Origin: origin } } : undefined);
    ws.on("open", () => {
      ws.close();
      resolve("open");
    });
    ws.on("error", () => resolve("rejected"));
  });
}

describe("WsHub hardening", () => {
  const hubs: WsHub[] = [];
  const sockets: WebSocket[] = [];
  const servers: http.Server[] = [];

  afterEach(async () => {
    for (const s of sockets) {
      try {
        s.terminate();
      } catch {
        // ignore
      }
    }
    sockets.length = 0;
    for (const h of hubs) await h.stop();
    hubs.length = 0;
    for (const s of servers) {
      s.closeAllConnections?.();
      await new Promise<void>((r) => s.close(() => r()));
    }
    servers.length = 0;
  });

  it("does not crash when the port is held by an unrelated program; reports role 'offline'", async () => {
    const foreign = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end("some other app");
    });
    servers.push(foreign);
    await new Promise<void>((r) => foreign.listen(0, "127.0.0.1", () => r()));
    const port = (foreign.address() as { port: number }).port;

    const hub = new WsHub({ port });
    hubs.push(hub);
    const role = await hub.start();
    expect(role).toBe("offline");
    expect(hub.getRole()).toBe("offline");
    expect(hub.getLastError()).toMatch(/another program|outro programa/i);

    const router = new BridgeRouter({ wsHub: hub, enableOsFallback: false });
    await expect(router.dispatch("photoshop", "ps.doc.list", {})).rejects.toMatchObject({ code: "HUB_NOT_CONNECTED" });
  });

  it("rejects WebSocket connections coming from web pages (http/https or opaque 'null' origins)", async () => {
    const hub = new WsHub({ port: 0 });
    hubs.push(hub);
    await hub.start();
    const port = hub.getPort();

    expect(await tryConnect(port, "https://evil.example")).toBe("rejected");
    expect(await tryConnect(port, "http://localhost:8080")).toBe("rejected");
    expect(await tryConnect(port, "null")).toBe("rejected");
    expect(await tryConnect(port)).toBe("open");
    expect(await tryConnect(port, "file://")).toBe("open");
  });

  it("lets a FOLLOWER use the OS fallback when the leader has no bridge for the app", async () => {
    const leader = new WsHub({ port: 0 });
    hubs.push(leader);
    await leader.start();
    const follower = new WsHub({ port: leader.getPort() });
    hubs.push(follower);
    expect(await follower.start()).toBe("follower");

    const calls: string[] = [];
    const router = new BridgeRouter({
      wsHub: follower,
      enableOsFallback: true,
      osFallback: async (packet) => {
        calls.push(packet.action);
        return { type: "response", id: packet.id, app: packet.app, bridgeType: "com", ok: true, data: { via: "com" } };
      }
    });
    const res = await router.dispatch("photoshop", "ps.doc.list", {});
    expect(res.data).toEqual({ via: "com" });
    expect(calls).toEqual(["ps.doc.list"]);
  });

  it("reports leader health on a FOLLOWER and restores the link before listing bridges", async () => {
    const leader = new WsHub({ port: 0 });
    hubs.push(leader);
    await leader.start();
    const follower = new WsHub({ port: leader.getPort() });
    hubs.push(follower);
    expect(await follower.start()).toBe("follower");
    expect(leader.getLeaderHealth().state).toBe("self");
    expect(await follower.getConnectedBridges()).toEqual([]);
    expect(follower.getLeaderHealth().state).toBe("ok");
    expect(follower.getLeaderHealth().lastReplyAt).not.toBeNull();
    // drop the follower's socket: the next status call reconnects first instead of answering "no bridges"
    (follower as unknown as { followerClient: { terminate(): void } }).followerClient.terminate();
    await new Promise((r) => setTimeout(r, 50));
    await follower.getConnectedBridges();
    expect(follower.getRole()).toBe("follower");
    expect(follower.getLeaderHealth().state).toBe("ok");
  });

  it("retries on the next bridge when the preferred one does not implement the action", async () => {
    const hub = new WsHub({ port: 0 });
    hubs.push(hub);
    await hub.start();
    const port = hub.getPort();

    const seen: string[] = [];
    await connectMockBridge(
      port,
      "premiere",
      "uxp",
      (cmd) => {
        seen.push(`uxp:${cmd.action}`);
        return { ok: false, error: { code: "ACTION_NOT_SUPPORTED", message: "not here" } };
      },
      sockets
    );
    await connectMockBridge(
      port,
      "premiere",
      "cep",
      (cmd) => {
        seen.push(`cep:${cmd.action}`);
        return { ok: true, data: { handledBy: "cep" } };
      },
      sockets
    );

    const router = new BridgeRouter({ wsHub: hub, enableOsFallback: false });
    const res = await router.dispatch("premiere", "pr.sequence.getState", {});
    expect(res.data).toEqual({ handledBy: "cep" });
    expect(seen).toEqual(["uxp:pr.sequence.getState", "cep:pr.sequence.getState"]);
  });

  it("recognises the legacy 'unknown action' messages of already-installed plugins and falls back to COM", async () => {
    const hub = new WsHub({ port: 0 });
    hubs.push(hub);
    await hub.start();

    await connectMockBridge(
      hub.getPort(),
      "photoshop",
      "uxp",
      (cmd) => ({ ok: false, error: { code: "PS_UXP_ERROR", message: `Unknown Photoshop UXP action: ${cmd.action}` } }),
      sockets
    );

    const router = new BridgeRouter({
      wsHub: hub,
      enableOsFallback: true,
      osFallback: async (packet) => ({
        type: "response",
        id: packet.id,
        app: packet.app,
        bridgeType: "com",
        ok: true,
        data: { via: "com" }
      })
    });
    const res = await router.dispatch("photoshop", "ps.doc.save", {});
    expect(res.data).toEqual({ via: "com" });
  });

  it("reports a clear error listing the bridges tried when no bridge implements the action", async () => {
    const hub = new WsHub({ port: 0 });
    hubs.push(hub);
    await hub.start();
    await connectMockBridge(
      hub.getPort(),
      "premiere",
      "uxp",
      () => ({ ok: false, error: { code: "ACTION_NOT_SUPPORTED", message: "nope" } }),
      sockets
    );
    const router = new BridgeRouter({ wsHub: hub, enableOsFallback: false });
    await expect(router.dispatch("premiere", "pr.sequence.getState", {})).rejects.toMatchObject({
      code: "ACTION_NOT_SUPPORTED",
      message: expect.stringMatching(/uxp/)
    });
  });
});

describe("WsHub start-up failures other than a busy port", () => {
  const canTest = process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() !== 0;

  it.skipIf(!canTest)("stays up in 'offline' mode when the port cannot be opened (EACCES)", async () => {
    const hub = new WsHub({ port: 1 }); // privileged port: bind is refused for a normal user
    try {
      expect(await hub.start()).toBe("offline");
      expect(hub.getLastError()).toMatch(/EACCES/);
    } finally {
      await hub.stop();
    }
  });
});
