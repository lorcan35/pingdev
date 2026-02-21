export interface LocalModeConfig {
    enabled: boolean;
    llmBaseUrl: string;
    llmModel: string;
    llmApiKey: string;
    visionBaseUrl: string;
    visionModel: string;
    domLimit: number;
    responseFormat: boolean;
    timeouts: {
        query: number;
        heal: number;
        generate: number;
        suggest: number;
        extract: number;
        discover: number;
        visual: number;
        default: number;
    };
    models: {
        extract?: string;
        heal?: string;
        generate?: string;
        vision?: string;
    };
}
export declare function getLocalConfig(): LocalModeConfig;
export declare function isLocalMode(): boolean;
export declare function getTimeoutForFeature(feature: string): number;
export declare function getModelForFeature(feature: string): string;
export declare function truncateDom(html: string, limit?: number): string;
export declare function compressPrompt(prompt: string): string;
//# sourceMappingURL=local-mode.d.ts.map