// @pingdev/std — Configuration types and loader
// Config location: ~/.pingos/config.json

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { DriverCapabilities, RoutingStrategy } from './types.js';
import {
  DEFAULT_SELF_HEAL_CONFIG,
  type SelfHealConfig,
} from './self-heal.js';

// ---------------------------------------------------------------------------
// Config Interfaces
// ---------------------------------------------------------------------------

export interface DriverConfig {
  id: string;
  type: 'pingapp' | 'ollama' | 'openai' | 'anthropic' | 'openrouter' | 'lmstudio' | 'openai_compat';
  endpoint: string;
  model?: string;
  apiKeyEnv?: string;
  priority?: number;
  capabilities?: Partial<DriverCapabilities>;
  enabled?: boolean;
}

export interface LLMProviderConfig {
  openrouter?: {
    apiKey: string;
    defaultModel?: string;
    fallbackModel?: string;
    siteUrl?: string;
    siteName?: string;
  };
  anthropic?: {
    apiKey?: string;
    model?: string;
  };
  openai?: {
    apiKey?: string;
    model?: string;
  };
  ollama?: {
    baseUrl: string;
    model: string;
  };
  lmstudio?: {
    baseUrl: string;
    model: string;
  };
}

export interface PingOSConfig {
  gatewayPort: number;
  drivers: DriverConfig[];
  defaultStrategy: RoutingStrategy;
  healthIntervalMs: number;
  selfHeal: SelfHealConfig;
  llm?: LLMProviderConfig;
}

// ---------------------------------------------------------------------------
// Default Config — 3 PingApps pre-registered
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: PingOSConfig = {
  gatewayPort: 3500,
  defaultStrategy: 'best',
  healthIntervalMs: 30_000,
  selfHeal: DEFAULT_SELF_HEAL_CONFIG,
  drivers: [
    {
      id: 'gemini',
      type: 'pingapp',
      endpoint: 'http://localhost:3456',
      priority: 1,
      capabilities: {
        llm: true,
        streaming: true,
        vision: true,
        toolCalling: true,
        imageGen: true,
        search: true,
        deepResearch: true,
        thinking: true,
      },
    },
    {
      id: 'ai-studio',
      type: 'pingapp',
      endpoint: 'http://localhost:3457',
      priority: 2,
      capabilities: {
        llm: true,
        streaming: true,
        vision: true,
        toolCalling: true,
        imageGen: false,
        search: false,
        deepResearch: false,
        thinking: true,
      },
    },
    {
      id: 'chatgpt',
      type: 'pingapp',
      endpoint: 'http://localhost:3458',
      priority: 3,
      capabilities: {
        llm: true,
        streaming: true,
        vision: true,
        toolCalling: true,
        imageGen: true,
        search: true,
        deepResearch: true,
        thinking: true,
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Config Loader
// ---------------------------------------------------------------------------

const CONFIG_PATH = join(homedir(), '.pingos', 'config.json');

/**
 * Load PingOS config from ~/.pingos/config.json.
 * Falls back to DEFAULT_CONFIG if the file does not exist.
 */
export async function loadConfig(path?: string): Promise<PingOSConfig> {
  const configPath = path ?? CONFIG_PATH;
  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PingOSConfig>;

    // Self-heal is optional in config.json; merge with defaults.
    // Backwards-compat: older configs may specify `llmModel` at top-level.
    const selfHealParsed = (parsed as { selfHeal?: Partial<SelfHealConfig> & { llmModel?: string } }).selfHeal;
    const llmModelCompat = selfHealParsed && 'llmModel' in selfHealParsed ? (selfHealParsed as any).llmModel : undefined;

    const selfHeal: SelfHealConfig = {
      ...DEFAULT_SELF_HEAL_CONFIG,
      ...(selfHealParsed ?? {}),
      llm: {
        ...DEFAULT_SELF_HEAL_CONFIG.llm,
        ...((selfHealParsed as any)?.llm ?? {}),
        model: (llmModelCompat ?? (selfHealParsed as any)?.llm?.model ?? DEFAULT_SELF_HEAL_CONFIG.llm.model) as string,
      },
    };

    return {
      gatewayPort: parsed.gatewayPort ?? DEFAULT_CONFIG.gatewayPort,
      defaultStrategy: parsed.defaultStrategy ?? DEFAULT_CONFIG.defaultStrategy,
      healthIntervalMs: parsed.healthIntervalMs ?? DEFAULT_CONFIG.healthIntervalMs,
      selfHeal,
      drivers: parsed.drivers ?? DEFAULT_CONFIG.drivers,
      llm: (parsed as any).llm as LLMProviderConfig | undefined,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
