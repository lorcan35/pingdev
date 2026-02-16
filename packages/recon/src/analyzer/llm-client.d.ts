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
export declare class LLMClient {
    private backend;
    private endpoint;
    private model;
    private apiKey;
    private defaultTemperature;
    private defaultMaxTokens;
    constructor(options?: LLMClientOptions);
    /** Which backend is active. */
    get backendName(): string;
    /** Send a chat completion request and return the assistant's reply. */
    chat(messages: ChatMessage[], options?: {
        temperature?: number;
        maxTokens?: number;
    }): Promise<string>;
    /** Send a chat request with JSON mode — response is parsed as JSON. */
    chatJSON<T>(messages: ChatMessage[], options?: {
        temperature?: number;
        maxTokens?: number;
    }): Promise<T>;
    private anthropicChat;
    private buildOpenAIBody;
    private postOpenAI;
    private extractOpenAIContent;
    /** Add "respond with JSON" instruction for backends without native JSON mode. */
    private addJsonInstruction;
    /** Parse JSON from LLM response, handling markdown fences and thinking tags. */
    private parseJSON;
}
//# sourceMappingURL=llm-client.d.ts.map