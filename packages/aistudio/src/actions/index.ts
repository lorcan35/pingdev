import type { ActionHandler } from '@pingdev/core';

import { sendMessage } from './send-message.js';
import { newConversation } from './new-conversation.js';
import { switchModel } from './switch-model.js';
import { setSystemInstructions } from './set-system-instructions.js';
import { toggleTool } from './toggle-tool.js';
import { setThinkingLevel } from './set-thinking-level.js';
import { setTemperature } from './set-temperature.js';
import { addMedia } from './add-media.js';
import { getCode } from './get-code.js';
import { stopGeneration } from './stop-generation.js';

export const actions: Record<string, ActionHandler> = {
  sendMessage,
  newConversation,
  switchModel,
  setSystemInstructions,
  toggleTool,
  setThinkingLevel,
  setTemperature,
  addMedia,
  getCode,
  stopGeneration,
};
