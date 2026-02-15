# PingOS API Reference

Base URL: `http://localhost:3500`

The PingOS gateway exposes a POSIX-inspired HTTP API for routing requests to LLM drivers. All request and response bodies are JSON. All endpoints use the `/v1/` version prefix.

---

## Table of Contents

- [POST /v1/dev/llm/prompt](#post-v1devllmprompt)
- [POST /v1/dev/llm/chat](#post-v1devllmchat)
- [GET /v1/registry](#get-v1registry)
- [GET /v1/health](#get-v1health)
- [Common Request Fields](#common-request-fields)
- [Response Schema](#response-schema)
- [Error Reference](#error-reference)
- [Type Definitions](#type-definitions)

---

## POST /v1/dev/llm/prompt

Send a single prompt to the best available LLM driver. The gateway resolves the target driver based on required capabilities, routing strategy, and driver health.

### Request Schema

```typescript
interface PromptRequest {
  // Required
  prompt: string;                          // The prompt text to send

  // Optional — routing
  driver?: string;                         // Target a specific driver by ID (bypasses routing)
  require?: Partial<DriverCapabilities>;   // Required capability flags for filtering drivers
  strategy?: 'best' | 'fastest' | 'cheapest' | 'round-robin';  // Routing strategy (default: 'best')

  // Optional — execution
  timeout_ms?: number;                     // Request timeout in milliseconds (default: 120000)
  conversation_id?: string;                // Continue an existing conversation (PingApp drivers)
  tool?: string;                           // Activate a PingApp tool (e.g., 'deep-research', 'image-gen')
}
```

### Example: Basic prompt

```bash
curl -s http://localhost:3500/v1/dev/llm/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Explain quantum entanglement in one paragraph"}' | jq .
```

**Response (200):**

```json
{
  "text": "Quantum entanglement is a phenomenon in quantum mechanics where two or more particles become interconnected in such a way that the quantum state of each particle cannot be described independently of the others, even when separated by large distances. When a measurement is performed on one entangled particle, it instantaneously affects the state of its partner particle, regardless of the distance between them — a phenomenon Einstein famously called \"spooky action at a distance.\"",
  "driver": "gemini",
  "durationMs": 15432
}
```

### Example: Capability-based routing

```bash
# Only route to drivers with thinking/reasoning support
curl -s http://localhost:3500/v1/dev/llm/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Think step by step: what is the derivative of x^3 * sin(x)?",
    "require": {"thinking": true}
  }' | jq .
```

**Response (200):**

```json
{
  "text": "Using the product rule: d/dx[x³·sin(x)] = 3x²·sin(x) + x³·cos(x)",
  "driver": "gemini",
  "thinking": "I need to apply the product rule. Let u = x³ and v = sin(x)...",
  "durationMs": 8200
}
```

### Example: Target a specific driver

```bash
curl -s http://localhost:3500/v1/dev/llm/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello", "driver": "gemini"}' | jq .
```

### Example: Choose routing strategy

```bash
# Fastest available driver
curl -s http://localhost:3500/v1/dev/llm/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Capital of France?", "strategy": "fastest"}' | jq .
```

### Example: Use a PingApp tool

```bash
# Activate Gemini's Deep Research tool
curl -s http://localhost:3500/v1/dev/llm/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Research the latest advances in quantum computing in 2026",
    "driver": "gemini",
    "tool": "deep-research",
    "timeout_ms": 300000
  }' | jq .
```

### Error Cases

| Scenario | HTTP Status | errno | code |
|----------|-------------|-------|------|
| Missing `prompt` field | 400 | `ENOSYS` | `ping.gateway.bad_request` |
| No driver matches `require` capabilities | 404 | `ENOENT` | `ping.router.no_driver` |
| Specified `driver` ID not found | 404 | `ENOENT` | `ping.router.no_driver` |
| PingApp busy (processing another request) | 409 | `EBUSY` | `ping.driver.concurrency_exceeded` |
| Request timed out | 503 | `ETIMEDOUT` | `ping.driver.timeout` |
| PingApp unreachable | 502 | `EIO` | `ping.driver.io_error` |

---

## POST /v1/dev/llm/chat

Multi-turn chat with full message history. Accepts all the same fields as `/prompt` plus a `messages` array. This endpoint is designed for conversational AI workflows where context from previous turns must be preserved.

### Request Schema

```typescript
interface ChatRequest {
  // At least one of prompt or messages is required
  prompt?: string;                         // Current turn prompt (can be empty if messages provided)
  messages?: Message[];                    // Full conversation history

  // Same optional fields as /prompt
  driver?: string;
  require?: Partial<DriverCapabilities>;
  strategy?: 'best' | 'fastest' | 'cheapest' | 'round-robin';
  timeout_ms?: number;
  conversation_id?: string;
  tool?: string;
}

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; url: string; detail?: 'low' | 'high' }
  | { type: 'tool_call'; id: string; name: string; arguments: unknown }
  | { type: 'tool_result'; toolCallId: string; content: unknown };
```

### Example: Multi-turn conversation

```bash
curl -s http://localhost:3500/v1/dev/llm/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Now explain it to a 5-year-old",
    "messages": [
      {"role": "system", "content": "You are a helpful physics tutor."},
      {"role": "user", "content": "What is gravity?"},
      {"role": "assistant", "content": "Gravity is the force that pulls objects toward each other..."},
      {"role": "user", "content": "Now explain it to a 5-year-old"}
    ]
  }' | jq .
```

**Response (200):**

```json
{
  "text": "You know how when you jump, you always come back down? That's gravity! It's like the Earth is giving you a big hug and pulling you close.",
  "driver": "gemini",
  "durationMs": 9800
}
```

### Example: Multi-modal message with image

```bash
curl -s http://localhost:3500/v1/dev/llm/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "What do you see in this image?"},
          {"type": "image_url", "url": "https://example.com/photo.jpg", "detail": "high"}
        ]
      }
    ],
    "require": {"vision": true}
  }' | jq .
```

### Behavior Notes

- If both `prompt` and `messages` are provided, the driver receives both. For PingApp drivers, `prompt` is sent as the primary input. For API drivers, messages take precedence.
- The `conversation_id` field enables multi-turn conversations on PingApp drivers (which maintain browser tab state). API drivers are stateless and use the `messages` array for context.
- If neither `prompt` nor `messages` is provided, the request returns 400.

### Error Cases

Same as [/v1/dev/llm/prompt](#error-cases), plus:

| Scenario | HTTP Status | errno | code |
|----------|-------------|-------|------|
| Neither `prompt` nor `messages` provided | 400 | `ENOSYS` | `ping.gateway.bad_request` |

---

## GET /v1/registry

List all registered drivers with their capabilities, backend type, endpoint, and priority.

### Response Schema

```typescript
interface RegistryResponse {
  drivers: DriverRegistration[];
}

interface DriverRegistration {
  id: string;                          // Unique driver identifier
  name: string;                        // Human-readable name
  type: 'pingapp' | 'api' | 'local';  // Backend type
  capabilities: DriverCapabilities;    // What this driver can do
  endpoint: string;                    // Where this driver lives
  priority: number;                    // Lower = preferred (used by routing)
  tools?: string[];                    // Available tools (PingApps)
  modes?: string[];                    // Available modes (PingApps)
  model?: ModelInfo;                   // Model info (API drivers)
}

interface DriverCapabilities {
  llm: boolean;
  streaming: boolean;
  vision: boolean;
  toolCalling: boolean;
  imageGen: boolean;
  search: boolean;
  deepResearch: boolean;
  thinking: boolean;
  snapshotting?: boolean;
  sessionAffinity?: boolean;
  maxContextTokens?: number;
  concurrency?: number;
}

interface ModelInfo {
  id: string;
  name: string;
  provider?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}
```

### Example

```bash
curl -s http://localhost:3500/v1/registry | jq .
```

**Response (200):**

```json
{
  "drivers": [
    {
      "id": "gemini",
      "name": "Gemini PingApp",
      "type": "pingapp",
      "capabilities": {
        "llm": true,
        "streaming": true,
        "vision": true,
        "toolCalling": true,
        "imageGen": true,
        "search": true,
        "deepResearch": true,
        "thinking": true
      },
      "endpoint": "http://localhost:3456",
      "priority": 1
    },
    {
      "id": "ollama-llama3",
      "name": "Ollama Llama 3",
      "type": "api",
      "capabilities": {
        "llm": true,
        "streaming": true,
        "vision": false,
        "toolCalling": false,
        "imageGen": false,
        "search": false,
        "deepResearch": false,
        "thinking": false
      },
      "endpoint": "http://localhost:11434",
      "priority": 20,
      "model": {
        "id": "llama3:8b",
        "name": "llama3:8b"
      }
    }
  ]
}
```

### Filtering tips

```bash
# List just driver IDs and types
curl -s http://localhost:3500/v1/registry | jq '.drivers[] | {id, type}'

# Find drivers with a specific capability
curl -s http://localhost:3500/v1/registry | jq '.drivers[] | select(.capabilities.thinking == true) | .id'

# Show only PingApp drivers
curl -s http://localhost:3500/v1/registry | jq '.drivers[] | select(.type == "pingapp")'
```

---

## GET /v1/health

Gateway health check. Returns the operational status of the gateway server itself (not individual drivers).

### Response Schema

```typescript
interface HealthResponse {
  status: 'healthy';
  timestamp: string;    // ISO 8601 timestamp
}
```

### Example

```bash
curl -s http://localhost:3500/v1/health | jq .
```

**Response (200):**

```json
{
  "status": "healthy",
  "timestamp": "2026-02-15T12:00:00.000Z"
}
```

This endpoint always returns 200 if the gateway process is running. For individual driver health, check the driver's own health endpoint (e.g., `curl http://localhost:3456/v1/health` for the Gemini PingApp).

---

## Common Request Fields

These fields are shared across `/v1/dev/llm/prompt` and `/v1/dev/llm/chat`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `prompt` | `string` | — | The prompt text |
| `messages` | `Message[]` | — | Full conversation history (chat endpoint only) |
| `driver` | `string` | — | Target a specific driver by ID. Bypasses capability matching and routing strategy. |
| `require` | `Partial<DriverCapabilities>` | — | Only consider drivers matching these capability flags |
| `strategy` | `string` | `'best'` | Routing strategy: `best`, `fastest`, `cheapest`, `round-robin` |
| `timeout_ms` | `number` | `120000` | Maximum time to wait for a response (milliseconds) |
| `conversation_id` | `string` | — | Continue an existing conversation (PingApp drivers maintain tab state) |
| `tool` | `string` | — | Activate a PingApp-specific tool (e.g., `deep-research`, `image-gen`, `canvas`) |

---

## Response Schema

All successful responses from `/prompt` and `/chat` share this shape:

```typescript
interface DeviceResponse {
  text: string;                 // The response text (always present)
  driver: string;               // ID of the driver that handled the request
  model?: string;               // Model identifier (API drivers)
  usage?: TokenUsage;           // Token usage (API drivers only)
  thinking?: string;            // Reasoning chain (drivers with thinking capability)
  artifacts?: Artifact[];       // Generated artifacts (images, code, files)
  conversation_id?: string;     // Conversation ID for multi-turn (PingApp drivers)
  durationMs?: number;          // Total request duration in milliseconds
}

interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

interface Artifact {
  type: 'image' | 'code' | 'file' | 'json';
  data: string;
  mimeType?: string;
  filename?: string;
}
```

---

## Error Reference

All errors follow the `PingError` schema:

```typescript
interface PingError {
  errno: PingErrno;             // POSIX-style error number (machine-parseable)
  code: string;                 // Domain-specific error code (human-debuggable)
  message: string;              // Human-readable error description
  retryable: boolean;           // Whether the client should retry this request
  retryAfterMs?: number;        // Suggested retry delay (for retryable errors)
  details?: unknown;            // Additional error context
}
```

### errno → HTTP Status Mapping

| errno | HTTP Status | Description | Retryable | When it occurs |
|-------|-------------|-------------|-----------|----------------|
| `ENOENT` | 404 | No driver found | No | No registered driver matches the required capabilities, or specified driver ID doesn't exist |
| `ENODEV` | 404 | Device not found | No | Requested device path doesn't exist in registry |
| `EACCES` | 403 | Auth required | No | API driver rejected the request due to invalid or missing API key |
| `EBUSY` | 409 | Resource busy | **Yes** | PingApp is already processing another request (single concurrency) |
| `ETIMEDOUT` | 503 | Timeout | **Yes** | Request exceeded `timeout_ms` waiting for the driver to respond |
| `EAGAIN` | 429 | Rate limited | **Yes** | Driver is rate limiting requests. Check `retryAfterMs` for suggested delay |
| `ENOSYS` | 422 | Not implemented | No | Requested capability or operation is not implemented by the driver |
| `EOPNOTSUPP` | 422 | Op not supported | No | The specific operation is not supported by this driver type |
| `EIO` | 502 | I/O error | **Yes** | Backend returned unexpected response, connection failed, or internal driver error |
| `ECANCELED` | 499 | Canceled | No | Request was canceled by the caller |

### Domain Code Reference

The `code` field provides structured, human-readable context for debugging:

| Code | errno | Description |
|------|-------|-------------|
| `ping.router.no_driver` | `ENOENT` | No driver in the registry matches the required capabilities |
| `ping.registry.device_not_found` | `ENODEV` | Requested device not found in registry |
| `ping.driver.auth_required` | `EACCES` | Driver requires authentication credentials (invalid or missing API key) |
| `ping.driver.concurrency_exceeded` | `EBUSY` | PingApp is processing another request (single-concurrency browser driver) |
| `ping.driver.timeout` | `ETIMEDOUT` | Request exceeded timeout waiting for driver response |
| `ping.driver.rate_limited` | `EAGAIN` | Driver is rate limiting requests |
| `ping.driver.not_implemented` | `ENOSYS` | Requested capability not implemented by this driver |
| `ping.driver.op_not_supported` | `EOPNOTSUPP` | Requested operation not supported |
| `ping.driver.io_error` | `EIO` | Connection failed, unexpected response, or internal driver error |
| `ping.driver.canceled` | `ECANCELED` | Request was canceled |
| `ping.gateway.bad_request` | `ENOSYS` | Missing required fields in the request body |
| `ping.gateway.internal` | `EIO` | Unexpected internal gateway error |

### Error Examples

**No matching driver:**

```bash
curl -s http://localhost:3500/v1/dev/llm/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test", "require": {"snapshotting": true}}' | jq .
```

```json
{
  "errno": "ENOENT",
  "code": "ping.router.no_driver",
  "message": "No driver available for test",
  "retryable": false
}
```

**Missing prompt:**

```bash
curl -s http://localhost:3500/v1/dev/llm/prompt \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

```json
{
  "errno": "ENOSYS",
  "code": "ping.gateway.bad_request",
  "message": "Missing required field: prompt",
  "retryable": false
}
```

**Driver timeout:**

```json
{
  "errno": "ETIMEDOUT",
  "code": "ping.driver.timeout",
  "message": "Driver gemini timed out after 120000ms",
  "retryable": true
}
```

**Driver busy:**

```json
{
  "errno": "EBUSY",
  "code": "ping.driver.concurrency_exceeded",
  "message": "Driver gemini is busy (single concurrency)",
  "retryable": true,
  "retryAfterMs": 5000
}
```

**Authentication failure:**

```json
{
  "errno": "EACCES",
  "code": "ping.driver.auth_required",
  "message": "Driver claude: Invalid or missing API key",
  "retryable": false
}
```

---

## Type Definitions

For the full TypeScript type definitions, see `packages/std/src/types.ts`. You can also generate the schema with:

```bash
npx tsx packages/recon/src/types-export.ts
```

### Key Types

```typescript
// Backend types
type BackendType = 'pingapp' | 'api' | 'local';

// Routing strategies
type RoutingStrategy = 'fastest' | 'cheapest' | 'best' | 'round-robin';

// Health statuses
type HealthStatus = 'online' | 'degraded' | 'offline' | 'unknown';

// POSIX error numbers
type PingErrno =
  | 'ENOENT' | 'EACCES' | 'EBUSY' | 'ETIMEDOUT' | 'EAGAIN'
  | 'ENOSYS' | 'ENODEV' | 'EOPNOTSUPP' | 'EIO' | 'ECANCELED';

// Streaming chunk types (for future SSE streaming endpoints)
interface StreamChunk {
  type: 'partial' | 'thinking' | 'complete';
  text?: string;
  usage?: TokenUsage;
  durationMs?: number;
}
```
