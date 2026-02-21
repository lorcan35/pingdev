// @pingdev/std — Gateway entrypoint
// Starts the HTTP + WebSocket gateway on port 3500 (defaults to dual-stack host ::).
import { createGateway } from './gateway.js';
import { ModelRegistry } from './registry.js';
import { ExtensionBridge } from './ext-bridge.js';
import { logCrash, logGateway, serializeError } from './gw-log.js';
import { loadConfig } from './config.js';
import { OpenRouterAdapter } from './drivers/openrouter.js';
import { OpenAICompatAdapter } from './drivers/openai-compat.js';
import { AnthropicAdapter } from './drivers/anthropic.js';
import { OpenAIAdapter } from './drivers/openai.js';
import { LMStudioAdapter } from './drivers/lmstudio.js';
import { getLocalConfig, isLocalMode } from './local-mode.js';
// ---------------------------------------------------------------------------
// Crash / rejection logging
// ---------------------------------------------------------------------------
// IMPORTANT: Node 24 can terminate on unhandled promise rejections.
// Install global handlers early to capture details.
process.on('uncaughtException', (err) => {
    logCrash('uncaughtException', serializeError(err));
    // Also surface in stdout/stderr when running in foreground.
    // eslint-disable-next-line no-console
    console.error('[PingOS] uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
    logCrash('unhandledRejection', serializeError(reason));
    // eslint-disable-next-line no-console
    console.error('[PingOS] unhandledRejection', reason);
});
const port = Number.parseInt(process.env.PING_GATEWAY_PORT ?? process.env.PORT ?? '3500', 10);
const host = process.env.PING_GATEWAY_HOST ?? '::';
const registry = new ModelRegistry();
const extBridge = new ExtensionBridge();
logGateway('[main] starting', { host, port, pid: process.pid });
// ---------------------------------------------------------------------------
// Auto-register LLM drivers from config + env vars
// ---------------------------------------------------------------------------
const config = await loadConfig();
const localMode = isLocalMode();
const localCfg = getLocalConfig();
async function detectModelFromEndpoint(baseUrl, apiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        const headers = {};
        if (apiKey)
            headers.Authorization = `Bearer ${apiKey}`;
        const res = await fetch(`${baseUrl}/models`, { headers, signal: controller.signal });
        if (!res.ok)
            return undefined;
        const body = await res.json();
        const first = body.data?.find((m) => typeof m.id === 'string' && m.id.trim().length > 0);
        return first?.id;
    }
    catch {
        return undefined;
    }
    finally {
        clearTimeout(timeout);
    }
}
// OpenRouter — from config or OPENROUTER_API_KEY env
const orApiKey = config.llm?.openrouter?.apiKey ?? process.env.OPENROUTER_API_KEY;
if (orApiKey) {
    const orCfg = config.llm?.openrouter;
    registry.register(new OpenRouterAdapter({
        apiKey: orApiKey,
        defaultModel: orCfg?.defaultModel,
        fallbackModel: orCfg?.fallbackModel,
        siteUrl: orCfg?.siteUrl,
        siteName: orCfg?.siteName,
    }));
    logGateway('[main] registered openrouter driver');
}
// Ollama — from config
if (config.llm?.ollama) {
    const oll = config.llm.ollama;
    registry.register(new OpenAICompatAdapter({
        id: 'ollama',
        name: 'Ollama',
        endpoint: oll.baseUrl.replace(/\/$/, ''),
        model: oll.model,
        capabilities: {
            llm: true, streaming: true, vision: false, toolCalling: false,
            imageGen: false, search: false, deepResearch: false, thinking: false,
        },
        priority: 10,
    }));
    logGateway('[main] registered ollama driver');
}
// Anthropic — from config or ANTHROPIC_API_KEY env
const anthropicApiKey = config.llm?.anthropic?.apiKey ?? process.env.ANTHROPIC_API_KEY;
if (anthropicApiKey) {
    registry.register(new AnthropicAdapter({
        id: 'anthropic',
        name: 'Anthropic',
        endpoint: 'https://api.anthropic.com',
        apiKey: anthropicApiKey,
        model: config.llm?.anthropic?.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
        capabilities: {
            llm: true, streaming: true, vision: true, toolCalling: true,
            imageGen: false, search: false, deepResearch: false, thinking: true,
        },
        priority: 5,
    }));
    logGateway('[main] registered anthropic driver');
}
// OpenAI — from config or OPENAI_API_KEY env
const openaiApiKey = config.llm?.openai?.apiKey ?? process.env.OPENAI_API_KEY;
if (openaiApiKey) {
    registry.register(new OpenAIAdapter({
        apiKey: openaiApiKey,
        model: config.llm?.openai?.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
        priority: 5,
    }));
    logGateway('[main] registered openai driver');
}
// LM Studio — from config or always try (local, no auth)
{
    const lmsCfg = config.llm?.lmstudio;
    registry.register(new LMStudioAdapter({
        endpoint: lmsCfg?.baseUrl,
        model: lmsCfg?.model,
    }));
    logGateway('[main] registered lmstudio driver');
}
// Dedicated local-mode OpenAI-compatible route (highest priority, local only)
if (localMode) {
    const detectedModel = localCfg.llmModel || await detectModelFromEndpoint(localCfg.llmBaseUrl, localCfg.llmApiKey);
    if (!process.env.PINGOS_LLM_MODEL && detectedModel) {
        process.env.PINGOS_LLM_MODEL = detectedModel;
    }
    registry.register(new OpenAICompatAdapter({
        id: 'openai-compat-local',
        name: 'OpenAI-Compat (local mode)',
        endpoint: localCfg.llmBaseUrl.replace(/\/v1$/, ''),
        apiKey: localCfg.llmApiKey,
        model: detectedModel ?? 'default',
        capabilities: {
            llm: true, streaming: true, vision: true, toolCalling: true,
            imageGen: false, search: false, deepResearch: false, thinking: false,
        },
        priority: -100,
    }));
    logGateway('[main] local mode enabled', {
        localMode: true,
        llmBaseUrl: localCfg.llmBaseUrl,
        llmModel: detectedModel ?? localCfg.llmModel ?? 'default',
        visionBaseUrl: localCfg.visionBaseUrl,
        visionModel: localCfg.visionModel || localCfg.models.vision || detectedModel || 'default',
        domLimit: localCfg.domLimit,
        jsonMode: localCfg.responseFormat,
        timeouts: localCfg.timeouts,
    });
}
// Generic OpenAI-compat fallback — from PINGOS_LLM_BASE_URL env
if (process.env.PINGOS_LLM_BASE_URL) {
    const envPriority = process.env.PINGOS_LLM_PRIORITY
        ? Number.parseInt(process.env.PINGOS_LLM_PRIORITY, 10)
        : NaN;
    registry.register(new OpenAICompatAdapter({
        id: 'openai-compat-env',
        name: 'OpenAI-Compat (env)',
        endpoint: process.env.PINGOS_LLM_BASE_URL.replace(/\/$/, ''),
        apiKey: process.env.PINGOS_LLM_API_KEY,
        model: process.env.PINGOS_LLM_MODEL ?? 'gpt-4',
        capabilities: {
            llm: true, streaming: true, vision: false, toolCalling: true,
            imageGen: false, search: false, deepResearch: false, thinking: false,
        },
        priority: Number.isFinite(envPriority) ? envPriority : 1,
    }));
    logGateway('[main] registered openai-compat-env driver');
}
const app = await createGateway({ registry, port, host, extBridge });
const displayHost = host.includes(':') ? `[${host}]` : host;
console.log(`PingOS Gateway running on http://${displayHost}:${port}`);
logGateway('[main] started', { host, port });
async function shutdown(signal) {
    try {
        console.log(`Received ${signal}. Shutting down...`);
        logGateway('[main] shutdown', { signal });
        extBridge.stop();
        await app.close();
    }
    catch {
        // ignore
    }
    finally {
        process.exit(0);
    }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
//# sourceMappingURL=main.js.map