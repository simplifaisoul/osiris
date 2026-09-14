'use client';

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert, Lock, Unlock, Play, Loader2, AlertTriangle, Terminal,
  FileText, Crosshair, ChevronDown, ChevronUp,
} from 'lucide-react';

const OPERATOR_KEY_STORAGE = 'osiris_operator_key';
const POLL_MS = 4000;
const TERMINAL_STATES = new Set(['completed', 'failed', 'timeout', 'vulnerabilities_found']);

interface StrixReport {
  name: string;
  relative_path: string;
  size: number;
  content: string;
  truncated: boolean;
}
interface JobState {
  job_id?: string;
  target?: string;
  mode?: string;
  status?: string;
  exit_code?: number | null;
  duration_sec?: number;
  stdout_tail?: string;
  error?: string | null;
  reports?: StrixReport[];
}

interface StrixPanelProps {
  isMobile?: boolean;
  onClose?: () => void;
}

function statusColor(status?: string) {
  switch (status) {
    case 'completed': return 'var(--alert-green)';
    case 'vulnerabilities_found': return 'var(--alert-red)';
    case 'running':
    case 'queued': return 'var(--cyan-primary)';
    case 'timeout':
    case 'failed': return 'var(--gold-primary)';
    default: return 'var(--text-muted)';
  }
}

