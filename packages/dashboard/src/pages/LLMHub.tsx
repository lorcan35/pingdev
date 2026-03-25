import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, ChevronDown, Cpu, Layers, MessageSquare, Play, Send, Sparkles, Zap,
} from 'lucide-react';
import * as gw from '../lib/gw';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModelCard({ model }: { model: gw.LLMModel }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border bg-surface p-4 flex items-start gap-3"
    >
      <div className="mt-0.5 rounded-md bg-accent-cyan/10 p-2 text-accent-cyan">
        <Cpu size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-fg truncate">{model.name ?? model.id}</div>
        <div className="text-xs text-muted mt-0.5">{model.id}</div>
        {model.provider && (
          <span className="mt-2 inline-block rounded-full bg-accent-cyan/10 px-2 py-0.5 text-[10px] font-medium text-accent-cyan uppercase tracking-wider">
            {model.provider}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-accent-cyan/15 text-fg rounded-br-sm'
            : 'bg-surface border border-border text-fg rounded-bl-sm'
        }`}
      >
        {msg.content}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function LLMHub() {
  // Models
  const [models, setModels] = useState<gw.LLMModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Prompt
  const [promptInput, setPromptInput] = useState('');
  const [promptResult, setPromptResult] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);

  // Registry
  const [registryData, setRegistryData] = useState<any>(null);
  const [registryLoading, setRegistryLoading] = useState(true);

  // Active tab
  const [tab, setTab] = useState<'chat' | 'prompt' | 'registry'>('chat');

  // Fetch models
  useEffect(() => {
    gw.llmModels()
      .then(r => {
        setModels(r.models ?? []);
        if (r.models?.length) setSelectedModel(r.models[0].id);
      })
      .catch(e => setModelsError(e.message))
      .finally(() => setModelsLoading(false));
  }, []);

  // Fetch registry
  useEffect(() => {
    gw.registry()
      .then(setRegistryData)
      .catch(() => {})
      .finally(() => setRegistryLoading(false));
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Chat send
  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: text };
    const next = [...chatMessages, userMsg];
    setChatMessages(next);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await gw.llmChat(
        next.map(m => ({ role: m.role, content: m.content })),
        selectedModel ? { model: selectedModel } : undefined,
      );
      const assistantText =
        res?.choices?.[0]?.message?.content ??
        res?.response ??
        res?.content ??
        (typeof res === 'string' ? res : JSON.stringify(res, null, 2));
      setChatMessages(prev => [...prev, { role: 'assistant', content: assistantText }]);
    } catch (e: any) {
      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${e.message}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, selectedModel]);

  // Prompt send
  const sendPrompt = useCallback(async () => {
    const text = promptInput.trim();
    if (!text || promptLoading) return;
    setPromptLoading(true);
    setPromptResult(null);
    try {
      const res = await gw.llmPrompt(text, selectedModel ? { model: selectedModel } : undefined);
      const out =
        res?.choices?.[0]?.message?.content ??
        res?.response ??
        res?.content ??
        (typeof res === 'string' ? res : JSON.stringify(res, null, 2));
      setPromptResult(out);
    } catch (e: any) {
      setPromptResult(`Error: ${e.message}`);
    } finally {
      setPromptLoading(false);
    }
  }, [promptInput, promptLoading, selectedModel]);

  const selectedModelObj = models.find(m => m.id === selectedModel);

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg flex items-center gap-2">
            <Sparkles size={20} className="text-accent-cyan" /> LLM Hub
          </h1>
          <p className="text-sm text-muted mt-0.5">Models, chat playground, prompt testing & driver registry</p>
        </div>
      </div>

      {/* Models strip */}
      <section>
        <h2 className="text-xs font-medium uppercase tracking-wider text-dim mb-3 flex items-center gap-1.5">
          <Layers size={13} /> Available Models
        </h2>
        {modelsLoading ? (
          <div className="text-sm text-muted animate-pulse">Loading models...</div>
        ) : modelsError ? (
          <div className="text-sm text-health-offline">{modelsError}</div>
        ) : models.length === 0 ? (
          <div className="text-sm text-muted">No models found. Is the LLM service running?</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {models.map(m => (
              <ModelCard key={m.id} model={m} />
            ))}
          </div>
        )}
      </section>

      {/* Model selector */}
      {models.length > 0 && (
        <div className="relative inline-block">
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg hover:border-accent-cyan/40 transition-colors"
          >
            <Bot size={14} className="text-accent-cyan" />
            <span>{selectedModelObj?.name ?? selectedModel}</span>
            <ChevronDown size={14} className={`text-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 mt-1 z-50 min-w-[220px] rounded-lg border border-border bg-surface shadow-xl"
              >
                {models.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedModel(m.id); setDropdownOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors ${
                      m.id === selectedModel ? 'text-accent-cyan' : 'text-fg'
                    }`}
                  >
                    <div className="font-medium">{m.name ?? m.id}</div>
                    {m.provider && <div className="text-xs text-muted">{m.provider}</div>}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['chat', 'prompt', 'registry'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-accent-cyan text-accent-cyan'
                : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {t === 'chat' && <MessageSquare size={13} className="inline mr-1.5 -mt-0.5" />}
            {t === 'prompt' && <Zap size={13} className="inline mr-1.5 -mt-0.5" />}
            {t === 'registry' && <Layers size={13} className="inline mr-1.5 -mt-0.5" />}
            {t}
          </button>
        ))}
      </div>

      {/* Chat playground */}
      {tab === 'chat' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <div className="rounded-lg border border-border bg-surface overflow-hidden flex flex-col" style={{ height: 420 }}>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 && (
                <div className="flex items-center justify-center h-full text-muted text-sm">
                  Send a message to start chatting
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <ChatBubble key={i} msg={msg} />
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-xl bg-surface border border-border px-4 py-2.5 text-sm text-muted animate-pulse">
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-border p-3 flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                placeholder="Type a message..."
                className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-dim outline-none focus:border-accent-cyan/50 transition-colors"
              />
              <button
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="rounded-lg bg-accent-cyan/15 px-3 py-2 text-accent-cyan hover:bg-accent-cyan/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setChatMessages([])}
              className="text-xs text-muted hover:text-fg transition-colors"
            >
              Clear conversation
            </button>
          </div>
        </motion.div>
      )}

      {/* Prompt testing */}
      {tab === 'prompt' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <label className="block">
              <div className="text-xs font-medium text-muted mb-1.5 uppercase tracking-wider">Prompt</div>
              <textarea
                value={promptInput}
                onChange={e => setPromptInput(e.target.value)}
                rows={5}
                placeholder="Enter a single-shot prompt..."
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-dim outline-none focus:border-accent-cyan/50 transition-colors resize-y"
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={sendPrompt}
                disabled={promptLoading || !promptInput.trim()}
                className="flex items-center gap-2 rounded-lg bg-accent-cyan/15 px-4 py-2 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Play size={14} />
                {promptLoading ? 'Running...' : 'Run Prompt'}
              </button>
              {promptResult !== null && (
                <button
                  onClick={() => setPromptResult(null)}
                  className="text-xs text-muted hover:text-fg transition-colors"
                >
                  Clear result
                </button>
              )}
            </div>
          </div>
          <AnimatePresence>
            {promptResult !== null && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="text-xs font-medium text-dim uppercase tracking-wider mb-2">Result</div>
                <pre className="text-sm text-fg whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                  {promptResult}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Registry */}
      {tab === 'registry' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {registryLoading ? (
            <div className="text-sm text-muted animate-pulse">Loading registry...</div>
          ) : !registryData ? (
            <div className="text-sm text-muted">No registry data available.</div>
          ) : (
            <div className="space-y-4">
              {typeof registryData === 'object' &&
                Object.entries(registryData).map(([key, val]: [string, any]) => (
                  <div key={key} className="rounded-lg border border-border bg-surface p-4">
                    <h3 className="text-sm font-medium text-fg mb-2">{key}</h3>
                    {Array.isArray(val) ? (
                      <div className="space-y-2">
                        {val.map((item: any, i: number) => (
                          <div key={i} className="rounded-md bg-bg border border-border p-3 text-xs">
                            <pre className="text-fg whitespace-pre-wrap">{JSON.stringify(item, null, 2)}</pre>
                          </div>
                        ))}
                      </div>
                    ) : typeof val === 'object' ? (
                      <pre className="text-xs text-fg whitespace-pre-wrap bg-bg rounded-md border border-border p-3">
                        {JSON.stringify(val, null, 2)}
                      </pre>
                    ) : (
                      <div className="text-sm text-fg">{String(val)}</div>
                    )}
                  </div>
                ))}
              {typeof registryData !== 'object' && (
                <pre className="text-sm text-fg whitespace-pre-wrap rounded-lg border border-border bg-surface p-4">
                  {JSON.stringify(registryData, null, 2)}
                </pre>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
