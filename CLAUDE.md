# PingDev — Claude Code Integration

You are acting as the **analysis stage** of PingDev's recon pipeline. The pipeline is:

1. **Snapshot** (automated) — captures interactive elements, regions, ARIA tree, dynamic areas
2. **Analyze** (you) — read the snapshot JSON, produce a `SiteDefinitionResult` JSON
3. **Generate** (automated) — scaffolds a complete PingApp TypeScript project

No external LLM is needed — you ARE the analyzer.

## Quick Reference

### Step 1: Capture a snapshot

```bash
bin/pingdev-snapshot <url> --output /tmp/<site>-snapshot.json
```

This runs the SnapshotEngine against a live browser (CDP) and writes clean JSON with base64 screenshots stripped.

### Step 2: Analyze the snapshot (your job)

Read the snapshot JSON file. Focus on:

- **Purpose**: What does this site do? (chat, search, code, image generation, etc.)
- **Actions**: What can a user do? Map each to input selectors, submit triggers, output areas
- **Selectors**: Build tiered CSS selectors (most specific first) for every interactive element
- **States**: What observable states does the UI have? (idle, loading, generating, done, error)
- **Completion signals**: How do you know a response is done? (hash stability is preferred for streaming sites)

From the snapshot, pay attention to:
- `elements[]` — interactive elements with their CSS/ARIA/XPath selectors and confidence scores
- `dynamicAreas[]` — where content changes (response output, loading indicators)
- `ariaTree[]` — accessibility structure for understanding page semantics
- `regions[]` — page layout (header, main, sidebar, etc.)
- `visibleText[]` — visible text for understanding labels and state indicators

### Step 3: Produce a SiteDefinitionResult JSON

Write the analysis to a JSON file (e.g., `/tmp/<site>-definition.json`). The exact schema:

```bash
npx tsx packages/recon/src/types-export.ts
```

Key structure:

```jsonc
{
  "name": "chatgpt",                    // derived from URL
  "url": "https://chatgpt.com",
  "purpose": "AI chat assistant",
  "category": "chat",                   // chat|search|code|image-gen|...
  "selectors": {
    "chat-input": {
      "name": "chat-input",
      "tiers": ["#prompt-textarea", "textarea[data-id=\"root\"]"]  // most specific first
    }
  },
  "actions": [{
    "name": "sendMessage",              // camelCase
    "description": "Send a chat message",
    "inputSelector": "#prompt-textarea",
    "submitTrigger": "button[data-testid=\"send-button\"]",
    "outputSelector": "div.markdown",
    "completionSignal": "hash_stability on response container",
    "isPrimary": true
  }],
  "states": [{
    "name": "idle",
    "detectionMethod": "send button enabled, no loading spinner",
    "indicatorSelector": "button[data-testid=\"send-button\"]",
    "transitions": ["loading"]
  }],
  "features": [{
    "name": "file-upload",
    "description": "Upload files to the conversation",
    "activationMethod": "click attachment button"
  }],
  "completion": {
    "method": "hash_stability",         // preferred for streaming
    "pollMs": 1000,
    "stableCount": 3,
    "maxWaitMs": 120000
  },
  "stateTransitions": {
    "idle": ["loading"],
    "loading": ["generating", "error"],
    "generating": ["done", "error"],
    "done": ["idle"],
    "error": ["idle"]
  }
}
```

### Step 4: Generate the PingApp

```bash
npx tsx packages/recon/src/generate-cli.ts \
  --config /tmp/<site>-definition.json \
  --output ~/projects/<site>-shim
```

This scaffolds a complete TypeScript PingApp project with selectors, state machine, action handlers, tests, and README. It runs a self-test (tsc --noEmit) and auto-fixes common issues.

### Step 5: Verify and fix

1. Check the generated code compiles: `cd ~/projects/<site>-shim && npx tsc --noEmit`
2. Review generated action handlers in `src/actions/` — fill in TODO stubs with real logic
3. Run tests: `npm test`

## Selector Best Practices

- **Tiered fallback**: Always provide 2-3 selectors per element, most specific first
- **Prefer**: `data-testid`, `aria-label`, unique IDs
- **Avoid**: fragile class names, deep nesting, index-based selectors
- Runtime tries each tier in order and uses the first visible match

## Architecture Notes

- Source: `packages/recon/src/` (TypeScript, commonjs, .js extensions in imports)
- Types: `packages/recon/src/types.ts` — `SiteDefinitionResult`, `SiteSnapshot`, etc.
- Core types: `packages/core/src/types.ts` — `SelectorDef`, `ActionHandler`, `ActionContext`
- Generator: `packages/recon/src/generator/generator.ts` — `PingAppGenerator`
- Self-test: `packages/recon/src/generator/self-test.ts` — `SelfTester`
