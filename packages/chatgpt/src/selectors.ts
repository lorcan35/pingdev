import type { SelectorDef } from '@pingdev/core';

export const selectors: Record<string, SelectorDef> = {
  'chat-input': {
    name: 'chat-input',
    tiers: [
      '#prompt-textarea',
      '[id="prompt-textarea"]',
      'div[contenteditable="true"][id="prompt-textarea"]',
      'textarea[data-id="root"]',
    ],
  },
  'send-button': {
    name: 'send-button',
    tiers: [
      '[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[data-testid="send-button"]',
      'form button[type="button"]:has(svg)',
    ],
  },
  'stop-button': {
    name: 'stop-button',
    tiers: [
      '[data-testid="stop-button"]',
      'button[aria-label="Stop generating"]',
      'button[aria-label="Stop streaming"]',
    ],
  },
  'response-container': {
    name: 'response-container',
    tiers: [
      '[data-message-author-role="assistant"]',
      'div.agent-turn',
      'div[class*="markdown"]',
      '.message-content',
    ],
  },
  'model-selector': {
    name: 'model-selector',
    tiers: [
      '[data-testid="model-selector-dropdown"]',
      'button[aria-haspopup="menu"][class*="model"]',
      'button[class*="model-switcher"]',
    ],
  },
  'new-chat': {
    name: 'new-chat',
    tiers: [
      'a[href="/"]',
      'nav a[href="/"]',
      'button[data-testid="create-new-chat-button"]',
    ],
  },
  'conversation-list': {
    name: 'conversation-list',
    tiers: [
      'nav[aria-label="Chat history"]',
      'nav ol',
      'nav ul',
    ],
  },
  'conversation-item': {
    name: 'conversation-item',
    tiers: [
      'nav a[href*="/c/"]',
      'nav li a[href*="/c/"]',
      'a[href^="/c/"]',
    ],
  },
  'file-upload': {
    name: 'file-upload',
    tiers: [
      'input[type="file"]',
      '[data-testid="file-upload"]',
    ],
  },
  'attach-button': {
    name: 'attach-button',
    tiers: [
      'button[aria-label="Attach files"]',
      'button[aria-label="Upload file"]',
      'button[aria-label="Add photos"]',
    ],
  },
  'create-image': {
    name: 'create-image',
    tiers: [
      '[data-testid="composer-button-create-image"]',
      'button[aria-label="Create image"]',
    ],
  },
  'voice-button': {
    name: 'voice-button',
    tiers: [
      '[data-testid="composer-speech-button"]',
      'button[aria-label="Start Voice"]',
      'button[aria-label="Voice input"]',
    ],
  },
  'search-button': {
    name: 'search-button',
    tiers: [
      '[data-testid="composer-button-search"]',
      'button[aria-label="Search"]',
      'button[aria-label="Search the web"]',
    ],
  },
  'login-button': {
    name: 'login-button',
    tiers: [
      '[data-testid="login-button"]',
      'button:has-text("Log in")',
    ],
  },
  'profile-menu': {
    name: 'profile-menu',
    tiers: [
      'button[data-testid="profile-button"]',
      'img[alt="User"]',
      'button[aria-label="Open Profile Menu"]',
    ],
  },
  'sidebar-toggle': {
    name: 'sidebar-toggle',
    tiers: [
      'button[aria-label="Open sidebar"]',
      'button[aria-label="Close sidebar"]',
      'button[data-testid="sidebar-toggle"]',
    ],
  },
  'thinking-indicator': {
    name: 'thinking-indicator',
    tiers: [
      '[data-testid="thinking-indicator"]',
      '[class*="thinking"]',
      '[class*="Thinking"]',
      'span:has-text("Thinking")',
    ],
  },
  'reasoning-content': {
    name: 'reasoning-content',
    tiers: [
      '[data-testid="reasoning-content"]',
      '[class*="reasoning"]',
      'details[class*="thought"]',
    ],
  },
};
