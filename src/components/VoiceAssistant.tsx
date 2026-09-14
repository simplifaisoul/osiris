'use client';

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Volume2, VolumeX, Settings, X, Key, Lock, Unlock,
  Loader2, MessageCircle, Send, AlertTriangle,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

const API_KEY_STORAGE = 'osiris_voice_api_key';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/* ── Web Speech API helpers ── */
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionInstance) | null;
}

/** Mobile portrait → bottom sheet; otherwise right drawer */
function useMobileBottomSheet() {
  const [isBottomSheet, setIsBottomSheet] = useState(false);
  useEffect(() => {
    const check = () => {
      setIsBottomSheet(window.innerWidth <= 768 && window.innerHeight > 500);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);
  return isBottomSheet;
}

function VoiceAssistantInner() {
  const { t, locale } = useI18n();
  const isBottomSheet = useMobileBottomSheet();

  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [configured, setConfigured] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [speechSupported, setSpeechSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  /* Load API key from localStorage */
  useEffect(() => {
    const saved = localStorage.getItem(API_KEY_STORAGE);
    if (saved) {
      setApiKey(saved);
      setConfigured(true);
    }
    setSpeechSupported(!!getSpeechRecognition());
  }, []);

  /* Auto-scroll chat */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveKey = useCallback(() => {
    const k = keyInput.trim();
    if (!k) return;
    localStorage.setItem(API_KEY_STORAGE, k);
    setApiKey(k);
    setConfigured(true);
    setKeyInput('');
    setShowSettings(false);
    setError('');
  }, [keyInput]);

  const removeKey = useCallback(() => {
    localStorage.removeItem(API_KEY_STORAGE);
    setApiKey('');
    setConfigured(false);
    setShowSettings(true);
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = locale === 'ps' ? 'ps-AF' : 'fa-IR';
    utt.rate = 0.95;
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    utteranceRef.current = utt;
    window.speechSynthesis.speak(utt);
  }, [locale]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    if (!apiKey) {
      setShowSettings(true);
      setError(t('voice.errNoKey'));
      return;
    }

    setError('');
    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setTextInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ messages: updated }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          removeKey();
          setError(t('voice.errInvalidKey'));
        } else {
          setError(data.error || t('voice.errGeneric'));
        }
        return;
      }
      const assistantMsg: ChatMessage = { role: 'assistant', content: data.reply };
      setMessages((prev) => [...prev, assistantMsg]);
      speak(data.reply);
    } catch {
      setError(t('voice.errNetwork'));
    } finally {
      setLoading(false);
    }
  }, [apiKey, loading, messages, removeKey, speak, t]);

  const startListening = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setSpeechSupported(false);
      return;
    }
    if (listening) return;

    stopSpeaking();
    const rec = new SR();
    rec.lang = locale === 'ps' ? 'ps-AF' : 'fa-IR';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (ev) => {
      const transcript = ev.results[0]?.[0]?.transcript;
      if (transcript) sendMessage(transcript);
    };
    rec.onerror = (ev) => {
      if (ev.error !== 'aborted') setError(t('voice.errMic'));
      setListening(false);
    };
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    setListening(true);
    setError('');
    try {
      rec.start();
    } catch {
      setListening(false);
      setError(t('voice.errMic'));
    }
  }, [listening, locale, sendMessage, stopSpeaking, t]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const toggleMic = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening, stopListening]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    if (!configured) setShowSettings(true);
  }, [configured]);

  return (
    <>
      {/* ── Floating Voice Button (FAB) ── */}
      {!open && (
        <motion.button
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 3.2, type: 'spring', stiffness: 280, damping: 22 }}
          onClick={handleOpen}
          className="voice-fab group"
          aria-label={t('voice.title')}
        >
          <span className="voice-fab-ring voice-fab-ring-1" aria-hidden="true" />
          <span className="voice-fab-ring voice-fab-ring-2" aria-hidden="true" />

          <span className="voice-fab-inner">
            <Mic className="voice-fab-icon" strokeWidth={2.5} />
            <span className="voice-fab-text">{t('voice.tapToTalk')}</span>
          </span>
        </motion.button>
      )}

      {/* ── Voice Panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={isBottomSheet ? { y: '100%', opacity: 0 } : { x: '100%', opacity: 0 }}
            animate={isBottomSheet ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
            exit={isBottomSheet ? { y: '100%', opacity: 0 } : { x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="voice-panel"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[var(--cyan-primary)]/15 border border-[var(--cyan-primary)]/40 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-[var(--cyan-primary)]" />
                </div>
                <div>
                  <div className="text-[12px] font-bold text-[var(--text-primary)] tracking-wide">{t('voice.title')}</div>
                  <div className="text-[8px] font-mono text-[var(--text-muted)] tracking-widest uppercase">{t('voice.subtitle')}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowSettings((s) => !s)}
                  className={`p-2 rounded transition-colors ${showSettings ? 'text-[var(--gold-primary)] bg-[var(--gold-primary)]/10' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                  title={t('voice.settings')}
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setOpen(false); stopListening(); stopSpeaking(); }}
                  className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* API Key Settings */}
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-b border-[var(--border-primary)]"
                >
                  <div className="px-4 py-3 space-y-2.5">
                    <div className="flex items-start gap-2 px-2.5 py-2 rounded bg-[var(--cyan-primary)]/5 border border-[var(--cyan-primary)]/20">
                      <Key className="w-4 h-4 text-[var(--cyan-primary)] shrink-0 mt-0.5" />
                      <span className="text-[10px] font-mono text-[var(--text-secondary)] leading-relaxed">
                        {t('voice.keyHint')}
                      </span>
                    </div>

                    {configured ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded bg-black/30 border border-[var(--alert-green)]/30">
                          <Lock className="w-3.5 h-3.5 text-[var(--alert-green)]" />
                          <span className="text-[10px] font-mono text-[var(--alert-green)]">{t('voice.keySaved')}</span>
                          <span className="text-[10px] font-mono text-[var(--text-muted)] mr-auto">••••••••</span>
                        </div>
                        <button
                          onClick={removeKey}
                          className="px-3 py-2 rounded border border-[var(--alert-red)]/30 text-[var(--alert-red)] text-[10px] font-mono hover:bg-[var(--alert-red)]/10 transition-colors"
                        >
                          {t('voice.removeKey')}
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          type="password"
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveKey()}
                          placeholder={t('voice.keyPlaceholder')}
                          className="w-full bg-black/30 border border-[var(--border-primary)] rounded px-3 py-2 text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--cyan-primary)]/50"
                        />
                        <button
                          onClick={saveKey}
                          disabled={!keyInput.trim()}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-[var(--cyan-primary)]/15 border border-[var(--cyan-primary)]/40 text-[var(--cyan-primary)] text-[11px] font-mono font-bold tracking-wider hover:bg-[var(--cyan-primary)]/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          {t('voice.saveKey')}
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat area */}
            <div className="voice-chat-area styled-scrollbar">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
                  <div className="w-16 h-16 rounded-full bg-[var(--cyan-primary)]/10 border border-[var(--cyan-primary)]/25 flex items-center justify-center mb-4">
                    <Mic className="w-7 h-7 text-[var(--cyan-primary)]" />
                  </div>
                  <p className="text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed max-w-[240px]">
                    {configured ? t('voice.emptyHint') : t('voice.emptyNoKey')}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 p-3">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[85%] px-3 py-2 rounded-lg text-[11px] font-mono leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-[var(--cyan-primary)]/10 border border-[var(--cyan-primary)]/25 text-[var(--text-primary)]'
                            : 'bg-[var(--gold-primary)]/10 border border-[var(--gold-primary)]/25 text-[var(--text-primary)]'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-end">
                      <div className="px-3 py-2 rounded-lg bg-[var(--gold-primary)]/10 border border-[var(--gold-primary)]/25">
                        <Loader2 className="w-4 h-4 text-[var(--gold-primary)] animate-spin" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="mx-3 mb-2 flex items-start gap-1.5 px-2.5 py-2 rounded bg-[var(--alert-red)]/10 border border-[var(--alert-red)]/30">
                <AlertTriangle className="w-3.5 h-3.5 text-[var(--alert-red)] shrink-0 mt-0.5" />
                <span className="text-[9px] font-mono text-[var(--alert-red)] leading-relaxed">{error}</span>
              </div>
            )}

            {/* Controls */}
            <div className="px-4 py-3 border-t border-[var(--border-primary)] space-y-2.5">
              {/* Big mic button */}
              <div className="flex items-center justify-center gap-4">
                {speaking && (
                  <button
                    onClick={stopSpeaking}
                    className="p-2.5 rounded-full border border-[var(--gold-primary)]/30 text-[var(--gold-primary)] hover:bg-[var(--gold-primary)]/10 transition-colors"
                    title={t('voice.stopSpeaking')}
                  >
                    <VolumeX className="w-5 h-5" />
                  </button>
                )}

                <button
                  onClick={toggleMic}
                  disabled={!configured || loading}
                  className={`voice-mic-btn ${listening ? 'voice-mic-btn-active' : ''}`}
                  aria-label={listening ? t('voice.stopListening') : t('voice.startListening')}
                >
                  {listening ? <MicOff /> : <Mic />}
                  {listening && <span className="voice-mic-pulse" aria-hidden="true" />}
                </button>

                {speaking && (
                  <div className="p-2.5 rounded-full border border-[var(--cyan-primary)]/30 text-[var(--cyan-primary)]">
                    <Volume2 className="w-5 h-5 animate-pulse" />
                  </div>
                )}
              </div>

              {!speechSupported && (
                <p className="text-[9px] font-mono text-[var(--text-muted)] text-center">{t('voice.noSpeechSupport')}</p>
              )}

              {/* Text fallback input */}
              <div className="flex items-center gap-2">
                <input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(textInput)}
                  placeholder={t('voice.textPlaceholder')}
                  disabled={!configured || loading}
                  className="flex-1 bg-black/30 border border-[var(--border-primary)] rounded px-3 py-2 text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--cyan-primary)]/50 disabled:opacity-40"
                />
                <button
                  onClick={() => sendMessage(textInput)}
                  disabled={!configured || !textInput.trim() || loading}
                  className="p-2.5 rounded border border-[var(--cyan-primary)]/40 text-[var(--cyan-primary)] hover:bg-[var(--cyan-primary)]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const VoiceAssistant = memo(VoiceAssistantInner);
export default VoiceAssistant;
