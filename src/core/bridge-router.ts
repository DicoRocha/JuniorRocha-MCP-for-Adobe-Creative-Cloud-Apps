import { randomUUID } from "node:crypto";
import { withTargetDocument } from "./doc-target.js";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  AdobeAppId,
  AdobeBridgeError,
  ALL_ADOBE_APPS,
  BridgeCommandPacket,
  BridgeResponsePacket,
  BridgeType,
  CommandOptions,
  ConnectedBridgeInfo
} from "./types.js";
import { WsHub } from "./ws-hub.js";
import { executeDirectOsFallback } from "./com-runner.js";
import { logger } from "./logger.js";
import { applyTimeoutFloor, resolveTimeoutMs, TIMEOUTS } from "./timeouts.js";

export type OsFallbackExecutor = (packet: BridgeCommandPacket, timeoutMs: number) => Promise<BridgeResponsePacket>;

export interface BridgeRouterOptions {
  wsHub: WsHub;
  enableOsFallback?: boolean;
  /** Fixed timeout for every command without an explicit one. Omit to use the per-action policy (timeouts.ts). */
  defaultTimeoutMs?: number;
  /** Timeout of the liveness probe sent before the next command after a BRIDGE_TIMEOUT. */
  probeTimeoutMs?: number;
  /** Injectable for tests; defaults to the real Windows COM / AfterFX CLI fallback. */
  osFallback?: OsFallbackExecutor;
}

const NO_BRIDGE_CODES = ["BRIDGE_NOT_CONNECTED", "HUB_NOT_CONNECTED"];

/** Action used to check that a host's script engine answers again after a timeout. Any answer counts. */
export const PING_ACTION = "adobe.ping";

/** Live state of one application's command queue, reported by jradb_get_status. */
export interface AppQueueState {
  app: AdobeAppId;
  /** Commands waiting behind the one in flight. */
  queued: number;
  inFlight: { action: string; startedAt: string; elapsedMs: number } | null;
  /**
   * Set when a command timed out: the host may still be running it (long render, modal dialog).
   * The next command first sends a short probe; if the host does not answer it fails fast with APP_BUSY.
   */
  suspectBusySince: string | null;
  lastError: { code: string; message: string; action: string; at: string } | null;
  lastSuccess: { action: string; at: string; durationMs: number } | null;
}

interface MutableAppState {
  queued: number;
  inFlight: { action: string; startedAt: number } | null;
  suspectBusySince: number | null;
  lastError: { code: string; message: string; action: string; at: number } | null;
  lastSuccess: { action: string; at: number; durationMs: number } | null;
}

/** One bridge call recorded instead of sent (see captureDispatches). */
export interface CapturedDispatch {
  app: AdobeAppId;
  action: string;
  params: Record<string, unknown>;
  options: CommandOptions;
}

const captureStore = new AsyncLocalStorage<CapturedDispatch[]>();

/**
 * Runs `fn` with every BridgeRouter.dispatch call recorded instead of sent to Adobe.
 * Used by jradb_batch to turn ordinary tool calls into batch operations without duplicating
 * each tool's parameter mapping. Concurrency-safe: only calls made inside `fn` are captured.
 */
export async function captureDispatches(fn: () => Promise<unknown>): Promise<CapturedDispatch[]> {
  const captured: CapturedDispatch[] = [];
  await captureStore.run(captured, async () => {
    await fn();
  });
  return captured;
}

/**
 * Plugins installed before the ACTION_NOT_SUPPORTED code existed report unknown actions only through
 * these messages. Keep matching them so an old installed panel still triggers the retry on another bridge.
 */
const LEGACY_UNSUPPORTED_MESSAGE =
  /Unknown .{0,40}action|requires the Photoshop UXP plugin bridge|is routed via pr_execute_uxp_script|__mcpDispatch is not defined|runs through the ExtendScript handlers/i;

export function isActionNotSupported(response: BridgeResponsePacket): boolean {
  if (response.ok) {
    return false;
  }
  if (response.error?.code === "ACTION_NOT_SUPPORTED") {
    return true;
  }
  return LEGACY_UNSUPPORTED_MESSAGE.test(response.error?.message || "");
}

/**
 * Serializes commands per Adobe host application (FIFO queue with concurrency=1 per app)
 * while allowing full concurrency across different applications.
 *
 * Routing for one command:
 *   1. best connected WebSocket bridge (UXP > CEP), honouring options.preferBridge;
 *   2. if that bridge answers ACTION_NOT_SUPPORTED, the next connected bridge for the same app;
 *   3. if no (other) bridge is connected, the OS fallback (Windows COM for Photoshop/Illustrator,
 *      AfterFX -r for After Effects) unless the action is UXP-only.
 */
export class BridgeRouter {
  private readonly wsHub: WsHub;
  private readonly enableOsFallback: boolean;
  private readonly defaultTimeoutMs: number | undefined;
  private readonly probeTimeoutMs: number;
  private readonly osFallback: OsFallbackExecutor;
  private readonly appQueues = new Map<AdobeAppId, Promise<unknown>>();
  private readonly appStates = new Map<AdobeAppId, MutableAppState>();
  /** Project/document name each app must have active; injected as params.expectedProject (see pr_expect_project). */
  private readonly expectedProjects = new Map<AdobeAppId, string>();

