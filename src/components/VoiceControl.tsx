'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, AlertTriangle, Loader2, X } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { RealtimeSession, SessionState } from '@/lib/voice/realtime-session';
import { dispatchToolCall, VoiceToolHandlers } from '@/lib/voice/voice-tools';
import { CostMeter } from '@/lib/voice/cost-meter';

interface VoiceControlProps {
  enabled: boolean;
  handlers: VoiceToolHandlers;
  data?: any;
  activeLayers?: any;
}

function VoiceControlInner({ enabled, handlers, data, activeLayers }: VoiceControlProps) {
  const { t } = useI18n();
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [transcript, setTranscript] = useState('');
  const [lastCommand, setLastCommand] = useState('');
  const [error, setError] = useState('');
  const [costMeter] = useState(() => new CostMeter({ softCapUSD: 2, hardCapUSD: 5 }));
  const [sessionConfig, setSessionConfig] = useState<{ ephemeralKey: string; model: string } | null>(null);
  const [session, setSession] = useState<RealtimeSession | null>(null);

  // Fetch ephemeral token on mount if enabled
  useEffect(() => {
    if (!enabled) return;

    fetch('/api/realtime/token')
      .then(res => {
        if (!res.ok) throw new Error('Voice control not available');
        return res.json();
      })
      .then(data => {
        setSessionConfig({
          ephemeralKey: data.ephemeralKey,
          model: data.model,
        });
      })
      .catch(err => {
        console.error('Failed to fetch voice token:', err);
        setError(t('voiceControl.apiKeyRequired'));
      });
  }, [enabled, t]);

  // Create session when config is available
  useEffect(() => {
    if (!sessionConfig || session) return;

    const newSession = new RealtimeSession({
      ephemeralKey: sessionConfig.ephemeralKey,
      model: sessionConfig.model,
      onStateChange: setSessionState,
      onTranscript: (text) => {
        setTranscript(text);
      },
      onToolCall: (toolName, args) => {
        const result = dispatchToolCall(toolName, args, handlers);
        if (result.success) {
          setLastCommand(`${toolName}: ${JSON.stringify(args)}`);
        } else {
          setError(result.error || 'Command failed');
        }
      },
      onError: (err) => {
        setError(err.message);
        setSessionState('error');
      },
    });

    setSession(newSession);
  }, [sessionConfig, session, handlers]);

  // Auto-disconnect on hard cap
  useEffect(() => {
    if (costMeter.shouldAutoStop() && session) {
      session.disconnect();
      setSessionState('idle');
      setError(t('voiceControl.hardCapReached'));
    }
  }, [costMeter, session, t]);

  const toggleSession = useCallback(async () => {
    if (!session) return;

    if (sessionState === 'idle' || sessionState === 'error') {
      try {
        await session.connect();
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect');
      }
    } else {
      await session.disconnect();
    }
  }, [session, sessionState]);

  // Update query_state handler to include current data
  const enhancedHandlers = useCallback(() => ({
    ...handlers,
    onQueryState: () => ({
      activeLayers,
      data,
      timestamp: Date.now(),
    }),
  }), [handlers, activeLayers, data]);

  if (!enabled) return null;

  const progress = costMeter.getProgress();
  const isWarning = costMeter.shouldWarn();
  const isCritical = costMeter.shouldAutoStop();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 3.5 }}
      className="absolute bottom-[75px] md:bottom-6 right-3 md:right-6 z-[200] flex items-end gap-2"
    >
      {/* Main button */}
      <motion.button
        onClick={toggleSession}
        className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all ${
          sessionState === 'listening' || sessionState === 'thinking' || sessionState === 'speaking'
            ? 'bg-[var(--cyan-primary)]/20 border-2 border-[var(--cyan-primary)]'
            : sessionState === 'error'
            ? 'bg-[var(--alert-red)]/20 border-2 border-[var(--alert-red)]'
            : 'bg-[var(--bg-panel)]/80 border border-[var(--border-primary)] hover:border-[var(--gold-primary)]/40'
        }`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {sessionState === 'connecting' ? (
          <Loader2 className="w-5 h-5 text-[var(--text-primary)] animate-spin" />
        ) : sessionState === 'listening' || sessionState === 'thinking' || sessionState === 'speaking' ? (
          <>
            <Mic className="w-5 h-5 text-[var(--cyan-primary)]" />
            <span className="absolute inset-0 rounded-full border-2 border-[var(--cyan-primary)] animate-ping" />
          </>
        ) : sessionState === 'error' ? (
          <AlertTriangle className="w-5 h-5 text-[var(--alert-red)]" />
        ) : (
          <MicOff className="w-5 h-5 text-[var(--text-muted)]" />
        )}
      </motion.button>

      {/* Status popover */}
      <AnimatePresence>
        {(sessionState !== 'idle' || error) && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className="glass-panel p-3 min-w-[200px] max-w-[280px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                {t('voiceControl.title')}
              </span>
              <button
                onClick={() => {
                  session?.disconnect();
                  setError('');
                }}
                className="p-1 hover:bg-white/5 rounded transition-colors"
              >
                <X className="w-3 h-3 text-[var(--text-muted)]" />
              </button>
            </div>

            {/* State indicator */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[9px] font-mono ${
                sessionState === 'listening' ? 'text-[var(--cyan-primary)]' :
                sessionState === 'thinking' ? 'text-[var(--gold-primary)]' :
                sessionState === 'speaking' ? 'text-[var(--alert-green)]' :
                sessionState === 'error' ? 'text-[var(--alert-red)]' :
                'text-[var(--text-muted)]'
              }`}>
                {t(`voiceControl.${sessionState}`)}
              </span>
              {(sessionState === 'listening' || sessionState === 'thinking' || sessionState === 'speaking') && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--cyan-primary)] animate-pulse" />
              )}
            </div>

            {/* Transcript */}
            {transcript && (
              <div className="mb-2">
                <div className="text-[8px] font-mono text-[var(--text-muted)] mb-1">
                  {t('voiceControl.transcript')}
                </div>
                <div className="text-[10px] text-[var(--text-primary)] leading-relaxed">
                  {transcript}
                </div>
              </div>
            )}

            {/* Last command */}
            {lastCommand && (
              <div className="mb-2">
                <div className="text-[8px] font-mono text-[var(--text-muted)] mb-1">
                  {t('voiceControl.lastCommand')}
                </div>
                <div className="text-[9px] text-[var(--gold-primary)] font-mono">
                  {lastCommand}
                </div>
              </div>
            )}

            {/* Cost meter */}
            <div className="pt-2 border-t border-[var(--border-secondary)]/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] font-mono text-[var(--text-muted)]">
                  {t('voiceControl.costMeter', {
                    current: progress.current.toFixed(2),
                    limit: progress.hard.toFixed(2),
                  })}
                </span>
                {isWarning && !isCritical && (
                  <span className="text-[8px] font-mono text-[var(--gold-primary)]">
                    {t('voiceControl.softCapWarning')}
                  </span>
                )}
                {isCritical && (
                  <span className="text-[8px] font-mono text-[var(--alert-red)]">
                    {t('voiceControl.hardCapReached')}
                  </span>
                )}
              </div>
              {/* Progress bar */}
              <div className="h-1 bg-[var(--bg-void)] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full transition-colors"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress.percentToHard}%` }}
                  style={{
                    backgroundColor: isCritical ? 'var(--alert-red)' : isWarning ? 'var(--gold-primary)' : 'var(--alert-green)',
                  }}
                />
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="mt-2 flex items-start gap-1.5 px-2 py-1.5 rounded bg-[var(--alert-red)]/10 border border-[var(--alert-red)]/30">
                <AlertTriangle className="w-3 h-3 text-[var(--alert-red)] shrink-0 mt-0.5" />
                <span className="text-[8px] font-mono text-[var(--alert-red)] leading-relaxed">
                  {error}
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const VoiceControl = memo(VoiceControlInner);
export default VoiceControl;
