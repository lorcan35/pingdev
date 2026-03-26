import type { SelectorDef } from '@pingdev/core';

export const selectors: Record<string, SelectorDef> = {
  'chat-input': {
    name: 'chat-input',
    tiers: [
      'textarea[aria-label="Enter a prompt"]',
      'textarea.cdk-textarea-autosize.textarea',
    ],
  },
  'submit-button': {
    name: 'submit-button',
    tiers: [
      'button[type="submit"].ctrl-enter-submits',
      'button.ctrl-enter-submits',
      'button[type="submit"]',
    ],
  },
  'new-chat': {
    name: 'new-chat',
    tiers: [
      'button[aria-label="New chat"]',
    ],
  },
  'model-picker': {
    name: 'model-picker',
    tiers: [
      'button.model-selector-card',
    ],
  },
  'system-instructions': {
    name: 'system-instructions',
    tiers: [
      'button[aria-label="System instructions"]',
      'button.system-instructions-card',
    ],
  },
  'tools-button': {
    name: 'tools-button',
    tiers: [
      'button[aria-label="Open tools menu"]',
    ],
  },
  'add-media': {
    name: 'add-media',
    tiers: [
      '[data-test-id="add-media-button"]',
      'button[aria-label="Insert images, videos, audio, or files"]',
    ],
  },
  'toggle-nav': {
    name: 'toggle-nav',
    tiers: [
      'button[aria-label="Toggle navigation menu"]',
    ],
  },
  'more-actions': {
    name: 'more-actions',
    tiers: [
      'button[aria-label="View more actions"]',
    ],
  },
  'temporary-chat': {
    name: 'temporary-chat',
    tiers: [
      'button[aria-label="Temporary chat toggle"]',
    ],
  },
  'share-prompt': {
    name: 'share-prompt',
    tiers: [
      'button[aria-label="Share prompt"]',
    ],
  },
  'get-code': {
    name: 'get-code',
    tiers: [
      '#getCodeBtn',
      'button[aria-label="Get code"]',
    ],
  },
  'reset-settings': {
    name: 'reset-settings',
    tiers: [
      '#resetSettingsBtn',
      'button[aria-label="Reset default settings"]',
    ],
  },
  'close-settings': {
    name: 'close-settings',
    tiers: [
      'button[aria-label="Close run settings panel"]',
    ],
  },
  'settings-menu': {
    name: 'settings-menu',
    tiers: [
      '[data-test-id="settings-menu"]',
    ],
  },
  'response-container': {
    name: 'response-container',
    tiers: [
      '.model-response-text',
      '[class*="markdown"]',
      '.response-container',
    ],
  },
  'stop-button': {
    name: 'stop-button',
    tiers: [
      'button[aria-label="Stop response"]',
      'button[aria-label="Stop"]',
    ],
  },
  'thinking-level': {
    name: 'thinking-level',
    tiers: [
      '[role="combobox"][aria-label="Thinking Level"]',
      'mat-select[aria-label="Thinking Level"]',
    ],
  },
  'temperature-slider': {
    name: 'temperature-slider',
    tiers: [
      'input.mdc-slider__input',
    ],
  },
  'temperature-input': {
    name: 'temperature-input',
    tiers: [
      'input.slider-number-input',
    ],
  },
  'media-resolution': {
    name: 'media-resolution',
    tiers: [
      '[role="combobox"][aria-label="Media resolution"]',
      'mat-select[aria-label="Media resolution"]',
    ],
  },
  'structured-outputs-toggle': {
    name: 'structured-outputs-toggle',
    tiers: [
      '[role="switch"][aria-label="Structured outputs"]',
      'button[aria-label="Structured outputs"]',
    ],
  },
  'code-execution-toggle': {
    name: 'code-execution-toggle',
    tiers: [
      '[role="switch"][aria-label="Code execution"]',
      'button[aria-label="Code execution"]',
    ],
  },
  'function-calling-toggle': {
    name: 'function-calling-toggle',
    tiers: [
      '[role="switch"][aria-label="Function calling"]',
      'button[aria-label="Function calling"]',
    ],
  },
  'grounding-toggle': {
    name: 'grounding-toggle',
    tiers: [
      '[role="switch"][aria-label="Grounding with Google Search"]',
      'button[aria-label="Grounding with Google Search"]',
    ],
  },
  'url-context-toggle': {
    name: 'url-context-toggle',
    tiers: [
      '[role="switch"][aria-label="Browse the url context"]',
      'button[aria-label="Browse the url context"]',
    ],
  },
  'remove-grounding': {
    name: 'remove-grounding',
    tiers: [
      'button[aria-label="Remove Grounding with Google Search"]',
    ],
  },
  'edit-json-schema': {
    name: 'edit-json-schema',
    tiers: [
      '[data-test-id="editJsonSchemaButton"]',
      'button[aria-label="Edit JSON schema"]',
    ],
  },
  'edit-function-declarations': {
    name: 'edit-function-declarations',
    tiers: [
      'button[aria-label="Edit function declarations"]',
      'button.edit-function-declarations-button',
    ],
  },
  'expand-tools': {
    name: 'expand-tools',
    tiers: [
      'button[aria-label="Expand or collapse tools"]',
    ],
  },
  'expand-advanced': {
    name: 'expand-advanced',
    tiers: [
      'button[aria-label="Expand or collapse advanced settings"]',
    ],
  },
  'no-api-key': {
    name: 'no-api-key',
    tiers: [
      'button[aria-label="No API key selected"]',
      'button.paid-api-key-button',
    ],
  },
  'api-key-card': {
    name: 'api-key-card',
    tiers: [
      'button[aria-label="No API Key"]',
      'button.paid-api-key-card',
    ],
  },
  'account-button': {
    name: 'account-button',
    tiers: [
      '[role="button"][aria-label*="Google Account"]',
      'div.button-container',
    ],
  },
  'home-link': {
    name: 'home-link',
    tiers: [
      'a.logo-link',
      'a[href="/"]',
    ],
  },
  'playground-link': {
    name: 'playground-link',
    tiers: [
      'a.playground-link',
      'a[href="/prompts/new_chat"]',
    ],
  },
  'home-search': {
    name: 'home-search',
    tiers: [
      '[role="combobox"][aria-label="Home"]',
      'input[placeholder="Start a chat or vibe code an app"]',
    ],
  },
};
