import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        include: [
            'packages/*/tests/**/*.test.ts',
            'packages/*/src/__tests__/**/*.test.ts',
        ],
        testTimeout: 30_000,
    },
});
//# sourceMappingURL=vitest.config.mjs.map