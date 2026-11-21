import { describe, it, expect, afterEach } from "vitest";
import { WsHub, HttpPollSocket } from "../../src/core/ws-hub.js";
import { BridgeCommandPacket } from "../../src/core/types.js";

const H = { "X-Adobe-MCP": "lightroom" };

describe("Lightroom HTTP long-poll bridge", () => {
  const hubs: WsHub[] = [];
  afterEach(async () => {
    for (const h of hubs) await h.stop();
    hubs.length = 0;
  });

  async function leader(): Promise<{ hub: WsHub; base: string }> {
    const hub = new WsHub({ port: 0 });
    hubs.push(hub);
    expect(await hub.start()).toBe("leader");
    return { hub, base: `http://127.0.0.1:${hub.getPort()}/http-bridge` };
  }

  it("HttpPollSocket queues commands only and hands them to the next poll", async () => {
    const s = new HttpPollSocket();
    s.send(JSON.stringify({ type: "hello_ack" }));
    s.send(JSON.stringify({ type: "command", id: "1" }));
    expect(await s.nextMessage(10)).toContain('"id":"1"');
    expect(await s.nextMessage(10)).toBeNull();
    const waiting = s.nextMessage(1000);
    s.send(JSON.stringify({ type: "command", id: "2" }));
    expect(await waiting).toContain('"id":"2"');
    s.close();
    expect(s.readyState).not.toBe(1);
  });

  it("rejects requests without the header or with a browser Origin", async () => {
    const { base } = await leader();
    expect((await fetch(`${base}/poll?app=lightroom`)).status).toBe(403);
    expect((await fetch(`${base}/poll?app=lightroom`, { headers: { ...H, Origin: "https://evil.example" } })).status).toBe(403);
    expect((await fetch(`${base}/poll?app=nope`, { headers: H })).status).toBe(400);
  });

  it("registers the plug-in on first poll, delivers a command and resolves its response", async () => {
    const { hub, base } = await leader();
    // first poll registers the bridge (it would idle for 25 s, so abort it once registered)
    const ctrl = new AbortController();
    const firstPoll = fetch(`${base}/poll?app=lightroom&instance=100&appVersion=15.0`, { headers: H, signal: ctrl.signal }).catch(() => null);
    for (let i = 0; i < 50 && !hub.hasConnectedBridge("lightroom"); i++) await new Promise((r) => setTimeout(r, 20));
    expect(hub.hasConnectedBridge("lightroom", "lua")).toBe(true);

    const pending = hub.sendCommand({ type: "command", id: "c1", app: "lightroom", action: "lr.catalog.getInfo", params: {} } as BridgeCommandPacket, 5000);
    const res = await firstPoll;
    let cmd: BridgeCommandPacket;
    if (res && res.status === 200) {
      cmd = (await res.json()) as BridgeCommandPacket;
    } else {
      ctrl.abort();
      const again = await fetch(`${base}/poll?app=lightroom&instance=100`, { headers: H });
      expect(again.status).toBe(200);
      cmd = (await again.json()) as BridgeCommandPacket;
    }
    expect(cmd.action).toBe("lr.catalog.getInfo");

    const post = await fetch(`${base}/result?app=lightroom`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "response", id: cmd.id, app: "lightroom", bridgeType: "lua", ok: true, data: { photoCount: 3 } })
    });
    expect(post.status).toBe(200);
    const packet = await pending;
    expect(packet.ok).toBe(true);
    expect((packet.data as { photoCount: number }).photoCount).toBe(3);

    // an older plug-in instance (left behind by a reload) is retired
    const newer = new AbortController();
    void fetch(`${base}/poll?app=lightroom&instance=200`, { headers: H, signal: newer.signal }).catch(() => null);
    await new Promise((r) => setTimeout(r, 50));
    expect((await fetch(`${base}/poll?app=lightroom&instance=100`, { headers: H })).status).toBe(410);
    newer.abort();
  });
});
