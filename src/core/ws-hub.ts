import * as http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import {
  AdobeAppId,
  AdobeBridgeError,
  ALL_ADOBE_APPS,
  BridgeCommandPacket,
  BridgeResponsePacket,
  BridgeType,
  ConnectedBridgeInfo,
  HubRole,
  HubWireMessage,
  PeerForwardPacket,
  PeerStatusRequestPacket,
  PeerStatusResponsePacket,
  PluginHelloMessage
} from "./types.js";
import { logger } from "./logger.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { usageDir } from "./usage-log.js";

/** One line per panel connection attempt (accepted or refused), readable without the Claude Desktop logs. */
function logHubConnection(accepted: boolean, origin: unknown, userAgent: unknown, url: unknown): void {
  try {
    const file = path.join(path.dirname(usageDir()), "hub-conexoes.log");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(
      file,
      `${new Date().toISOString()} ${accepted ? "ACEITA" : "RECUSADA"} origin=${JSON.stringify(origin ?? null)} ua=${JSON.stringify(userAgent ?? null)} url=${JSON.stringify(url ?? null)}\n`
    );
  } catch (_e) {
    /* diagnostics only */
  }
}

interface RegisteredSocket {
  ws: WebSocket;
  info: ConnectedBridgeInfo;
}

interface PendingRequest {
  id: string;
  app: AdobeAppId;
  resolve: (res: BridgeResponsePacket) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  peerOriginWs?: WebSocket;
}

export interface WsHubOptions {
  host?: string;
  port?: number;
}

const REJOIN_INTERVAL_MS = 3000;

/** Header every HTTP-bridge request must carry; browsers cannot send it without a CORS preflight we never answer. */
export const HTTP_BRIDGE_HEADER = "x-adobe-mcp";
const HTTP_POLL_WAIT_MS = 25000;
const HTTP_POLL_STALE_MS = 45000;

/**
 * A bridge that cannot open a WebSocket (Lightroom Classic's Lua SDK only has HTTP) long-polls the Hub.
 * This object stands in for its WebSocket: commands sent to it wait in a queue until the next poll takes them.
 */
export class HttpPollSocket {
  private readonly queue: string[] = [];
  private waiter: ((msg: string | null) => void) | null = null;
  private lastPollAt = Date.now();
  private closed = false;

  public get readyState(): number {
    return !this.closed && Date.now() - this.lastPollAt < HTTP_POLL_STALE_MS ? WebSocket.OPEN : WebSocket.CLOSED;
  }

  public send(data: string): void {
    if (!data.includes('"type":"command"')) {
      return; // hello_ack / pong are WebSocket chatter the poller does not need
    }
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(data);
    } else {
      this.queue.push(data);
    }
  }

  public close(): void {
    this.closed = true;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(null);
    }
  }

  /** WebSocket API parity (WsHub.stop terminates every bridge). */
  public terminate(): void {
    this.close();
  }

  public isClosed(): boolean {
    return this.closed;
  }

  public touch(): void {
    this.lastPollAt = Date.now();
  }

  /** Next queued command, or null after waitMs. */
  public nextMessage(waitMs: number = HTTP_POLL_WAIT_MS): Promise<string | null> {
    this.touch();
    const queued = this.queue.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }
    if (this.waiter) {
      const previous = this.waiter;
      this.waiter = null;
      previous(null);
    }
    return new Promise((resolve) => {
      const done = (msg: string | null) => {
        clearTimeout(timer);
        resolve(msg);
      };
      const timer = setTimeout(() => {
        if (this.waiter === done) {
          this.waiter = null;
        }
        resolve(null);
      }, waitMs);
      this.waiter = done;
    });
  }

  /** Puts a command back at the front (its poll request died before the plugin received it). */
  public requeue(data: string): void {
    this.queue.unshift(data);
  }
}

/**
 * Only local app panels (CEP = "file://", UXP = no Origin) and Node peers (no Origin) may talk to the Hub.
 * Any browser page sends an http(s) Origin (or the opaque "null" origin from sandboxed frames / local html),
 * and must never be able to drive Adobe apps on this machine.
 * Set JRADB_MCP_ALLOW_NULL_ORIGIN=1 only if a trusted host panel is being rejected with origin "null".
 */
