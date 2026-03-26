/**
 * Gemini UI Selector Registry v1
 *
 * Tiered selector strategy:
 * - Tier 1: ARIA role+name (most stable, from accessibility snapshots)
 * - Tier 2: data-test-id attributes
 * - Tier 3: CSS class / partial attribute fallbacks
 *
 * Each action has 2+ independent selector paths.
 * ARIA ref numbers (eNN) change per page load — never rely on them.
 */

import type { SelectorDef } from '@pingdev/core';
export type { SelectorDef };

/** Core chat controls — always needed. */
export const CHAT_INPUT: SelectorDef = {
  name: 'chat-input',
  tiers: [
    // Tier 1: ARIA role+name (observed on ULTRA account)
    'role=textbox[name="Enter a prompt for Gemini"]',
    // Tier 1 alt: placeholder variant seen on ULTRA
    'role=textbox[name=/Ask Gemini/i]',
    // Tier 1 alt: tool-specific placeholder variants
    'role=textbox[name=/What do you want to research/i]',
    'role=textbox[name=/Describe your video/i]',
    'role=textbox[name=/Describe your image/i]',
    'role=textbox[name=/Let.*write or build together/i]',
    'role=textbox[name=/What do you want to learn/i]',
    'role=textbox[name=/Ask a complex question/i]',
    // Tier 3: CSS fallback
    '.ql-editor[contenteditable="true"]',
    '[aria-label="Enter a prompt here"]',
  ],
};

export const NEW_CHAT: SelectorDef = {
  name: 'new-chat',
  tiers: [
    'role=link[name="New chat"]',
    'a[href="/app"]',
    'button[aria-label*="New chat"]',
  ],
};

export const TOOLS_BUTTON: SelectorDef = {
  name: 'tools-button',
  tiers: [
    'role=button[name="Tools"]',
    'button[aria-label="Tools"]',
  ],
};

export const MODE_PICKER: SelectorDef = {
  name: 'mode-picker',
  tiers: [
    'role=button[name="Open mode picker"]',
    'button[aria-label="Open mode picker"]',
  ],
};

export const MAIN_MENU: SelectorDef = {
  name: 'main-menu',
  tiers: [
    'role=button[name="Main menu"]',
    'button[aria-label="Main menu"]',
  ],
};

export const ACCOUNT_BUTTON: SelectorDef = {
  name: 'account-button',
  tiers: [
    'role=button[name=/Google Account.*emilesawayame/i]',
    'button[aria-label*="Google Account"]',
  ],
};

/** Response detection selectors. */
export const STOP_BUTTON: SelectorDef = {
  name: 'stop-response',
  tiers: [
    'role=button[name="Stop response"]',
    'button[aria-label="Stop response"]',
  ],
};

export const GOOD_RESPONSE: SelectorDef = {
  name: 'good-response',
  tiers: [
    'role=button[name="Good response"]',
    'button[aria-label="Good response"]',
  ],
};

/** Model response text containers — used for extracting Gemini's reply. */
export const RESPONSE_CONTAINER: SelectorDef = {
  name: 'response-container',
  tiers: [
    // The last message-content container holds the latest response
    '.model-response-text',
    '[data-test-id="conversation"]',
  ],
};

/** Tool menu items (menuitemcheckbox labels). */
export const TOOL_MENU_ITEMS: Record<string, SelectorDef> = {
  deep_research: {
    name: 'tool-deep-research',
    tiers: [
      'role=menuitemcheckbox[name="Deep Research"]',
      'menuitemcheckbox[aria-label="Deep Research"]',
    ],
  },
  create_videos: {
    name: 'tool-create-videos',
    tiers: [
      'role=menuitemcheckbox[name=/Create videos/i]',
      'menuitemcheckbox[aria-label*="Create videos"]',
    ],
  },
  create_images: {
    name: 'tool-create-images',
    tiers: [
      'role=menuitemcheckbox[name="Create images"]',
      'menuitemcheckbox[aria-label="Create images"]',
    ],
  },
  canvas: {
    name: 'tool-canvas',
    tiers: [
      'role=menuitemcheckbox[name="Canvas"]',
      'menuitemcheckbox[aria-label="Canvas"]',
    ],
  },
  guided_learning: {
    name: 'tool-guided-learning',
    tiers: [
      'role=menuitemcheckbox[name="Guided Learning"]',
      'menuitemcheckbox[aria-label="Guided Learning"]',
    ],
  },
  deep_think: {
    name: 'tool-deep-think',
    tiers: [
      'role=menuitemcheckbox[name="Deep Think"]',
      'menuitemcheckbox[aria-label="Deep Think"]',
    ],
  },
};

/** Tool deselect chips (appear near input when a tool is active). */
export const TOOL_DESELECT_CHIPS: Record<string, SelectorDef> = {
  deep_research: {
    name: 'deselect-deep-research',
    tiers: ['role=button[name="Deselect Deep Research"]'],
  },
  create_videos: {
    name: 'deselect-video',
    tiers: ['role=button[name="Deselect Video"]'],
  },
  create_images: {
    name: 'deselect-image',
    tiers: ['role=button[name="Deselect Image"]'],
  },
  canvas: {
    name: 'deselect-canvas',
    tiers: ['role=button[name="Deselect Canvas"]'],
  },
  guided_learning: {
    name: 'deselect-guided-learning',
    tiers: ['role=button[name="Deselect Guided Learning"]'],
  },
  deep_think: {
    name: 'deselect-deep-think',
    tiers: ['role=button[name="Deselect Deep Think"]'],
  },
};

/** Mode picker radio items. */
export const MODE_ITEMS: Record<string, SelectorDef> = {
  fast: {
    name: 'mode-fast',
    tiers: ['role=menuitemradio[name=/^Fast/i]'],
  },
  thinking: {
    name: 'mode-thinking',
    tiers: ['role=menuitemradio[name=/^Thinking/i]'],
  },
  pro: {
    name: 'mode-pro',
    tiers: ['role=menuitemradio[name=/^Pro /i]'],
  },
};
