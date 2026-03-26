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
  /** Poll interval when waiting for response. Default: 1_500 */
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
    this.pollIntervalMs = opts.pollIntervalMs ?? 1_500;

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

    const deviceId = await this.findClaudeDevice();
    if (!deviceId) {
      return {
        text: '[Browser Claude error: No Claude tab open]',
        driver: this.registration.id,
        durationMs: Date.now() - start,
      };
    }

    // 1. Count existing response messages so we can detect the new one
    const beforeCount = await this.getResponseCount(deviceId);

    // 2. Extract the prompt
    const prompt = request.prompt || (
      typeof request.messages?.at(-1)?.content === 'string'
        ? request.messages.at(-1)!.content as string
        : ''
    );

    if (!prompt) {
      return { text: '', driver: this.registration.id, durationMs: Date.now() - start };
    }

    // 3. Send the message via PingApp route
    const sendRes = await gwPost(`${this.gateway}/v1/app/claude/chat`, { message: prompt }, 30_000);
    if (!sendRes?.ok) {
      return {
        text: `[Browser Claude error: ${sendRes?.error || 'send failed'}]`,
        driver: this.registration.id,
        durationMs: Date.now() - start,
      };
    }

    // 4. Poll until a NEW response appears and Claude stops typing
    const deadline = Date.now() + timeoutMs;
    let lastText = '';
    let stableCount = 0;

    // Wait a bit for Claude to start generating
    await sleep(2000);

    while (Date.now() < deadline) {
      // Read the latest response directly from the DOM
      const readData = await this.readLatestResponse(deviceId, beforeCount);

      if (!readData.text) {
        // No new response yet — keep waiting
        await sleep(this.pollIntervalMs);
        continue;
      }

      // Got text — check if it's still changing
      if (readData.text !== lastText) {
        lastText = readData.text;
        stableCount = 0;
        await sleep(this.pollIntervalMs);
        continue;
      }

      // Text stable — check if Claude is done
      stableCount++;
      if (stableCount >= 2) {
        const stillTyping = await this.isStillTyping();
        if (!stillTyping) break;
        stableCount = 0;
      }
      await sleep(this.pollIntervalMs);
    }

    const durationMs = Date.now() - start;

    // 5. Final read
    if (!lastText) {
      const finalRead = await this.readLatestResponse(deviceId, beforeCount);
      lastText = finalRead.text;
    }

    // 6. Get model info
    const modelRes = await gwFetch(`${this.gateway}/v1/app/claude/model`).catch(() => null);

    return {
      text: lastText || '[No response from Claude]',
      driver: this.registration.id,
      model: modelRes?.model || 'claude-web',
      durationMs,
    };
  }

  // -------------------------------------------------------------------------
  // Read helpers — work directly with deviceId to avoid navigation issues
  // -------------------------------------------------------------------------

  private async getResponseCount(deviceId: string): Promise<number> {
    try {
      const res = await gwPost(`${this.gateway}/v1/dev/${deviceId}/eval`, {
        expression: `document.querySelectorAll('.font-claude-response').length`,
      });
      return typeof res?.result === 'number' ? res.result : 0;
    } catch {
      return 0;
    }
  }

  private async readLatestResponse(deviceId: string, beforeCount: number): Promise<{ text: string; thinking?: string }> {
    try {
      const res = await gwPost(`${this.gateway}/v1/dev/${deviceId}/eval`, {
        expression: `(() => {
          const msgs = document.querySelectorAll('.font-claude-response');
          if (msgs.length <= ${beforeCount}) return { text: '' };
          const last = msgs[msgs.length - 1];
          if (!last) return { text: '' };

          // Clone the node and remove thinking indicators before reading text
          const clone = last.cloneNode(true);

          // Remove "Thought for Xs" indicators and thinking blocks
          clone.querySelectorAll('[class*="thinking"], [class*="Thinking"], [data-thinking]').forEach(el => el.remove());

          let text = clone.textContent?.trim() || '';

          // Strip common thinking prefix patterns: "Thought for Xs", "Thinking..."
          text = text.replace(/^(Thought for \\d+s\\s*)+/gi, '').trim();
          text = text.replace(/^Thinking\\.{0,3}\\s*/gi, '').trim();

          // Also extract thinking separately if present
          const thinkingEls = last.querySelectorAll('[class*="thinking"], [class*="Thinking"]');
          const thinking = Array.from(thinkingEls).map(el => el.textContent?.trim()).filter(Boolean).join('\\n');

          return { text: text.substring(0, 10000), thinking: thinking || undefined };
        })()`,
      });
      const data = res?.result ?? res;
      return { text: data?.text || '', thinking: data?.thinking };
    } catch {
      return { text: '' };
    }
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
          const stopBtn = document.querySelector('button[aria-label="Stop Response"], button[aria-label="Stop"]');
          if (stopBtn) return { typing: true, indicator: 'stop-button' };

          // Streaming indicator — the last response block might have a cursor
          const responses = document.querySelectorAll('.font-claude-response');
          const last = responses[responses.length - 1];
          if (last) {
            const cursor = last.querySelector('.animate-pulse, [class*="cursor"], .blinking-cursor');
            if (cursor) return { typing: true, indicator: 'cursor' };
          }

          // Check if there's a "Thinking" or loading spinner visible
          const thinking = document.querySelector('[class*="thinking"], [class*="Thinking"]');
          if (thinking && thinking.offsetParent !== null) return { typing: true, indicator: 'thinking' };

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