function StrixPanelInner({ isMobile }: StrixPanelProps) {
  const [available, setAvailable] = useState<boolean | null>(null); // null = still checking
  // Lazy-init from localStorage. Safe against SSR/hydration because the panel
  // renders null until `available` resolves client-side (same on server & client).
  const [operatorKey, setOperatorKey] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(OPERATOR_KEY_STORAGE) || '' : '');
  const [unlocked, setUnlocked] = useState(() =>
    typeof window !== 'undefined' ? !!localStorage.getItem(OPERATOR_KEY_STORAGE) : false);
  const [keyInput, setKeyInput] = useState('');

  const [target, setTarget] = useState('');
  const [mode, setMode] = useState<'quick' | 'standard'>('quick');
  const [instruction, setInstruction] = useState('');
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<JobState | null>(null);
  const [showOutput, setShowOutput] = useState(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Is the feature configured on this deployment? If not (503), render nothing.
  useEffect(() => {
    let alive = true;
    fetch('/api/strix')
      .then((r) => setAvailable(alive ? r.status !== 503 : false))
      .catch(() => alive && setAvailable(false));
    return () => { alive = false; };
  }, []);

  // Clean up any in-flight poll on unmount.
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const lock = useCallback(() => {
    localStorage.removeItem(OPERATOR_KEY_STORAGE);
    setOperatorKey(''); setUnlocked(false); setJob(null);
  }, []);

  const unlock = useCallback(() => {
    const k = keyInput.trim();
    if (!k) return;
    localStorage.setItem(OPERATOR_KEY_STORAGE, k);
    setOperatorKey(k); setUnlocked(true); setKeyInput(''); setError('');
  }, [keyInput]);

  const poll = useCallback((jobId: string, key: string) => {
    const tick = async () => {
      try {
        const res = await fetch(`/api/strix/${jobId}`, { headers: { 'x-operator-key': key } });
        if (res.status === 401) { setError('Operator key rejected.'); lock(); return; }
        const data: JobState = await res.json();
        setJob(data);
        if (!TERMINAL_STATES.has(data.status || '')) {
          pollRef.current = setTimeout(tick, POLL_MS);
        }
      } catch {
        pollRef.current = setTimeout(tick, POLL_MS);
      }
    };
    tick();
  }, [lock]);

  const launch = useCallback(async () => {
    if (!target.trim() || launching) return;
    setLaunching(true); setError(''); setJob(null);
    if (pollRef.current) clearTimeout(pollRef.current);
    try {
      const res = await fetch('/api/strix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-operator-key': operatorKey },
        body: JSON.stringify({ target: target.trim(), mode, instruction: instruction.trim() || undefined }),
      });
      const data = await res.json();
      if (res.status === 401) { setError('Operator key rejected.'); lock(); return; }
      if (!res.ok) { setError(data.detail || data.error || 'Launch failed.'); return; }
      setJob({ job_id: data.job_id, status: data.status, target: target.trim(), mode });
      poll(data.job_id, operatorKey);
    } catch {
      setError('Could not reach the Strix proxy.');
    } finally {
      setLaunching(false);
    }
  }, [target, mode, instruction, operatorKey, launching, poll, lock]);

  // Not configured on this deployment → the feature simply doesn't exist here.
  if (available === null || available === false) return null;

  const running = job ? !TERMINAL_STATES.has(job.status || '') : false;

  return (
    <motion.div
      initial={{ opacity: 0, x: isMobile ? 0 : 20 }} animate={{ opacity: 1, x: 0 }}
      className="glass-panel p-3 pointer-events-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-sm border border-[var(--alert-red)]/40 bg-[var(--alert-red)]/10 flex items-center justify-center">
          <ShieldAlert className="w-3.5 h-3.5 text-[var(--alert-red)]" />
        </div>
        <div className="flex flex-col flex-1">
          <span className="hud-text text-[10px] text-[var(--text-primary)] tracking-wider font-bold">STRIX · AUTONOMOUS PENTEST</span>
          <span className="text-[7px] font-mono text-[var(--text-muted)] tracking-widest uppercase">operator-gated · authorized targets only</span>
        </div>
        {unlocked && (
          <button onClick={lock} title="Lock (clear operator key)" className="text-[var(--text-muted)] hover:text-[var(--alert-red)] transition-colors p-1">
            <Lock className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Operator gate */}
      {!unlocked ? (
        <div className="space-y-2">
          <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-[var(--cyan-primary)]/5 border border-[var(--cyan-primary)]/20">
            <Lock className="w-3.5 h-3.5 text-[var(--cyan-primary)] shrink-0 mt-0.5" />
            <span className="text-[9px] font-mono text-[var(--text-secondary)] leading-relaxed">
              This tool actively exploits vulnerabilities. Enter your operator key to unlock.
            </span>
          </div>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
            placeholder="Operator key"
            className="w-full bg-black/30 border border-[var(--border-primary)] rounded px-2.5 py-1.5 text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--cyan-primary)]/50"
          />
          <button
            onClick={unlock}
            disabled={!keyInput.trim()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[var(--cyan-primary)]/15 border border-[var(--cyan-primary)]/40 text-[var(--cyan-primary)] text-[11px] font-mono font-bold tracking-wider hover:bg-[var(--cyan-primary)]/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Unlock className="w-3.5 h-3.5" /> UNLOCK
          </button>
        </div>
      ) : (
        <>
          {/* Authorization notice */}
          <div className="flex items-start gap-1.5 px-2 py-1.5 mb-2 rounded bg-[var(--alert-red)]/[0.07] border border-[var(--alert-red)]/25">
            <AlertTriangle className="w-3.5 h-3.5 text-[var(--alert-red)] shrink-0 mt-0.5" />
            <span className="text-[8px] font-mono text-[var(--text-secondary)] leading-relaxed">
              Only launch against targets you own or are explicitly authorized to test. You are responsible for lawful, ethical use.
            </span>
          </div>

          {/* Target */}
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Target — URL, GitHub repo, or host you own"
            className="w-full bg-black/30 border border-[var(--border-primary)] rounded px-2.5 py-1.5 text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--alert-red)]/50"
          />

          {/* Optional instruction */}
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Optional focus instruction (e.g. 'test the login flow')"
            className="mt-2 w-full bg-black/30 border border-[var(--border-primary)] rounded px-2.5 py-1.5 text-[10px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--cyan-primary)]/50"
          />

          {/* Mode + launch */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex rounded border border-[var(--border-primary)] overflow-hidden text-[9px] font-mono">
              <button
                onClick={() => setMode('quick')}
                className={`px-2 py-1 transition-colors ${mode === 'quick' ? 'bg-[var(--cyan-primary)]/20 text-[var(--cyan-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
              >QUICK</button>
              <button
                onClick={() => setMode('standard')}
                className={`px-2 py-1 transition-colors ${mode === 'standard' ? 'bg-[var(--alert-red)]/20 text-[var(--alert-red)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
              >DEEP</button>
            </div>
            <button
              onClick={launch}
              disabled={!target.trim() || launching || running}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[var(--alert-red)]/15 border border-[var(--alert-red)]/40 text-[var(--alert-red)] text-[11px] font-mono font-bold tracking-wider hover:bg-[var(--alert-red)]/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {launching || running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {running ? 'RUNNING' : 'LAUNCH'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-2 flex items-start gap-1.5 px-2 py-1.5 rounded bg-[var(--alert-red)]/10 border border-[var(--alert-red)]/30">
              <AlertTriangle className="w-3.5 h-3.5 text-[var(--alert-red)] shrink-0 mt-0.5" />
              <span className="text-[9px] font-mono text-[var(--alert-red)] leading-relaxed">{error}</span>
            </div>
          )}

          {/* Job status + results */}
          <AnimatePresence>
            {job && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
                <div className="rounded-lg border border-[var(--border-primary)] bg-black/20 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Crosshair className="w-3 h-3 text-[var(--text-muted)]" />
                      <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate max-w-[160px]">{job.target}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[9px] font-mono font-bold uppercase tracking-wider" style={{ color: statusColor(job.status) }}>
                      {running && <Loader2 className="w-3 h-3 animate-spin" />}
                      {job.status}
                    </span>
                  </div>
                  {typeof job.duration_sec === 'number' && (
                    <div className="text-[8px] font-mono text-[var(--text-muted)] mt-0.5">
                      {Math.round(job.duration_sec)}s{job.exit_code != null ? ` · exit ${job.exit_code}` : ''}
                    </div>
                  )}
                  {job.error && (
                    <div className="text-[9px] font-mono text-[var(--alert-red)] mt-1 leading-relaxed">{job.error}</div>
                  )}
                </div>

                {/* Report artifacts */}
                {job.reports && job.reports.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {job.reports.map((rep, i) => (
                      <details key={i} className="rounded border border-[var(--border-primary)] bg-black/20">
                        <summary className="flex items-center gap-1.5 px-2 py-1 cursor-pointer text-[9px] font-mono text-[var(--text-secondary)] hover:text-[var(--cyan-primary)]">
                          <FileText className="w-3 h-3" /> {rep.relative_path}
                          <span className="text-[var(--text-muted)]/60">({rep.size}B)</span>
                        </summary>
                        <pre className="px-2 py-1.5 text-[8px] font-mono text-[var(--text-muted)] whitespace-pre-wrap break-all max-h-60 overflow-y-auto styled-scrollbar">{rep.content}{rep.truncated ? '\n…(truncated)' : ''}</pre>
                      </details>
                    ))}
                  </div>
                )}

                {/* Live/console output */}
                {job.stdout_tail && (
                  <div className="mt-2">
                    <button onClick={() => setShowOutput((v) => !v)} className="flex items-center gap-1 text-[9px] font-mono text-[var(--text-muted)] hover:text-[var(--text-secondary)] uppercase tracking-widest">
                      <Terminal className="w-3 h-3" /> console
                      {showOutput ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {showOutput && (
                      <pre className="mt-1 px-2 py-1.5 rounded bg-black/40 border border-[var(--border-primary)] text-[8px] font-mono text-[var(--text-muted)] whitespace-pre-wrap break-all max-h-60 overflow-y-auto styled-scrollbar">{job.stdout_tail}</pre>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}

const StrixPanel = memo(StrixPanelInner);
export default StrixPanel;
