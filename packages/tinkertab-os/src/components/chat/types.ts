export type AiTier = 'local' | 'browser' | 'cloud';

export interface ActionButton {
  label: string;
  icon?: string;
  onClick?: () => void;
}

export interface ActionCardData {
  title: string;
  description: string;
  imageUrl?: string;
  buttons: ActionButton[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tier?: AiTier;
  timestamp: number;
  cards?: ActionCardData[];
}

export const TIER_CONFIG: Record<AiTier, { label: string; emoji: string; color: string }> = {
  local: { label: 'Local', emoji: '🧠', color: 'text-emerald-500' },
  browser: { label: 'PingApp', emoji: '🌐', color: 'text-cyan-500' },
  cloud: { label: 'Cloud', emoji: '☁️', color: 'text-violet-500' },
};
