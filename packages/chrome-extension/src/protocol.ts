export type ExtToGatewayMessage =
  | ExtHello
  | ExtShareUpdate
  | ExtDeviceResponse;

export type GatewayToExtMessage = ExtDeviceRequest;

export interface SharedTab {
  deviceId: string; // e.g. tab-123
  tabId: number;
  url: string;
  title?: string;
}

export interface ExtHello {
  type: 'hello';
  clientId: string;
  version: string;
  tabs: SharedTab[];
}

export interface ExtShareUpdate {
  type: 'share_update';
  clientId: string;
  tabs: SharedTab[];
}

export interface ExtDeviceRequest {
  type: 'device_request';
  id: string;
  deviceId: string;
  op: string;
  payload: unknown;
}

export interface ExtDeviceResponse {
  type: 'device_response';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type BgToContentMessage =
  | {
      type: 'bridge_command';
      id: string;
      op: string;
      payload: unknown;
    }
  | {
      type: 'passive:get_export';
    };

export type ContentToBgResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: string };
