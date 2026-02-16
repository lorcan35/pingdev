/**
 * Queue Worker — consumes jobs from BullMQ and drives the browser automation.
 *
 * Flow: dequeue job → connect browser → find/create page → preflight →
 *       type prompt → submit → poll for response → extract → persist artifacts → return result.
 *
 * All site-specific operations are delegated to the SiteDefinition's action handlers.
 */
import { Worker } from 'bullmq';
import type { SiteDefinition, JobRequest, EnhancedJobResult, RedisConfig, QueueConfig, RetryConfig } from '../types.js';
import { IdempotencyStore } from '../api/idempotency.js';
import { ConversationStore } from './conversation-store.js';
export interface WorkerOptions {
    redisConfig: RedisConfig;
    queueConfig: QueueConfig;
    retryConfig: RetryConfig;
    conversationStore: ConversationStore;
    idempotencyStore: IdempotencyStore;
    artifactsDir: string;
}
/**
 * Create and start the BullMQ worker.
 */
export declare function createWorker(site: SiteDefinition, opts: WorkerOptions): Worker<JobRequest, EnhancedJobResult>;
/** Disconnect the shared browser adapter (for clean shutdown). */
export declare function disconnectBrowser(): Promise<void>;
//# sourceMappingURL=index.d.ts.map