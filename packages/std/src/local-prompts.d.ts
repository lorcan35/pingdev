export interface PromptTemplate {
    system: string;
    userTemplate: string;
}
export declare function getQueryPrompt(local: boolean): PromptTemplate;
export declare function getHealPrompt(local: boolean): PromptTemplate;
export declare function getSuggestPrompt(local: boolean): PromptTemplate;
export declare function getGeneratePrompt(local: boolean): PromptTemplate;
export declare function getDiscoverPrompt(local: boolean): PromptTemplate;
export declare function getExtractPrompt(local: boolean): PromptTemplate;
export declare function getVisualPrompt(local: boolean): PromptTemplate;
export declare function getPaginatePrompt(local: boolean): PromptTemplate;
//# sourceMappingURL=local-prompts.d.ts.map