#!/usr/bin/env npx tsx
// PingOS Hello World — Zero external dependencies required
// Run:  npx tsx examples/hello-world/start.ts
// Test: curl http://localhost:3500/v1/dev/llm/prompt -H "Content-Type: application/json" -d '{"prompt":"Hello"}'

import { createGateway } from '../../packages/std/src/gateway.js';
import { ModelRegistry } from '../../packages/std/src/registry.js';
import type {
  Driver,
  DriverHealth,
  DeviceRequest,
  DeviceResponse,
} from '../../packages/std/src/types.js';

// ---------------------------------------------------------------------------
// 1. Create a mock driver (no Chrome, no Redis, no API keys)
// ---------------------------------------------------------------------------

const echoDriver: Driver = {
  registration: {
    id: 'echo',
    name: 'Echo Driver',
    type: 'local',
    capabilities: {
      llm: true,
      streaming: false,
      vision: false,
      toolCalling: false,
      imageGen: false,
      search: false,
      deepResearch: false,
      thinking: false,
    },
    endpoint: 'local://echo',
    priority: 1,
  },

  async health(): Promise<DriverHealth> {
    return { status: 'online', lastCheck: Date.now(), latencyMs: 1 };
  },

  async execute(request: DeviceRequest): Promise<DeviceResponse> {
    return {
      text: `Hello from PingOS! You said: "${request.prompt}"`,
      driver: 'echo',
      model: 'echo-v1',
      durationMs: 1,
    };
  },
};

// ---------------------------------------------------------------------------
// 2. Register the driver and start the gateway
// ---------------------------------------------------------------------------

const registry = new ModelRegistry('best');
registry.register(echoDriver);

const app = await createGateway({ port: 3500, registry });

console.log(`
╔═══════════════════════════════════════════════════════════╗
║  PingOS Gateway running on http://localhost:3500          ║
║                                                           ║
║  Try these commands:                                      ║
║                                                           ║
║  curl -s http://localhost:3500/v1/health | jq .           ║
║                                                           ║
║  curl -s http://localhost:3500/v1/registry | jq .         ║
║                                                           ║
║  curl -s http://localhost:3500/v1/dev/llm/prompt \\        ║
║    -H "Content-Type: application/json" \\                  ║
║    -d '{"prompt":"Hello world"}' | jq .                   ║
║                                                           ║
║  Press Ctrl+C to stop.                                    ║
╚═══════════════════════════════════════════════════════════╝
`);
