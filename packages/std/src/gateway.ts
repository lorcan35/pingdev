// @pingdev/std — Gateway server
// Fastify-based HTTP gateway that routes requests through the ModelRegistry

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { ModelRegistry } from './registry.js';
import { mapErrnoToHttp } from './errors.js';
import type { ContentPart, DeviceRequest, DeviceResponse, PingError } from './types.js';
import { ExtensionBridge } from './ext-bridge.js';
import { logGateway, serializeError } from './gw-log.js';
import { loadConfig } from './config.js';
import { SelectorCache } from './selector-cache.js';
import { attemptHeal, configureSelfHeal } from './self-heal.js';
import { registerAppRoutes, PINGAPP_FUNCTION_DEFS } from './app-routes.js';
import { suggest as llmSuggest, callLLM as directLLM, extractJSON } from './llm.js';
import { getLocalConfig, getTimeoutForFeature, isLocalMode, truncateDom } from './local-mode.js';
import { getDiscoverPrompt, getExtractPrompt, getGeneratePrompt, getQueryPrompt } from './local-prompts.js';
import { repairLLMJson, stripThinkBlocks } from './json-repair.js';
import { buildDiscoverSummaryForLLM, discoverPage } from './discover-engine.js';
import { FunctionRegistry } from './function-registry.js';
import { WatchManager } from './watch-manager.js';
import type { WatchEvent, PipelineDef } from './types.js';
import { PipelineEngine } from './pipeline-engine.js';
import { ReplayEngine } from './replay-engine.js';
import { PingAppGenerator, generatePingAppViaLLM } from './pingapp-generator.js';
import type { Recording, RecordedAction } from './types.js';
import { paginateExtract } from './paginate-extract.js';
import { visualExtract } from './visual-extract.js';
import {
  learnTemplate, applyTemplate, findTemplateForUrl,
  loadTemplate, listTemplates, deleteTemplate,
  exportTemplate, importTemplate,
} from './template-learner.js';
import { cdpFallback } from './cdp-fallback.js';

// ---------------------------------------------------------------------------
// Request / Reply schemas
// ---------------------------------------------------------------------------

interface PromptBody {
  prompt: string;
  driver?: string;
  require?: DeviceRequest['require'];
  strategy?: DeviceRequest['strategy'];
  timeout_ms?: number;
  conversation_id?: string;
  tool?: string;
  model?: string;
}

interface ChatBody extends PromptBody {
  messages?: DeviceRequest['messages'];
}

const CONVERSATION_TTL_MS = 30 * 60 * 1000;
const MAX_CONVERSATION_MESSAGES = 100;
type ConversationMessages = NonNullable<DeviceRequest['messages']>;
interface ConversationState {
  messages: ConversationMessages;
  updatedAt: number;
}
const chatConversations = new Map<string, ConversationState>();

function sanitizeDeviceResponse(result: DeviceResponse): DeviceResponse {
  const text = typeof result.text === 'string' ? cleanAssistantText(result.text).trim() : result.text;
  return {
    ...result,
    text,
  };
}

