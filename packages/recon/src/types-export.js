#!/usr/bin/env npx tsx
"use strict";
/**
 * Prints the expected SiteDefinitionResult JSON structure with field descriptions.
 * Used as a reference for Claude Code when producing analysis output.
 *
 * Usage:
 *   npx tsx packages/recon/src/types-export.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
const schema = {
    $comment: 'SiteDefinitionResult — JSON structure that Claude Code must produce after analyzing a snapshot.',
    type: 'object',
    required: ['name', 'url', 'purpose', 'category', 'selectors', 'actions', 'states', 'features', 'completion', 'stateTransitions'],
    properties: {
        name: {
            type: 'string',
            description: 'Site name derived from URL (e.g., "chatgpt", "gemini", "perplexity").',
        },
        url: {
            type: 'string',
            description: 'Base URL of the site (e.g., "https://chatgpt.com").',
        },
        purpose: {
            type: 'string',
            description: 'One-sentence description of what the site does.',
        },
        category: {
            type: 'string',
            enum: ['chat', 'search', 'code', 'image-gen', 'video-gen', 'audio-gen', 'translation', 'writing', 'other'],
            description: 'Site category.',
        },
        selectors: {
            type: 'object',
            description: 'Map of selector name → SelectorDef. Each SelectorDef has { name: string, tiers: string[] } where tiers is an array of CSS selectors ordered most-specific first.',
            additionalProperties: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Human-readable selector name (e.g., "chat-input", "submit-button").' },
                    tiers: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'CSS selectors ordered most-specific first. Runtime tries each in order, uses first visible match.',
                    },
                },
                required: ['name', 'tiers'],
            },
            example: {
                'chat-input': { name: 'chat-input', tiers: ['#prompt-textarea', 'textarea[data-id="root"]', 'div[contenteditable="true"]'] },
                'submit-button': { name: 'submit-button', tiers: ['button[data-testid="send-button"]', 'button[aria-label="Send"]'] },
            },
        },
        actions: {
            type: 'array',
            description: 'Inferred user actions the site supports.',
            items: {
                type: 'object',
                required: ['name', 'description', 'isPrimary'],
                properties: {
                    name: { type: 'string', description: 'camelCase action name (e.g., "sendMessage", "newChat", "uploadFile").' },
                    description: { type: 'string', description: 'What this action does.' },
                    inputSelector: { type: 'string', description: 'CSS selector for the input element (if applicable).' },
                    submitTrigger: { type: 'string', description: 'CSS selector or method for submission (e.g., "button.send", "Enter key").' },
                    outputSelector: { type: 'string', description: 'CSS selector where output/response appears.' },
                    completionSignal: { type: 'string', description: 'How to detect the action completed (e.g., "button re-enabled", "loading spinner gone").' },
                    isPrimary: { type: 'boolean', description: 'true if this is a core action (sendMessage), false for secondary (uploadFile).' },
                },
            },
        },
        states: {
            type: 'array',
            description: 'Observable UI states.',
            items: {
                type: 'object',
                required: ['name', 'detectionMethod', 'transitions'],
                properties: {
                    name: { type: 'string', description: 'State name (e.g., "idle", "loading", "generating", "done", "error").' },
                    detectionMethod: { type: 'string', description: 'How to detect this state (CSS selector, text content, element visibility).' },
                    indicatorSelector: { type: 'string', description: 'CSS selector that indicates this state.' },
                    transitions: { type: 'array', items: { type: 'string' }, description: 'State names this state can transition to.' },
                },
            },
        },
        features: {
            type: 'array',
            description: 'Tools, modes, or features available on the site.',
            items: {
                type: 'object',
                required: ['name', 'description'],
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    activationMethod: { type: 'string', description: 'How to activate (e.g., "click dropdown", "type /command").' },
                },
            },
        },
        completion: {
            type: 'object',
            description: 'How to detect that a response/generation is complete.',
            required: ['method', 'pollMs', 'stableCount', 'maxWaitMs'],
            properties: {
                method: { type: 'string', enum: ['hash_stability', 'selector_presence', 'network_idle'] },
                pollMs: { type: 'number', description: 'Polling interval in milliseconds (typically 500–2000).' },
                stableCount: { type: 'number', description: 'Number of consecutive stable polls before marking done (typically 3–5).' },
                maxWaitMs: { type: 'number', description: 'Maximum wait time in milliseconds (typically 120000–300000).' },
            },
        },
        stateTransitions: {
            type: 'object',
            description: 'Map of state name → array of states it can transition to.',
            additionalProperties: { type: 'array', items: { type: 'string' } },
            example: {
                idle: ['loading', 'error'],
                loading: ['generating', 'error'],
                generating: ['done', 'error'],
                done: ['idle'],
                error: ['idle'],
            },
        },
        docsSummary: {
            type: 'string',
            description: 'Optional summary of any documentation found.',
        },
    },
};
console.log(JSON.stringify(schema, null, 2));
//# sourceMappingURL=types-export.js.map