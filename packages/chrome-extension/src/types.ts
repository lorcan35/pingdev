// Shared types for PingOS Chrome Extension Bridge

export type BridgeCommand =
  | { type: 'click'; selector: string; stealth?: boolean }
  | { type: 'type'; selector: string; text: string; stealth?: boolean }
  | { type: 'read'; selector: string; stealth?: boolean }
  | { type: 'extract'; schema: Record<string, string>; stealth?: boolean } // selector map
  // CANONICAL field name is `expression`; keep `code` as a backwards-compatible alias.
  | { type: 'eval'; expression?: string; code?: string; stealth?: boolean }
  | { type: 'waitFor'; selector: string; timeoutMs?: number; stealth?: boolean }
  | { type: 'navigate'; url: string; stealth?: boolean }
  | { type: 'getUrl'; stealth?: boolean }
  | { type: 'recon'; classify?: boolean; stealth?: boolean }
  | { type: 'screenshot'; stealth?: boolean };

export interface BridgeResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface RecordedAction {
  type: 'click' | 'type' | 'navigate';
  selector?: string;
  text?: string;
  url?: string;
  timestamp: number;
}

export interface TabInfo {
  tabId: number;
  url: string;
  title: string;
  shared: boolean;
}

export interface ConnectionStatus {
  // NOTE: keep `connected` for backwards compatibility; prefer `state`.
  connected: boolean;
  state: 'connected' | 'connecting' | 'disconnected';
  gatewayUrl: string;
  lastMessageAt?: number;
  reconnectAttempt?: number;
}

export interface DeviceRequest {
  type: 'device_request';
  device: string;
  command: BridgeCommand;
  requestId: string;
}

export interface DeviceResponse {
  type: 'device_response';
  requestId: string;
  response: BridgeResponse;
}

export interface ShareTabMessage {
  type: 'share_tab';
  tabId: number;
}

export interface UnshareTabMessage {
  type: 'unshare_tab';
  tabId: number;
}
