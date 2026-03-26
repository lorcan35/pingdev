import { useState, useRef, useCallback } from 'react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

const QUICK_ACTIONS = [
  'Search AliExpress',
  'Ask Claude',
  'Take Screenshot',
  'Open YouTube',
];

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    inputRef.current?.focus();
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleQuickAction = useCallback(
    (action: string) => {
      if (disabled) return;
      onSend(action);
    },
    [disabled, onSend],
  );

  const toggleVoice = useCallback(() => {
    setVoiceActive((v) => !v);
  }, []);

  return (
    <div className="border-t border-zinc-800 bg-zinc-950">
      {/* Quick actions */}
      <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-hide">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action}
            onClick={() => handleQuickAction(action)}
            disabled={disabled}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full
              bg-zinc-800 text-zinc-300 border border-zinc-700
              hover:bg-zinc-700 active:scale-95 transition-all
              disabled:opacity-40 disabled:pointer-events-none"
          >
            {action}
          </button>
        ))}
      </div>

      {/* Voice listening indicator */}
      {voiceActive && (
        <div className="flex items-center justify-center gap-2 py-2">
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <span
                key={i}
                className="w-1 bg-cyan-400 rounded-full animate-pulse"
                style={{
                  height: `${12 + Math.random() * 16}px`,
                  animationDelay: `${i * 100}ms`,
                  animationDuration: '0.6s',
                }}
              />
            ))}
          </div>
          <span className="text-xs text-cyan-400 font-medium">Listening...</span>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-2 px-3 pb-3 pt-1">
        {/* Mic button */}
        <button
          onClick={toggleVoice}
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
            transition-all active:scale-90 ${
              voiceActive
                ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1a1 1 0 1 1 2 0v1a5 5 0 0 0 10 0v-1a1 1 0 1 1 2 0Z" />
            <path d="M12 19a7.03 7.03 0 0 1-1 0v3a1 1 0 1 0 2 0v-3Z" />
          </svg>
        </button>

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={voiceActive ? 'Or type here...' : 'Message TinkerChat...'}
          disabled={disabled}
          className="flex-1 h-10 px-4 rounded-full bg-zinc-800 text-zinc-100 text-sm
            placeholder:text-zinc-500 outline-none border border-zinc-700
            focus:border-cyan-600 transition-colors
            disabled:opacity-40"
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-cyan-600 text-white
            flex items-center justify-center
            hover:bg-cyan-500 active:scale-90 transition-all
            disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
