import { useEffect, useRef } from 'react';
import { MessageBubble, ChatInput, TypingIndicator } from '@/components/chat';
import { useChatStore } from './useChatStore';

export default function ChatPage() {
  const { messages, loading, activeTier, sendMessage } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, loading]);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white">
      {/* Header — 48px */}
      <header className="flex items-center h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <button className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path
              fillRule="evenodd"
              d="M7.72 12.53a.75.75 0 0 1 0-1.06l7.5-7.5a.75.75 0 1 1 1.06 1.06L9.31 12l6.97 6.97a.75.75 0 1 1-1.06 1.06l-7.5-7.5Z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div className="flex-1 text-center">
          <h1 className="text-sm font-semibold tracking-wide">TinkerChat</h1>
        </div>

        <button className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path
              fillRule="evenodd"
              d="M11.078 2.25c-.917 0-1.699.663-1.855 1.567L8.982 5.38a1.19 1.19 0 0 1-.586.676l-.153.077a1.19 1.19 0 0 1-.89.054l-1.512-.493a1.886 1.886 0 0 0-2.186.816l-.922 1.597a1.886 1.886 0 0 0 .33 2.382l1.175 1.024c.26.226.399.555.39.898l-.007.164a1.19 1.19 0 0 1-.399.862l-1.175 1.024a1.886 1.886 0 0 0-.33 2.382l.922 1.597a1.886 1.886 0 0 0 2.186.816l1.512-.493a1.19 1.19 0 0 1 .89.054l.153.077c.27.136.47.382.586.676l.241 1.563a1.886 1.886 0 0 0 1.855 1.567h1.844a1.886 1.886 0 0 0 1.855-1.567l.242-1.563c.115-.294.315-.54.586-.676l.152-.077a1.19 1.19 0 0 1 .89-.054l1.513.493a1.886 1.886 0 0 0 2.186-.816l.922-1.597a1.886 1.886 0 0 0-.33-2.382l-1.176-1.024a1.19 1.19 0 0 1-.398-.862l.006-.164a1.19 1.19 0 0 1 .39-.898l1.175-1.024a1.886 1.886 0 0 0 .33-2.382l-.922-1.597a1.886 1.886 0 0 0-2.186-.816l-1.513.493a1.19 1.19 0 0 1-.89-.054l-.152-.077a1.19 1.19 0 0 1-.586-.676l-.242-1.563a1.886 1.886 0 0 0-1.855-1.567h-1.844ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </header>

      {/* Messages area — scrollable */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 space-y-1">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {loading && <TypingIndicator tier={activeTier} />}
      </div>

      {/* Input area */}
      <ChatInput onSend={sendMessage} disabled={loading} />
    </div>
  );
}
