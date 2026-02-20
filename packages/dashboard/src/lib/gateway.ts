/** API client for the PingOS gateway at localhost:3500 (proxied via /gw). */

const GW_BASE = '/gw';

export interface GatewayHealth {
  status: string;
  version?: string;
  uptime?: number;
}

export interface DeviceInfo {
  id: string;
  title?: string;
  url?: string;
}

export async function fetchGatewayHealth(): Promise<GatewayHealth> {
  const res = await fetch(`${GW_BASE}/v1/health`);
  if (!res.ok) throw new Error(`Gateway health failed: ${res.status}`);
  return res.json();
}

export async function fetchDevices(): Promise<DeviceInfo[]> {
  const res = await fetch(`${GW_BASE}/v1/devices`);
  if (!res.ok) throw new Error(`Devices fetch failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.devices ?? []);
}

export async function extractFromDevice(deviceId: string, query: string): Promise<unknown> {
  const res = await fetch(`${GW_BASE}/v1/dev/${encodeURIComponent(deviceId)}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as Record<string, string>).error ?? `Extract failed: ${res.status}`);
  }
  return res.json();
}
