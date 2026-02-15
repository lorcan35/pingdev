// @pingdev/std — PingApp driver adapter
// Wraps existing PingApps running on localhost ports via their HTTP API

import type {
  Driver,
  DriverRegistration,
  DriverHealth,
  DriverCapabilities,
  DeviceRequest,
  DeviceResponse,
  HealthStatus,
} from '../types.js';
import { ETIMEDOUT, EIO } from '../errors.js';

// ---------------------------------------------------------------------------
// PingApp API response shapes
// ---------------------------------------------------------------------------

interface PingAppHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  browser: { connected: boolean; page_loaded: boolean };
  queue: { waiting: number; active: number; completed: number; failed: number };
  worker: { running: boolean; current_job?: string };
  timestamp: string;
}

interface PingAppChatResponse {
  job_id: string;
  status: string;
  response?: string;
  error?: { code: string; message: string };
  artifact_path?: string;
  thinking?: string;
  timing?: {
    queued_at: string;
    started_at?: string;
    completed_at?: string;
    total_ms?: number;
  };
  tool_used?: string | null;
  mode?: string | null;
  conversation_id?: string;
}

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

export interface PingAppAdapterOptions {
  id: string;
  name: string;
  endpoint: string;
  capabilities: DriverCapabilities;
  priority: number;
}

// ---------------------------------------------------------------------------
// PingApp Adapter
// ---------------------------------------------------------------------------

const HEALTH_TIMEOUT_MS = 5_000;

export class PingAppAdapter implements Driver {
  readonly registration: DriverRegistration;
  private readonly endpoint: string;

  constructor(options: PingAppAdapterOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, '');
    this.registration = {
      id: options.id,
      name: options.name,
      type: 'pingapp',
      capabilities: options.capabilities,
      endpoint: this.endpoint,
      priority: options.priority,
    };
  }

  async health(): Promise<DriverHealth> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

      const res = await fetch(`${this.endpoint}/v1/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        return {
          status: 'degraded',
          lastCheck: Date.now(),
          latencyMs,
          error: `Health endpoint returned HTTP ${res.status}`,
        };
      }

      const body = (await res.json()) as PingAppHealthResponse;

      const statusMap: Record<string, HealthStatus> = {
        healthy: 'online',
        degraded: 'degraded',
        unhealthy: 'offline',
      };

      return {
        status: statusMap[body.status] ?? 'unknown',
        lastCheck: Date.now(),
        latencyMs,
      };
    } catch (err) {
      return {
        status: 'offline',
        lastCheck: Date.now(),
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  }

  async execute(request: DeviceRequest): Promise<DeviceResponse> {
    const timeoutMs = request.timeout_ms ?? 120_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();

    try {
      const res = await fetch(`${this.endpoint}/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: request.prompt,
          conversation_id: request.conversation_id,
          timeout_ms: timeoutMs,
          tool: request.tool,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as Record<string, unknown>;
        const errMsg = typeof errBody['error'] === 'string'
          ? errBody['error']
          : `HTTP ${res.status}`;
        throw EIO(this.registration.id, errMsg);
      }

      const body = (await res.json()) as PingAppChatResponse;

      if (body.error) {
        throw EIO(this.registration.id, body.error.message);
      }

      return {
        text: body.response ?? '',
        driver: this.registration.id,
        thinking: body.thinking,
        conversation_id: body.conversation_id,
        durationMs: body.timing?.total_ms ?? (Date.now() - start),
      };
    } catch (err) {
      clearTimeout(timer);

      // Re-throw PingErrors as-is
      if (isPingError(err)) throw err;

      if (isAbortError(err)) {
        throw ETIMEDOUT(this.registration.id, timeoutMs);
      }

      throw EIO(
        this.registration.id,
        err instanceof Error ? err.message : 'Unknown error',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPingError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'errno' in err &&
    'code' in err &&
    'retryable' in err
  );
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
