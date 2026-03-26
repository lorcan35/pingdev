// @pingdev/std — Browser Claude driver
// Uses the Claude PingApp (browser tab) as an LLM engine via the gateway's own routes.
// This is Tier 3 of TinkerClaw's 4-tier AI stack: free Claude via browser automation.

import type {
  Driver,
  DriverRegistration,
  DriverHealth,
  DeviceRequest,
  DeviceResponse,
} from '../types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface BrowserClaudeOptions {
  /** Gateway base URL — defaults to http://localhost:3500 */
  gateway?: string;
  /** Priority in the driver registry (lower = preferred). Default: 3 */
  priority?: number;
  /** Max ms to wait for Claude to finish responding. Default: 120_000 */
  responseTimeoutMs?: number;
  /** Poll interval when waiting for response. Default: 2_000 */
  pollIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEALTH_TIMEOUT = 5_000;

async function gwFetch(url: string, init?: RequestInit, timeoutMs = 15_000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function gwPost(url: string, body: Record<string, unknown>, timeoutMs?: number): Promise<any> {
  return gwFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs);
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export class BrowserClaudeAdapter implements Driver {
  readonly registration: DriverRegistration;
  private readonly gateway: string;
  private readonly responseTimeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(opts: BrowserClaudeOptions = {}) {
    this.gateway = (opts.gateway ?? 'http://localhost:3500').replace(/\/$/, '');
    this.responseTimeoutMs = opts.responseTimeoutMs ?? 120_000;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2_000;

    this.registration = {
      id: 'browser-claude',
      name: 'Claude (Browser)',
      type: 'pingapp',
      capabilities: {
        llm: true,
        streaming: false,   // We poll — no real streaming
        vision: true,       // Claude has vision via file upload
        toolCalling: false,  // Not available through web UI
        imageGen: false,
        search: false,
        deepResearch: false,
        thinking: true,      // Claude shows thinking in web UI
      },
      endpoint: this.gateway,
      priority: opts.priority ?? 3,
    };
  }

  // -------------------------------------------------------------------------
  // Health — check if a Claude tab is open and responsive
  // -------------------------------------------------------------------------

  async health(): Promise<DriverHealth> {
    const start = Date.now();
    try {
      const res = await gwFetch(`${this.gateway}/v1/app/claude/model`, undefined, HEALTH_TIMEOUT);
      const latencyMs = Date.now() - start;

      if (res?.ok && res.model && res.model !== 'unknown') {
        return { status: 'online', lastCheck: Date.now(), latencyMs };
      }

      // Tab exists but model unknown — degraded
      if (res?.ok) {
        return { status: 'degraded', lastCheck: Date.now(), latencyMs, error: 'Model unknown' };
      }

      // No Claude tab
      return { status: 'offline', lastCheck: Date.now(), latencyMs, error: res?.error || 'No Claude tab' };
    } catch (err) {
      return {
        status: 'offline',
        lastCheck: Date.now(),
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  }

  // -------------------------------------------------------------------------
  // Execute — send a prompt to Claude via browser and wait for response
  // -------------------------------------------------------------------------

  async execute(request: DeviceRequest): Promise<DeviceResponse> {
    const start = Date.now();
    const timeoutMs = request.timeout_ms ?? this.responseTimeoutMs;

    // 1. Start a new chat for clean context (unless conversation_id given)
    if (!request.conversation_id) {
      await gwPost(`${this.gateway}/v1/app/claude/chat/new`, {});
      await sleep(1000);
    }

    // 2. Get the "before" response snapshot so we can detect new output
    const beforeRes = await gwFetch(`${this.gateway}/v1/app/claude/chat/read`);
    const beforeText = beforeRes?.response || '';

    // 3. Send the message
    const prompt = request.prompt || (
      typeof request.messages?.at(-1)?.content === 'string'
        ? request.messages.at(-1)!.content as string
        : ''
    );

    if (!prompt) {
      return { text: '', driver: this.registration.id, durationMs: Date.now() - start };
    }

    const sendRes = await gwPost(`${this.gateway}/v1/app/claude/chat`, { message: prompt }, 30_000);
    if (!sendRes?.ok) {
      return {
        text: `[Browser Claude error: ${sendRes?.error || 'send failed'}]`,
        driver: this.registration.id,
        durationMs: Date.now() - start,
      };
    }

    // 4. Poll for response — wait until text changes and Claude stops typing
    const deadline = Date.now() + timeoutMs;
    let lastResponse = '';
    let stableCount = 0;

    while (Date.now() < deadline) {
      await sleep(this.pollIntervalMs);

      const readRes = await gwFetch(`${this.gateway}/v1/app/claude/chat/read`);
      const currentText = readRes?.response || '';

      // No new text yet
      if (currentText === beforeText || !currentText) {
        continue;
      }

      // Text is changing — Claude is still typing
      if (currentText !== lastResponse) {
        lastResponse = currentText;
        stableCount = 0;
        continue;
      }

      // Text hasn't changed since last poll — might be done
      stableCount++;

      // Also check if Claude's "stop" button has disappeared (typing indicator gone)
      if (stableCount >= 2) {
        // Double-check: is Claude still generating?
        const stillTyping = await this.isStillTyping();
        if (!stillTyping) {
          break;
        }
        // Reset stable count if still typing
        stableCount = 0;
      }
    }

    const durationMs = Date.now() - start;

    // 5. Read final response
    const finalRes = await gwFetch(`${this.gateway}/v1/app/claude/chat/read`);
    const responseText = finalRes?.response || lastResponse || '';

    // 6. Get model info
    const modelRes = await gwFetch(`${this.gateway}/v1/app/claude/model`);

    return {
      text: responseText,
      driver: this.registration.id,
      model: modelRes?.model || 'claude-web',
      durationMs,
    };
  }

  // -------------------------------------------------------------------------
  // Internal — check if Claude is still generating
  // -------------------------------------------------------------------------

  private async isStillTyping(): Promise<boolean> {
    try {
      const deviceId = await this.findClaudeDevice();
      if (!deviceId) return false;

      const res = await gwPost(`${this.gateway}/v1/dev/${deviceId}/eval`, {
        expression: `(() => {
          // Claude shows a stop button while generating
          const stopBtn = document.querySelector('button[aria-label="Stop Response"]');
          if (stopBtn) return { typing: true, indicator: 'stop-button' };

          // Pulsing cursor dot
          const cursor = document.querySelector('.animate-pulse, [class*="cursor"]');
          if (cursor) return { typing: true, indicator: 'cursor' };

          return { typing: false };
        })()`,
      });
      const data = res?.result ?? res;
      return !!data?.typing;
    } catch {
      return false;
    }
  }

  private async findClaudeDevice(): Promise<string | null> {
    try {
      const res = await gwFetch(`${this.gateway}/v1/devices`, undefined, 5_000);
      const devices = res?.extension?.devices || [];
      const match = devices.find((d: any) => d.url?.includes('claude.ai'));
      return match?.deviceId || null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // List models — report what model Claude web UI is currently using
  // -------------------------------------------------------------------------

  async listModels() {
    try {
      const res = await gwFetch(`${this.gateway}/v1/app/claude/model`);
      if (res?.ok && res.model) {
        return [{
          id: res.model,
          name: `Claude ${res.model}`,
          contextWindow: 200_000,
        }];
      }
    } catch { /* ignore */ }
    return [{ id: 'claude-web', name: 'Claude (Web)', contextWindow: 200_000 }];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