function cleanAssistantText(text: string): string {
  const base = stripThinkBlocks(String(text ?? ''))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
  if (!base) return base;

  const isJsonish = base.startsWith('{')
    || base.startsWith('[')
    || /```(?:json)?/i.test(base)
    || /[\[{][\s\S]*[\]}]/.test(base);

  if (!isJsonish) return base;

  const extracted = extractJSON(base);
  if (!extracted) return base;
  try {
    JSON.parse(extracted);
    return extracted;
  } catch {
    try {
      return JSON.stringify(repairLLMJson(extracted));
    } catch {
      return base;
    }
  }
}

function pruneExpiredConversations(now = Date.now()): void {
  for (const [id, state] of chatConversations.entries()) {
    if ((now - state.updatedAt) > CONVERSATION_TTL_MS) {
      chatConversations.delete(id);
    }
  }
}

function ensureConversationId(conversationId?: string): string {
  const trimmed = conversationId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : randomUUID();
}

function getConversationMessages(conversationId: string): ConversationMessages {
  pruneExpiredConversations();
  const existing = chatConversations.get(conversationId);
  if (!existing) return [];
  chatConversations.set(conversationId, { ...existing, updatedAt: Date.now() });
  return [...existing.messages];
}

function appendConversationMessages(
  conversationId: string,
  incoming: DeviceRequest['messages'],
): ConversationMessages {
  const existing = getConversationMessages(conversationId);
  const next = [...existing, ...(incoming ?? [])];
  const trimmed = next.length > MAX_CONVERSATION_MESSAGES
    ? next.slice(next.length - MAX_CONVERSATION_MESSAGES)
    : next;
  chatConversations.set(conversationId, { messages: trimmed, updatedAt: Date.now() });
  return trimmed;
}

function contentToText(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type === 'text') return part.text;
    if (part.type === 'image_url') return `[image: ${part.url}]`;
    if (part.type === 'tool_call') return `[tool_call:${part.name}]`;
    if (part.type === 'tool_result') return '[tool_result]';
    return '';
  }).join(' ').trim();
}

function buildPromptWithConversationContext(prompt: string, conversationId: string): string {
  const history = getConversationMessages(conversationId);
  if (!history.length) return prompt;
  const context = history
    .map((msg) => `${msg.role}: ${contentToText(msg.content)}`)
    .join('\n');
  return `Conversation context:\n${context}\n\nCurrent user request:\n${prompt}`;
}

const CRASH_LOG_PATH = '/tmp/pingos-crash.log';
let crashHandlersInstalled = false;

function appendCrashLog(event: string, err: unknown) {
  const ts = new Date().toISOString();
  const payload = err instanceof Error ? (err.stack || err.message) : String(err);
  try {
    appendFileSync(CRASH_LOG_PATH, `[${ts}] ${event}: ${payload}
`);
  } catch {
    // ignore secondary logging failures
  }
  logGateway('[gw] crash-resilience', { event, error: serializeError(err) });
}

function setupCrashResilience() {
  if (crashHandlersInstalled) return;
  crashHandlersInstalled = true;

  process.on('uncaughtException', (err) => {
    appendCrashLog('uncaughtException', err);
  });

  process.on('unhandledRejection', (reason) => {
    appendCrashLog('unhandledRejection', reason);
  });
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export interface GatewayOptions {
  port?: number;
  host?: string;
  registry: ModelRegistry;
  extBridge?: ExtensionBridge;
}

export async function createGateway(opts: GatewayOptions): Promise<FastifyInstance> {
  setupCrashResilience();

  // Default to IPv6 any-address so `localhost` (which often resolves to ::1 in Chrome)
  // can connect. On Linux this is typically dual-stack and will also accept IPv4.
  const { registry, port = 3500, host = '::' } = opts;
  const extBridge = opts.extBridge ?? new ExtensionBridge();

  // Load config for optional gateway middleware (e.g., self-healing).
  const cfg = await loadConfig();
  const selfHealCfg = cfg.selfHeal;

  const selectorCache = new SelectorCache();
  await selectorCache.load();
  configureSelfHeal({ extBridge, config: selfHealCfg, registry });

  const healStats = {
    attempts: 0,
    successes: 0,
    cacheHits: 0,
    cacheHitSuccesses: 0,
    llmAttempts: 0,
    llmSuccesses: 0,
  };

  const app = Fastify({ logger: false });
  const funcRegistry = new FunctionRegistry(extBridge);
  funcRegistry.registerPingApps(PINGAPP_FUNCTION_DEFS);

  // Accept empty JSON bodies as {} instead of Fastify's FST_ERR_CTP_EMPTY_JSON_BODY
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const str = (body as string).trim();
      done(null, str ? JSON.parse(str) : {});
    } catch (err) {
      const parseError = new Error('Malformed JSON body') as Error & { statusCode?: number; code?: string };
      parseError.statusCode = 400;
      parseError.code = 'FST_ERR_CTP_INVALID_JSON_BODY';
      (parseError as any).cause = err;
      done(parseError, undefined);
    }
  });

  // Global Fastify-level logging
  app.addHook('onRequest', async (request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any)._startAt = process.hrtime.bigint();
    logGateway('[http] request', {
      method: request.method,
      url: request.url,
      ip: request.ip,
    });
  });

  app.addHook('onResponse', async (request, reply) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startAt: bigint | undefined = (request as any)._startAt;
    const durationMs = startAt ? Number(process.hrtime.bigint() - startAt) / 1e6 : undefined;
    logGateway('[http] response', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs,
    });
  });

  app.addHook('onError', async (request, _reply, error) => {
    logGateway('[http] onError', {
      method: request.method,
      url: request.url,
      error: serializeError(error),
    });
  });

  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error & { statusCode?: number; code?: string };
    const parseErr = err.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || /malformed json/i.test(err.message);
    if (parseErr) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.gateway.bad_request',
        message: 'Malformed JSON body',
        retryable: false,
      });
    }

    const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({
        errno: 'ENOSYS',
        code: 'ping.gateway.bad_request',
        message: err.message || 'Bad request',
        retryable: false,
      });
    }

    return reply.status(500).send({
      errno: 'EIO',
      code: 'ping.gateway.internal_error',
      message: err.message || 'Internal server error',
      retryable: false,
    });
  });

  // ---- Health ----
  app.get('/v1/health', async () => {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  });

  // ---- Registry listing ----
  app.get('/v1/registry', async () => {
    return { drivers: registry.listAll() };
  });

  // ---- Self-heal debug endpoints ----
  app.get('/v1/heal/cache', async () => {
    return { ok: true, cache: selectorCache.getAll() };
  });

  app.get('/v1/heal/stats', async () => {
    const attempts = healStats.attempts || 0;
    const cacheHits = healStats.cacheHits || 0;
    const llmAttempts = healStats.llmAttempts || 0;
    return {
      ok: true,
      enabled: selfHealCfg.enabled,
      stats: {
        ...healStats,
        successRate: attempts ? healStats.successes / attempts : 0,
        cacheHitRate: attempts ? cacheHits / attempts : 0,
        cacheHitSuccessRate: cacheHits ? healStats.cacheHitSuccesses / cacheHits : 0,
        llmSuccessRate: llmAttempts ? healStats.llmSuccesses / llmAttempts : 0,
      },
    };
  });

  // ---- Extension reload ----
  app.post('/v1/extension/reload', async (_request, reply) => {
    const sent = extBridge.sendToFirstClient({ type: 'reload_extension' });
    if (!sent) {
      return reply.status(503).send({
        ok: false,
        error: 'No extension client connected',
      });
    }
    return { ok: true, message: 'Reload signal sent' };
  });

  // ---- Connected devices (extension bridge) ----
  app.get('/v1/devices', async () => {
    const clients = extBridge.listSharedTabs();
    const devices = clients.flatMap(({ clientId, tabs }) =>
      (tabs ?? []).map((t) => ({ ...t, clientId })),
    );
    return {
      extension: {
        clients,
        devices,
      },
    };
  });

  // ---- Device status ----
  app.get<{ Params: { device: string } }>('/v1/dev/:device/status', async (request, reply) => {
    const { device } = request.params;
    const status = extBridge.getDeviceStatus(device);
    if (!status.owned) {
      return reply.status(404).send({
        errno: 'ENODEV',
        code: 'ping.gateway.device_not_found',
        message: `Device ${device} not found`,
        retryable: false,
      });
    }
    return { ok: true, device, status };
  });

  // ---- GET /v1/dev/:device/discover — Zero-Shot Site Adaptation ----
  app.get<{ Params: { device: string } }>('/v1/dev/:device/discover', async (request, reply) => {
    const { device } = request.params;
    if (!extBridge.ownsDevice(device)) {
      return reply.status(404).send({
        errno: 'ENODEV',
        code: 'ping.gateway.device_not_found',
        message: `Device ${device} not found`,
        retryable: false,
      });
    }
    try {
      const snapshot = await extBridge.callDevice({
        deviceId: device,
        op: 'discover',
        payload: {},
        timeoutMs: 10_000,
      });
      const result = discoverPage(snapshot as Record<string, unknown>);
      return { ok: true, result };
    } catch (err) {
      // CDP fallback for discover when content script fails
      const isEIOErr = isPingError(err) ? err.errno === 'EIO' : false;
      if (isEIOErr) {
        const deviceUrl = getDeviceUrlFromShares(extBridge, device);
        const cdpResult = await cdpFallback(deviceUrl, 'discover', undefined);
        if (cdpResult) return cdpResult;
      }
      return sendPingError(reply, err);
    }
  });

  // POST alias for discover (so curl -X POST with empty body works)
  app.post<{ Params: { device: string } }>('/v1/dev/:device/discover', async (request, reply) => {
    const { device } = request.params;
    if (!extBridge.ownsDevice(device)) {
      return reply.status(404).send({
        errno: 'ENODEV',
        code: 'ping.gateway.device_not_found',
        message: `Device ${device} not found`,
        retryable: false,
      });
    }
    try {
      const snapshot = await extBridge.callDevice({
        deviceId: device,
        op: 'discover',
        payload: {},
        timeoutMs: 10_000,
      });
      const result = discoverPage(snapshot as Record<string, unknown>);
      return { ok: true, result };
    } catch (err) {
      // CDP fallback for discover when content script fails
      const isEIOErr = isPingError(err) ? err.errno === 'EIO' : false;
      if (isEIOErr) {
        const deviceUrl = getDeviceUrlFromShares(extBridge, device);
        const cdpResult = await cdpFallback(deviceUrl, 'discover', undefined);
        if (cdpResult) return cdpResult;
      }
      return sendPingError(reply, err);
    }
  });

  // ---- POST /v1/dev/:device/suggest ----
  app.post<{ Params: { device: string }; Body: { context?: string; question: string } }>(
    '/v1/dev/:device/suggest',
    async (request, reply) => {
      const { device } = request.params;
      const body = request.body as { context?: string; question: string } | null;
      if (!body || !body.question) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.gateway.bad_request',
          message: 'Missing required field: question',
          retryable: false,
        });
      }

      try {
        const result = await llmSuggest(device, body.context ?? '', body.question);
        return { ok: true, suggestion: result.suggestion, confidence: result.confidence };
      } catch (err) {
        return sendPingError(reply, err);
      }
    },
  );

  // ---- POST /v1/dev/llm/prompt ----
  app.post<{ Body: PromptBody }>('/v1/dev/llm/prompt', async (request, reply) => {
    const body = request.body as PromptBody;
    if (!body || !body.prompt) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.gateway.bad_request',
        message: 'Missing required field: prompt',
        retryable: false,
      });
    }

    const conversationId = ensureConversationId(body.conversation_id);
    const promptWithContext = body.conversation_id
      ? buildPromptWithConversationContext(body.prompt, conversationId)
      : body.prompt;

    const deviceReq: DeviceRequest = {
      prompt: promptWithContext,
      driver: body.driver,
      require: body.require,
      strategy: body.strategy,
      timeout_ms: body.timeout_ms,
      conversation_id: conversationId,
      tool: body.tool,
      model: body.model,
    };

    try {
      const driver = registry.resolve(deviceReq);
      const result: DeviceResponse = await driver.execute(deviceReq);
      const sanitized = sanitizeDeviceResponse(result);
      appendConversationMessages(conversationId, [
        { role: 'user', content: body.prompt },
        { role: 'assistant', content: sanitized.text ?? '' },
      ]);
      return {
        ...sanitized,
        conversation_id: conversationId,
      };
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  // ---- POST /v1/dev/llm/chat ----
  app.post<{ Body: ChatBody }>('/v1/dev/llm/chat', async (request, reply) => {
    const body = request.body as ChatBody;
    if (!body || (!body.prompt && !body.messages?.length)) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.gateway.bad_request',
        message: 'Missing required field: prompt or messages',
        retryable: false,
      });
    }

    const conversationId = ensureConversationId(body.conversation_id);
    const incomingMessages = body.messages
      ?? (body.prompt ? [{ role: 'user', content: body.prompt }] : []);
    const messages = [...getConversationMessages(conversationId), ...incomingMessages];

    const deviceReq: DeviceRequest = {
      prompt: body.prompt ?? '',
      messages,
      driver: body.driver,
      require: body.require,
      strategy: body.strategy,
      timeout_ms: body.timeout_ms,
      conversation_id: conversationId,
      tool: body.tool,
      model: body.model,
    };

    try {
      const driver = registry.resolve(deviceReq);
      const result: DeviceResponse = await driver.execute(deviceReq);
      const sanitized = sanitizeDeviceResponse(result);
      appendConversationMessages(conversationId, [
        ...incomingMessages,
        { role: 'assistant', content: sanitized.text ?? '' },
      ]);
      return {
        ...sanitized,
        conversation_id: conversationId,
      };
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  // ---- GET /v1/llm/models — List models from all registered LLM drivers ----
  app.get('/v1/llm/models', async (_request, reply) => {
    try {
      const allModels: Array<{ driver: string; models: import('./types.js').ModelInfo[] }> = [];
      for (const driver of registry.listDrivers()) {
        if (driver.registration.capabilities.llm && typeof driver.listModels === 'function') {
          try {
            const models = await driver.listModels();
            allModels.push({ driver: driver.registration.id, models });
          } catch {
            allModels.push({ driver: driver.registration.id, models: [] });
          }
        }
      }
      return { drivers: allModels };
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  // ---------------------------------------------------------------------------
  // Novel Features — Query, Watch, Diff, Generate
  // ---------------------------------------------------------------------------

  const queryCache = new Map<string, { selector: string; url: string }>();
  const diffStorage = new Map<string, Record<string, string>>();

  function featureHash(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return 'h' + Math.abs(h).toString(36);
  }

  async function getDeviceDom(deviceId: string, maxChars = 15_000): Promise<string> {
    const local = isLocalMode();
    const localCfg = getLocalConfig();
    const cap = local ? localCfg.domLimit : maxChars;
    try {
      const result = await extBridge.callDevice({
        deviceId,
        op: 'eval',
        payload: {
          expression: `(() => {
            const r = document.querySelector('main') || document.body;
            if (!r) return '';
            const c = r.cloneNode(true);
            if (c.querySelectorAll) c.querySelectorAll('script,style,noscript,svg,link').forEach(n => n.remove());
            return (c.innerHTML || '').substring(0, ${cap});
          })()`,
        },
        timeoutMs: 5_000,
      });
      if (typeof result === 'string') return truncateDom(result, cap);
      if (result && typeof result === 'object') {
        const html = (result as any).html ?? (result as any).data ?? result;
        return truncateDom(String(html), cap);
      }
      return truncateDom(String(result ?? ''), cap);
    } catch {
      return '';
    }
  }

  async function extractSchemaFromDevice(
    deviceId: string,
    schema: Record<string, string>,
  ): Promise<Record<string, string>> {
    try {
      const res = await extBridge.callDevice({
        deviceId,
        op: 'extract',
        payload: { schema },
        timeoutMs: 10_000,
      });
      if (res && typeof res === 'object') {
        const src = (res as any).data ?? res;
        const out: Record<string, string> = {};
        for (const key of Object.keys(schema)) {
          out[key] = typeof src[key] === 'string' ? src[key] : String(src[key] ?? '');
        }
        return out;
      }
      return {};
    } catch {
      return {};
    }
  }

  function extractTextFromResult(result: unknown): string {
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object') {
      const r = result as any;
      if (typeof r.data === 'string') return r.data;
      if (typeof r.text === 'string') return r.text;
      if (typeof r.result === 'string') return r.result;
      if (r.data && typeof r.data === 'object') {
        if (typeof r.data.text === 'string') return r.data.text;
        if (typeof r.data.result === 'string') return r.data.result;
      }
    }
    return String(result ?? '');
  }

  function extractExplicitCountFromQuery(query: string | undefined): number | null {
    const q = (query ?? '').trim();
    if (!q) return null;

    const patterns = [
      /\b(?:top|first|last)\s+(\d{1,3})\b/i,
      /\b(?:show|list|give|return|find|get)\s+(?:me\s+)?(?:the\s+)?(?:top\s+|first\s+|last\s+)?(\d{1,3})\b/i,
      /\b(\d{1,3})\s+(?:items?|results?|stories|posts?|articles?|products?|records?|entries)\b/i,
    ];
    for (const pattern of patterns) {
      const m = q.match(pattern);
      if (m) {
        const count = Number.parseInt(m[1], 10);
        if (Number.isFinite(count) && count > 0) return count;
      }
    }
    return null;
  }

  function applyExplicitQueryCountLimit(
    data: Record<string, unknown>,
    query: string | undefined,
  ): Record<string, unknown> {
    const count = extractExplicitCountFromQuery(query);
    if (!count) return data;

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      out[key] = Array.isArray(value) ? value.slice(0, count) : value;
    }
    return out;
  }

  function envInt(name: string, fallback: number): number {
    const raw = Number.parseInt(process.env[name] || '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  function envStr(name: string): string | undefined {
    const value = (process.env[name] || '').trim();
    return value || undefined;
  }

  interface FeatureLLMOptions {
    feature?: string;
    modelEnv?: string;
    timeoutEnv?: string;
    timeoutMs?: number;
    responseFormatJson?: boolean;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
  }

  async function callFeatureLLM(prompt: string, opts?: FeatureLLMOptions): Promise<{ text: string; model: string }> {
    const local = isLocalMode();
    const modelOverride = opts?.modelEnv ? envStr(opts.modelEnv) : undefined;
    const timeoutMs = local
      ? getTimeoutForFeature(opts?.feature ?? 'default')
      : (opts?.timeoutEnv
      ? envInt(opts.timeoutEnv, opts?.timeoutMs ?? 30_000)
      : (opts?.timeoutMs ?? 30_000));

    if (modelOverride || opts?.responseFormatJson || opts?.systemPrompt || opts?.maxTokens || opts?.temperature) {
      const text = await directLLM(prompt, {
        model: modelOverride,
        feature: opts?.feature,
        timeoutMs,
        responseFormatJson: opts?.responseFormatJson,
        systemPrompt: opts?.systemPrompt,
        maxTokens: opts?.maxTokens,
        temperature: opts?.temperature,
      });
      return { text, model: modelOverride ?? 'direct' };
    }

    try {
      const driver = registry.resolve({ prompt, require: { llm: true } });
      const res = await driver.execute({ prompt, timeout_ms: timeoutMs });
      return { text: res.text, model: res.model ?? driver.registration.id };
    } catch {
      const text = await directLLM(prompt, { timeoutMs, feature: opts?.feature });
      return { text, model: 'direct' };
    }
  }

  function featureParseJson(text: string): any {
    try {
      return repairLLMJson(text);
    } catch {
      return null;
    }
  }

  // ---- POST /v1/dev/:device/query — Natural language query ----
  app.post<{ Params: { device: string }; Body: { question: string } }>(
    '/v1/dev/:device/query',
    async (request, reply) => {
      const { device } = request.params;
      const body = request.body as { question?: string } | null;
      if (!body || !body.question) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.gateway.bad_request',
          message: 'Missing required field: question',
          retryable: false,
        });
      }
      if (!extBridge.ownsDevice(device)) {
        return reply.status(404).send({
          errno: 'ENODEV',
          code: 'ping.gateway.device_not_found',
          message: `Device ${device} not found`,
          retryable: false,
        });
      }

      try {
        const local = isLocalMode();
        const localCfg = getLocalConfig();
        const qHash = featureHash(body.question.toLowerCase().trim());
        const cached = queryCache.get(qHash);

        if (cached) {
          const result = await extBridge.callDevice({
            deviceId: device,
            op: 'read',
            payload: { selector: cached.selector },
            timeoutMs: 10_000,
          });
          return { answer: extractTextFromResult(result), selector: cached.selector, cached: true };
        }

        const dom = await getDeviceDom(device);
        if (!dom) {
          return reply.status(502).send({
            errno: 'EIO',
            code: 'ping.gateway.dom_unavailable',
            message: 'Could not retrieve page DOM',
            retryable: true,
          });
        }

        const domMaxChars = local ? localCfg.domLimit : envInt('PINGOS_LLM_SELECTOR_DOM_MAX_CHARS', 5_000);
        const baseTruncatedDom = truncateDom(dom, domMaxChars);
        const maxDomChars = parseInt(process.env.PINGOS_DOM_LIMIT ?? '5000', 10);
        const truncatedDom = baseTruncatedDom.length > maxDomChars
          ? baseTruncatedDom.slice(0, maxDomChars) + '\n<!-- truncated -->'
          : baseTruncatedDom;
        const qPrompt = getQueryPrompt(local);
        const prompt = qPrompt.userTemplate
          .replace('{{question}}', body.question)
          .replace('{{dom}}', truncatedDom);

        const llmRes = await callFeatureLLM(prompt, {
          feature: 'query',
          modelEnv: 'PINGOS_LLM_SELECTOR_MODEL',
          timeoutEnv: 'PINGOS_LLM_SELECTOR_TIMEOUT_MS',
          responseFormatJson: true,
          systemPrompt: qPrompt.system,
          maxTokens: 300,
          temperature: 0.1,
        });
        const parsed = featureParseJson(llmRes.text);
        if (!parsed || typeof parsed.selector !== 'string') {
          return reply.status(502).send({
            errno: 'EIO',
            code: 'ping.gateway.llm_parse_error',
            message: 'LLM did not return a valid selector',
            retryable: true,
          });
        }

        const selector = String(parsed.selector).trim();
        const result = await extBridge.callDevice({
          deviceId: device,
          op: 'read',
          payload: { selector },
          timeoutMs: 10_000,
        });
        const answer = extractTextFromResult(result);
        queryCache.set(qHash, { selector, url: getDeviceUrlFromShares(extBridge, device) ?? '' });
        return { answer, selector, cached: false, model: llmRes.model };
      } catch (err) {
        return sendPingError(reply, err);
      }
    },
  );

  // ---- POST /v1/dev/:device/watch — Schema-based live data stream (SSE), requires schema ----
  app.post<{ Params: { device: string }; Body: { schema: Record<string, string>; interval?: number } }>(
    '/v1/dev/:device/watch',
    async (request, reply) => {
      const { device } = request.params;
      const body = request.body as { schema?: Record<string, string>; interval?: number } | null;
      if (!body || !body.schema || typeof body.schema !== 'object') {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.gateway.bad_request',
          message: 'Missing required field: schema',
          retryable: false,
        });
      }
      if (!extBridge.ownsDevice(device)) {
        return reply.status(404).send({
          errno: 'ENODEV',
          code: 'ping.gateway.device_not_found',
          message: `Device ${device} not found`,
          retryable: false,
        });
      }

      const schema = body.schema;
      const interval = Math.max(1000, body.interval ?? 5000);

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      let previousData = await extractSchemaFromDevice(device, schema);
      raw.write(`data: ${JSON.stringify({ ...previousData, timestamp: Date.now() })}\n\n`);

      const intervalId = setInterval(async () => {
        try {
          const data = await extractSchemaFromDevice(device, schema);
          const currentJson = JSON.stringify(data);
          if (currentJson !== JSON.stringify(previousData)) {
            raw.write(`data: ${JSON.stringify({ ...data, timestamp: Date.now() })}\n\n`);
            previousData = data;
          }
        } catch {
          // Ignore extraction errors during polling
        }
      }, interval);

      request.raw.on('close', () => {
        clearInterval(intervalId);
      });
    },
  );

  // ---- POST /v1/dev/:device/diff — Differential extraction ----
  app.post<{ Params: { device: string }; Body: { schema: Record<string, string> } }>(
    '/v1/dev/:device/diff',
    async (request, reply) => {
      const { device } = request.params;
      const body = request.body as { schema?: Record<string, string> } | null;
      if (!body || !body.schema || typeof body.schema !== 'object') {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.gateway.bad_request',
          message: 'Missing required field: schema',
          retryable: false,
        });
      }
      if (!extBridge.ownsDevice(device)) {
        return reply.status(404).send({
          errno: 'ENODEV',
          code: 'ping.gateway.device_not_found',
          message: `Device ${device} not found`,
          retryable: false,
        });
      }

      try {
        const schema = body.schema;
        const schemaKey = `${device}_${featureHash(JSON.stringify(schema))}`;
        const snapshot = await extractSchemaFromDevice(device, schema);
        const previousSnapshot = diffStorage.get(schemaKey);
        diffStorage.set(schemaKey, snapshot);

        if (!previousSnapshot) {
          return {
            changes: [],
            unchanged: Object.keys(schema),
            snapshot,
            previousSnapshot: null,
            isFirstExtraction: true,
          };
        }

        const changes: Array<{ field: string; old: string; new: string }> = [];
        const unchanged: string[] = [];
        for (const key of Object.keys(schema)) {
          if (snapshot[key] !== previousSnapshot[key]) {
            changes.push({ field: key, old: previousSnapshot[key] ?? '', new: snapshot[key] ?? '' });
          } else {
            unchanged.push(key);
          }
        }

        return { changes, unchanged, snapshot, previousSnapshot, isFirstExtraction: false };
      } catch (err) {
        return sendPingError(reply, err);
      }
    },
  );

  // ---- GET /v1/apps — List registered PingApps ----
  app.get('/v1/apps', async (_request, reply) => {
    return reply.send({ ok: true, apps: PINGAPP_FUNCTION_DEFS });
  });

  // ---- POST /v1/apps/generate — PingApp generator ----
  app.post<{ Body: { url: string; description: string } }>(
    '/v1/apps/generate',
    async (request, reply) => {
      const body = request.body as { url?: string; description?: string } | null;
      if (!body || !body.url || !body.description) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.gateway.bad_request',
          message: 'Missing required fields: url, description',
          retryable: false,
        });
      }

      try {
        const local = isLocalMode();
        const localCfg = getLocalConfig();
        let dom = '';
        const targetHost = body.url.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
        for (const { tabs } of extBridge.listSharedTabs()) {
          for (const tab of tabs ?? []) {
            if (tab.url && tab.url.toLowerCase().includes(targetHost)) {
              dom = await getDeviceDom(tab.deviceId);
              break;
            }
          }
          if (dom) break;
        }

        const domMaxChars = local ? localCfg.domLimit : envInt('PINGOS_LLM_APPGEN_DOM_MAX_CHARS', 5_000);
        const baseTruncatedDom = truncateDom(dom, domMaxChars);
        const maxDomChars = parseInt(process.env.PINGOS_DOM_LIMIT ?? '5000', 10);
        const truncatedDom = baseTruncatedDom.length > maxDomChars
          ? baseTruncatedDom.slice(0, maxDomChars) + '\n<!-- truncated -->'
          : baseTruncatedDom;
        const domContext = dom ? `DOM:\n${truncatedDom}` : 'DOM: none';

        if (local) {
          const app = await generatePingAppViaLLM({
            url: body.url,
            description: body.description,
            domContext,
          });
          if (!app || typeof app !== 'object' || typeof (app as Record<string, unknown>).name !== 'string') {
            return reply.status(502).send({
              errno: 'EIO',
              code: 'ping.gateway.llm_parse_error',
              message: 'LLM did not return a valid PingApp definition',
              retryable: true,
            });
          }
          funcRegistry.registerGeneratedApp(app as Record<string, unknown>, body.url);
          const appName = String((app as Record<string, unknown>).name || '').trim();
          return {
            app,
            model: getLocalConfig().llmModel || 'local',
            functions: appName ? (funcRegistry.listForApp(appName) ?? []) : [],
          };
        }

        const gPrompt = getGeneratePrompt(false);
        const prompt = gPrompt.userTemplate
          .replace('{{url}}', body.url)
          .replace('{{description}}', body.description)
          .replace('{{domContext}}', domContext);

        const llmRes = await callFeatureLLM(prompt, {
          feature: 'generate',
          modelEnv: 'PINGOS_LLM_APPGEN_MODEL',
          timeoutEnv: 'PINGOS_LLM_APPGEN_TIMEOUT_MS',
          responseFormatJson: true,
          systemPrompt: gPrompt.system,
          maxTokens: isLocalMode() ? 4096 : 1200,
          temperature: 0.1,
        });
        const parsed = featureParseJson(llmRes.text);
        if (!parsed || !parsed.name) {
          return reply.status(502).send({
            errno: 'EIO',
            code: 'ping.gateway.llm_parse_error',
            message: 'LLM did not return a valid PingApp definition',
            retryable: true,
          });
        }

        funcRegistry.registerGeneratedApp(parsed as Record<string, unknown>, body.url);
        const appName = String((parsed as Record<string, unknown>).name || '').trim();
        return {
          app: parsed,
          model: llmRes.model,
          functions: appName ? (funcRegistry.listForApp(appName) ?? []) : [],
        };
      } catch (err) {
        return sendPingError(reply, err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Tab-as-a-Function — /v1/functions namespace
  // ---------------------------------------------------------------------------

  // GET /v1/functions — list all callable functions
  app.get('/v1/functions', async () => {
    const functions = funcRegistry.listAll();
    return { ok: true, functions };
  });

  // Legacy/dev alias: GET /v1/dev/functions
  app.get('/v1/dev/functions', async () => {
    const functions = funcRegistry.listAll();
    return { ok: true, functions };
  });

  // GET /v1/functions/:app — describe functions for a specific app
  app.get<{ Params: { app: string } }>('/v1/functions/:app', async (request, reply) => {
    const { app: appName } = request.params;
    const functions = funcRegistry.listForApp(appName);
    if (!functions) {
      return reply.status(404).send({
        errno: 'ENOENT',
        code: 'ping.functions.app_not_found',
        message: `App "${appName}" not found`,
        retryable: false,
      });
    }
    return { ok: true, app: appName, functions };
  });

  // Legacy/dev alias: GET /v1/dev/functions/:app
  app.get<{ Params: { app: string } }>('/v1/dev/functions/:app', async (request, reply) => {
    const { app: appName } = request.params;
    const functions = funcRegistry.listForApp(appName);
    if (!functions) {
      return reply.status(404).send({
        errno: 'ENOENT',
        code: 'ping.functions.app_not_found',
        message: `App "${appName}" not found`,
        retryable: false,
      });
    }
    return { ok: true, app: appName, functions };
  });

  // POST /v1/functions/:app/call — call a single function
  app.post<{ Params: { app: string }; Body: { function: string; params?: Record<string, unknown> } }>(
    '/v1/functions/:app/call',
    async (request, reply) => {
      const { app: appName } = request.params;
      const body = request.body as { function?: string; params?: Record<string, unknown> } | null;
      if (!body || !body.function) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.functions.bad_request',
          message: 'Missing required field: function',
          retryable: false,
        });
      }

      const resolution = funcRegistry.resolveFunction(appName, body.function);
      if (!resolution.matched || !resolution.qualifiedName) {
        return reply.status(404).send({
          error: 'Function not found',
          available: resolution.available,
          suggestion: resolution.suggestion,
        });
      }

      try {
        const result = await funcRegistry.call(resolution.qualifiedName, body.params ?? {});
        return { ok: true, result };
      } catch (err) {
        return sendPingError(reply, err);
      }
    },
  );

  // Legacy/dev alias: POST /v1/dev/functions/call
  app.post<{ Body: { app: string; function: string; params?: Record<string, unknown> } }>(
    '/v1/dev/functions/call',
    async (request, reply) => {
      const body = request.body as { app?: string; function?: string; params?: Record<string, unknown> } | null;
      if (!body || !body.app || !body.function) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.functions.bad_request',
          message: 'Missing required fields: app, function',
          retryable: false,
        });
      }

      const appName = String(body.app).trim();
      const resolution = funcRegistry.resolveFunction(appName, body.function);
      if (!resolution.matched || !resolution.qualifiedName) {
        return reply.status(404).send({
          error: 'Function not found',
          available: resolution.available,
          suggestion: resolution.suggestion,
        });
      }

      try {
        const result = await funcRegistry.call(resolution.qualifiedName, body.params ?? {});
        return { ok: true, result };
      } catch (err) {
        return sendPingError(reply, err);
      }
    },
  );

  // POST /v1/functions/:app/batch — call multiple functions in sequence
  app.post<{
    Params: { app: string };
    Body: { calls: Array<{ function: string; params?: Record<string, unknown> }> };
  }>(
    '/v1/functions/:app/batch',
    async (request, reply) => {
      const { app: appName } = request.params;
      const body = request.body as { calls?: Array<{ function: string; params?: Record<string, unknown> }> } | null;
      if (!body || !Array.isArray(body.calls) || body.calls.length === 0) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.functions.bad_request',
          message: 'Missing required field: calls (array of {function, params})',
          retryable: false,
        });
      }

      try {
        const results = await funcRegistry.batch(
          body.calls.map((c) => ({
            function: c.function.includes('.') ? c.function : `${appName}.${c.function}`,
            params: c.params ?? {},
          })),
        );
        return { ok: true, results };
      } catch (err) {
        return sendPingError(reply, err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Real-Time Page Subscriptions — Watch Manager + SSE
  // ---------------------------------------------------------------------------

  const watchManager = new WatchManager(extBridge);

  // POST /v1/dev/:device/watch/start — Selector-based watch, requires selector, returns watchId + SSE stream URL
  app.post<{ Params: { device: string }; Body: { selector: string; fields?: Record<string, string>; interval?: number } }>(
    '/v1/dev/:device/watch/start',
    async (request, reply) => {
      const { device } = request.params;
      const body = request.body as { selector?: string; fields?: Record<string, string>; interval?: number } | null;
      if (!body || !body.selector) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.watch.bad_request',
          message: 'Missing required field: selector',
          retryable: false,
        });
      }
      if (!extBridge.ownsDevice(device)) {
        return reply.status(404).send({
          errno: 'ENODEV',
          code: 'ping.gateway.device_not_found',
          message: `Device ${device} not found`,
          retryable: false,
        });
      }

      const watch = watchManager.startWatch(device, {
        selector: body.selector,
        fields: body.fields,
        interval: body.interval,
      });

      return {
        ok: true,
        watchId: watch.watchId,
        stream: `/v1/watches/${watch.watchId}/events`,
      };
    },
  );

  // GET /v1/watches/:watchId/events — SSE stream of changes
  app.get<{ Params: { watchId: string } }>(
    '/v1/watches/:watchId/events',
    async (request, reply) => {
      const { watchId } = request.params;
      const watch = watchManager.getWatch(watchId);
      if (!watch) {
        return reply.status(404).send({
          errno: 'ENOENT',
          code: 'ping.watch.not_found',
          message: `Watch ${watchId} not found`,
          retryable: false,
        });
      }

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const listener = (event: WatchEvent) => {
        try {
          raw.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          // Connection closed
          watchManager.removeListener(watchId, listener);
        }
      };

      watchManager.addListener(watchId, listener);

      request.raw.on('close', () => {
        watchManager.removeListener(watchId, listener);
      });
    },
  );

  // DELETE /v1/watches/:watchId — stop watching
  app.delete<{ Params: { watchId: string } }>(
    '/v1/watches/:watchId',
    async (request, reply) => {
      const { watchId } = request.params;
      const stopped = watchManager.stopWatch(watchId);
      if (!stopped) {
        return reply.status(404).send({
          errno: 'ENOENT',
          code: 'ping.watch.not_found',
          message: `Watch ${watchId} not found`,
          retryable: false,
        });
      }
      return { ok: true, watchId };
    },
  );

  // GET /v1/watches — list all active watches
  app.get('/v1/watches', async () => {
    return { ok: true, watches: watchManager.listAll() };
  });

  // ---------------------------------------------------------------------------
  // Cross-Tab Data Pipes — Pipeline Engine
  // ---------------------------------------------------------------------------

  const pipelineEngine = new PipelineEngine(extBridge);
  const savedPipelines = new Map<string, PipelineDef>();

  // POST /v1/pipelines/run — execute a pipeline
  app.post<{ Body: PipelineDef }>('/v1/pipelines/run', async (request, reply) => {
    const body = request.body as PipelineDef | null;
    if (!body || !body.steps) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.pipeline.bad_request',
        message: 'Missing pipeline definition with steps',
        retryable: false,
      });
    }

    const errors = pipelineEngine.validate(body);
    if (errors.length > 0) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.pipeline.invalid',
        message: `Pipeline validation failed: ${errors.join('; ')}`,
        retryable: false,
      });
    }

    try {
      const result = await pipelineEngine.run(body);
      return { ok: true, result };
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  // POST /v1/pipelines/validate — validate a pipeline definition
  app.post<{ Body: PipelineDef }>('/v1/pipelines/validate', async (request, reply) => {
    const body = request.body as PipelineDef | null;
    if (!body) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.pipeline.bad_request',
        message: 'Missing pipeline definition',
        retryable: false,
      });
    }
    const errors = pipelineEngine.validate(body);
    return { ok: errors.length === 0, errors };
  });

  // GET /v1/pipelines — list saved pipelines
  app.get('/v1/pipelines', async () => {
    const list = Array.from(savedPipelines.entries()).map(([name, def]) => ({
      name,
      stepCount: def.steps.length,
    }));
    return { ok: true, pipelines: list };
  });

  // POST /v1/pipelines/save — save a named pipeline
  app.post<{ Body: PipelineDef }>('/v1/pipelines/save', async (request, reply) => {
    const body = request.body as PipelineDef | null;
    if (!body || !body.name || !body.steps) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.pipeline.bad_request',
        message: 'Missing pipeline name or steps',
        retryable: false,
      });
    }
    savedPipelines.set(body.name, body);
    return { ok: true, name: body.name };
  });

  // POST /v1/pipelines/pipe — execute pipe shorthand
  app.post<{ Body: { pipe: string } }>('/v1/pipelines/pipe', async (request, reply) => {
    const body = request.body as { pipe?: string } | null;
    if (!body || !body.pipe) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.pipeline.bad_request',
        message: 'Missing required field: pipe',
        retryable: false,
      });
    }

    try {
      const pipeline = PipelineEngine.parsePipeShorthand(body.pipe);
      const errors = pipelineEngine.validate(pipeline);
      if (errors.length > 0) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.pipeline.invalid',
          message: `Pipe validation failed: ${errors.join('; ')}`,
          retryable: false,
        });
      }
      const result = await pipelineEngine.run(pipeline);
      return { ok: true, result };
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  // ---- POST /v1/dev/:device/:op — Generic device operation route ----
  // Forwards to extension if it owns the device; otherwise falls back to driver registry.
  app.post<{ Params: { device: string; op: string }; Body: unknown }>(
    '/v1/dev/:device/:op',
    async (request, reply) => {
      const { device, op } = request.params;
      const payload = request.body;

      // 1. Check if extension owns this device
      if (extBridge.ownsDevice(device)) {
        const _opStartMs = Date.now();
        const payloadObj =
          payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
        const selector = typeof payloadObj?.selector === 'string' ? String(payloadObj.selector) : '';

        // Level 10: Template auto-apply — check if we have a template for this URL
        if (op === 'extract' && !payloadObj?.paginate && !payloadObj?.strategy) {
          const deviceUrl = getDeviceUrlFromShares(extBridge, device);
          if (deviceUrl) {
            const template = findTemplateForUrl(deviceUrl);
            if (template) {
              // Only auto-apply if no schema was provided (or schema matches template)
              const schemaIsEmpty = !payloadObj?.schema || Object.keys(payloadObj.schema as object).length === 0;
              if (schemaIsEmpty) {
                try {
                  const tmplResult = await applyTemplate(extBridge, device, template);
                  const limitedTemplateData = applyExplicitQueryCountLimit(
                    tmplResult.data,
                    payloadObj?.query as string | undefined,
                  );
                  if (Object.keys(limitedTemplateData).length > 0) {
                    logRecordedAction(device, op, payloadObj, limitedTemplateData, Date.now() - _opStartMs);
                    return {
                      ok: true,
                      result: {
                        data: limitedTemplateData,
                        _meta: {
                          strategy: 'template',
                          template_hit: true,
                          template_healed: tmplResult.healed,
                          domain: template.domain,
                        },
                      },
                    };
                  }
                } catch { /* template failed, fall through to normal extraction */ }
              }
            }
          }
        }

        // Level 5: Multi-Page Extract — intercept extract with paginate: true
        if (op === 'extract' && payloadObj?.paginate) {
          try {
            const result = await paginateExtract(extBridge, {
              deviceId: device,
              schema: payloadObj.schema as Record<string, string> | undefined,
              query: payloadObj.query as string | undefined,
              paginate: true,
              maxPages: (payloadObj.maxPages as number) ?? 10,
              delay: (payloadObj.delay as number) ?? 1000,
            });
            logRecordedAction(device, op, payloadObj, result, Date.now() - _opStartMs);
            return { ok: true, result };
          } catch (err) {
            return sendPingError(reply, err);
          }
        }

        // Level 9: Visual Extract — intercept extract with strategy: "visual"
        if (op === 'extract' && payloadObj?.strategy === 'visual') {
          try {
            const result = await visualExtract(extBridge, {
              deviceId: device,
              schema: payloadObj.schema as Record<string, string> | undefined,
              query: payloadObj.query as string | undefined,
              strategy: 'visual',
            });
            logRecordedAction(device, op, payloadObj, result, Date.now() - _opStartMs);
            return { ok: true, result };
          } catch (err) {
            return sendPingError(reply, err);
          }
        }

        // Default timeout for wait operations — prevent indefinite hangs
        if (op === 'wait' || op === 'waitFor') {
          if (payloadObj && !payloadObj.timeout) payloadObj.timeout = 10_000;
          if (payloadObj && !payloadObj.timeoutMs) payloadObj.timeoutMs = 10_000;
        }

        try {
          // For wait ops, wrap with a server-side race timeout as safety net
          const callPromise = extBridge.callDevice({
            deviceId: device,
            op,
            payload: payloadObj ?? payload,
            timeoutMs: op === 'wait' || op === 'waitFor' ? 30_000 : 20_000,
          });

          let result: unknown;
          if (op === 'wait' || op === 'waitFor') {
            const serverTimeout = new Promise<unknown>((_, reject) =>
              setTimeout(() => reject(new Error('Server-side wait timeout (15s)')), 15_000),
            );
            try {
              result = await Promise.race([callPromise, serverTimeout]);
            } catch (raceErr) {
              const dur = 15_000;
              const waitResult = {
                waited: true,
                duration_ms: dur,
                condition_met: false,
                error: raceErr instanceof Error ? raceErr.message : 'Wait timeout',
                _note: 'Server-side timeout safety net triggered',
              };
              logRecordedAction(device, op, payloadObj, waitResult, Date.now() - _opStartMs);
              return { ok: true, result: waitResult };
            }
          } else {
            result = await callPromise;
          }

          // Level 9: Visual fallback — if extract returned empty and fallback: "visual"
          if (op === 'extract' && payloadObj?.fallback === 'visual') {
            const resObj = result as Record<string, unknown>;
            const resData = (resObj?.result ?? resObj?.data ?? resObj) as Record<string, unknown>;
            const isEmpty = !resData || Object.values(resData).every(v =>
              v === '' || v === null || (Array.isArray(v) && v.length === 0),
            );
            if (isEmpty) {
              const visualResult = await visualExtract(extBridge, {
                deviceId: device,
                schema: payloadObj.schema as Record<string, string> | undefined,
                query: payloadObj.query as string | undefined,
                strategy: 'visual',
              });
              logRecordedAction(device, op, payloadObj, visualResult, Date.now() - _opStartMs);
              return { ok: true, result: visualResult, _fallback: 'visual' };
            }
          }

          logRecordedAction(device, op, payloadObj, result, Date.now() - _opStartMs);
          return { ok: true, result };
        } catch (err) {
          // Paginate next causes full-page navigation which destroys the content
          // script port. The resulting bfcache/EIO error is expected — treat as success.
          if (op === 'paginate' && payloadObj?.action === 'next') {
            const errMsg = err instanceof Error ? err.message : String(err);
            if (errMsg.includes('back/forward cache') || errMsg.includes('message channel closed') ||
                errMsg.includes('io_error') || errMsg.includes('I/O error') || errMsg.includes('EIO') ||
                errMsg.includes('disconnected') || errMsg.includes('destroyed')) {
              const paginateResult = { action: 'next', navigated: true, _note: 'page navigation destroyed content script port (expected)' };
              logRecordedAction(device, op, payloadObj, paginateResult, Date.now() - _opStartMs);
              return { ok: true, result: paginateResult };
            }
          }

          // CDP fallback path: when content script can't communicate (EIO/disconnected),
          // try executing the operation via Chrome DevTools Protocol directly.
          const isEIO = isPingError(err)
            ? err.errno === 'EIO'
            : (err instanceof Error && (
                err.message.includes('I/O error') || err.message.includes('EIO') ||
                err.message.includes('Receiving end does not exist') ||
                err.message.includes('Could not establish connection')
              ));
          if (isEIO) {
            const deviceUrl = getDeviceUrlFromShares(extBridge, device);
            const cdpResult = await cdpFallback(deviceUrl, op, payloadObj);
            if (cdpResult) {
              logRecordedAction(device, op, payloadObj, cdpResult, Date.now() - _opStartMs);
              return cdpResult;
            }
          }

          // JIT self-healing path: only for selector-based operations.
          if (
            selfHealCfg.enabled &&
            selector &&
            isElementNotFoundError(err) &&
            (op === 'read' || op === 'click' || op === 'type' || op === 'waitFor' || op === 'extract')
          ) {
            healStats.attempts++;

            const deviceUrl = getDeviceUrlFromShares(extBridge, device);

            // 1) Cache retry (fast path)
            const cached = selectorCache.lookup(selector, deviceUrl ?? '');
            if (cached) {
              healStats.cacheHits++;
              try {
                const retryResult = await extBridge.callDevice({
                  deviceId: device,
                  op,
                  payload: { ...payloadObj, selector: cached },
                  timeoutMs: 20_000,
                });
                healStats.successes++;
                healStats.cacheHitSuccesses++;
                logRecordedAction(device, op, payloadObj, retryResult, Date.now() - _opStartMs);
                return { ok: true, result: retryResult, _healed: { from: selector, to: cached, cached: true } };
              } catch {
                // continue to LLM path
              }
            }

            // 2) LLM retry
            healStats.llmAttempts++;
            const errorMsg =
              isPingError(err) ? err.message : err instanceof Error ? err.message : String(err);

            const healResult = await attemptHeal({
              deviceId: device,
              op,
              selector,
              error: errorMsg,
            });

            if (healResult && healResult.confidence >= selfHealCfg.minConfidence) {
              try {
                const retryResult = await extBridge.callDevice({
                  deviceId: device,
                  op,
                  payload: { ...payloadObj, selector: healResult.newSelector },
                  timeoutMs: 20_000,
                });
                healStats.successes++;
                healStats.llmSuccesses++;
                selectorCache.store(
                  selector,
                  healResult.newSelector,
                  deviceUrl ?? '',
                  healResult.confidence,
                );
                logRecordedAction(device, op, payloadObj, retryResult, Date.now() - _opStartMs);
                return {
                  ok: true,
                  result: retryResult,
                  _healed: {
                    from: selector,
                    to: healResult.newSelector,
                    cached: false,
                    confidence: healResult.confidence,
                    reasoning: healResult.reasoning,
                  },
                };
              } catch {
                // fall through to original error
              }
            }
          }
          return sendPingError(reply, err);
        }
      }

      // 2. Fall back to driver registry for known device types (e.g., "llm")
      if (device === 'llm' && (op === 'prompt' || op === 'chat')) {
        // Reuse existing logic
        const body = payload as PromptBody;
        if (!body || (!body.prompt && !(body as ChatBody).messages?.length)) {
          return reply.status(400).send({
            errno: 'ENOSYS',
            code: 'ping.gateway.bad_request',
            message: 'Missing required field: prompt or messages',
            retryable: false,
          });
        }

        const conversationId = ensureConversationId(body.conversation_id);
        const chatBody = body as ChatBody;
        const incomingMessages = chatBody.messages
          ?? (body.prompt ? [{ role: 'user', content: body.prompt }] : []);
        const isChat = op === 'chat';
        const messages = isChat
          ? [...getConversationMessages(conversationId), ...incomingMessages]
          : undefined;
        const promptText = isChat
          ? (body.prompt ?? '')
          : (body.conversation_id ? buildPromptWithConversationContext(body.prompt ?? '', conversationId) : (body.prompt ?? ''));

        const deviceReq: DeviceRequest = {
          prompt: promptText,
          ...(messages ? { messages } : {}),
          driver: body.driver,
          require: body.require,
          strategy: body.strategy,
          timeout_ms: body.timeout_ms,
          conversation_id: conversationId,
          tool: body.tool,
        };

        try {
          const driver = registry.resolve(deviceReq);
          const result: DeviceResponse = await driver.execute(deviceReq);
          const sanitized = sanitizeDeviceResponse(result);
          appendConversationMessages(conversationId, [
            ...incomingMessages,
            { role: 'assistant', content: sanitized.text ?? '' },
          ]);
          return {
            ...sanitized,
            conversation_id: conversationId,
          };
        } catch (err) {
          return sendPingError(reply, err);
        }
      }

      // 3. Unknown device
      return reply.status(404).send({
        errno: 'ENODEV',
        code: 'ping.gateway.device_not_found',
        message: `Device ${device} not found`,
        retryable: false,
      });
    },
  );

  // ---- POST /v1/dev/:device/extract/semantic — Semantic LLM-driven extraction ----
  const semanticSelectorCache = new Map<string, { selectors: Record<string, string>; timestamp: number }>();
  const SEMANTIC_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  app.post<{ Params: { device: string }; Body: { query: string; limit?: number } }>(
    '/v1/dev/:device/extract/semantic',
    async (request, reply) => {
      const { device } = request.params;
      const body = request.body as { query?: string; limit?: number } | null;
      if (!body || !body.query) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.gateway.bad_request',
          message: 'Missing required field: query',
          retryable: false,
        });
      }
      if (!extBridge.ownsDevice(device)) {
        return reply.status(404).send({
          errno: 'ENODEV',
          code: 'ping.gateway.device_not_found',
          message: `Device ${device} not found`,
          retryable: false,
        });
      }

      try {
        const local = isLocalMode();
        const localCfg = getLocalConfig();
        const deviceUrl = getDeviceUrlFromShares(extBridge, device) ?? '';
        const domain = deviceUrl ? new URL(deviceUrl).hostname : '';
        const cacheKey = `${domain}::${body.query}`;

        // Check cache first
        const cached = semanticSelectorCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < SEMANTIC_CACHE_TTL_MS) {
          const result = await extBridge.callDevice({
            deviceId: device,
            op: 'extract',
            payload: { schema: cached.selectors, limit: body.limit },
            timeoutMs: 20_000,
          });
          return { ok: true, result, _cached: true, _selectors: cached.selectors };
        }

        // Get page context for LLM
        const snapshot = await extBridge.callDevice({
          deviceId: device,
          op: 'discover',
          payload: {},
          timeoutMs: 10_000,
        });

        // Build a summary for the LLM
        const snapshotObj = snapshot as Record<string, unknown>;
        const elemSummary = buildDiscoverSummaryForLLM(
          snapshotObj,
          envInt('PINGOS_LLM_EXTRACT_ELEMENT_LIMIT', 30),
          local ? localCfg.domLimit : envInt('PINGOS_LLM_EXTRACT_DOM_MAX_CHARS', 5_000),
        );

        const extractPrompt = getExtractPrompt(local);
        const discoverPrompt = getDiscoverPrompt(local);
        const prompt = extractPrompt.userTemplate
          .replace('{{query}}', body.query)
          .replace('{{url}}', String(snapshotObj.url || ''))
          .replace('{{title}}', String(snapshotObj.title || ''))
          .replace('{{elements}}', elemSummary);

        const llmResponse = await directLLM(prompt, {
          feature: 'extract',
          model: envStr('PINGOS_LLM_EXTRACT_MODEL'),
          timeoutMs: local ? getTimeoutForFeature('extract') : envInt('PINGOS_LLM_EXTRACT_TIMEOUT_MS', 20_000),
          maxTokens: 300,
          temperature: 0.1,
          responseFormatJson: true,
          systemPrompt: local ? discoverPrompt.system : 'Return JSON only: {field: cssSelector}. RESPOND WITH ONLY VALID JSON. No explanation, no markdown, no code fences.',
        });

        // Parse LLM response
        let selectors: Record<string, string> = {};
        try {
          const parsed = repairLLMJson(llmResponse) as Record<string, unknown>;
          selectors = Object.fromEntries(
            Object.entries(parsed || {}).filter(([, v]) => typeof v === 'string'),
          ) as Record<string, string>;
        } catch {
          return reply.status(500).send({
            errno: 'EIO',
            code: 'ping.extract.llm_parse_error',
            message: 'Failed to parse LLM selector response',
            retryable: true,
          });
        }

        // Cache the selectors
        semanticSelectorCache.set(cacheKey, { selectors, timestamp: Date.now() });

        // Execute the extraction
        const result = await extBridge.callDevice({
          deviceId: device,
          op: 'extract',
          payload: { schema: selectors, limit: body.limit },
          timeoutMs: 20_000,
        });

        // If extraction returned empty, retry with broader LLM context
        const resultObj = result as Record<string, unknown>;
        const resultData = resultObj?.result as Record<string, unknown> || resultObj || {};
        const allEmpty = Object.values(resultData).every(v => v === '' || (Array.isArray(v) && v.length === 0));

        if (allEmpty && Object.keys(selectors).length > 0) {
          // Fallback: use the content script's own NL extraction
          const fallbackResult = await extBridge.callDevice({
            deviceId: device,
            op: 'extract',
            payload: { query: body.query, limit: body.limit },
            timeoutMs: 20_000,
          });
          return { ok: true, result: fallbackResult, _strategy: 'semantic-fallback-nl' };
        }

        return { ok: true, result, _selectors: selectors, _strategy: 'semantic' };
      } catch (err) {
        return sendPingError(reply, err);
      }
    },
  );

  // ---- Level 10: Template Learning endpoints ----

  // POST /v1/dev/:device/extract/learn — learn template from current page
  app.post<{ Params: { device: string }; Body: { schema: Record<string, string> } }>(
    '/v1/dev/:device/extract/learn',
    async (request, reply) => {
      const { device } = request.params;
      const body = request.body as { schema?: Record<string, string> } | null;
      if (!body || !body.schema) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.extract.bad_request',
          message: 'Missing required field: schema',
          retryable: false,
        });
      }
      if (!extBridge.ownsDevice(device)) {
        return reply.status(404).send({
          errno: 'ENODEV',
          code: 'ping.gateway.device_not_found',
          message: `Device ${device} not found`,
          retryable: false,
        });
      }

      try {
        // First extract with the schema to get a successful result
        const extractResult = await extBridge.callDevice({
          deviceId: device,
          op: 'extract',
          payload: { schema: body.schema },
          timeoutMs: 20_000,
        });

        const template = await learnTemplate(
          extBridge,
          device,
          extractResult as Record<string, unknown>,
          body.schema,
        );

        return { ok: true, template };
      } catch (err) {
        return sendPingError(reply, err);
      }
    },
  );

  // GET /v1/templates — list all saved templates
  app.get('/v1/templates', async () => {
    const templates = listTemplates();
    return { ok: true, templates };
  });

  // GET /v1/templates/:domain — get template for a domain
  app.get<{ Params: { domain: string } }>('/v1/templates/:domain', async (request, reply) => {
    const template = loadTemplate(request.params.domain);
    if (!template) {
      return reply.status(404).send({
        errno: 'ENOENT',
        code: 'ping.template.not_found',
        message: `No template for domain: ${request.params.domain}`,
        retryable: false,
      });
    }
    return { ok: true, template };
  });

  // DELETE /v1/templates/:domain — delete template
  app.delete<{ Params: { domain: string } }>('/v1/templates/:domain', async (request, reply) => {
    const deleted = deleteTemplate(request.params.domain);
    if (!deleted) {
      return reply.status(404).send({
        errno: 'ENOENT',
        code: 'ping.template.not_found',
        message: `No template for domain: ${request.params.domain}`,
        retryable: false,
      });
    }
    return { ok: true, deleted: true };
  });

  // POST /v1/templates/import — import a template
  app.post<{ Body: unknown }>('/v1/templates/import', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || !(body as Record<string, unknown>).domain) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.template.bad_request',
        message: 'Missing required field: domain',
        retryable: false,
      });
    }
    try {
      importTemplate(body as any);
      return { ok: true, imported: true };
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  // GET /v1/templates/:domain/export — export template as JSON
  app.get<{ Params: { domain: string } }>('/v1/templates/:domain/export', async (request, reply) => {
    const template = exportTemplate(request.params.domain);
    if (!template) {
      return reply.status(404).send({
        errno: 'ENOENT',
        code: 'ping.template.not_found',
        message: `No template for domain: ${request.params.domain}`,
        retryable: false,
      });
    }
    return template;
  });

  // ---- Recording endpoints ----
  app.post<{ Body: { device: string } }>('/v1/record/start', async (request, reply) => {
    const body = request.body as { device?: string } | null;
    if (!body || !body.device) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.gateway.bad_request',
        message: 'Missing required field: device',
        retryable: false,
      });
    }
    if (!extBridge.ownsDevice(body.device)) {
      return reply.status(404).send({
        errno: 'ENODEV',
        code: 'ping.gateway.device_not_found',
        message: `Device ${body.device} not found`,
        retryable: false,
      });
    }
    try {
      const result = await extBridge.callDevice({
        deviceId: body.device,
        op: 'record_start',
        payload: {},
        timeoutMs: 5_000,
      });
      // Also start gateway-level recording for API-driven actions
      const deviceUrl = getDeviceUrlFromShares(extBridge, body.device) ?? '';
      gatewayRecordings.set(body.device, {
        startedAt: Date.now(),
        url: deviceUrl,
        actions: [],
      });
      return { ok: true, result };
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  app.post<{ Body: { device: string } }>('/v1/record/stop', async (request, reply) => {
    const body = request.body as { device?: string } | null;
    if (!body || !body.device) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.gateway.bad_request',
        message: 'Missing required field: device',
        retryable: false,
      });
    }
    if (!extBridge.ownsDevice(body.device)) {
      return reply.status(404).send({
        errno: 'ENODEV',
        code: 'ping.gateway.device_not_found',
        message: `Device ${body.device} not found`,
        retryable: false,
      });
    }
    try {
      const result = await extBridge.callDevice({
        deviceId: body.device,
        op: 'record_stop',
        payload: {},
        timeoutMs: 5_000,
      });
      // Gateway recording stays in map until export — stop is just a marker
      return { ok: true, result };
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  app.post<{ Body: { device: string; name?: string } }>('/v1/record/export', async (request, reply) => {
    const body = request.body as { device?: string; name?: string } | null;
    if (!body || !body.device) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.gateway.bad_request',
        message: 'Missing required field: device',
        retryable: false,
      });
    }
    if (!extBridge.ownsDevice(body.device)) {
      return reply.status(404).send({
        errno: 'ENODEV',
        code: 'ping.gateway.device_not_found',
        message: `Device ${body.device} not found`,
        retryable: false,
      });
    }
    try {
      const extResult = await extBridge.callDevice({
        deviceId: body.device,
        op: 'record_export',
        payload: { name: body.name || 'recording' },
        timeoutMs: 5_000,
      });

      // Merge gateway-captured API actions into the export
      const gwRec = gatewayRecordings.get(body.device);
      const extExport = extResult as Record<string, unknown> ?? {};
      const extSteps = (extExport.steps ?? extExport.actions ?? []) as RecordedAction[];
      const gwActions = gwRec?.actions ?? [];

      // Combine: extension browser events + gateway API actions, sorted by timestamp
      const allActions = [...extSteps, ...gwActions].sort((a, b) => a.timestamp - b.timestamp);

      const recordingName = body.name || 'recording';
      const recordingId = `${recordingName}-${Date.now()}`;
      const exportedRecording: Recording = {
        id: recordingId,
        startedAt: gwRec?.startedAt ?? Date.now(),
        endedAt: Date.now(),
        url: gwRec?.url ?? (extExport.url as string) ?? '',
        actions: allActions,
      };

      // Clean up gateway recording state
      gatewayRecordings.delete(body.device);

      const exportResult = {
        ...extExport,
        ...exportedRecording,
        actionCount: allActions.length,
        gatewayActions: gwActions.length,
        browserActions: extSteps.length,
      };

      const response: Record<string, unknown> = {
        ok: true,
        result: exportResult,
      };

      // Bug #2: Warn when no actions were captured
      if (allActions.length === 0) {
        response.warning = 'No actions captured during recording. API-driven actions (navigate, extract, etc.) are captured automatically. For browser interactions, perform them directly in Chrome while recording is active.';
      }

      // Bug #3: Auto-save export so GET /v1/recordings and replay by ID can find it.
      savedRecordings.set(recordingId, exportedRecording);

      return response;
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  app.get<{ Querystring: { device?: string } }>('/v1/record/status', async (request, reply) => {
    const device = (request.query as { device?: string })?.device;
    if (!device) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.gateway.bad_request',
        message: 'Missing required query param: device',
        retryable: false,
      });
    }
    if (!extBridge.ownsDevice(device)) {
      return reply.status(404).send({
        errno: 'ENODEV',
        code: 'ping.gateway.device_not_found',
        message: `Device ${device} not found`,
        retryable: false,
      });
    }
    try {
      const result = await extBridge.callDevice({
        deviceId: device,
        op: 'record_status',
        payload: {},
        timeoutMs: 5_000,
      });
      return { ok: true, result };
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  // ---------------------------------------------------------------------------
  // Record → Replay → PingApp Generator
  // ---------------------------------------------------------------------------

  const replayEngine = new ReplayEngine(extBridge);
  const pingAppGenerator = new PingAppGenerator();
  const savedRecordings = new Map<string, Recording>();

  // ---------------------------------------------------------------------------
  // Gateway-level recording: captures API-driven actions (navigate, extract, etc.)
  // The extension recorder only captures user browser events. This fills the gap.
  // ---------------------------------------------------------------------------
  interface GatewayRecording {
    startedAt: number;
    url: string;
    actions: RecordedAction[];
  }
  const gatewayRecordings = new Map<string, GatewayRecording>();

  function logRecordedAction(deviceId: string, op: string, payload: unknown, result: unknown, durationMs: number): void {
    const rec = gatewayRecordings.get(deviceId);
    if (!rec) return;
    // Don't record internal recording ops
    if (op.startsWith('record_')) return;
    const payloadObj = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined;
    const action: RecordedAction = {
      type: op,
      timestamp: Date.now(),
      selector: payloadObj?.selector as string | undefined,
      value: payloadObj?.to as string ?? payloadObj?.text as string ?? payloadObj?.query as string ?? payloadObj?.url as string ?? undefined,
    };
    // Attach input/output as extra fields on the action for rich export
    (action as any).input = payload ?? {};
    (action as any).output = result ?? {};
    (action as any).durationMs = durationMs;
    rec.actions.push(action);
  }

  // POST /v1/record/replay — alias for /v1/recordings/replay (short-form)
  app.post<{ Body: { device: string; recording?: Recording; recordingId?: string; speed?: number; timeout?: number } }>(
    '/v1/record/replay',
    async (request, reply) => {
      const body = request.body as {
        device?: string;
        recording?: Recording;
        recordingId?: string;
        speed?: number;
        timeout?: number;
      } | null;

      if (!body || !body.device) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.recordings.bad_request',
          message: 'Missing required field: device',
          retryable: false,
        });
      }

      // Support inline recording, saved recording ID, or export result object
      let recording = body.recording;
      if (!recording && body.recordingId) {
        recording = savedRecordings.get(body.recordingId);
        if (!recording) {
          return reply.status(404).send({
            errno: 'ENOENT',
            code: 'ping.recordings.not_found',
            message: `Recording "${body.recordingId}" not found. Use GET /v1/recordings to list available recordings.`,
            retryable: false,
          });
        }
      }
      // Handle export result object: if recording has no .actions but has .result.actions
      if (recording && !(recording as Recording).actions && (recording as any).result?.actions) {
        recording = { ...(recording as any).result, id: (recording as any).result?.id ?? 'inline' } as Recording;
      }
      if (!recording || !(recording as Recording).actions) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.recordings.bad_request',
          message: 'Missing recording or recordingId. Provide either { recording: { actions: [...] } } or { recordingId: "..." }',
          retryable: false,
        });
      }

      if (!extBridge.ownsDevice(body.device)) {
        return reply.status(404).send({
          errno: 'ENODEV',
          code: 'ping.gateway.device_not_found',
          message: `Device ${body.device} not found`,
          retryable: false,
        });
      }

      try {
        const result = await replayEngine.replay(body.device, recording, {
          speed: body.speed,
          timeout: body.timeout,
        });
        return { ok: true, result };
      } catch (err) {
        return sendPingError(reply, err);
      }
    },
  );

  // POST /v1/recordings/replay — replay a recording on a device
  app.post<{ Body: { device: string; recording?: Recording; recordingId?: string; speed?: number; timeout?: number } }>(
    '/v1/recordings/replay',
    async (request, reply) => {
      const body = request.body as {
        device?: string;
        recording?: Recording;
        recordingId?: string;
        speed?: number;
        timeout?: number;
      } | null;

      if (!body || !body.device) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.recordings.bad_request',
          message: 'Missing required field: device',
          retryable: false,
        });
      }

      // Support inline recording, saved recording ID, or export result object
      let recording = body.recording;
      if (!recording && body.recordingId) {
        recording = savedRecordings.get(body.recordingId);
        if (!recording) {
          return reply.status(404).send({
            errno: 'ENOENT',
            code: 'ping.recordings.not_found',
            message: `Recording "${body.recordingId}" not found. Use GET /v1/recordings to list available recordings.`,
            retryable: false,
          });
        }
      }
      // Handle export result object: if recording has no .actions but has .result.actions
      if (recording && !(recording as Recording).actions && (recording as any).result?.actions) {
        recording = { ...(recording as any).result, id: (recording as any).result?.id ?? 'inline' } as Recording;
      }
      if (!recording || !recording.actions) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.recordings.bad_request',
          message: 'Missing recording or recordingId. Provide either { recording: { actions: [...] } } or { recordingId: "..." }',
          retryable: false,
        });
      }

      if (!extBridge.ownsDevice(body.device)) {
        return reply.status(404).send({
          errno: 'ENODEV',
          code: 'ping.gateway.device_not_found',
          message: `Device ${body.device} not found`,
          retryable: false,
        });
      }

      try {
        const result = await replayEngine.replay(body.device, recording, {
          speed: body.speed,
          timeout: body.timeout,
        });
        return { ok: true, result };
      } catch (err) {
        return sendPingError(reply, err);
      }
    },
  );

  // POST /v1/recordings/generate — generate PingApp from recording
  app.post<{ Body: { recording: Recording; name?: string } }>(
    '/v1/recordings/generate',
    async (request, reply) => {
      const body = request.body as {
        recording?: Recording;
        recordingId?: string;
        name?: string;
      } | null;

      if (!body) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.recordings.bad_request',
          message: 'Missing request body',
          retryable: false,
        });
      }

      let recording = body.recording;
      if (!recording && body.recordingId) {
        recording = savedRecordings.get(body.recordingId);
      }
      if (!recording || !recording.actions) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.recordings.bad_request',
          message: 'Missing recording or recordingId',
          retryable: false,
        });
      }

      try {
        const app = pingAppGenerator.generate(recording, body.name);
        const files = pingAppGenerator.serialize(app);
        return { ok: true, app, files };
      } catch (err) {
        return sendPingError(reply, err);
      }
    },
  );

  // POST /v1/recordings/save — save a recording
  app.post<{ Body: Recording }>(
    '/v1/recordings/save',
    async (request, reply) => {
      const body = request.body as Recording | null;
      if (!body || !body.id || !body.actions) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.recordings.bad_request',
          message: 'Missing recording id or actions',
          retryable: false,
        });
      }
      savedRecordings.set(body.id, body);
      return { ok: true, id: body.id };
    },
  );

  // GET /v1/recordings — list saved recordings
  app.get('/v1/recordings', async () => {
    const list = Array.from(savedRecordings.entries()).map(([id, rec]) => ({
      id,
      url: rec.url,
      actionCount: rec.actions.length,
      startedAt: rec.startedAt,
    }));
    return { ok: true, recordings: list };
  });

  // DELETE /v1/recordings/:id — delete a recording
  app.delete<{ Params: { id: string } }>(
    '/v1/recordings/:id',
    async (request, reply) => {
      const { id } = request.params;
      const deleted = savedRecordings.delete(id);
      if (!deleted) {
        return reply.status(404).send({
          errno: 'ENOENT',
          code: 'ping.recordings.not_found',
          message: `Recording "${id}" not found`,
          retryable: false,
        });
      }
      return { ok: true, id };
    },
  );

  // ---- WebSocket upgrade handler ----
  logGateway('[gw] starting ExtensionBridge');
  extBridge.start();

  // IMPORTANT: unhandled 'error' events can crash Node.
  app.server.on('error', (err) => {
    logGateway('[http] server error', serializeError(err));
  });

  app.server.on('upgrade', (req, socket, head) => {
    try {
      const handled = extBridge.handleUpgrade(req, socket, head);
      if (!handled) {
        logGateway('[ext] upgrade not handled', { url: req.url });
        socket.destroy();
      }
    } catch (err) {
      logGateway('[ext] upgrade handler threw', serializeError(err));
      try {
        socket.destroy();
      } catch {
        // ignore
      }
    }
  });

  // Register PingApp routes
  const gatewayUrl = `http://localhost:${port}`;
  registerAppRoutes(app, gatewayUrl);
  logGateway('[gw] app routes registered', { apps: ['aliexpress'] });

  logGateway('[gw] listening', { host, port });
  await app.listen({ port, host });
  return app;
}

