import type { ExtensionBridge } from './ext-bridge.js';
export interface ExtractionTemplate {
    domain: string;
    urlPattern: string;
    pageType?: string;
    selectors: Record<string, string>;
    alternatives?: Record<string, string[]>;
    schema: Record<string, string>;
    sampleData?: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
    hitCount: number;
    successCount: number;
    failCount: number;
}
export interface TemplateStore {
    templates: Record<string, ExtractionTemplate>;
    version: number;
}
/** Load a template for a specific domain. */
export declare function loadTemplate(domain: string): ExtractionTemplate | null;
/** Save a template for a domain. */
export declare function saveTemplate(template: ExtractionTemplate): void;
/** Delete a template for a domain. */
export declare function deleteTemplate(domain: string): boolean;
/** List all saved templates. */
export declare function listTemplates(): Array<{
    domain: string;
    urlPattern: string;
    hitCount: number;
    successRate: number;
}>;
/** Export a template as JSON. */
export declare function exportTemplate(domain: string): ExtractionTemplate | null;
/** Import a template from JSON. */
export declare function importTemplate(data: ExtractionTemplate): void;
/**
 * Find a template that matches the given URL.
 * Returns the template if found and URL matches the stored pattern.
 */
export declare function findTemplateForUrl(url: string): ExtractionTemplate | null;
/**
 * Learn a template from a successful extraction on the current page.
 *
 * @param extBridge - Extension bridge for calling device operations
 * @param deviceId - Device/tab to learn from
 * @param extractionResult - The successful extraction result
 * @param schema - The schema that was used
 */
export declare function learnTemplate(extBridge: ExtensionBridge, deviceId: string, extractionResult: Record<string, unknown>, schema: Record<string, string>): Promise<ExtractionTemplate>;
/**
 * Apply a template for extraction — use stored selectors.
 * If selectors fail, attempt self-healing.
 */
export declare function applyTemplate(extBridge: ExtensionBridge, deviceId: string, template: ExtractionTemplate): Promise<{
    data: Record<string, unknown>;
    healed: boolean;
}>;
//# sourceMappingURL=template-learner.d.ts.map