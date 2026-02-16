"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSwagger = registerSwagger;
async function registerSwagger(app, site, port) {
    const swagger = await import('@fastify/swagger');
    const swaggerUi = await import('@fastify/swagger-ui');
    await app.register(swagger.default, {
        openapi: {
            openapi: '3.0.3',
            info: {
                title: `PingDev — ${site.name} API`,
                description: `Local HTTP API shim for ${site.url} powered by PingDev browser automation.`,
                version: '1.0.0',
            },
            servers: [
                { url: `http://localhost:${port}`, description: 'Local dev server' },
            ],
            tags: [
                { name: 'Jobs', description: 'Asynchronous job lifecycle — submit, poll, stream' },
                { name: 'Chat', description: 'Synchronous chat convenience endpoint' },
                { name: 'System', description: 'Health checks and diagnostics' },
            ],
        },
    });
    await app.register(swaggerUi.default, {
        routePrefix: '/docs',
        uiConfig: {
            docExpansion: 'list',
            deepLinking: true,
        },
    });
}
//# sourceMappingURL=swagger.js.map