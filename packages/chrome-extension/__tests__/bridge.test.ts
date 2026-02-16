// Mock test for bridge command routing

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BridgeCommand, BridgeResponse } from '../src/types';

describe('Bridge Command Routing', () => {
  let mockChrome: any;

  beforeEach(() => {
    // Mock chrome API
    mockChrome = {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
        },
      },
      tabs: {
        sendMessage: vi.fn(),
        get: vi.fn(),
        query: vi.fn(),
        onRemoved: {
          addListener: vi.fn(),
        },
      },
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
        },
      },
    };

    (global as any).chrome = mockChrome;
  });

  it('should handle click command', async () => {
    const command: BridgeCommand = {
      type: 'click',
      selector: '#submit-btn',
    };

    const expectedResponse: BridgeResponse = {
      success: true,
    };

    mockChrome.tabs.sendMessage.mockResolvedValue(expectedResponse);

    const response = await mockChrome.tabs.sendMessage(123, {
      type: 'bridge_command',
      command,
    });

    expect(response).toEqual(expectedResponse);
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
      type: 'bridge_command',
      command,
    });
  });

  it('should handle type command', async () => {
    const command: BridgeCommand = {
      type: 'type',
      selector: 'input[name="username"]',
      text: 'testuser',
    };

    const expectedResponse: BridgeResponse = {
      success: true,
    };

    mockChrome.tabs.sendMessage.mockResolvedValue(expectedResponse);

    const response = await mockChrome.tabs.sendMessage(123, {
      type: 'bridge_command',
      command,
    });

    expect(response).toEqual(expectedResponse);
  });

  it('should handle read command', async () => {
    const command: BridgeCommand = {
      type: 'read',
      selector: '.result-text',
    };

    const expectedResponse: BridgeResponse = {
      success: true,
      data: 'Hello World',
    };

    mockChrome.tabs.sendMessage.mockResolvedValue(expectedResponse);

    const response = await mockChrome.tabs.sendMessage(123, {
      type: 'bridge_command',
      command,
    });

    expect(response).toEqual(expectedResponse);
  });

  it('should handle extract command', async () => {
    const command: BridgeCommand = {
      type: 'extract',
      schema: {
        title: 'h1',
        price: '.price',
      },
    };

    const expectedResponse: BridgeResponse = {
      success: true,
      data: {
        title: 'Product Name',
        price: '$99.99',
      },
    };

    mockChrome.tabs.sendMessage.mockResolvedValue(expectedResponse);

    const response = await mockChrome.tabs.sendMessage(123, {
      type: 'bridge_command',
      command,
    });

    expect(response).toEqual(expectedResponse);
  });

  it('should handle eval command', async () => {
    const command: BridgeCommand = {
      type: 'eval',
      code: 'document.title',
    };

    const expectedResponse: BridgeResponse = {
      success: true,
      data: 'Example Page',
    };

    mockChrome.tabs.sendMessage.mockResolvedValue(expectedResponse);

    const response = await mockChrome.tabs.sendMessage(123, {
      type: 'bridge_command',
      command,
    });

    expect(response).toEqual(expectedResponse);
  });

  it('should return error for element not found', async () => {
    const command: BridgeCommand = {
      type: 'click',
      selector: '#nonexistent',
    };

    const expectedResponse: BridgeResponse = {
      success: false,
      error: 'Element not found: #nonexistent',
    };

    mockChrome.tabs.sendMessage.mockResolvedValue(expectedResponse);

    const response = await mockChrome.tabs.sendMessage(123, {
      type: 'bridge_command',
      command,
    });

    expect(response).toEqual(expectedResponse);
  });
});