// ---------------------------------------------------------------------------
// Standalone startup (optional)
// ---------------------------------------------------------------------------

// If this file is executed directly (node gateway.js), start a minimal gateway.
// NOTE: packages/std/src/main.ts remains the preferred entrypoint.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number.parseInt(process.env.PING_GATEWAY_PORT ?? process.env.PORT ?? '3500', 10);
  const host = process.env.PING_GATEWAY_HOST ?? '::';
  const registry = new ModelRegistry();
  const extBridge = new ExtensionBridge();

  // eslint-disable-next-line no-console
  console.log(`[PingOS] Starting gateway (standalone) on ${host}:${port}`);
  const app = await createGateway({ registry, port, host, extBridge });

  async function shutdown(signal: string) {
    try {
      // eslint-disable-next-line no-console
      console.log(`Received ${signal}. Shutting down...`);
      extBridge.stop();
      await app.close();
    } catch {
      // ignore
    } finally {
      process.exit(0);
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function isPingError(err: unknown): err is PingError {
  return (
    err !== null &&
    typeof err === 'object' &&
    'errno' in err &&
    'code' in err &&
    'retryable' in err
  );
}

function isElementNotFoundError(err: unknown): boolean {
  if (!isPingError(err)) return false;
  if (err.errno !== 'EIO') return false;
  const msg = (err.message ?? '').toLowerCase();
  const details = (typeof (err as any).details === 'string' ? (err as any).details : '').toLowerCase();
  const text = msg + ' ' + details;
  return (
    text.includes('element not found:') ||
    text.includes('element not found') ||
    text.includes('timeout waiting for selector:') ||
    text.includes('no node found for selector')
  );
}

function getDeviceUrlFromShares(extBridge: ExtensionBridge, deviceId: string): string | undefined {
  try {
    for (const { tabs } of extBridge.listSharedTabs()) {
      for (const t of tabs ?? []) {
        if (t.deviceId === deviceId) return t.url;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

function isTimeoutLikeMessage(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('timeout')
    || t.includes('timed out')
    || t.includes('deadline exceeded')
    || t.includes('abort');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sendPingError(reply: any, err: unknown) {
  if (isPingError(err)) {
    if (err.errno === 'EIO') {
      const details = typeof (err as any).details === 'string' ? (err as any).details : JSON.stringify((err as any).details ?? '');
      const timeoutLike = isTimeoutLikeMessage(err.message ?? '') || isTimeoutLikeMessage(details);
      if (timeoutLike) {
        return reply.status(504).send({
          ...err,
          code: 'ping.gateway.upstream_timeout',
          message: err.message || 'Upstream request timed out',
          retryable: true,
        });
      }
    }
    const httpStatus = mapErrnoToHttp(err.errno);
    return reply.status(httpStatus).send(err);
  }
  if (err instanceof Error && isTimeoutLikeMessage(err.message || '')) {
    return reply.status(504).send({
      errno: 'ETIMEDOUT',
      code: 'ping.gateway.timeout',
      message: err.message || 'Request timed out',
      retryable: true,
    });
  }
  return reply.status(500).send({
    errno: 'EIO',
    code: 'ping.gateway.internal',
    message: err instanceof Error ? err.message : 'Internal server error',
    retryable: false,
  });
}
