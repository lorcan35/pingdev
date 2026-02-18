// @pingdev/std — Gateway entrypoint
// Starts the HTTP + WebSocket gateway on port 3500 (defaults to dual-stack host ::).

import { createGateway } from './gateway.js';
import { ModelRegistry } from './registry.js';
import { ExtensionBridge } from './ext-bridge.js';
import { logCrash, logGateway, serializeError } from './gw-log.js';
import { loadConfig } from './config.js';
import { OpenRouterAdapter } from './drivers/openrouter.js';
import { OpenAICompatAdapter } from './drivers/openai-compat.js';

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

// OpenRouter — from config or OPENROUTER_API_KEY env
const orApiKey = config.llm?.openrouter?.apiKey ?? process.env.OPENROUTER_API_KEY;
if (orApiKey) {
  const orCfg = config.llm?.openrouter;
  registry.register(
    new OpenRouterAdapter({
      apiKey: orApiKey,
      defaultModel: orCfg?.defaultModel,
      fallbackModel: orCfg?.fallbackModel,
      siteUrl: orCfg?.siteUrl,
      siteName: orCfg?.siteName,
    }),
  );
  logGateway('[main] registered openrouter driver');
}

// Ollama — from config
if (config.llm?.ollama) {
  const oll = config.llm.ollama;
  registry.register(
    new OpenAICompatAdapter({
      id: 'ollama',
      name: 'Ollama',
      endpoint: oll.baseUrl.replace(/\/$/, ''),
      model: oll.model,
      capabilities: {
        llm: true, streaming: true, vision: false, toolCalling: false,
        imageGen: false, search: false, deepResearch: false, thinking: false,
      },
      priority: 10,
    }),
  );
  logGateway('[main] registered ollama driver');
}

// LM Studio — from config
if (config.llm?.lmstudio) {
  const lms = config.llm.lmstudio;
  registry.register(
    new OpenAICompatAdapter({
      id: 'lmstudio',
      name: 'LM Studio',
      endpoint: lms.baseUrl.replace(/\/$/, ''),
      model: lms.model,
      capabilities: {
        llm: true, streaming: true, vision: false, toolCalling: false,
        imageGen: false, search: false, deepResearch: false, thinking: false,
      },
      priority: 10,
    }),
  );
  logGateway('[main] registered lmstudio driver');
}

// Generic OpenAI-compat fallback — from PINGOS_LLM_BASE_URL env
if (process.env.PINGOS_LLM_BASE_URL && process.env.PINGOS_LLM_API_KEY) {
  registry.register(
    new OpenAICompatAdapter({
      id: 'openai-compat-env',
      name: 'OpenAI-Compat (env)',
      endpoint: process.env.PINGOS_LLM_BASE_URL.replace(/\/$/, ''),
      apiKey: process.env.PINGOS_LLM_API_KEY,
      model: process.env.PINGOS_LLM_MODEL ?? 'gpt-4',
      capabilities: {
        llm: true, streaming: true, vision: false, toolCalling: true,
        imageGen: false, search: false, deepResearch: false, thinking: false,
      },
      priority: 15,
    }),
  );
  logGateway('[main] registered openai-compat-env driver');
}

const app = await createGateway({ registry, port, host, extBridge });

const displayHost = host.includes(':') ? `[${host}]` : host;
console.log(`PingOS Gateway running on http://${displayHost}:${port}`);
logGateway('[main] started', { host, port });

async function shutdown(signal: string) {
  try {
    console.log(`Received ${signal}. Shutting down...`);
    logGateway('[main] shutdown', { signal });
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
