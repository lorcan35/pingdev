import { ChatMessage, TIER_CONFIG } from './types';
import ActionCard from './ActionCard';

interface MessageBubbleProps {
  message: ChatMessage;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Minimal markdown: **bold**, *italic*, `code`, and newlines. */
function renderContent(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="bg-zinc-700 px-1 py-0.5 rounded text-xs font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    // Handle newlines
    return part.split('\n').map((line, j, arr) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < arr.length - 1 && <br />}
      </span>
    ));
  });
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex flex-col px-4 py-1 animate-fade-in ${
        isUser ? 'items-end' : 'items-start'
      }`}
    >
      {/* Tier badge for AI messages */}
      {!isUser && message.tier && (
        <div className="flex items-center gap-1 mb-1 ml-1">
          <span className={`text-[10px] font-medium ${TIER_CONFIG[message.tier].color}`}>
            {TIER_CONFIG[message.tier].emoji} {TIER_CONFIG[message.tier].label}
          </span>
        </div>
      )}

      {/* Bubble */}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-cyan-600 text-white rounded-br-sm'
            : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{renderContent(message.content)}</div>

        {/* Action cards */}
        {message.cards?.map((card, i) => (
          <ActionCard key={i} card={card} />
        ))}
      </div>

      {/* Timestamp */}
      <span className="text-[10px] text-zinc-500 mt-1 px-1">{formatTime(message.timestamp)}</span>
    </div>
  );
}
