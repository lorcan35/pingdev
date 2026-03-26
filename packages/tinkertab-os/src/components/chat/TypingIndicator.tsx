import { AiTier, TIER_CONFIG } from './types';

interface TypingIndicatorProps {
  tier?: AiTier;
}

export default function TypingIndicator({ tier = 'cloud' }: TypingIndicatorProps) {
  const config = TIER_CONFIG[tier];

  return (
    <div className="flex items-start gap-2 px-4 py-2 animate-fade-in">
      <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[280px]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
          <span className={`text-xs ${config.color}`}>
            {config.emoji} {config.label} is thinking...
          </span>
        </div>
      </div>
    </div>
  );
}
