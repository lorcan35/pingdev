import { useCallback, useReducer } from 'react';
import type { AiTier, ChatMessage, ActionCardData } from '@/components/chat/types';

interface ChatState {
  messages: ChatMessage[];
  loading: boolean;
  activeTier: AiTier;
}

type ChatAction =
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_TIER'; tier: AiTier };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_TIER':
      return { ...state, activeTier: action.tier };
    default:
      return state;
  }
}

function makeId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateMockResponse(text: string): {
  content: string;
  tier: AiTier;
  cards?: ActionCardData[];
} {
  const lower = text.toLowerCase();

  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return {
      content: "Hey! I'm TinkerChat, your AI assistant. What can I help with?",
      tier: 'local',
    };
  }

  if (lower.includes('aliexpress') || lower.includes('search')) {
    return {
      content: 'Found **3 ESP32 boards** on AliExpress. Here are the top results:',
      tier: 'browser',
      cards: [
        {
          title: 'ESP32-S3 DevKit-C N16R8',
          description: '$4.20 — WiFi + BLE, 16MB Flash, 8MB PSRAM. Ships in 5 days.',
          buttons: [
            { label: 'View', icon: '👁' },
            { label: 'Add to Cart', icon: '🛒' },
            { label: 'Open in Browser', icon: '🌐' },
          ],
        },
        {
          title: 'ESP32-C6 Mini Module',
          description: '$3.80 — WiFi 6 + BLE 5, Thread/Zigbee, USB-C. Ships in 3 days.',
          buttons: [
            { label: 'View', icon: '👁' },
            { label: 'Add to Cart', icon: '🛒' },
            { label: 'Open in Browser', icon: '🌐' },
          ],
        },
        {
          title: 'ESP32-P4 Preview Board',
          description: '$12.50 — Dual-core RISC-V, MIPI-DSI, 32MB PSRAM. Pre-order.',
          buttons: [
            { label: 'View', icon: '👁' },
            { label: 'Add to Cart', icon: '🛒' },
            { label: 'Open in Browser', icon: '🌐' },
          ],
        },
      ],
    };
  }

  if (lower.includes('weather')) {
    return {
      content: "I don't have weather data yet, but I will soon!",
      tier: 'cloud',
    };
  }

  if (lower.includes('claude')) {
    return {
      content:
        'Claude integration is on the way! Soon I\'ll route complex questions through **Claude** for deeper reasoning. For now, I handle things locally.',
      tier: 'cloud',
    };
  }

  if (lower.includes('screenshot')) {
    return {
      content:
        'Screenshot captured! (This will save to your gallery once the camera module is connected.)',
      tier: 'local',
    };
  }

  if (lower.includes('youtube')) {
    return {
      content:
        'Opening YouTube in the browser app... (Browser integration coming in the next update!)',
      tier: 'browser',
    };
  }

  return {
    content: `I heard you! AI integration coming soon. You said: *${text}*`,
    tier: 'local',
  };
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Welcome to TinkerChat! \uD83D\uDC4B I'm your AI assistant. I can help you search, browse, control apps, and more. Try saying 'search AliExpress for ESP32' or just ask me anything.",
  tier: 'local',
  timestamp: Date.now(),
};

export function useChatStore() {
  const [state, dispatch] = useReducer(chatReducer, {
    messages: [WELCOME_MESSAGE],
    loading: false,
    activeTier: 'local' as AiTier,
  });

  const sendMessage = useCallback((text: string) => {
    // Add user message
    const userMsg: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    dispatch({ type: 'ADD_MESSAGE', message: userMsg });
    dispatch({ type: 'SET_LOADING', loading: true });

    // Generate response
    const response = generateMockResponse(text);
    dispatch({ type: 'SET_TIER', tier: response.tier });

    // Fake AI delay (1-2 seconds)
    const delay = 1000 + Math.random() * 1000;
    setTimeout(() => {
      const aiMsg: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        content: response.content,
        tier: response.tier,
        timestamp: Date.now(),
        cards: response.cards,
      };
      dispatch({ type: 'ADD_MESSAGE', message: aiMsg });
      dispatch({ type: 'SET_LOADING', loading: false });
    }, delay);
  }, []);

  return {
    messages: state.messages,
    loading: state.loading,
    activeTier: state.activeTier,
    sendMessage,
  };
}