  constructor(options: BridgeRouterOptions) {
    this.wsHub = options.wsHub;
    this.enableOsFallback = options.enableOsFallback ?? true;
    this.defaultTimeoutMs = options.defaultTimeoutMs;
    this.probeTimeoutMs = options.probeTimeoutMs ?? TIMEOUTS.probe;
    this.osFallback = options.osFallback ?? executeDirectOsFallback;

    for (const app of ALL_ADOBE_APPS) {
      this.appQueues.set(app, Promise.resolve());
      this.appStates.set(app, { queued: 0, inFlight: null, suspectBusySince: null, lastError: null, lastSuccess: null });
    }
  }

  /** Snapshot of every application's queue, for jradb_get_status. */
  public getAppStates(apps: AdobeAppId[] = ALL_ADOBE_APPS): AppQueueState[] {
    const now = Date.now();
    const iso = (t: number) => new Date(t).toISOString();
    return apps.map((app) => {
      const st = this.state(app);
      return {
        app,
        queued: st.queued,
        inFlight: st.inFlight
          ? { action: st.inFlight.action, startedAt: iso(st.inFlight.startedAt), elapsedMs: now - st.inFlight.startedAt }
          : null,
        suspectBusySince: st.suspectBusySince ? iso(st.suspectBusySince) : null,
        lastError: st.lastError ? { ...st.lastError, at: iso(st.lastError.at) } : null,
        lastSuccess: st.lastSuccess ? { ...st.lastSuccess, at: iso(st.lastSuccess.at) } : null
      };
    });
  }

  private state(app: AdobeAppId): MutableAppState {
    let st = this.appStates.get(app);
    if (!st) {
      st = { queued: 0, inFlight: null, suspectBusySince: null, lastError: null, lastSuccess: null };
      this.appStates.set(app, st);
    }
    return st;
  }

  public getHub(): WsHub {
    return this.wsHub;
  }

  public async getConnectedBridges(): Promise<ConnectedBridgeInfo[]> {
    return this.wsHub.getConnectedBridges();
  }

  public setExpectedProject(app: AdobeAppId, name: string | null): void {
    if (name && name.trim()) this.expectedProjects.set(app, name.trim());
    else this.expectedProjects.delete(app);
  }

  public getExpectedProject(app: AdobeAppId): string | null {
    return this.expectedProjects.get(app) ?? null;
  }

  public async dispatch(
    app: AdobeAppId,
    action: string,
    params: Record<string, unknown> = {},
    options: CommandOptions = {}
  ): Promise<BridgeResponsePacket> {
    // Target document: the tool call's documentName reaches every command it sends (core/doc-target.ts).
    params = withTargetDocument(app, params);
    const expected = this.expectedProjects.get(app);
    if (expected && params.expectedProject === undefined && !action.startsWith("adobe.")) {
      params = { ...params, expectedProject: expected };
    }
    const capture = captureStore.getStore();
    if (capture) {
      capture.push({ app, action, params, options });
      return { type: "response", id: "captured", app, bridgeType: "mock", ok: true, data: { captured: true } };
    }

    const prevChain = this.appQueues.get(app) || Promise.resolve();
    const st = this.state(app);
    st.queued++;

    const taskPromise = prevChain
      .catch(() => undefined)
      .then(() => {
        st.queued = Math.max(0, st.queued - 1);
        return this.runTracked(app, action, params, options);
      });

    this.appQueues.set(app, taskPromise);
    return taskPromise;
  }

  /** Runs one command with busy detection and bookkeeping for jradb_get_status. */
  private async runTracked(
    app: AdobeAppId,
    action: string,
    params: Record<string, unknown>,
    options: CommandOptions
  ): Promise<BridgeResponsePacket> {
    const st = this.state(app);
    const startedAt = Date.now();
    st.inFlight = { action, startedAt };
    try {
      if (st.suspectBusySince !== null && action !== PING_ACTION) {
        await this.probeAfterTimeout(app, action);
      }
      const res = await this.executeSingleCommand(app, action, params, options);
      st.lastSuccess = { action, at: Date.now(), durationMs: Date.now() - startedAt };
      return res;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || "EXECUTION_ERROR";
      if (code === "BRIDGE_TIMEOUT" && st.suspectBusySince === null) {
        st.suspectBusySince = Date.now();
      }
      st.lastError = {
        code,
        message: err instanceof Error ? err.message : String(err),
        action,
        at: Date.now()
      };
      throw err;
    } finally {
      st.inFlight = null;
    }
  }

