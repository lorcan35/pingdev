/**
 * OpenAPI JSON Schema definitions for PingDev.
 *
 * Builds schemas dynamically from the SiteDefinition so tool/mode enums
 * are populated from the site config instead of being hardcoded.
 */
import type { SiteDefinition } from '../types.js';
export interface SiteSchemas {
    postJobsSchema: Record<string, unknown>;
    getJobSchema: Record<string, unknown>;
    getJobStatusSchema: Record<string, unknown>;
    getJobThinkingSchema: Record<string, unknown>;
    getJobStreamSchema: Record<string, unknown>;
    postChatSchema: Record<string, unknown>;
    getHealthSchema: Record<string, unknown>;
}
/** Build all route schemas from the site definition. */
export declare function buildSchemas(site: SiteDefinition): SiteSchemas;
//# sourceMappingURL=schemas.d.ts.map