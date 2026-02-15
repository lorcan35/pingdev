// @pingdev/std — Configuration types and loader
// Config location: ~/.pingos/config.json

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { DriverCapabilities, RoutingStrategy } from './types.js';

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

export interface PingOSConfig {
  gatewayPort: number;
  drivers: DriverConfig[];
  defaultStrategy: RoutingStrategy;
  healthIntervalMs: number;
}

// ---------------------------------------------------------------------------
// Default Config — 3 PingApps pre-registered
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: PingOSConfig = {
  gatewayPort: 3500,
  defaultStrategy: 'best',
  healthIntervalMs: 30_000,
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
    return {
      gatewayPort: parsed.gatewayPort ?? DEFAULT_CONFIG.gatewayPort,
      defaultStrategy: parsed.defaultStrategy ?? DEFAULT_CONFIG.defaultStrategy,
      healthIntervalMs: parsed.healthIntervalMs ?? DEFAULT_CONFIG.healthIntervalMs,
      drivers: parsed.drivers ?? DEFAULT_CONFIG.drivers,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
