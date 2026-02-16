"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWorker = createWorker;
exports.disconnectBrowser = disconnectBrowser;
/**
 * Queue Worker — consumes jobs from BullMQ and drives the browser automation.
 *
 * Flow: dequeue job → connect browser → find/create page → preflight →
 *       type prompt → submit → poll for response → extract → persist artifacts → return result.
 *
 * All site-specific operations are delegated to the SiteDefinition's action handlers.
 */
const bullmq_1 = require("bullmq");
const node_crypto_1 = require("node:crypto");
const adapter_js_1 = require("../browser/adapter.js");
const index_js_1 = require("../state-machine/index.js");
const index_js_2 = require("../artifacts/index.js");
const index_js_3 = require("../errors/index.js");
const selector_resolver_js_1 = require("../browser/selector-resolver.js");
const jobStore = __importStar(require("./job-state-store.js"));
const retry_js_1 = require("./retry.js");
const logger_js_1 = require("../logger.js");
/** Shared browser adapter (one per worker, one active job at a time). */
let adapter = null;
/** Get or create the browser adapter. */
async function getAdapter(site) {
    if (adapter?.page)
        return adapter;
    adapter = new adapter_js_1.BrowserAdapter(site.browser);
    await adapter.connect();
    return adapter;
}
/** Hash text content for stability detection. */
function hashText(text) {
    return (0, node_crypto_1.createHash)('sha256').update(text).digest('hex').slice(0, 16);
}
function isShimError(err) {
    return typeof err === 'object' && err !== null && 'code' in err && 'retryable' in err;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/** Build an ActionContext for calling site action handlers. */
function buildActionContext(site, browser, jobRequest, log) {
    const page = browser.page;
    return {
        page,
        selectors: site.selectors,
        resolveSelector: (selectorDef, timeoutMs) => (0, selector_resolver_js_1.resolveSelector)(page, selectorDef, timeoutMs),
        log,
        jobRequest,
    };
}
/**
 * Process a single job: drive the browser through the chat flow using site actions.
 */
async function processJob(job, site, opts) {
    const { id: jobId } = job;
    const request = job.data;
    const sm = new index_js_1.UIStateMachine(site.states);
    const artifacts = new index_js_2.ArtifactLogger(jobId, opts.artifactsDir);
    const errors = [];
    const log = (0, logger_js_1.createLogger)(site.name).child({ module: 'worker', jobId });
    log.info({ prompt: request.prompt.slice(0, 80) }, 'Processing job');
    // Initialize live job state for observability
    jobStore.initJobState(jobId, request.tool ?? null, request.mode ?? null);
    jobStore.updateTiming(jobId, { queued_at: new Date(job.timestamp).toISOString() });
    await artifacts.init();
    await artifacts.saveRequest(request);
    const startedAt = new Date().toISOString();
    jobStore.updateTiming(jobId, { started_at: startedAt });
    const result = {
        job_id: jobId,
        status: 'running',
        created_at: new Date(job.timestamp).toISOString(),
        started_at: startedAt,
        prompt: request.prompt,
        artifact_path: artifacts.dir,
        tool_used: request.tool ?? null,
        mode: request.mode ?? null,
    };
    jobStore.setArtifactPath(jobId, artifacts.dir);
    try {
        // Step 1: Connect to browser
        const browser = await getAdapter(site);
        const ctx = buildActionContext(site, browser, request, log);
        // Step 2: Find or create the target page
        await (0, retry_js_1.withRetry)(() => site.actions.findOrCreatePage(ctx), { label: 'findOrCreatePage', maxRetries: opts.retryConfig.actionRetries, backoffMs: opts.retryConfig.actionBackoffMs });
        // Step 2.1: Run preflight checks if defined
        if (site.actions.preflight) {
            await site.actions.preflight(ctx);
        }
        // Step 2.2: Navigate to conversation or start new chat
        let conversationId = request.conversation_id;
        const existingConvo = conversationId
            ? await opts.conversationStore.get(conversationId)
            : null;
        if (existingConvo && site.actions.navigateToConversation) {
            await (0, retry_js_1.withRetry)(() => site.actions.navigateToConversation(ctx, existingConvo.url), { label: 'navigateToConversation', maxRetries: opts.retryConfig.actionRetries, backoffMs: opts.retryConfig.actionBackoffMs });
            const convoEntry = {
                timestamp: new Date().toISOString(),
                from: 'IDLE',
                to: 'IDLE',
                trigger: 'continue-conversation',
                details: `Resumed conversation ${conversationId}`,
            };
            await artifacts.appendTimeline(convoEntry);
            log.info({ conversationId }, 'Continuing existing conversation');
        }
        else if (site.actions.newConversation) {
            await (0, retry_js_1.withRetry)(() => site.actions.newConversation(ctx), { label: 'newConversation', maxRetries: opts.retryConfig.actionRetries, backoffMs: opts.retryConfig.actionBackoffMs });
            const newChatEntry = {
                timestamp: new Date().toISOString(),
                from: 'IDLE',
                to: 'IDLE',
                trigger: 'new-chat',
                details: 'Fresh chat loaded',
            };
            await artifacts.appendTimeline(newChatEntry);
        }
        await sleep(2000);
        // Step 2.5: Activate tool/mode if requested
        if (request.mode && site.actions.switchMode) {
            await (0, retry_js_1.withRetry)(() => site.actions.switchMode(ctx), { label: 'switchMode', maxRetries: opts.retryConfig.actionRetries, backoffMs: opts.retryConfig.actionBackoffMs });
            log.info({ mode: request.mode }, 'Mode switched');
        }
        if (request.tool && site.actions.activateTool) {
            await (0, retry_js_1.withRetry)(() => site.actions.activateTool(ctx), { label: 'activateTool', maxRetries: opts.retryConfig.actionRetries, backoffMs: opts.retryConfig.actionBackoffMs });
            log.info({ tool: request.tool }, 'Tool activated');
        }
        // Step 3: Type prompt
        await (0, retry_js_1.withRetry)(() => site.actions.typePrompt(ctx), { label: 'typePrompt', maxRetries: opts.retryConfig.actionRetries, backoffMs: opts.retryConfig.actionBackoffMs });
        sm.transition('TYPING', 'type-prompt', `Typed ${request.prompt.length} chars`);
        jobStore.updateState(jobId, 'TYPING', 'type-prompt');
        await artifacts.appendTimeline(sm.timeline[sm.timeline.length - 1]);
        // Step 4: Submit
        await sleep(500);
        await site.actions.submit(ctx);
        sm.transition('GENERATING', 'submit', 'Prompt submitted');
        jobStore.updateState(jobId, 'GENERATING', 'submit');
        await artifacts.appendTimeline(sm.timeline[sm.timeline.length - 1]);
        // Step 5: Poll for response completion
        const timeoutMs = request.timeout_ms ?? site.completion.maxWaitMs;
        const response = await pollForResponse(site, browser, request, timeoutMs, jobId, log);
        sm.transition('DONE', 'response-stable', `Response extracted (${response.length} chars)`);
        jobStore.updateState(jobId, 'DONE', 'response-stable');
        jobStore.setSubstate(jobId, null);
        const completedAt = new Date().toISOString();
        jobStore.updateTiming(jobId, { completed_at: completedAt });
        await artifacts.appendTimeline(sm.timeline[sm.timeline.length - 1]);
        // Step 5.5: Extract thinking content
        let thinking = '';
        if (site.actions.extractThinking) {
            try {
                const thinkingResult = await (0, retry_js_1.withRetry)(() => site.actions.extractThinking(ctx), { label: 'extractThinking' });
                thinking = typeof thinkingResult === 'string' ? thinkingResult : '';
                if (thinking) {
                    jobStore.setThinking(jobId, thinking);
                    log.info({ thinkingLength: thinking.length }, 'Thinking content extracted');
                }
            }
            catch {
                log.warn('Failed to extract thinking content');
            }
        }
        // Step 5.6: Deactivate tool if one was activated
        if (request.tool && site.actions.deactivateTool) {
            await site.actions.deactivateTool(ctx).catch((err) => {
                log.warn({ err: String(err) }, 'Failed to deactivate tool (non-fatal)');
            });
        }
        // Step 6: Save artifacts
        await artifacts.saveResponse(response);
        if (errors.length > 0) {
            await artifacts.saveErrors(errors);
        }
        // Compute timing
        const timing = jobStore.getJobState(jobId)?.timing;
        const totalMs = timing?.started_at
            ? Date.now() - new Date(timing.started_at).getTime()
            : undefined;
        if (timing)
            timing.total_ms = totalMs;
        // Step 7: Store conversation mapping for continuity
        if (site.actions.getCurrentUrl) {
            try {
                const urlResult = await site.actions.getCurrentUrl(ctx);
                const currentUrl = typeof urlResult === 'string' ? urlResult : browser.getCurrentUrl();
                conversationId = await opts.conversationStore.store(currentUrl, conversationId);
                log.info({ conversationId, url: currentUrl }, 'Conversation URL stored');
            }
            catch (e) {
                log.warn({ err: String(e) }, 'Failed to store conversation URL');
            }
        }
        result.status = 'done';
        result.response = response;
        result.completed_at = completedAt;
        result.thinking = thinking || undefined;
        result.timing = timing;
        result.state_history = [...sm.timeline];
        result.conversation_id = conversationId;
        // Store idempotency result on success
        if (request.idempotency_key) {
            await opts.idempotencyStore.storeResult(request.idempotency_key, request.prompt, result).catch((e) => {
                log.warn({ err: String(e) }, 'Failed to store idempotency result');
            });
        }
        log.info({ responseLength: response.length }, 'Job completed successfully');
        return result;
    }
    catch (err) {
        const shimErr = isShimError(err) ? err : index_js_3.Errors.unknown(String(err));
        errors.push(shimErr);
        await artifacts.saveErrors(errors).catch(() => { });
        sm.transition('FAILED', 'error', shimErr.message);
        jobStore.updateState(jobId, 'FAILED', 'error', shimErr.message);
        const completedAt = new Date().toISOString();
        jobStore.updateTiming(jobId, { completed_at: completedAt });
        await artifacts.appendTimeline(sm.timeline[sm.timeline.length - 1]).catch(() => { });
        result.status = 'failed';
        result.error = shimErr;
        result.completed_at = completedAt;
        result.state_history = [...sm.timeline];
        result.timing = jobStore.getJobState(jobId)?.timing;
        if (request.idempotency_key) {
            await opts.idempotencyStore.storeResult(request.idempotency_key, request.prompt, result).catch((e) => {
                log.warn({ err: String(e) }, 'Failed to store idempotency failure result');
            });
        }
        log.error({ error: shimErr.message, code: shimErr.code }, 'Job failed');
        return result;
    }
}
/**
 * Poll until the response is stable (same hash for N consecutive polls).
 */
async function pollForResponse(site, browser, request, timeoutMs, jobId, log) {
    const startTime = Date.now();
    let lastHash = '';
    let stableCount = 0;
    let lastText = '';
    let firstTokenRecorded = false;
    const { pollMs, stableCount: requiredStable } = site.completion;
    const ctx = buildActionContext(site, browser, request, log);
    log.info({ timeoutMs }, 'Polling for response...');
    // Initial wait for generation to start
    await sleep(2000);
    while (Date.now() - startTime < timeoutMs) {
        try {
            // Check if still generating
            const generating = await site.actions.isGenerating(ctx);
            const complete = await site.actions.isResponseComplete(ctx);
            // Try to extract partial response for observability
            let partialText = '';
            if (site.actions.extractPartialResponse) {
                try {
                    const partial = await site.actions.extractPartialResponse(ctx);
                    partialText = typeof partial === 'string' ? partial : '';
                }
                catch { /* ignore */ }
            }
            // Update live state with partial response
            if (partialText.length > 0) {
                jobStore.setPartialResponse(jobId, partialText);
                if (!firstTokenRecorded) {
                    firstTokenRecorded = true;
                    jobStore.updateTiming(jobId, { first_token_at: new Date().toISOString() });
                }
            }
            // Update thinking content periodically
            if (site.actions.extractThinking) {
                try {
                    const thinking = await site.actions.extractThinking(ctx);
                    if (thinking && typeof thinking === 'string')
                        jobStore.setThinking(jobId, thinking);
                }
                catch { /* ignore */ }
            }
            if (site.actions.extractProgressText) {
                try {
                    const progress = await site.actions.extractProgressText(ctx);
                    if (progress && typeof progress === 'string')
                        jobStore.setProgressText(jobId, progress);
                }
                catch { /* ignore */ }
            }
            if (complete && !generating) {
                // Response seems done — extract and check stability
                const textResult = await site.actions.extractResponse(ctx);
                const text = typeof textResult === 'string' ? textResult : '';
                const hash = hashText(text);
                if (hash === lastHash && text.length > 0) {
                    stableCount++;
                    if (stableCount >= requiredStable) {
                        log.info({ stableCount, elapsed: Date.now() - startTime }, 'Response stable');
                        return text;
                    }
                }
                else {
                    stableCount = text.length > 0 ? 1 : 0;
                    lastHash = hash;
                    lastText = text;
                }
            }
            else if (!generating && !complete) {
                // Neither generating nor complete — try extracting anyway
                try {
                    const textResult = await site.actions.extractResponse(ctx);
                    const text = typeof textResult === 'string' ? textResult : '';
                    if (text.length > 0) {
                        const hash = hashText(text);
                        if (hash === lastHash) {
                            stableCount++;
                            if (stableCount >= requiredStable) {
                                return text;
                            }
                        }
                        else {
                            stableCount = 1;
                            lastHash = hash;
                            lastText = text;
                        }
                    }
                }
                catch {
                    // Response not yet available
                }
            }
        }
        catch (err) {
            log.warn({ err: String(err) }, 'Poll cycle error');
        }
        await sleep(pollMs);
    }
    // Timeout — return whatever we have
    if (lastText.length > 0) {
        log.warn({ elapsed: Date.now() - startTime }, 'Timeout reached but have partial response');
        return lastText;
    }
    throw index_js_3.Errors.generationTimeout(Date.now() - startTime);
}
/**
 * Create and start the BullMQ worker.
 */
function createWorker(site, opts) {
    const log = (0, logger_js_1.createLogger)(site.name).child({ module: 'worker' });
    const worker = new bullmq_1.Worker(opts.queueConfig.name, async (job) => processJob(job, site, opts), {
        connection: {
            host: opts.redisConfig.host,
            port: opts.redisConfig.port,
        },
        concurrency: opts.queueConfig.concurrency,
        settings: {
            backoffStrategy: (attemptsMade) => {
                const backoffMs = opts.retryConfig.actionBackoffMs;
                return backoffMs[Math.min(attemptsMade - 1, backoffMs.length - 1)] ?? 7000;
            },
        },
    });
    worker.on('completed', (job) => {
        log.info({ jobId: job.id }, 'Job completed in queue');
    });
    worker.on('failed', (job, err) => {
        log.error({ jobId: job?.id, error: String(err) }, 'Job failed in queue');
    });
    log.info('Worker started');
    return worker;
}
/** Disconnect the shared browser adapter (for clean shutdown). */
async function disconnectBrowser() {
    if (adapter) {
        await adapter.disconnect();
        adapter = null;
    }
}
//# sourceMappingURL=index.js.map