export function isAllowedWsOrigin(origin: string | undefined | null): boolean {
  if (origin === undefined || origin === null || origin === "") {
    return true;
  }
  const o = String(origin).trim().toLowerCase();
  if (o === "null") {
    return process.env.JRADB_MCP_ALLOW_NULL_ORIGIN === "1";
  }
  if (o.startsWith("http://") || o.startsWith("https://")) {
    return false;
  }
  return true;
}

/**
 * Auto-elected WebSocket Hub (Leader/Follower).
 * - The first MCP process binds 127.0.0.1:31001 as "leader".
 * - Additional MCP processes (when running per-app servers) detect EADDRINUSE and
 *   automatically connect to ws://127.0.0.1:31001/mcp-peer as "follower".
 * - Adobe UXP/CEP plugins always connect to ws://127.0.0.1:31001/plugin (or root /).
 */
export class WsHub {
  private readonly host: string;
  private port: number;
  private role: HubRole = "stopped";
  private lastError: string | null = null;
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private followerClient: WebSocket | null = null;
  private rejoinTimer: NodeJS.Timeout | null = null;
  /** Follower side: when the leader last answered anything, and how many status requests in a row timed out. */
  private leaderLastReplyAt: number | null = null;
  private leaderStatusTimeouts = 0;

  private readonly bridges = new Map<string, RegisteredSocket>();
  private readonly httpBridges = new Map<string, { socket: HttpPollSocket; key: string }>();
  /** Newest plug-in instance id per app; polls from an older instance (left behind by a plug-in reload) get 410. */
  private readonly httpInstances = new Map<string, number>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly pendingStatusRequests = new Map<
    string,
    { resolve: (res: PeerStatusResponsePacket) => void; timer: NodeJS.Timeout }
  >();

  constructor(options: WsHubOptions = {}) {
    this.host = options.host || "127.0.0.1";
    this.port = options.port ?? Number(process.env.JRADB_MCP_PORT || 31001);
  }

  public getRole(): HubRole {
    return this.role;
  }

  /** Human-readable reason why the Hub is "offline" (null when healthy). */
  public getLastError(): string | null {
    return this.lastError;
  }

  public getPort(): number {
    return this.port;
  }

  /**
   * Health of the link to the leader process (follower only). "unresponsive": the socket is open but the leader
   * did not answer the last status request in time — its event loop is blocked or the process is stuck.
   */
  public getLeaderHealth(): { state: "self" | "ok" | "unresponsive" | "disconnected" | "none"; lastReplyAt: string | null; consecutiveTimeouts: number } {
    const last = this.leaderLastReplyAt ? new Date(this.leaderLastReplyAt).toISOString() : null;
    if (this.role === "leader") return { state: "self", lastReplyAt: null, consecutiveTimeouts: 0 };
    if (this.role !== "follower") return { state: "none", lastReplyAt: last, consecutiveTimeouts: this.leaderStatusTimeouts };
    if (!this.followerClient || this.followerClient.readyState !== WebSocket.OPEN) return { state: "disconnected", lastReplyAt: last, consecutiveTimeouts: this.leaderStatusTimeouts };
    return { state: this.leaderStatusTimeouts > 0 ? "unresponsive" : "ok", lastReplyAt: last, consecutiveTimeouts: this.leaderStatusTimeouts };
  }

