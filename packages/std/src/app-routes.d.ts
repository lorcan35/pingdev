/**
 * PingApp Routes — High-level app actions mounted on the gateway
 *
 * Pattern: /v1/app/:appName/:action
 * Each app is a "device driver" for a website — named actions instead of raw selectors.
 *
 * Currently: aliexpress
 * Future: claude, amazon, perplexity, twitter, etc.
 */
import type { FastifyInstance } from 'fastify';
/**
 * PingApp function definitions for the function registry.
 * These describe the high-level app actions that can be called via /v1/functions.
 */
export declare const PINGAPP_FUNCTION_DEFS: Array<{
    app: string;
    domain: string;
    functions: Array<{
        name: string;
        description: string;
        params: Array<{
            name: string;
            type: string;
            required?: boolean;
            description?: string;
        }>;
    }>;
}>;
export declare function registerAppRoutes(app: FastifyInstance, gatewayUrl: string): void;
//# sourceMappingURL=app-routes.d.ts.map