import type { LLMConfig } from './self-heal.js';
export interface CallLLMOptions {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
    timeoutMs?: number;
    responseFormatJson?: boolean;
    feature?: string;
}
export interface SuggestResult {
    suggestion: string;
    confidence: number;
}
/** Build an LLMConfig from environment variables, falling back to self-heal defaults. */
export declare function getLLMConfig(feature?: string): LLMConfig;
/** Call an OpenAI-compatible LLM and return the assistant's text response. */
export declare function callLLM(prompt: string, opts?: CallLLMOptions): Promise<string>;
/** Generate a contextual suggestion for a device interaction. */
export declare function suggest(deviceId: string, context: string, question: string): Promise<SuggestResult>;
export interface VisionContent {
    type: 'image_url';
    image_url: {
        url: string;
    };
}
export interface TextContent {
    type: 'text';
    text: string;
}
export type MessageContent = string | Array<TextContent | VisionContent>;
export interface CallLLMVisionOptions extends CallLLMOptions {
    images?: string[];
}
/** Call an OpenAI-compatible LLM with optional vision (image) content. */
export declare function callLLMVision(prompt: string, opts?: CallLLMVisionOptions): Promise<string>;
//# sourceMappingURL=llm.d.ts.map