  /**
   * Follower whose link to the leader is down (closed socket, rejoin pending): try to restore it now and wait up
   * to `ms`, so a status call right after a reconnect does not report "no bridges" while commands would work.
   */
  private async waitForLeaderLink(ms: number): Promise<void> {
    const open = () => this.role === "leader" || (this.role === "follower" && this.followerClient?.readyState === WebSocket.OPEN);
    if (open() || this.role === "stopped") return;
    if (!this.rejoinTimer) this.scheduleRejoin(0);
    const end = Date.now() + ms;
    while (!open() && Date.now() < end && (this.role as HubRole) !== "stopped") {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  public async start(): Promise<"leader" | "follower" | "offline"> {
    if (this.role !== "stopped") {
      return this.role as "leader" | "follower" | "offline";
    }

    try {
      await this.tryStartLeader();
      this.role = "leader";
      this.lastError = null;
      logger.info(`WebSocket Hub started as LEADER on ws://${this.host}:${this.port}`);
      return "leader";
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== "EADDRINUSE") {
        // EACCES (porta reservada pelo Windows, sandbox do app), EADDRNOTAVAIL etc.
        // The MCP server must stay up for the OS fallbacks and to report the problem in jradb_get_status.
        this.role = "offline";
        this.lastError =
          `Could not open the WebSocket Hub on ${this.host}:${this.port} (${code || "error"}: ` +
          `${err instanceof Error ? err.message : String(err)}). app panels cannot connect. ` +
          `If the port is reserved by Windows or blocked, choose another with --port / JRADB_MCP_PORT.`;
        logger.error(this.lastError);
        this.scheduleRejoin();
        return "offline";
      }
    }

    logger.info(`Port ${this.port} already in use; joining existing Hub as FOLLOWER`);
    try {
      await this.connectAsFollower();
      this.role = "follower";
      this.lastError = null;
      return "follower";
    } catch (err: unknown) {
      // The port is held by something that is NOT a Junior Rocha MCP hub. Never crash the MCP server for this:
      // stay up in "offline" mode (OS/COM fallbacks still work) and keep retrying in the background.
      this.role = "offline";
      this.lastError =
        `Port ${this.port} on ${this.host} is in use by another program that is not a Junior Rocha MCP hub ` +
        `(${err instanceof Error ? err.message : String(err)}). app panels cannot connect until that port is free. ` +
        `Close the other program, or choose another port with --port / JRADB_MCP_PORT (the panels use 31001).`;
      logger.error(this.lastError);
      this.scheduleRejoin();
      return "offline";
    }
  }

  public async stop(): Promise<void> {
    this.role = "stopped";
    if (this.rejoinTimer) {
      clearTimeout(this.rejoinTimer);
      this.rejoinTimer = null;
    }

    for (const req of this.pending.values()) {
      clearTimeout(req.timer);
      req.reject(new AdobeBridgeError(req.app, "HUB_STOPPED", "WebSocket Hub stopped"));
    }
    this.pending.clear();

    if (this.followerClient) {
      this.followerClient.removeAllListeners();
      this.followerClient.terminate();
      this.followerClient = null;
    }

    for (const entry of this.bridges.values()) {
      entry.ws.terminate();
    }
    this.bridges.clear();

    if (this.wss) {
      for (const client of this.wss.clients) {
        try {
          client.terminate();
        } catch {
          // ignore
        }
      }
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
      this.wss = null;
    }

    if (this.httpServer) {
      this.httpServer.closeAllConnections?.();
      await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()));
      this.httpServer = null;
    }
  }

  public hasConnectedBridge(app: AdobeAppId, preferBridge?: BridgeType): boolean {
    if (this.role === "leader") {
      return this.selectBridgeSocket(app, preferBridge) !== null;
    }
    // Follower queries leader dynamically on sendCommand, or checks via getStatus
    return this.followerClient !== null && this.followerClient.readyState === WebSocket.OPEN;
  }

  public async getConnectedBridges(): Promise<ConnectedBridgeInfo[]> {
    if (this.role === "follower" || this.role === "offline") await this.waitForLeaderLink(2500);
    if (this.role === "leader") {
      return Array.from(this.bridges.values())
        .filter((b) => b.ws.readyState === WebSocket.OPEN)
        .map((b) => ({ ...b.info }));
    }

    if (this.role === "follower" && this.followerClient?.readyState === WebSocket.OPEN) {
      const reqId = `status_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const packet: PeerStatusRequestPacket = { type: "peer_status_request", id: reqId };

      return new Promise<ConnectedBridgeInfo[]>((resolve) => {
        const timer = setTimeout(() => {
          this.pendingStatusRequests.delete(reqId);
          this.leaderStatusTimeouts++;
          resolve([]);
        }, 2000);

        this.pendingStatusRequests.set(reqId, {
          resolve: (res) => {
            this.leaderStatusTimeouts = 0;
            resolve(res.connectedBridges);
          },
          timer
        });

        this.followerClient!.send(JSON.stringify(packet));
      });
    }

    return [];
  }

  public async sendCommand(
    packet: BridgeCommandPacket,
    timeoutMs: number = 20000
  ): Promise<BridgeResponsePacket> {
    if (this.role === "leader") {
      return this.dispatchFromLeader(packet, timeoutMs);
    }

    if (this.role === "follower") {
      if (!this.followerClient || this.followerClient.readyState !== WebSocket.OPEN) {
        throw new AdobeBridgeError(
          packet.app,
          "HUB_NOT_CONNECTED",
          `Follower MCP server is not connected to Leader Hub on ws://${this.host}:${this.port}`
        );
      }

      return new Promise<BridgeResponsePacket>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(packet.id);
          reject(
            new AdobeBridgeError(
              packet.app,
              "BRIDGE_TIMEOUT",
              `Timed out after ${timeoutMs}ms waiting for ${packet.app} (${packet.action})`
            )
          );
        }, timeoutMs);

        this.pending.set(packet.id, {
          id: packet.id,
          app: packet.app,
          resolve,
          reject,
          timer
        });

        const forward: PeerForwardPacket = {
          type: "peer_forward",
          command: packet
        };
        this.followerClient!.send(JSON.stringify(forward));
      });
    }

    if (this.role === "offline") {
      throw new AdobeBridgeError(
        packet.app,
        "HUB_NOT_CONNECTED",
        this.lastError || `WebSocket Hub is offline on ws://${this.host}:${this.port}`
      );
    }

    throw new AdobeBridgeError(packet.app, "HUB_STOPPED", "WebSocket Hub is not running");
  }

  private tryStartLeader(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (req.url && req.url.startsWith("/http-bridge/")) {
          void this.handleHttpBridge(req, res);
          return;
        }
        if (req.url === "/health" || req.url === "/status") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "ok",
              role: "leader",
              port: this.port,
              connectedBridges: Array.from(this.bridges.values()).map((b) => b.info)
            })
          );
          return;
        }
        res.writeHead(404);
        res.end();
      });

      const onError = (err: Error) => {
        server.removeListener("listening", onListening);
        reject(err);
      };

      const onListening = () => {
        server.removeListener("error", onError);
        const addr = server.address();
        if (addr && typeof addr === "object") {
          this.port = addr.port;
        }
        this.httpServer = server;
        this.wss = new WebSocketServer({
          server,
          verifyClient: (info: { origin?: string; req?: http.IncomingMessage }) => {
            const allowed = isAllowedWsOrigin(info.origin);
            logHubConnection(allowed, info.origin, info.req?.headers["user-agent"], info.req?.url);
            if (!allowed) {
              logger.warn("Rejected WebSocket connection from a non-local origin", { origin: info.origin });
            }
            return allowed;
          }
        });
        this.setupLeaderWss(this.wss);
        resolve();
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.port, this.host);
    });
  }

  private setupLeaderWss(wss: WebSocketServer): void {
    wss.on("connection", (ws: WebSocket) => {
      let registeredKey: string | null = null;

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as HubWireMessage;
          if (msg.type === "ping") {
            if (registeredKey && this.bridges.has(registeredKey)) {
              this.bridges.get(registeredKey)!.info.lastSeenAt = new Date().toISOString();
            }
            ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
            return;
          }

          if (msg.type === "hello") {
            registeredKey = this.registerPluginSocket(ws, msg);
            return;
          }

          if (msg.type === "response") {
            if (registeredKey && this.bridges.has(registeredKey)) {
              this.bridges.get(registeredKey)!.info.lastSeenAt = new Date().toISOString();
            }
            this.handleResponsePacket(msg);
            return;
          }

          if (msg.type === "peer_forward") {
            this.handlePeerForward(ws, msg);
            return;
          }

          if (msg.type === "peer_status_request") {
            const resp: PeerStatusResponsePacket = {
              type: "peer_status_response",
              id: msg.id,
              hubRole: "leader",
              port: this.port,
              connectedBridges: Array.from(this.bridges.values()).map((b) => ({ ...b.info }))
            };
            ws.send(JSON.stringify(resp));
            return;
          }
        } catch (err) {
          logger.warn("Invalid JSON message on WebSocket Hub", { error: String(err) });
        }
      });

      ws.on("close", () => {
        if (registeredKey) {
          const removed = this.bridges.get(registeredKey);
          this.bridges.delete(registeredKey);
          if (removed) {
            logger.info(`Bridge disconnected: ${removed.info.app} (${removed.info.bridgeType})`);
          }
        }
      });

      ws.on("error", (err) => {
        logger.debug("WebSocket client error", { error: String(err) });
      });
    });
  }

  /**
   * HTTP long-poll bridge (used by the Lightroom Classic plugin):
   *   GET  /http-bridge/poll?app=lightroom&appVersion=..&pluginVersion=..  -> 200 command JSON | 204 nothing
   *   POST /http-bridge/result?app=lightroom  body = response packet
   * Every request needs the X-Adobe-MCP header and no browser Origin.
   */
  private async handleHttpBridge(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const reply = (status: number, body?: unknown) => {
      if (res.writableEnded) return;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    try {
      if (!req.headers[HTTP_BRIDGE_HEADER] || !isAllowedWsOrigin(req.headers.origin as string | undefined)) {
        logger.warn("Rejected HTTP bridge request", { origin: req.headers.origin, url: req.url });
        reply(403, { error: "forbidden" });
        return;
      }
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const app = (url.searchParams.get("app") || "") as AdobeAppId;
      if (!ALL_ADOBE_APPS.includes(app)) {
        reply(400, { error: `unknown app '${app}'` });
        return;
      }

      if (url.pathname === "/http-bridge/poll" && req.method === "GET") {
        const instance = Number(url.searchParams.get("instance") || 0);
        if (Number.isFinite(instance) && instance > 0) {
          const latest = this.httpInstances.get(app) || 0;
          if (instance < latest) {
            reply(410, { error: "superseded by a newer plug-in instance" });
            return;
          }
          this.httpInstances.set(app, instance);
        }
        const socket = this.ensureHttpBridge(app, url.searchParams);
        const msg = await socket.nextMessage();
        if (msg === null) {
          reply(204);
          return;
        }
        if (req.destroyed || res.destroyed) {
          socket.requeue(msg);
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(msg);
        return;
      }

      if (url.pathname === "/http-bridge/result" && req.method === "POST") {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += (chunk as Buffer).length;
          if (size > 64 * 1024 * 1024) {
            reply(413, { error: "result too large" });
            return;
          }
          chunks.push(chunk as Buffer);
        }
        const packet = JSON.parse(Buffer.concat(chunks).toString("utf8")) as HubWireMessage;
        const entry = this.httpBridges.get(app);
        if (entry) {
          entry.socket.touch();
          const reg = this.bridges.get(entry.key);
          if (reg) reg.info.lastSeenAt = new Date().toISOString();
        }
        if (packet.type === "response") {
          this.handleResponsePacket(packet);
        }
        reply(200, { ok: true });
        return;
      }

      reply(404, { error: "not found" });
    } catch (err) {
      logger.warn("HTTP bridge error", { error: String(err) });
      reply(500, { error: String(err) });
    }
  }

  private ensureHttpBridge(app: AdobeAppId, query: URLSearchParams): HttpPollSocket {
    const existing = this.httpBridges.get(app);
    if (existing && !existing.socket.isClosed() && this.bridges.has(existing.key)) {
      existing.socket.touch();
      this.bridges.get(existing.key)!.info.lastSeenAt = new Date().toISOString();
      return existing.socket;
    }
    const socket = new HttpPollSocket();
    const key = this.registerPluginSocket(socket as unknown as WebSocket, {
      type: "hello",
      app,
      bridgeType: "lua",
      appVersion: query.get("appVersion") || "unknown",
      pluginVersion: query.get("pluginVersion") || "1.0.0",
      capabilities: ["http-poll"]
    });
    this.httpBridges.set(app, { socket, key });
    return socket;
  }

  private registerPluginSocket(ws: WebSocket, hello: PluginHelloMessage): string {
    const key = `${hello.app}:${hello.bridgeType}:${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    // Remove stale sockets for the same app + bridgeType
    for (const [k, existing] of this.bridges.entries()) {
      if (existing.info.app === hello.app && existing.info.bridgeType === hello.bridgeType) {
        try {
          existing.ws.close();
        } catch {
          // ignore
        }
        this.bridges.delete(k);
      }
    }

    const now = new Date().toISOString();
    const info: ConnectedBridgeInfo = {
      app: hello.app,
      bridgeType: hello.bridgeType,
      appVersion: hello.appVersion || "unknown",
      pluginVersion: hello.pluginVersion || "1.0.0",
      capabilities: hello.capabilities || [],
      connectedAt: now,
      lastSeenAt: now,
      pid: hello.pid
    };

    this.bridges.set(key, { ws, info });
    logger.info(`Registered Adobe Bridge: ${info.app} via ${info.bridgeType} (v${info.appVersion})`);
    ws.send(JSON.stringify({ type: "hello_ack", app: info.app, bridgeType: info.bridgeType, timestamp: now, ...(this.notice ? { notice: this.notice } : {}) }));
    return key;
  }

  private notice: string | null = null;

  /** A line every panel shows (a newer release on GitHub). Sent to the connected panels and with each hello_ack. */
  public setNotice(text: string | null): void {
    if (text === this.notice) return;
    this.notice = text;
    if (!text) return;
    for (const { ws } of this.bridges.values()) {
      try {
        ws.send(JSON.stringify({ type: "notice", text }));
      } catch {
        /* a closing socket gets it with its next hello_ack */
      }
    }
  }

  private selectBridgeSocket(
    app: AdobeAppId,
    preferBridge?: BridgeType,
    excludeBridges: BridgeType[] = []
  ): RegisteredSocket | null {
    const candidates = Array.from(this.bridges.values()).filter(
      (b) =>
        b.info.app === app && b.ws.readyState === WebSocket.OPEN && !excludeBridges.includes(b.info.bridgeType)
    );
    if (candidates.length === 0) {
      return null;
    }

    if (preferBridge) {
      const preferred = candidates.find((c) => c.info.bridgeType === preferBridge);
      if (preferred) {
        return preferred;
      }
    }

    // Priority order: UXP first (for PS/Premiere), then CEP, then Mock
    const priority: BridgeType[] = ["uxp", "cep", "lua", "mock", "com", "cli"];
    candidates.sort(
      (a, b) => priority.indexOf(a.info.bridgeType) - priority.indexOf(b.info.bridgeType)
    );
    return candidates[0];
  }

  /**
   * One command at a time per application, whoever sent it (19/11/2026). Each MCP process serialises its own
   * commands in BridgeRouter, but several processes share this Hub (one per chat / client): without this, two
   * clients could run scripts in the same app at once. A command that finds the app busy waits a short while and
   * then fails with APP_BUSY without being sent - it is never executed late, so nothing runs twice.
   * Not covered: the OS fallback (COM / AppleScript / AfterFX -r), which each process runs on its own.
   */
  private readonly leaderInFlight = new Map<AdobeAppId, { id: string; action: string; since: number; done: Promise<void>; release: () => void }>();

  private claimApp(packet: BridgeCommandPacket): void {
    let release: () => void = () => undefined;
    const done = new Promise<void>((r) => {
      release = r;
    });
    this.leaderInFlight.set(packet.app, { id: packet.id, action: packet.action, since: Date.now(), done, release });
  }

  private releaseApp(app: AdobeAppId, id: string): void {
    const cur = this.leaderInFlight.get(app);
    if (cur && cur.id === id) {
      this.leaderInFlight.delete(app);
      cur.release();
    }
  }

  private async dispatchFromLeader(
    packet: BridgeCommandPacket,
    timeoutMs: number,
    peerOriginWs?: WebSocket
  ): Promise<BridgeResponsePacket> {
    const waitUntil = Date.now() + Math.min(8000, Math.max(1000, timeoutMs / 2));
    for (;;) {
      const busy = this.leaderInFlight.get(packet.app);
      if (!busy) break;
      const left = waitUntil - Date.now();
      if (left <= 0) {
        throw new AdobeBridgeError(
          packet.app,
          "APP_BUSY",
          `${packet.app} is running '${busy.action}' for ${Math.round((Date.now() - busy.since) / 1000)} s (possibly from another ` +
            `chat or MCP client). '${packet.action}' was NOT sent. Wait and try again; check jradb_get_status.`
        );
      }
      await Promise.race([busy.done, new Promise<void>((r) => setTimeout(r, left))]);
    }
    return this.sendToBridge(packet, timeoutMs, peerOriginWs);
  }

  private sendToBridge(
    packet: BridgeCommandPacket,
    timeoutMs: number,
    peerOriginWs?: WebSocket
  ): Promise<BridgeResponsePacket> {
    const excluded = packet.options?.excludeBridges || [];
    const target = this.selectBridgeSocket(packet.app, packet.options?.preferBridge, excluded);
    if (!target) {
      return Promise.reject(
        new AdobeBridgeError(
          packet.app,
          "BRIDGE_NOT_CONNECTED",
          excluded.length > 0
            ? `No other WebSocket bridge connected for ${packet.app} (already tried: ${excluded.join(", ")})`
            : `No active WebSocket bridge (UXP/CEP) connected for ${packet.app}`
        )
      );
    }

    return new Promise<BridgeResponsePacket>((resolve, reject) => {
      this.claimApp(packet);
      const timer = setTimeout(() => {
        this.pending.delete(packet.id);
        this.releaseApp(packet.app, packet.id);
        reject(
          new AdobeBridgeError(
            packet.app,
            "BRIDGE_TIMEOUT",
            `Command '${packet.action}' timed out after ${timeoutMs}ms on ${packet.app} (${target.info.bridgeType})`
          )
        );
      }, timeoutMs);

      this.pending.set(packet.id, {
        id: packet.id,
        app: packet.app,
        resolve,
        reject,
        timer,
        peerOriginWs
      });

      try {
        target.ws.send(JSON.stringify(packet));
      } catch (errSend) {
        clearTimeout(timer);
        this.pending.delete(packet.id);
        this.releaseApp(packet.app, packet.id);
        reject(errSend instanceof Error ? errSend : new Error(String(errSend)));
      }
    });
  }

  private handleResponsePacket(resp: BridgeResponsePacket): void {
    const pendingReq = this.pending.get(resp.id);
    if (!pendingReq) {
      return;
    }
    clearTimeout(pendingReq.timer);
    this.pending.delete(resp.id);
    this.releaseApp(pendingReq.app, resp.id);

    if (pendingReq.peerOriginWs && pendingReq.peerOriginWs.readyState === WebSocket.OPEN) {
      pendingReq.peerOriginWs.send(JSON.stringify(resp));
    }
    pendingReq.resolve(resp);
  }

  private handlePeerForward(peerWs: WebSocket, forward: PeerForwardPacket): void {
    const cmd = forward.command;
    const timeoutMs = cmd.options?.timeoutMs || 20000;
    this.dispatchFromLeader(cmd, timeoutMs, peerWs).catch((err: unknown) => {
      const errorResp: BridgeResponsePacket = {
        type: "response",
        id: cmd.id,
        app: cmd.app,
        bridgeType: "mock",
        ok: false,
        error: {
          code: (err as { code?: string }).code || "BRIDGE_DISPATCH_ERROR",
          message: err instanceof Error ? err.message : String(err)
        }
      };
      if (peerWs.readyState === WebSocket.OPEN) {
        peerWs.send(JSON.stringify(errorResp));
      }
    });
  }

  private connectAsFollower(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://${this.host}:${this.port}/mcp-peer`);
      let settled = false;

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimer);
        ws.removeAllListeners();
        ws.on("error", () => undefined);
        try {
          ws.terminate();
        } catch {
          // ignore
        }
        reject(err);
      };

      // A foreign WebSocket server could accept the upgrade: require a real Hub status reply before trusting it.
      const probeId = `probe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const handshakeTimer = setTimeout(
        () => fail(new Error("the server on that port did not answer as a Junior Rocha MCP hub")),
        1500
      );
      handshakeTimer.unref?.();

      const onProbeMessage = (raw: unknown) => {
        try {
          const msg = JSON.parse(String(raw)) as HubWireMessage;
          if (msg.type === "peer_status_response" && msg.id === probeId) {
            settled = true;
            clearTimeout(handshakeTimer);
            ws.removeListener("message", onProbeMessage);
            this.followerClient = ws;
            this.setupFollowerHandlers(ws);
            resolve();
          }
        } catch {
          // ignore non-JSON noise from a foreign server; the timer will fail the handshake
        }
      };

      ws.on("message", onProbeMessage);
      ws.once("open", () => {
        ws.send(JSON.stringify({ type: "peer_status_request", id: probeId }));
      });
      ws.once("error", (err) => fail(err));
      ws.once("close", () => fail(new Error("connection closed before the Hub handshake completed")));
    });
  }

  private setupFollowerHandlers(ws: WebSocket): void {
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as HubWireMessage;
        this.leaderLastReplyAt = Date.now();
        if (msg.type === "response") {
          this.handleResponsePacket(msg);
        } else if (msg.type === "peer_status_response") {
          const st = this.pendingStatusRequests.get(msg.id);
          if (st) {
            clearTimeout(st.timer);
            this.pendingStatusRequests.delete(msg.id);
            st.resolve(msg);
          }
        }
      } catch {
        // ignore malformed
      }
    });

    ws.on("error", (err) => {
      logger.debug("Follower socket error", { error: String(err) });
    });

    ws.on("close", () => {
      if (this.role === "stopped" || this.followerClient !== ws) {
        return;
      }
      this.followerClient = null;
      // Fail in-flight requests now instead of letting each one wait for its full timeout.
      for (const req of this.pending.values()) {
        clearTimeout(req.timer);
        req.reject(new AdobeBridgeError(req.app, "HUB_NOT_CONNECTED", "Connection to the Leader Hub was lost"));
      }
      this.pending.clear();
      this.scheduleRejoin(1500);
    });
  }

  /**
   * Background loop used both by a FOLLOWER that lost its LEADER and by an OFFLINE hub:
   * try to become LEADER, else rejoin as FOLLOWER, else try again later (never gives up, never throws).
   */
  private scheduleRejoin(delayMs: number = REJOIN_INTERVAL_MS): void {
    if (this.rejoinTimer || this.role === "stopped") {
      return;
    }
    this.rejoinTimer = setTimeout(async () => {
      this.rejoinTimer = null;
      if (this.role === "stopped" || this.role === "leader") {
        return;
      }
      try {
        await this.tryStartLeader();
        if ((this.role as HubRole) === "stopped") {
          await this.stop();
          return;
        }
        this.role = "leader";
        this.lastError = null;
        logger.info(`WebSocket Hub is now LEADER on ws://${this.host}:${this.port}`);
        return;
      } catch {
        // port still busy: fall through and try to join whoever owns it
      }
      try {
        await this.connectAsFollower();
        if ((this.role as HubRole) === "stopped") {
          await this.stop();
          return;
        }
        this.role = "follower";
        this.lastError = null;
        logger.info("Rejoined existing WebSocket Hub as FOLLOWER");
      } catch {
        if ((this.role as HubRole) !== "stopped") {
          if (this.role === "follower") {
            this.role = "offline";
            this.lastError = `Lost the Leader Hub on ws://${this.host}:${this.port} and the port is held by another program.`;
          }
          this.scheduleRejoin();
        }
      }
    }, delayMs);
    this.rejoinTimer.unref?.();
  }
}
