# Contributing to PingOS

This guide covers how to add new drivers and PingApps, the coding standards we follow, testing requirements, and the PR process.

---

## Table of Contents

- [Adding a New API Backend (Step by Step)](#adding-a-new-api-backend-step-by-step)
- [Adding a New PingApp (Step by Step)](#adding-a-new-pingapp-step-by-step)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Commit Conventions](#commit-conventions)
- [PR Process](#pr-process)
- [Project Structure](#project-structure)

---

## Adding a New API Backend (Step by Step)

This tutorial walks through adding a new API backend driver. We'll use a hypothetical "Mistral" API as the example.

### 1. Determine the adapter type

Most API providers speak one of two protocols:

| Protocol | Use adapter | Providers |
|----------|-------------|-----------|
| OpenAI-compatible (`/v1/chat/completions`) | `OpenAICompatAdapter` | Ollama, LM Studio, OpenRouter, Together, Groq, Mistral, vLLM |
| Anthropic (`/v1/messages`) | `AnthropicAdapter` | Anthropic |

If the provider uses the OpenAI chat completions format, you don't need to write any code — just register an `OpenAICompatAdapter` instance. If it has a unique API format, create a new adapter class.

### 2a. OpenAI-compatible provider (no new code needed)

Just register it in your gateway startup:

```typescript
import { OpenAICompatAdapter } from '@pingdev/std';

registry.register(new OpenAICompatAdapter({
  id: 'mistral-large',
  name: 'Mistral Large',
  endpoint: 'https://api.mistral.ai',
  apiKey: process.env.MISTRAL_API_KEY!,
  model: 'mistral-large-latest',
  capabilities: {
    llm: true, streaming: true, vision: false, toolCalling: true,
    imageGen: false, search: false, deepResearch: false, thinking: false,
  },
  priority: 8,
}));
```

Then add the config entry in `~/.pingos/config.json`:

```json
{
  "id": "mistral-large",
  "type": "openai_compat",
  "endpoint": "https://api.mistral.ai",
  "apiKeyEnv": "MISTRAL_API_KEY",
  "model": "mistral-large-latest",
  "priority": 8
}
```

### 2b. Custom API format (new adapter needed)

If the API doesn't follow OpenAI's format, create a new adapter:

**Step 1: Create the adapter file**

```bash
touch packages/std/src/drivers/mistral.ts
```

```typescript
// packages/std/src/drivers/mistral.ts
import type {
  Driver, DriverRegistration, DriverHealth,
  DriverCapabilities, DeviceRequest, DeviceResponse,
} from '../types.js';
import { ETIMEDOUT, EIO, EACCES } from '../errors.js';

export interface MistralAdapterOptions {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  capabilities: DriverCapabilities;
  priority: number;
}

export class MistralAdapter implements Driver {
  readonly registration: DriverRegistration;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: MistralAdapterOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.registration = {
      id: options.id,
      name: options.name,
      type: 'api',
      capabilities: options.capabilities,
      endpoint: this.endpoint,
      priority: options.priority,
      model: { id: options.model, name: options.model, provider: 'mistral' },
    };
  }

  async health(): Promise<DriverHealth> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.endpoint}/v1/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return {
        status: res.ok ? 'online' : 'degraded',
        lastCheck: Date.now(),
        latencyMs: Date.now() - start,
      };
    } catch {
      return { status: 'offline', lastCheck: Date.now(), latencyMs: Date.now() - start };
    }
  }

  async execute(request: DeviceRequest): Promise<DeviceResponse> {
    const start = Date.now();
    // ... your API-specific implementation here
    // Convert DeviceRequest → API format, call the API, convert response → DeviceResponse
    // Throw PingError on failure (ETIMEDOUT, EIO, EACCES)
    return { text: '...', driver: this.registration.id, durationMs: Date.now() - start };
  }
}
```

**Step 2: Export from the drivers barrel**

Edit `packages/std/src/drivers/index.ts`:

```typescript
export { MistralAdapter } from './mistral.js';
export type { MistralAdapterOptions } from './mistral.js';
```

**Step 3: Export from the package barrel**

Edit `packages/std/src/index.ts`:

```typescript
export { MistralAdapter } from './drivers/index.js';
export type { MistralAdapterOptions } from './drivers/index.js';
```

**Step 4: Write tests** (see [Testing Requirements](#testing-requirements))

**Step 5: Submit a PR** (see [PR Process](#pr-process))

---

## Adding a New PingApp (Step by Step)

This tutorial walks through turning a website into a new PingApp.

### 1. Start Chrome with remote debugging

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/pingos-chrome &
```

Navigate to the target website in Chrome and log in if necessary.

### 2. Capture a snapshot

```bash
bin/pingdev-snapshot https://example-ai.com --output /tmp/example-snapshot.json
```

This runs the `SnapshotEngine` against the live page and captures:
- Interactive elements with CSS/ARIA/XPath selectors and confidence scores
- Dynamic areas (where content changes — response output, loading indicators)
- ARIA tree (accessibility structure)
- Regions (page layout — header, main, sidebar)
- Visible text (labels, buttons, state indicators)

### 3. Analyze the snapshot

Read the snapshot JSON and produce a `SiteDefinitionResult`. This is where you (or an LLM) identify:

- **Purpose**: What does this site do? (chat, search, code, image gen, etc.)
- **Actions**: What can a user do? Map each action to input selectors, submit triggers, output areas
- **Selectors**: Build tiered CSS selectors for every interactive element (most specific first)
- **States**: What observable UI states exist? (idle, loading, generating, done, error)
- **Completion signals**: How do you know a response is done? (`hash_stability` is preferred for streaming sites)

Write the definition JSON to a file:

```bash
# The definition format is documented in packages/recon/src/types.ts
# You can print the full schema with:
npx tsx packages/recon/src/types-export.ts
```

### 4. Generate the PingApp

```bash
npx tsx packages/recon/src/generate-cli.ts \
  --config /tmp/example-definition.json \
  --output ~/projects/example-shim
```

The generator creates a complete TypeScript project:

```
~/projects/example-shim/
├── src/
│   ├── actions/           # Generated action handlers (with TODO stubs)
│   │   └── sendMessage.ts
│   ├── definition.ts      # Compiled SiteDefinition
│   ├── index.ts           # Fastify server + BullMQ worker setup
│   └── state-machine.ts   # State transition logic
├── tests/
│   └── actions.test.ts    # Generated test stubs
├── package.json
├── tsconfig.json
└── README.md
```

### 5. Fill in TODO stubs

The generator creates handler stubs with TODO comments. You need to implement the actual browser automation logic for each action:

```typescript
// src/actions/sendMessage.ts — fill in the TODO
export async function sendMessage(ctx: ActionContext): Promise<ActionResult> {
  // TODO: Type prompt into input selector
  // TODO: Click submit trigger
  // TODO: Wait for completion signal
  // TODO: Extract response from output selector
}
```

### 6. Build and test

```bash
cd ~/projects/example-shim
npm install
npx tsc --noEmit    # Type check
npm test            # Run tests
npm start           # Start the PingApp server
```

### 7. Verify the PingApp

```bash
# Health check
curl -s http://localhost:3459/v1/health | jq .

# Send a test prompt
curl -s http://localhost:3459/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello"}' | jq .
```

### 8. Register with the gateway

Add the PingApp to your gateway configuration (either programmatically or via `~/.pingos/config.json`).

### Selector best practices

- **Tiered fallback**: Always provide 2-3 selectors per element, most specific first
- **Prefer**: `data-testid`, `aria-label`, unique IDs, semantic HTML attributes
- **Avoid**: Fragile class names (`.css-1a2b3c`), deep nesting (`div > div > div > span`), index-based selectors (`:nth-child(3)`)
- The runtime tries each tier in order and uses the first visible match

---

## Coding Standards

### TypeScript

- **Target**: ES2022
- **Module**: NodeNext (ESM with `.js` extensions in all relative imports)
- **Strict mode**: Enabled (`"strict": true`)
- Use explicit types for function signatures and public APIs
- Avoid `any` where possible; use `unknown` and narrow with type guards

### File naming

| Kind | Convention | Example |
|------|-----------|---------|
| Source files | `kebab-case.ts` | `pingapp-adapter.ts` |
| Test files | `__tests__/module-name.test.ts` | `__tests__/gateway.test.ts` |
| Type files | `types.ts` | `types.ts` |
| Barrel exports | `index.ts` | `index.ts` |

### Import conventions

Always use `.js` extensions in relative imports (required by NodeNext module resolution):

```typescript
// Correct
import { ModelRegistry } from './registry.js';
import type { Driver } from '../types.js';

// Wrong — will fail at runtime
import { ModelRegistry } from './registry';
```

### Error handling

- Use the POSIX error constructors from `errors.ts`:
  ```typescript
  throw ENOENT(device);           // No driver found
  throw EBUSY(driver);            // Concurrency exceeded
  throw ETIMEDOUT(driver, ms);    // Timeout
  throw EIO(driver, details);     // I/O error
  throw EACCES(driver, reason);   // Auth failure
  ```
- Never throw raw `Error` objects from drivers — always wrap in `PingError`
- Set `retryable: true` for transient errors (timeout, rate limit, I/O), `false` for permanent ones (auth, not found)
- Re-throw existing `PingError` objects unchanged (use `isPingError()` guard)

### Code organization

- Keep driver adapters self-contained. Each adapter file should contain all protocol-specific logic (request translation, response parsing, error mapping)
- Use the `Driver` interface contract — don't add extra public methods
- Put shared utilities in `types.ts` or `errors.ts`, not scattered helper files

---

## Testing Requirements

### What must be tested

Every new driver or feature **must** include tests before merging:

| Component | Test type | Required |
|-----------|-----------|----------|
| New driver adapter | Integration test (hits real/mock API) | **Yes** |
| Gateway route changes | Integration test (starts server, makes HTTP calls) | **Yes** |
| Error handling paths | Unit or integration test verifying PingError shape | **Yes** |
| Routing logic changes | Unit test with mock drivers | **Yes** |

### Test framework

We use **Vitest** for all tests. Configuration is in `packages/std/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    testTimeout: 120_000,   // Generous timeout for live PingApp tests
  },
});
```

### Writing integration tests

Integration tests start a real Fastify server and make real HTTP requests:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createGateway } from '../gateway.js';
import { ModelRegistry } from '../registry.js';

let app: FastifyInstance;

beforeAll(async () => {
  const registry = new ModelRegistry('best');
  // Register drivers...
  app = await createGateway({ port: 3500, registry });
});

afterAll(async () => {
  if (app) await app.close();
});

describe('POST /v1/dev/llm/prompt', () => {
  it('returns a text response', async () => {
    const res = await fetch('http://localhost:3500/v1/dev/llm/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Say hello' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBeDefined();
    expect(typeof body.text).toBe('string');
  }, 120_000);
});
```

### Running tests

```bash
# All tests from repo root
npm test

# Single package
cd packages/std && npm test

# Watch mode
npm run test:watch

# Type checking only (no tests)
npm run lint
```

### Tests that require live services

Integration tests against live PingApps (port 3456) are expected to pass in development. If the PingApp isn't running, these tests will fail with connection errors — this is by design. CI environments should either mock the PingApp or run it as a service.

---

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | When to use | Example |
|--------|-------------|---------|
| `feat:` | New features | `feat(std): add Ollama driver adapter` |
| `fix:` | Bug fixes | `fix(gateway): handle empty prompt body` |
| `docs:` | Documentation only | `docs: add API reference for /v1/registry` |
| `refactor:` | Code changes that don't add features or fix bugs | `refactor(registry): simplify health check loop` |
| `test:` | Adding or updating tests | `test(std): add integration tests for error paths` |
| `chore:` | Maintenance tasks | `chore: update TypeScript to 5.9.3` |

### Scoping

Scope to the package when the change is limited to one package:

```
feat(std): add session affinity to routing
fix(core): handle CDP disconnect during extraction
docs(recon): document SiteDefinition schema
```

Use no scope for cross-cutting changes:

```
chore: update all packages to ESM
feat: add end-to-end gateway test suite
```

---

## PR Process

### Before submitting

1. **Tests pass**: `npm test` from repo root
2. **Types check**: `npm run lint` (runs `tsc --noEmit`)
3. **Conventional commit**: Your commits follow the [convention](#commit-conventions)
4. **No unrelated changes**: Keep PRs focused on one feature/fix

### PR description template

```markdown
## Summary
What does this PR do? (1-3 bullet points)

## Test plan
- [ ] Unit/integration tests added
- [ ] Existing tests still pass
- [ ] Manually verified against live PingApp (if applicable)

## Breaking changes
None / describe breaking changes
```

### Review expectations

- Driver adapters: reviewer verifies error handling covers all `PingError` errnos
- Gateway changes: reviewer verifies request validation and error responses
- Type changes: reviewer checks for backwards compatibility

---

## Project Structure

```
packages/
  core/          @pingdev/core     PingApp engine (DO NOT MODIFY for Phase 1)
  std/           @pingdev/std      POSIX device layer (primary development target)
    src/
      types.ts                     Core type definitions
      errors.ts                    POSIX errno constructors + HTTP mapping
      registry.ts                  ModelRegistry (registration, routing, health)
      gateway.ts                   Fastify HTTP server
      config.ts                    Configuration loader
      drivers/
        pingapp-adapter.ts         Wraps running PingApps
        openai-compat.ts           OpenAI-compatible APIs (Ollama, LM Studio, etc.)
        anthropic.ts               Anthropic API
        index.ts                   Driver barrel exports
      routing/
        strategies.ts              Routing strategy implementations
        index.ts                   Routing barrel exports
      __tests__/
        gateway.test.ts            Integration tests
  cli/           @pingdev/cli      CLI tools (snapshot, generate, recon)
  recon/         @pingdev/recon    Snapshot engine + PingApp code generator
  dashboard/     @pingdev/dash     React 19 monitoring dashboard
```
