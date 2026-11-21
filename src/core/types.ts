export type AdobeAppId = "photoshop" | "after-effects" | "premiere" | "illustrator" | "indesign" | "lightroom";

export const ALL_ADOBE_APPS: AdobeAppId[] = [
  "photoshop",
  "after-effects",
  "premiere",
  "illustrator",
  "indesign",
  "lightroom"
];

export type BridgeType = "uxp" | "cep" | "lua" | "com" | "cli" | "mock";

export interface PluginHelloMessage {
  type: "hello";
  app: AdobeAppId;
  bridgeType: BridgeType;
  appVersion: string;
  pluginVersion: string;
  capabilities: string[];
  pid?: number;
}

export interface CommandOptions {
  undoGroup?: string;
  returnContext?: boolean;
  capturePreview?: boolean;
  timeoutMs?: number;
  preferBridge?: BridgeType;
  /** Bridges that already answered ACTION_NOT_SUPPORTED for this command and must be skipped. */
  excludeBridges?: BridgeType[];
}

export interface BridgeCommandPacket {
  type: "command";
  id: string;
  app: AdobeAppId;
  action: string;
  params: Record<string, unknown>;
  options?: CommandOptions;
}

export interface BridgeErrorDetail {
  code: string;
  message: string;
  line?: number | null;
  fileName?: string | null;
  scriptStack?: string | null;
  details?: unknown;
}

export interface BridgeResponsePacket {
  type: "response";
  id: string;
  app: AdobeAppId;
  bridgeType: BridgeType;
  ok: boolean;
  durationMs?: number;
  data?: unknown;
  context?: Record<string, unknown>;
  previewBase64?: string;
  previewMimeType?: string;
  error?: BridgeErrorDetail;
}

export interface PeerForwardPacket {
  type: "peer_forward";
  command: BridgeCommandPacket;
}

export interface PeerStatusRequestPacket {
  type: "peer_status_request";
  id: string;
}

export interface ConnectedBridgeInfo {
  app: AdobeAppId;
  bridgeType: BridgeType;
  appVersion: string;
  pluginVersion: string;
  capabilities: string[];
  connectedAt: string;
  lastSeenAt: string;
  pid?: number;
}

export interface PeerStatusResponsePacket {
  type: "peer_status_response";
  id: string;
  hubRole: "leader" | "follower" | "standalone";
  port: number;
  connectedBridges: ConnectedBridgeInfo[];
}

export type HubRole = "leader" | "follower" | "offline" | "stopped";

export type HubWireMessage =
  | PluginHelloMessage
  | BridgeCommandPacket
  | BridgeResponsePacket
  | PeerForwardPacket
  | PeerStatusRequestPacket
  | PeerStatusResponsePacket
  | { type: "ping"; timestamp?: number }
  | { type: "pong"; timestamp?: number };

export class AdobeBridgeError extends Error {
  public readonly code: string;
  public readonly app: AdobeAppId;
  public readonly details?: BridgeErrorDetail;

  constructor(app: AdobeAppId, code: string, message: string, details?: BridgeErrorDetail) {
    super(message);
    this.name = "AdobeBridgeError";
    this.app = app;
    this.code = code;
    this.details = details;
  }
}
