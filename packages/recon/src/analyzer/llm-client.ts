/**
 * LLM client — supports OpenAI-compatible APIs and Anthropic Messages API.
 *
 * Backend selection (in priority order):
 * 1. Explicit options passed to constructor
 * 2. PINGDEV_LLM_URL + PINGDEV_LLM_MODEL env vars
 * 3. ANTHROPIC_API_KEY → Anthropic Messages API
 * 4. OPENAI_API_KEY → OpenAI API
 * 5. Fallback: localhost:1234 (LM Studio)
 */

export interface LLMClientOptions {
  endpoint?: string;
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type Backend = 'anthropic' | 'openai-compat';

interface ChatCompletionResponse {
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  stop_reason: string;
}

/** Resolve which backend to use based on options and env vars. */
function resolveBackend(options?: LLMClientOptions): {
  backend: Backend;
  endpoint: string;
  model: string;
  apiKey: string;
} {
  // 1. Explicit options
  if (options?.endpoint) {
    const isAnthropic = options.endpoint.includes('anthropic.com');
    return {
      backend: isAnthropic ? 'anthropic' : 'openai-compat',
      endpoint: isAnthropic
        ? options.endpoint.replace(/\/+$/, '') + '/v1/messages'
        : options.endpoint,
      model: options.model ?? process.env.PINGDEV_LLM_MODEL ?? (isAnthropic ? 'claude-sonnet-4-5-20250929' : ''),
      apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? 'not-needed',
    };
  }

  // 2. PINGDEV_LLM_URL env var
  const envUrl = process.env.PINGDEV_LLM_URL;
  if (envUrl) {
    const isAnthropic = envUrl.includes('anthropic.com');
    const endpoint = isAnthropic
      ? envUrl.replace(/\/+$/, '').replace(/\/v1\/messages$/, '') + '/v1/messages'
      : envUrl.replace(/\/+$/, '') + (envUrl.includes('/v1/') ? '' : '/v1/chat/completions');
    return {
      backend: isAnthropic ? 'anthropic' : 'openai-compat',
      endpoint,
      model: options?.model ?? process.env.PINGDEV_LLM_MODEL ?? (isAnthropic ? 'claude-sonnet-4-5-20250929' : ''),
      apiKey: options?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? 'not-needed',
    };
  }

  // 3. ANTHROPIC_API_KEY present → use Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      backend: 'anthropic',
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: options?.model ?? process.env.PINGDEV_LLM_MODEL ?? 'claude-sonnet-4-5-20250929',
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }

  // 4. OPENAI_API_KEY present → use OpenAI
  if (process.env.OPENAI_API_KEY) {
    return {
      backend: 'openai-compat',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: options?.model ?? process.env.PINGDEV_LLM_MODEL ?? 'gpt-4o',
      apiKey: process.env.OPENAI_API_KEY,
    };
  }

  // 5. Fallback: LM Studio
  return {
    backend: 'openai-compat',
    endpoint: 'http://localhost:1234/v1/chat/completions',
    model: options?.model ?? process.env.PINGDEV_LLM_MODEL ?? '',
    apiKey: 'not-needed',
  };
}

export class LLMClient {
  private backend: Backend;
  private endpoint: string;
  private model: string;
  private apiKey: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;

  constructor(options?: LLMClientOptions) {
    const resolved = resolveBackend(options);
    this.backend = resolved.backend;
    this.endpoint = resolved.endpoint;
    this.model = resolved.model;
    this.apiKey = resolved.apiKey;
    this.defaultTemperature = options?.temperature ?? 0.3;
    this.defaultMaxTokens = options?.maxTokens ?? 4096;
  }

  /** Which backend is active. */
  get backendName(): string {
    return `${this.backend} (${this.endpoint})`;
  }

  /** Send a chat completion request and return the assistant's reply. */
  async chat(
    messages: ChatMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    if (this.backend === 'anthropic') {
      return this.anthropicChat(messages, options);
    }
    const body = this.buildOpenAIBody(messages, options);
    const data = await this.postOpenAI(body);
    return this.extractOpenAIContent(data);
  }

  /** Send a chat request with JSON mode — response is parsed as JSON. */
  async chatJSON<T>(
    messages: ChatMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<T> {
    let content: string;

    if (this.backend === 'anthropic') {
      // Anthropic doesn't have JSON mode — add instruction to the prompt
      const augmented = this.addJsonInstruction(messages);
      content = await this.anthropicChat(augmented, options);
    } else {
      const body = this.buildOpenAIBody(messages, options);
      body.response_format = { type: 'json_object' };
      const data = await this.postOpenAI(body);
      content = this.extractOpenAIContent(data);
    }

    return this.parseJSON<T>(content);
  }

  // ─── Anthropic Backend ─────────────────────────────────────────

  private async anthropicChat(
    messages: ChatMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    // Anthropic: system message is a separate top-level param
    const systemMsg = messages.find((m) => m.role === 'system');
    const nonSystem = messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      temperature: options?.temperature ?? this.defaultTemperature,
      messages: nonSystem.map((m) => ({ role: m.role, content: m.content })),
    };
    if (systemMsg) {
      body.system = systemMsg.content;
    }

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`Anthropic request failed (network): ${(err as Error).message}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Anthropic request failed (HTTP ${response.status}): ${text}`);
    }

    let data: AnthropicResponse;
    try {
      data = (await response.json()) as AnthropicResponse;
    } catch (err) {
      throw new Error(`Anthropic response is not valid JSON: ${(err as Error).message}`);
    }

    const textBlock = data.content?.find((b) => b.type === 'text');
    if (!textBlock?.text) {
      throw new Error('Anthropic response has no text content');
    }
    return textBlock.text;
  }

  // ─── OpenAI-Compatible Backend ─────────────────────────────────

  private buildOpenAIBody(
    messages: ChatMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): Record<string, unknown> {
    return {
      model: this.model,
      messages,
      temperature: options?.temperature ?? this.defaultTemperature,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
    };
  }

  private async postOpenAI(body: Record<string, unknown>): Promise<ChatCompletionResponse> {
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`LLM request failed (network): ${(err as Error).message}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`LLM request failed (HTTP ${response.status}): ${text}`);
    }

    try {
      return (await response.json()) as ChatCompletionResponse;
    } catch (err) {
      throw new Error(`LLM response is not valid JSON: ${(err as Error).message}`);
    }
  }

  private extractOpenAIContent(data: ChatCompletionResponse): string {
    const choice = data.choices?.[0];
    if (!choice?.message?.content) {
      throw new Error('LLM response has no content in choices[0].message.content');
    }
    return choice.message.content;
  }

  // ─── Helpers ───────────────────────────────────────────────────

  /** Add "respond with JSON" instruction for backends without native JSON mode. */
  private addJsonInstruction(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((m) => {
      if (m.role === 'system') {
        return {
          ...m,
          content: m.content + '\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown fences, no explanations — just the raw JSON object.',
        };
      }
      return m;
    });
  }

  /** Parse JSON from LLM response, handling markdown fences. */
  private parseJSON<T>(content: string): T {
    // Try direct parse first
    try {
      return JSON.parse(content) as T;
    } catch {
      // Try extracting from markdown fences
      const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        return JSON.parse(fenceMatch[1].trim()) as T;
      }
      // Try finding a JSON object in the text
      const objMatch = content.match(/(\{[\s\S]*\})/);
      if (objMatch) {
        return JSON.parse(objMatch[1].trim()) as T;
      }
      throw new Error(`Failed to parse LLM JSON response. Raw content starts with: ${content.slice(0, 200)}`);
    }
  }
}
