'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import AiOverview from './AiOverview';

/**
 * OSIRIS — News Chat Panel
 *
 * Two AI engines, kept deliberately separate:
 *  - The summary near the top reuses <AiOverview mode="alerts">, the
 *    existing Gemini-powered read-out already used by the Alerts and
 *    Markets panels — same endpoint, same fallback behaviour.
 *  - The chat below it calls /api/ai/news-chat, backed by Cloudflare
 *    Workers AI, scoped server-side to the live news feed only.
 *
 * Styled after Claude's own chat surface: a flat dark canvas, borderless
 * assistant replies, a quiet rounded bubble for what the user typed, and a
 * single pill-shaped input with the send control tucked inside it — rather
 * than the boxed, bracket-edged instrument-panel look used elsewhere in
 * OSIRIS. This is a conversation, not a data readout.
 */

interface NewsChatPanelProps {
  data: any;
  isMobile?: boolean;
  onClose?: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

export default function NewsChatPanel({ data, isMobile = false, onClose }: NewsChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const news = Array.isArray(data?.news) ? data.news : [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Grow the textarea with its content, Claude-style, capped so it never
  // swallows the message list above it.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/news-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
          news,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json?.code === 'NOT_CONFIGURED'
          ? 'News chat isn\u2019t set up on this deployment yet.'
          : json?.error || 'Something went wrong.';
        setMessages(m => [...m, { role: 'assistant', content: msg, error: true }]);
        return;
      }
      setMessages(m => [...m, { role: 'assistant', content: json.reply }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Could not reach the news chat service. Try again.', error: true }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, news]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div
      className={`flex flex-col pointer-events-auto overflow-hidden rounded-xl border border-white/10 ${isMobile ? 'h-full' : 'h-[560px] max-h-[75vh]'}`}
      style={{ background: '#17171a' }}
    >
      {/* Brand — Athens logo, centered */}
      <div className="flex items-center justify-center pt-4 pb-2 shrink-0">
        <img src="/athens-logo-white.png" alt="Athens" className="h-5 w-auto opacity-90" />
      </div>

      {/* Summary — Gemini, same component the Alerts panel already uses */}
      <div className="px-4 shrink-0">
        <AiOverview mode="alerts" payload={{ news }} accent="#00E5FF" signature={String(news.length)} />
      </div>

      {/* Message stream */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto styled-scrollbar px-4 py-4 space-y-5">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-2 opacity-70">
            <Sparkles className="w-4 h-4 text-white/40" />
            <p className="text-[13px] text-white/50 leading-relaxed max-w-[240px] font-sans">
              Ask about today's headlines — what's developing, who's reporting what, how a story is being covered.
            </p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap bg-white/[0.08] text-white font-sans">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div
                className={`max-w-[92%] text-[13.5px] leading-relaxed whitespace-pre-wrap font-sans ${
                  m.error ? 'text-[var(--alert-red)]' : 'text-white/85'
                }`}
              >
                {m.error && <AlertCircle className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />}
                {m.content}
              </div>
            </div>
          )
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 text-white/40">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-[12px] font-sans">Thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input — single rounded pill, send control tucked inside it */}
      <div className="shrink-0 px-3 pb-3 pt-1">
        <div className="flex items-end gap-2 rounded-[22px] border border-white/15 bg-white/[0.05] pl-4 pr-2 py-2 focus-within:border-white/30 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the news…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-[13.5px] text-white placeholder:text-white/35 focus:outline-none py-1 max-h-[120px] styled-scrollbar font-sans"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed bg-white text-black hover:bg-white/90"
            title="Send"
            aria-label="Send message"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="mt-1.5 px-1 text-[10px] text-white/30 font-sans">
          Scoped to the live news feed
        </div>
      </div>
    </div>
  );
}