  /**
   * After a timeout the host may still be busy with that command (a long render, a modal dialog,
   * a hang). Sending more scripts only stacks them up behind it, so ask first with a one-line probe:
   * any answer — even ACTION_NOT_SUPPORTED from an older plugin — means the host is responsive again.
   */
  private async probeAfterTimeout(app: AdobeAppId, nextAction: string): Promise<void> {
    const st = this.state(app);
    const packet: BridgeCommandPacket = {
      type: "command",
      id: `ping_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      app,
      action: PING_ACTION,
      params: {},
      options: { timeoutMs: this.probeTimeoutMs }
    };
    try {
      await this.wsHub.sendCommand(packet, this.probeTimeoutMs);
      st.suspectBusySince = null;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "BRIDGE_TIMEOUT") {
        const since = st.suspectBusySince ? Math.round((Date.now() - st.suspectBusySince) / 1000) : 0;
        throw new AdobeBridgeError(
          app,
          "APP_BUSY",
          `${app} has not answered since a command timed out ${since}s ago and did not answer a ${this.probeTimeoutMs} ms probe ` +
            `either, so '${nextAction}' was not sent. The app is still working on the earlier command or is blocked by a ` +
            `dialog. Check the app, close any dialog, then retry.`
        );
      }
      // No bridge / hub down: the normal routing below reports or falls back.
      st.suspectBusySince = null;
    }
  }

  private async executeSingleCommand(
    app: AdobeAppId,
    action: string,
    params: Record<string, unknown>,
    options: CommandOptions
  ): Promise<BridgeResponsePacket> {
    const id = `req_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const timeoutMs = applyTimeoutFloor(resolveTimeoutMs(action, options.timeoutMs ?? this.defaultTimeoutMs, params));
    const canUseOsFallback = this.enableOsFallback && options.preferBridge !== "uxp";

    const triedBridges: BridgeType[] = [];
    let lastUnsupported: BridgeResponsePacket | null = null;

    // At most: uxp -> cep -> mock -> OS fallback.
    for (let attempt = 0; attempt < 5; attempt++) {
      const packet: BridgeCommandPacket = {
        type: "command",
        id: attempt === 0 ? id : `${id}_${attempt}`,
        app,
        action,
        params,
        options: {
          ...options,
          timeoutMs,
          excludeBridges: [...triedBridges]
        }
      };

      let response: BridgeResponsePacket | null = null;
      let noBridgeError: unknown = null;

      try {
        response = await this.wsHub.sendCommand(packet, timeoutMs);
      } catch (wsErr: unknown) {
        const code = (wsErr as { code?: string }).code;
        if (!code || !NO_BRIDGE_CODES.includes(code)) {
          throw wsErr;
        }
        noBridgeError = wsErr;
      }

      // A FOLLOWER receives "no bridge" as a normal error packet relayed by the LEADER.
      if (response && !response.ok && NO_BRIDGE_CODES.includes(response.error?.code || "")) {
        noBridgeError = new AdobeBridgeError(
          app,
          response.error?.code || "BRIDGE_NOT_CONNECTED",
          response.error?.message || `No active WebSocket bridge connected for ${app}`
        );
        response = null;
      }

      if (!response) {
        if (canUseOsFallback && !triedBridges.includes("com") && !triedBridges.includes("cli")) {
          logger.info(`No ${triedBridges.length ? "other " : ""}WS bridge for ${app}; using OS fallback for '${action}'`);
          try {
            response = await this.osFallback(packet, timeoutMs);
          } catch (fallbackErr: unknown) {
            if (lastUnsupported) {
              throw this.buildUnsupportedError(app, action, triedBridges, lastUnsupported, fallbackErr);
            }
            throw fallbackErr;
          }
        } else if (lastUnsupported) {
          throw this.buildUnsupportedError(app, action, triedBridges, lastUnsupported);
        } else {
          throw noBridgeError;
        }
      }

      if (isActionNotSupported(response)) {
        lastUnsupported = response;
        if (!triedBridges.includes(response.bridgeType)) {
          triedBridges.push(response.bridgeType);
        }
        if (response.bridgeType === "com" || response.bridgeType === "cli") {
          throw this.buildUnsupportedError(app, action, triedBridges, response);
        }
        logger.info(`Bridge '${response.bridgeType}' does not implement '${action}' for ${app}; trying the next bridge`);
        continue;
      }

      if (!response.ok) {
        throw new AdobeBridgeError(
          app,
          response.error?.code || "HOST_ACTION_FAILED",
          response.error?.message || `Action '${action}' failed on ${app}`,
          response.error
        );
      }

      return response;
    }

    throw this.buildUnsupportedError(app, action, triedBridges, lastUnsupported);
  }

  private buildUnsupportedError(
    app: AdobeAppId,
    action: string,
    tried: BridgeType[],
    last: BridgeResponsePacket | null,
    fallbackErr?: unknown
  ): AdobeBridgeError {
    const triedText = tried.length > 0 ? tried.join(", ") : "none";
    const extra = fallbackErr
      ? ` The OS fallback also failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`
      : "";
    return new AdobeBridgeError(
      app,
      "ACTION_NOT_SUPPORTED",
      `Action '${action}' is not implemented by any bridge currently available for ${app} (tried: ${triedText}). ` +
        `Last answer: ${last?.error?.message || "n/a"}.${extra}`,
      last?.error
    );
  }
}
