import type { FastifyInstance } from 'fastify';
import { ModelRegistry } from './registry.js';
import { ExtensionBridge } from './ext-bridge.js';
export interface GatewayOptions {
    port?: number;
    host?: string;
    registry: ModelRegistry;
    extBridge?: ExtensionBridge;
}
export declare function createGateway(opts: GatewayOptions): Promise<FastifyInstance>;
//# sourceMappingURL=gateway.d.ts.map