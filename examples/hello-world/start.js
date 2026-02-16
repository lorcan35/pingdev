#!/usr/bin/env npx tsx
"use strict";
// PingOS Hello World — Zero external dependencies required
// Run:  npx tsx examples/hello-world/start.ts
// Test: curl http://localhost:3500/v1/dev/llm/prompt -H "Content-Type: application/json" -d '{"prompt":"Hello"}'
Object.defineProperty(exports, "__esModule", { value: true });
const gateway_js_1 = require("../../packages/std/src/gateway.js");
const registry_js_1 = require("../../packages/std/src/registry.js");
// ---------------------------------------------------------------------------
// 1. Create a mock driver (no Chrome, no Redis, no API keys)
// ---------------------------------------------------------------------------
const echoDriver = {
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
    async health() {
        return { status: 'online', lastCheck: Date.now(), latencyMs: 1 };
    },
    async execute(request) {
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
const registry = new registry_js_1.ModelRegistry('best');
registry.register(echoDriver);
const app = await (0, gateway_js_1.createGateway)({ port: 3500, registry });
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
//# sourceMappingURL=start.js.map