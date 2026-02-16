// @pingdev/std — Protocol types
// Single source of truth for all PingOS wire protocol types

/** Operations supported by the content script bridge */
export type BridgeOp = 'read' | 'click' | 'type' | 'eval' | 'extract' | 'waitFor' | 'navigate' | 'getUrl' | 'scroll';

/** Request payload for each operation */
export interface ReadPayload {
  selector: string;
}

export interface ClickPayload {
  selector: string;
  stealth?: boolean;
}

export interface TypePayload {
  selector: string;
  text: string;
  stealth?: boolean;
}

export interface EvalPayload {
  /** CANONICAL field name for eval operations */
  expression: string;
  /** Legacy alias for expression (kept for backwards compatibility) */
  code?: string;
}

export interface ExtractPayload {
  selector?: string;
  schema?: Record<string, string>;
}

export interface WaitForPayload {
  selector: string;
  timeout?: number;
}

export interface NavigatePayload {
  url: string;
}

export interface ScrollPayload {
  selector?: string;
  /** Scroll to element (if selector provided) or by delta */
  deltaY?: number;
  behavior?: 'auto' | 'smooth';
  stealth?: boolean;
}

/** Response from bridge operations */
export interface BridgeResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** WebSocket messages between extension and gateway */
export interface HelloMessage {
  type: 'hello';
  clientId: string;
  version: string;
  tabs: Array<{ tabId: number; url: string; title?: string; deviceId: string }>;
}

export interface ShareUpdateMessage {
  type: 'share_update';
  clientId: string;
  tabs: Array<{ tabId: number; url: string; title?: string; deviceId: string }>;
}

export interface DeviceRequest {
  type: 'device_request';
  requestId: string;
  device: string;
  command: { type: BridgeOp } & Record<string, unknown>;
}

export interface DeviceResponse {
  type: 'device_response';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface PingMessage {
  type: 'ping';
  t?: number;
}

export interface PongMessage {
  type: 'pong';
  t?: number;
}
