'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Send,
  Sparkles,
  Settings,
  X,
  Bot,
  User,
  AlertTriangle,
  Shield,
  ChevronDown,
  Loader2,
  Key,
  Check,
  Trash2,
} from 'lucide-react';
import type { IntelligenceContext } from '@/lib/ai-engine';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — AI Intelligence Analyst Panel
   Premium glass-panel chat interface for real-time intelligence
   analysis powered by Gemini 2.0 Flash
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────
   Interfaces
   ───────────────────────────────────────────────────────────── */

interface DashboardData {
  earthquakes?: EarthquakeItem[];
  news?: NewsItem[];
  gdelt?: GdeltEvent[];
  markets?: MarketData;
  [key: string]: unknown;
}

interface EarthquakeItem {
  id: string;
  magnitude: number;
  location: string;
  lat: number;
  lng: number;
  depth: number;
  time: string;
  tsunami: boolean;
  felt: number | null;
  alert: string | null;
}

interface NewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  published: string;
  source: string;
  risk_score: number;
  coords: [number, number] | null;
  machine_assessment: string | null;
}

interface GdeltEvent {
  title: string;
  type: string;
  lat: number;
  lng: number;
  date: string;
  source: string;
  tone: number;
}

interface MarketData {
  indices?: MarketIndex[];
  commodities?: MarketCommodity[];
}

interface MarketIndex {
  name: string;
  value: number;
  change: number;
  changePercent: number;
}

interface MarketCommodity {
  name: string;
  price: number;
  change: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'analyst';
  content: string;
  timestamp: string;
  isError?: boolean;
}

interface AiAnalystProps {
  data: DashboardData;
}

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildContext(data: DashboardData): IntelligenceContext {
  const earthquakes = (data.earthquakes || []).slice(0, 20).map((eq) => ({
    id: eq.id || generateId(),
    magnitude: eq.magnitude,
    location: eq.location,
    latitude: eq.lat,
    longitude: eq.lng,
    depth: eq.depth,
    timestamp: eq.time,
    tsunami: eq.tsunami ?? false,
    felt: eq.felt ?? null,
    alert: eq.alert ?? null,
  }));

  const news = (data.news || []).slice(0, 15).map((item) => ({
    id: item.id || generateId(),
    title: item.title,
    description: item.description || '',
    link: item.link || '',
    published: item.published,
    source: item.source,
    risk_score: item.risk_score,
    coords: item.coords,
    machine_assessment: item.machine_assessment,
  }));

  const threats = (data.gdelt || []).slice(0, 15).map((ev) => ({
    id: generateId(),
    type: ev.type || 'INCIDENT',
    title: ev.title,
    description: ev.title,
    severity: (ev.tone < -5 ? 'CRITICAL' : ev.tone < -2 ? 'HIGH' : ev.tone < 0 ? 'ELEVATED' : 'LOW') as
      | 'CRITICAL'
      | 'HIGH'
      | 'ELEVATED'
      | 'LOW',
    region: ev.source || 'Unknown',
    latitude: ev.lat,
    longitude: ev.lng,
    timestamp: ev.date,
    source: ev.source || 'GDELT',
  }));

  return {
    earthquakes,
    news,
    threats,
    cyberAlerts: [],
    timestamp: new Date().toISOString(),
  };
}

