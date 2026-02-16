"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createShimApp = createShimApp;
const fastify_1 = __importDefault(require("fastify"));
const bullmq_1 = require("bullmq");
const config_js_1 = require("./config.js");
const logger_js_1 = require("./logger.js");
const rate_limiter_js_1 = require("./api/rate-limiter.js");
const idempotency_js_1 = require("./api/idempotency.js");
const conversation_store_js_1 = require("./worker/conversation-store.js");
const swagger_js_1 = require("./api/swagger.js");
const routes_js_1 = require("./api/routes.js");
const index_js_1 = require("./worker/index.js");
function createShimApp(site, options = {}) {
    const config = (0, config_js_1.resolveConfig)(site);
    const port = options.port ?? 3456;
    const host = options.host ?? '0.0.0.0';
    const log = (0, logger_js_1.createLogger)(site.name, options.logLevel);
    const redisConfig = { ...config.redis, ...options.redis };
    // Create infrastructure — config is fully resolved, so all fields are present
    const rateLimiter = new rate_limiter_js_1.RateLimiter(config.rateLimit);
    const idempotencyStore = new idempotency_js_1.IdempotencyStore(redisConfig, config.idempotency);
    const conversationStore = new conversation_store_js_1.ConversationStore(redisConfig, config.conversation);
    const queue = new bullmq_1.Queue(config.queue.name, {
        connection: { host: redisConfig.host, port: redisConfig.port },
    });
    let worker = null;
    return {
        async start() {
            log.info(`Starting PingDev — ${site.name}`);
            const app = (0, fastify_1.default)({ logger: false });
            await (0, swagger_js_1.registerSwagger)(app, site, port);
            await (0, routes_js_1.registerRoutes)(app, site, {
                queue: queue,
                rateLimiter,
                idempotencyStore,
                redisConfig,
                appOptions: options,
            });
            worker = (0, index_js_1.createWorker)(site, {
                redisConfig,
                queueConfig: config.queue,
                retryConfig: config.retry,
                conversationStore,
                idempotencyStore,
                artifactsDir: config.artifactsDir,
            });
            await app.listen({ host, port });
            log.info({ host, port }, 'HTTP server listening');
            const shutdown = async (signal) => {
                log.info({ signal }, 'Shutting down...');
                if (worker)
                    await worker.close();
                await conversationStore.close();
                await idempotencyStore.close();
                await queue.close();
                await app.close();
                log.info('Shutdown complete');
                process.exit(0);
            };
            process.on('SIGTERM', () => shutdown('SIGTERM'));
            process.on('SIGINT', () => shutdown('SIGINT'));
        },
        async stop() {
            if (worker)
                await worker.close();
            await conversationStore.close();
            await idempotencyStore.close();
            await queue.close();
        },
    };
}
//# sourceMappingURL=app.js.map