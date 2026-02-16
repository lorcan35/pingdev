"use strict";
/** LLM prompt templates for site analysis. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAnalysisPrompt = buildAnalysisPrompt;
const MAX_ELEMENTS = 80;
const MAX_VISIBLE_TEXT_CHARS = 3000;
const MAX_LINKS = 40;
const SYSTEM_PROMPT = `You are an expert web UI analyst. Your job is to analyze a website snapshot and produce a structured JSON definition describing the site's purpose, interactive elements, actions, states, and features.

Respond ONLY with valid JSON matching this exact schema:

{
  "purpose": "string — what this site does",
  "category": "string — one of: chat, search, code-editor, image-gen, video-gen, audio-gen, writing, translation, data-analysis, automation, social, email, productivity, other",
  "actions": [
    {
      "name": "string — camelCase action name (e.g. sendMessage, newChat)",
      "description": "string — what this action does",
      "inputSelector": "string | null — CSS selector for the input element",
      "submitTrigger": "string | null — CSS selector or keyboard shortcut for submit",
      "outputSelector": "string | null — CSS selector where output appears",
      "completionSignal": "string | null — how to detect this action completed",
      "isPrimary": "boolean — is this a core/primary action?"
    }
  ],
  "states": [
    {
      "name": "string — state name (idle, loading, generating, done, error)",
      "detectionMethod": "string — how to detect this state (selector, text, attribute)",
      "indicatorSelector": "string | null — CSS selector for the state indicator",
      "transitions": ["string — state names this can transition to"]
    }
  ],
  "features": [
    {
      "name": "string — feature name",
      "description": "string — what this feature does",
      "activationMethod": "string | null — how to activate it"
    }
  ],
  "completion": {
    "method": "hash_stability | selector_presence | network_idle",
    "pollMs": "number — poll interval in ms (200-1000)",
    "stableCount": "number — how many stable polls before done (2-5)",
    "maxWaitMs": "number — max wait time in ms (30000-120000)"
  },
  "selectors": {
    "selectorName": {
      "tiers": ["string — CSS selectors from most specific to least specific"]
    }
  }
}

Guidelines:
- Use the most stable, specific CSS selectors available (prefer aria, data-*, id over fragile class names).
- For selectors, provide 2-3 tiers: best selector first, fallback selectors after.
- Identify ALL interactive actions available on the page.
- States should cover the full lifecycle: idle → active → done/error.
- For chat-like sites, the primary action is sending a message. The completion signal is typically when the response finishes streaming.
- Be precise about selectors — use the exact selectors from the snapshot data.
- Do NOT invent selectors that aren't supported by the snapshot data.`;
/** Build the analysis prompt messages from a snapshot and optional docs. */
function buildAnalysisPrompt(snapshot, docs) {
    const userContent = buildUserMessage(snapshot, docs);
    return [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
    ];
}
function buildUserMessage(snapshot, docs) {
    const sections = [];
    // Header
    sections.push(`# Site Analysis Request\n`);
    sections.push(`**URL:** ${snapshot.url}`);
    sections.push(`**Title:** ${snapshot.title}`);
    if (snapshot.meta.description) {
        sections.push(`**Description:** ${snapshot.meta.description}`);
    }
    // Elements
    const elements = snapshot.elements.slice(0, MAX_ELEMENTS);
    sections.push(`\n## Interactive Elements (${elements.length} of ${snapshot.elements.length})\n`);
    for (const el of elements) {
        const parts = [`- **${el.name}** (${el.type})`];
        if (el.role)
            parts.push(`role="${el.role}"`);
        if (el.label)
            parts.push(`label="${el.label}"`);
        if (el.placeholder)
            parts.push(`placeholder="${el.placeholder}"`);
        if (el.states.length)
            parts.push(`states=[${el.states.join(',')}]`);
        if (el.regionName)
            parts.push(`region="${el.regionName}"`);
        const selectors = [];
        if (el.ariaSelectors.length)
            selectors.push(el.ariaSelectors[0]);
        if (el.cssSelectors.length)
            selectors.push(el.cssSelectors[0]);
        if (selectors.length)
            parts.push(`selectors=[${selectors.join(' | ')}]`);
        sections.push(parts.join(' '));
    }
    // Regions
    if (snapshot.regions.length > 0) {
        sections.push(`\n## Page Regions\n`);
        for (const r of snapshot.regions) {
            sections.push(`- **${r.name}** (${r.role}) — ${r.elementIds.length} elements`);
        }
    }
    // Dynamic areas
    if (snapshot.dynamicAreas.length > 0) {
        sections.push(`\n## Dynamic Content Areas\n`);
        for (const da of snapshot.dynamicAreas) {
            sections.push(`- **${da.name}** (${da.contentType}) selector="${da.selector}" hints=[${da.mutationHints.join(',')}]`);
        }
    }
    // Visible text (truncated)
    const visibleText = snapshot.visibleText.join('\n');
    if (visibleText.length > 0) {
        const truncated = visibleText.length > MAX_VISIBLE_TEXT_CHARS
            ? visibleText.slice(0, MAX_VISIBLE_TEXT_CHARS) + '\n...(truncated)'
            : visibleText;
        sections.push(`\n## Visible Text\n\`\`\`\n${truncated}\n\`\`\``);
    }
    // Links
    const links = snapshot.links.slice(0, MAX_LINKS);
    if (links.length > 0) {
        sections.push(`\n## Links (${links.length} of ${snapshot.links.length})\n`);
        for (const link of links) {
            sections.push(`- [${link.text || '(no text)'}](${link.href})${link.isInternal ? ' (internal)' : ''}`);
        }
    }
    // Documentation
    if (docs && (docs.apiDocs.length > 0 || docs.helpPages.length > 0)) {
        sections.push(`\n## Documentation Summary\n`);
        if (docs.apiDocs.length > 0) {
            sections.push(`### API Docs\n${docs.apiDocs.join('\n\n').slice(0, 1500)}`);
        }
        if (docs.helpPages.length > 0) {
            sections.push(`### Help Pages\n${docs.helpPages.join('\n\n').slice(0, 1500)}`);
        }
        if (docs.constraints.length > 0) {
            sections.push(`### Constraints\n${docs.constraints.join('\n')}`);
        }
    }
    sections.push(`\nAnalyze this site and respond with the JSON definition.`);
    return sections.join('\n');
}
//# sourceMappingURL=prompts.js.map