// Shared types for PingOS Chrome Extension Bridge

export type BridgeCommand =
  | { type: 'click'; selector?: string; text?: string; x?: number; y?: number; stealth?: boolean }
  | { type: 'type'; selector: string; text: string; stealth?: boolean }
  | { type: 'read'; selector: string; limit?: number; stealth?: boolean }
  // CANONICAL field name is `expression`; keep `code` as a backwards-compatible alias.
  | { type: 'eval'; expression?: string; code?: string; stealth?: boolean }
  | { type: 'waitFor'; selector: string; timeoutMs?: number; stealth?: boolean }
  | { type: 'navigate'; url: string; stealth?: boolean }
  | { type: 'getUrl'; stealth?: boolean }
  | { type: 'clean'; mode?: 'css' | 'remove' | 'detect' | 'full'; stealth?: boolean }
  | { type: 'recon'; classify?: boolean; stealth?: boolean }
  | { type: 'observe'; stealth?: boolean }
  | { type: 'screenshot'; stealth?: boolean }
  | { type: 'press'; key: string; modifiers?: string[]; selector?: string; stealth?: boolean }
  | { type: 'dblclick'; selector: string; stealth?: boolean }
  | { type: 'select'; from?: string; to?: string; selector?: string; startOffset?: number; endOffset?: number; stealth?: boolean }
  | { type: 'scroll'; direction?: 'up' | 'down' | 'left' | 'right'; amount?: number; selector?: string; to?: 'top' | 'bottom'; stealth?: boolean }
  | { type: 'act'; instruction: string; stealth?: boolean }
  | { type: 'extract'; range?: string; format?: 'array' | 'object' | 'csv'; schema?: Record<string, string>; query?: string; limit?: number; stealth?: boolean }
  | { type: 'record_api_action'; action: { type: string; selector?: string; text?: string; key?: string; url?: string; timestamp: number; source: string }; stealth?: boolean };

export interface BridgeResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface RecordedAction {
  type: 'click' | 'type' | 'navigate' | 'select' | 'press' | 'scroll' | 'dblclick' | string;
  selector?: string;
  text?: string;
  url?: string;
  key?: string;
  value?: string;
  timestamp: number;
}

export interface WorkflowStep {
  op: string;
  selector?: string;
  text?: string;
  url?: string;
  key?: string;
  value?: string;
}

export interface WorkflowExport {
  name: string;
  steps: WorkflowStep[];
  inputs: Record<string, string>;
  outputs: Record<string, string>;
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