/** Render markdown-lite: bold, headers, bullet points */
function renderMarkdown(text: string): string {
  // Basic HTML escape to prevent XSS
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  return escaped
    .replace(/### (.+)/g, '<h4 class="text-[11px] font-bold text-[var(--gold-primary)] mt-3 mb-1 tracking-wider uppercase font-mono">$1</h4>')
    .replace(/## (.+)/g, '<h3 class="text-[12px] font-bold text-[var(--gold-primary)] mt-3 mb-1.5 tracking-wider uppercase font-mono border-b border-[var(--border-secondary)] pb-1">$1</h3>')
    .replace(/# (.+)/g, '<h2 class="text-[13px] font-bold text-[var(--gold-primary)] mt-3 mb-1.5 tracking-wider uppercase font-mono">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[var(--text-heading)] font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-[var(--text-secondary)] italic">$1</em>')
    .replace(/^- (.+)/gm, '<div class="flex items-start gap-1.5 ml-1 my-0.5"><span class="text-[var(--gold-dim)] mt-[3px] text-[8px]">◆</span><span>$1</span></div>')
    .replace(/\n/g, '<br />');
}

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */

export default function AiAnalyst({ data }: AiAnalystProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [keySaved, setKeySaved] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load saved key on mount
  useEffect(() => {
    const saved = localStorage.getItem('osiris-gemini-key');
    if (saved) {
      setApiKeyInput(saved);
      setKeySaved(true);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !showSettings) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, showSettings]);

  const getHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const savedKey = localStorage.getItem('osiris-gemini-key');
    if (savedKey) {
      headers['x-gemini-key'] = savedKey;
    }
    return headers;
  }, []);

  const handleSend = useCallback(async () => {
    const query = inputText.trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const context = buildContext(data);
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ query, context }),
      });

      const json = await res.json();

      if (!res.ok) {
        const errorBody = json as { error: string; code: string; retryAfter?: number };
        throw new Error(errorBody.error || `HTTP ${res.status}`);
      }

      const responseBody = json as { analysis: string; model: string; timestamp: string };

      const analystMsg: ChatMessage = {
        id: generateId(),
        role: 'analyst',
        content: responseBody.analysis,
        timestamp: responseBody.timestamp,
      };
      setMessages((prev) => [...prev, analystMsg]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      const errorMsg: ChatMessage = {
        id: generateId(),
        role: 'analyst',
        content: `⚠ INTELLIGENCE ANALYSIS ERROR\n\n${message}`,
        timestamp: new Date().toISOString(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, isLoading, data, getHeaders]);

  const handleBriefing = useCallback(async () => {
    if (isLoading) return;

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: '📋 Generate full intelligence briefing from current operational data',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const context = buildContext(data);
      const res = await fetch('/api/ai/briefing', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ context }),
      });

      const json = await res.json();

      if (!res.ok) {
        const errorBody = json as { error: string; code: string };
        throw new Error(errorBody.error || `HTTP ${res.status}`);
      }

      const responseBody = json as { briefing: string; generatedAt: string };

      const analystMsg: ChatMessage = {
        id: generateId(),
        role: 'analyst',
        content: responseBody.briefing,
        timestamp: responseBody.generatedAt,
      };
      setMessages((prev) => [...prev, analystMsg]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Briefing generation failed';
      const errorMsg: ChatMessage = {
        id: generateId(),
        role: 'analyst',
        content: `⚠ BRIEFING GENERATION ERROR\n\n${message}`,
        timestamp: new Date().toISOString(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, data, getHeaders]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const saveApiKey = useCallback(() => {
    const key = apiKeyInput.trim();
    if (key) {
      localStorage.setItem('osiris-gemini-key', key);
      setKeySaved(true);
      setTimeout(() => setShowSettings(false), 600);
    }
  }, [apiKeyInput]);

  const clearApiKey = useCallback(() => {
    localStorage.removeItem('osiris-gemini-key');
    setApiKeyInput('');
    setKeySaved(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  /* ── Floating Trigger Button ── */
  const triggerButton = (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 3, type: 'spring', stiffness: 200, damping: 15 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => setIsOpen(true)}
      className="fixed bottom-[90px] right-5 md:bottom-8 md:right-8 z-[500] w-14 h-14 rounded-full flex items-center justify-center cursor-pointer border-0"
      style={{
        background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.2) 0%, rgba(212, 175, 55, 0.08) 100%)',
        border: '1px solid rgba(212, 175, 55, 0.4)',
        boxShadow:
          '0 0 30px rgba(212, 175, 55, 0.2), 0 0 60px rgba(212, 175, 55, 0.1), 0 4px 20px rgba(0, 0, 0, 0.5)',
      }}
      aria-label="Open AI Intelligence Analyst"
    >
      <Brain className="w-6 h-6 text-[var(--gold-primary)]" />
      {/* Pulse rings */}
      <div className="absolute inset-0 rounded-full animate-glow-pulse" />
      <motion.div
        className="absolute inset-[-4px] rounded-full border border-[var(--gold-primary)]"
        animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.1, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{ opacity: 0.3 }}
      />
    </motion.button>
  );

  /* ── Panel ── */
  return (
    <>
      {/* Trigger — only show when panel is closed */}
      <AnimatePresence>{!isOpen && triggerButton}</AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop on mobile */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[600] md:hidden"
              onClick={() => setIsOpen(false)}
            />

            {/* Main Panel */}
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="fixed bottom-0 right-0 md:bottom-6 md:right-6 z-[700] w-full md:w-[440px] h-[85vh] md:h-[680px] md:max-h-[85vh] flex flex-col md:rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, rgba(8, 10, 20, 0.96) 0%, rgba(6, 6, 12, 0.98) 100%)',
                border: '1px solid rgba(212, 175, 55, 0.2)',
                boxShadow:
                  '0 0 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(212, 175, 55, 0.08), 0 1px 0 rgba(212, 175, 55, 0.1) inset',
                backdropFilter: 'blur(40px) saturate(1.5)',
              }}
            >
              {/* ── Header ── */}
              <div
                className="relative flex items-center justify-between px-4 py-3 shrink-0"
                style={{
                  background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.06) 0%, transparent 50%, rgba(0, 229, 255, 0.04) 100%)',
                  borderBottom: '1px solid rgba(212, 175, 55, 0.15)',
                }}
              >
                {/* Scan line accent */}
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-[1px]"
                  style={{ background: 'linear-gradient(90deg, transparent, var(--gold-primary), transparent)' }}
                  animate={{ opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                />

                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <Shield className="w-4.5 h-4.5 text-[var(--gold-primary)]" />
                    <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--alert-green)] animate-osiris-pulse" />
                  </div>
                  <div className="flex flex-col">
                    <span className="hud-text text-[11px] text-[var(--text-heading)]">OSIRIS ANALYST</span>
                    <span className="text-[7px] font-mono tracking-[0.2em] text-[var(--text-muted)]">
                      GEMINI 2.0 FLASH • ONLINE
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <button
                      onClick={clearMessages}
                      className="p-1.5 rounded-lg hover:bg-[var(--hover-accent)] transition-colors group"
                      title="Clear conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--alert-red)]" />
                    </button>
                  )}
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-1.5 rounded-lg hover:bg-[var(--hover-accent)] transition-colors group"
                    title="Settings"
                  >
                    <Settings
                      className={`w-3.5 h-3.5 transition-colors ${
                        showSettings ? 'text-[var(--gold-primary)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-[var(--hover-accent)] transition-colors group"
                    title="Close"
                  >
                    <X className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" />
                  </button>
                </div>
              </div>

              {/* ── Settings Panel ── */}
              <AnimatePresence>
                {showSettings && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden shrink-0"
                  >
                    <div
                      className="px-4 py-3 space-y-2.5"
                      style={{
                        background: 'rgba(212, 175, 55, 0.03)',
                        borderBottom: '1px solid rgba(212, 175, 55, 0.1)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Key className="w-3 h-3 text-[var(--gold-dim)]" />
                        <span className="hud-label" style={{ fontSize: '8px' }}>
                          GEMINI API KEY (OPTIONAL)
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={apiKeyInput}
                          onChange={(e) => {
                            setApiKeyInput(e.target.value);
                            setKeySaved(false);
                          }}
                          placeholder="AIza..."
                          className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg px-3 py-2 text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--gold-dim)] transition-colors"
                        />
                        {apiKeyInput.trim() && (
                          <>
                            <button
                              onClick={saveApiKey}
                              className="px-3 rounded-lg text-[9px] font-mono tracking-wider transition-all"
                              style={{
                                background: keySaved ? 'rgba(0, 230, 118, 0.15)' : 'rgba(212, 175, 55, 0.1)',
                                border: `1px solid ${keySaved ? 'rgba(0, 230, 118, 0.3)' : 'rgba(212, 175, 55, 0.2)'}`,
                                color: keySaved ? 'var(--alert-green)' : 'var(--gold-primary)',
                              }}
                            >
                              {keySaved ? <Check className="w-3 h-3" /> : 'SAVE'}
                            </button>
                            <button
                              onClick={clearApiKey}
                              className="px-2 rounded-lg text-[9px] font-mono tracking-wider transition-all hover:bg-red-500/10"
                              style={{
                                border: '1px solid rgba(255, 61, 61, 0.2)',
                                color: 'var(--alert-red)',
                              }}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                      <p className="text-[8px] font-mono text-[var(--text-muted)] leading-relaxed">
                        Your key is stored locally and sent only to the OSIRIS server. Get a free key at{' '}
                        <a
                          href="https://aistudio.google.com/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--cyan-primary)] hover:underline"
                        >
                          aistudio.google.com
                        </a>
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Messages Area ── */}
              <div className="flex-1 overflow-y-auto styled-scrollbar px-4 py-3 space-y-3">
                {/* Empty state */}
                {messages.length === 0 && !isLoading && (
                  <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-5">
                    {/* Animated brain icon */}
                    <div className="relative">
                      <motion.div
                        animate={{ rotate: [0, 360] }}
                        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-[-10px] rounded-full border border-[var(--gold-primary)]"
                        style={{ opacity: 0.15 }}
                      />
                      <motion.div
                        animate={{ rotate: [0, -360] }}
                        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-[-20px] rounded-full border border-[var(--cyan-primary)]"
                        style={{ opacity: 0.08 }}
                      />
                      <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center"
                        style={{
                          background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.1) 0%, rgba(0, 229, 255, 0.05) 100%)',
                          border: '1px solid rgba(212, 175, 55, 0.2)',
                        }}
                      >
                        <Brain className="w-7 h-7 text-[var(--gold-primary)]" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="hud-text text-[12px] text-[var(--text-heading)]">
                        INTELLIGENCE ANALYST READY
                      </h3>
                      <p className="text-[10px] font-mono text-[var(--text-muted)] leading-relaxed max-w-[280px]">
                        I correlate live seismic, OSINT, threat, and cyber data to deliver actionable intelligence assessments.
                      </p>
                    </div>

                    {/* Quick prompts */}
                    <div className="w-full space-y-1.5">
                      <span className="hud-label block text-center mb-2" style={{ fontSize: '7px' }}>
                        SUGGESTED QUERIES
                      </span>
                      {[
                        'What are the top 3 threats right now?',
                        'Are there seismic patterns correlating with conflicts?',
                        'Assess cyber risks to critical infrastructure',
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => {
                            setInputText(prompt);
                            setTimeout(() => inputRef.current?.focus(), 50);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg text-[10px] font-mono text-[var(--text-secondary)] transition-all hover:text-[var(--text-primary)] hover:bg-[var(--hover-accent)]"
                          style={{
                            border: '1px solid rgba(212, 175, 55, 0.08)',
                          }}
                        >
                          <span className="text-[var(--gold-dim)] mr-1.5">›</span>
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages */}
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-xl px-3.5 py-2.5 ${
                        msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'
                      }`}
                      style={
                        msg.role === 'user'
                          ? {
                              background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.12) 0%, rgba(0, 229, 255, 0.06) 100%)',
                              border: '1px solid rgba(0, 229, 255, 0.2)',
                            }
                          : msg.isError
                          ? {
                              background: 'linear-gradient(135deg, rgba(255, 61, 61, 0.1) 0%, rgba(255, 61, 61, 0.05) 100%)',
                              border: '1px solid rgba(255, 61, 61, 0.2)',
                            }
                          : {
                              background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.08) 0%, rgba(212, 175, 55, 0.03) 100%)',
                              border: '1px solid rgba(212, 175, 55, 0.12)',
                            }
                      }
                    >
                      {/* Message header */}
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {msg.role === 'user' ? (
                          <User className="w-3 h-3 text-[var(--cyan-primary)]" />
                        ) : msg.isError ? (
                          <AlertTriangle className="w-3 h-3 text-[var(--alert-red)]" />
                        ) : (
                          <Bot className="w-3 h-3 text-[var(--gold-primary)]" />
                        )}
                        <span
                          className="text-[8px] font-mono tracking-[0.15em] uppercase"
                          style={{
                            color: msg.role === 'user'
                              ? 'var(--cyan-primary)'
                              : msg.isError
                              ? 'var(--alert-red)'
                              : 'var(--gold-primary)',
                          }}
                        >
                          {msg.role === 'user' ? 'OPERATOR' : 'OSIRIS ANALYST'}
                        </span>
                        <span className="text-[7px] font-mono text-[var(--text-muted)] ml-auto">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {/* Message content */}
                      {msg.role === 'analyst' && !msg.isError ? (
                        <div
                          className="text-[11px] font-mono text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                        />
                      ) : (
                        <p className="text-[11px] font-mono text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div
                      className="rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-2.5"
                      style={{
                        background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.08) 0%, rgba(212, 175, 55, 0.03) 100%)',
                        border: '1px solid rgba(212, 175, 55, 0.12)',
                      }}
                    >
                      <Loader2 className="w-3.5 h-3.5 text-[var(--gold-primary)] animate-spin" />
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-mono tracking-[0.15em] text-[var(--gold-primary)] uppercase">
                          Analyzing intelligence
                        </span>
                        <motion.span
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="text-[var(--gold-primary)]"
                        >
                          ...
                        </motion.span>
                      </div>
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* ── Input Area ── */}
              <div
                className="shrink-0 px-3 py-2.5"
                style={{
                  borderTop: '1px solid rgba(212, 175, 55, 0.1)',
                  background: 'rgba(6, 6, 12, 0.8)',
                }}
              >
                {/* Quick action */}
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={handleBriefing}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-mono tracking-[0.1em] uppercase transition-all disabled:opacity-40"
                    style={{
                      background: 'rgba(212, 175, 55, 0.08)',
                      border: '1px solid rgba(212, 175, 55, 0.2)',
                      color: 'var(--gold-primary)',
                    }}
                  >
                    <Sparkles className="w-3 h-3" />
                    GENERATE BRIEFING
                  </button>
                  <div className="flex-1" />
                  <span className="flex items-center text-[7px] font-mono text-[var(--text-muted)] tracking-wider">
                    <ChevronDown className="w-2.5 h-2.5 mr-0.5" />
                    SHIFT+ENTER FOR NEWLINE
                  </span>
                </div>

                {/* Input row */}
                <div className="flex gap-2 items-end">
                  <div
                    className="flex-1 rounded-xl overflow-hidden transition-colors"
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid rgba(212, 175, 55, 0.1)',
                    }}
                  >
                    <textarea
                      ref={inputRef}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Query the intelligence analyst..."
                      rows={1}
                      className="w-full bg-transparent px-3 py-2.5 text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none"
                      style={{ maxHeight: '120px', minHeight: '36px' }}
                      disabled={isLoading}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                      }}
                    />
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSend}
                    disabled={!inputText.trim() || isLoading}
                    className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
                    style={{
                      background:
                        inputText.trim() && !isLoading
                          ? 'linear-gradient(135deg, rgba(0, 229, 255, 0.2) 0%, rgba(0, 229, 255, 0.1) 100%)'
                          : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${
                        inputText.trim() && !isLoading ? 'rgba(0, 229, 255, 0.3)' : 'rgba(255, 255, 255, 0.06)'
                      }`,
                    }}
                  >
                    <Send
                      className="w-3.5 h-3.5"
                      style={{
                        color: inputText.trim() && !isLoading ? 'var(--cyan-primary)' : 'var(--text-muted)',
                      }}
                    />
                  </motion.button>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-1.5 px-1">
                  <span className="text-[7px] font-mono text-[var(--text-muted)] tracking-wider">
                    {keySaved ? '🔑 CUSTOM KEY' : '🔧 SERVER KEY'} • {messages.filter((m) => m.role === 'user').length} QUERIES
                  </span>
                  <span className="text-[7px] font-mono text-[var(--text-muted)] tracking-wider">
                    FEEDS: {(data.earthquakes?.length || 0) + (data.news?.length || 0) + (data.gdelt?.length || 0)} ITEMS
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
