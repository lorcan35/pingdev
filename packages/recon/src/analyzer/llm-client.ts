/** LLM client for OpenAI-compatible chat completions. */

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

interface ChatCompletionResponse {
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
}

export class LLMClient {
  private endpoint: string;
  private model: string;
  private apiKey: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;

  constructor(options?: LLMClientOptions) {
    this.endpoint = options?.endpoint ?? 'http://localhost:1234/v1/chat/completions';
    this.model = options?.model ?? process.env.LLM_MODEL ?? '';
    this.apiKey = options?.apiKey ?? process.env.LLM_API_KEY ?? 'not-needed';
    this.defaultTemperature = options?.temperature ?? 0.3;
    this.defaultMaxTokens = options?.maxTokens ?? 4096;
  }

  /** Send a chat completion request and return the assistant's reply. */
  async chat(
    messages: ChatMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    const body = this.buildRequestBody(messages, options);
    const data = await this.postRequest(body);
    return this.extractContent(data);
  }

  /** Send a chat completion request with JSON mode enabled. */
  async chatJSON<T>(
    messages: ChatMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<T> {
    const body = this.buildRequestBody(messages, options);
    body.response_format = { type: 'json_object' };
    const data = await this.postRequest(body);
    const content = this.extractContent(data);

    try {
      return JSON.parse(content) as T;
    } catch (err) {
      // Try to extract JSON from markdown fences or surrounding text
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ??
        content.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim()) as T;
      }
      throw new Error(`Failed to parse LLM JSON response: ${(err as Error).message}`);
    }
  }

  private buildRequestBody(
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

  private async postRequest(body: Record<string, unknown>): Promise<ChatCompletionResponse> {
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

  private extractContent(data: ChatCompletionResponse): string {
    const choice = data.choices?.[0];
    if (!choice?.message?.content) {
      throw new Error('LLM response has no content in choices[0].message.content');
    }
    return choice.message.content;
  }
}
