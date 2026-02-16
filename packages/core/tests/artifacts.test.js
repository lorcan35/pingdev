"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_js_1 = require("../src/artifacts/index.js");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const TEST_DIR = '/tmp/pingdev-test-artifacts';
(0, vitest_1.describe)('ArtifactLogger', () => {
    let logger;
    (0, vitest_1.beforeEach)(async () => {
        logger = new index_js_1.ArtifactLogger('test-job-123', TEST_DIR);
        await logger.init();
    });
    (0, vitest_1.afterEach)(async () => {
        await (0, promises_1.rm)(TEST_DIR, { recursive: true, force: true });
    });
    (0, vitest_1.it)('creates artifact directory', () => {
        (0, vitest_1.expect)(logger.dir).toBe((0, node_path_1.join)(TEST_DIR, 'test-job-123'));
    });
    (0, vitest_1.it)('saves request JSON', async () => {
        await logger.saveRequest({ prompt: 'Hello world' });
        const content = await (0, promises_1.readFile)((0, node_path_1.join)(logger.dir, 'request.json'), 'utf-8');
        const parsed = JSON.parse(content);
        (0, vitest_1.expect)(parsed.prompt).toBe('Hello world');
    });
    (0, vitest_1.it)('appends timeline entries', async () => {
        await logger.appendTimeline({
            timestamp: '2025-01-01T00:00:00Z',
            from: 'IDLE',
            to: 'TYPING',
            trigger: 'test',
        });
        await logger.appendTimeline({
            timestamp: '2025-01-01T00:00:01Z',
            from: 'TYPING',
            to: 'GENERATING',
            trigger: 'submit',
        });
        const content = await (0, promises_1.readFile)((0, node_path_1.join)(logger.dir, 'timeline.jsonl'), 'utf-8');
        const lines = content.trim().split('\n');
        (0, vitest_1.expect)(lines).toHaveLength(2);
    });
    (0, vitest_1.it)('saves response text', async () => {
        await logger.saveResponse('This is the response');
        const content = await (0, promises_1.readFile)((0, node_path_1.join)(logger.dir, 'response.md'), 'utf-8');
        (0, vitest_1.expect)(content).toBe('This is the response');
    });
    (0, vitest_1.it)('saves errors', async () => {
        await logger.saveErrors([{
                code: 'UNKNOWN',
                message: 'Test error',
                retryable: false,
            }]);
        const content = await (0, promises_1.readFile)((0, node_path_1.join)(logger.dir, 'errors.json'), 'utf-8');
        const parsed = JSON.parse(content);
        (0, vitest_1.expect)(parsed).toHaveLength(1);
        (0, vitest_1.expect)(parsed[0].code).toBe('UNKNOWN');
    });
});
//# sourceMappingURL=artifacts.test.js.map