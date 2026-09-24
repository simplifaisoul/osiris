'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  analyzerLink, loadDigitalDon, parseHolders, parseResult, toUpdate,
  type DigitalDonHandle, type DigitalDonHolders, type DigitalDonRequest, type DigitalDonResult,
} from '@/lib/digitaldon';

/**
 * OSIRIS — the DigitalDon token-analysis card.
 *
 * Mounts the third-party widget (a cross-origin, sandboxed iframe created by
 * its own loader) into this component's box, in dark mode. The iframe sizes
 * its own height; this component gives it a width and never touches its
 * style. Everything it renders is theirs; what comes back through the
 * callbacks is validated in lib/digitaldon before it reaches our UI.
 *
 * `request` drives the card from outside: each new `id` loads that query or
 * token. A request that arrives before the frame is ready is held and sent
 * the moment it is, and a remount (fullscreen, maximize) starts from the
 * latest one, so the visitor never loses the token on screen.
 */

export type DigitalDonCommand = DigitalDonRequest & { id: number };

interface Props {
  /** Load this query or token; a new `id` loads again. */
  request?: DigitalDonCommand | null;
  /** Show the widget's own search box. Off when the host has its own. */
  search?: boolean;
  /** Frame height before the widget reports its own. */
  initialHeight?: number;
  /** Where the fallback link says it came from (utm_medium). */
  source: string;
  onResult?: (r: DigitalDonResult) => void;
  onHolders?: (h: DigitalDonHolders) => void;
}

/** Past this without the frame saying it booted, offer the link instead. */
const READY_TIMEOUT_MS = 20_000;

type Status = 'loading' | 'ready' | 'failed';

export default function DigitalDonWidget({ request = null, search = true, initialHeight = 300, source, onResult, onHolders }: Props) {
  const slotRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<DigitalDonHandle | null>(null);
  const readyRef = useRef(false);
  const sentIdRef = useRef<number | null>(null);
  const requestRef = useRef<DigitalDonCommand | null>(request);
  const callbacksRef = useRef({ onResult, onHolders });
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    callbacksRef.current = { onResult, onHolders };
  }, [onResult, onHolders]);

  // Mount once per component instance; destroy on unmount. The `cancelled`
  // guard makes React's development double-effect a no-op: the first pass is
  // cancelled before the loader resolves, so one iframe is ever created.
  useEffect(() => {
    let cancelled = false;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;

    const sendPending = () => {
      const req = requestRef.current;
      const h = handleRef.current;
      if (!h || !readyRef.current || !req || req.id === sentIdRef.current) return;
      sentIdRef.current = req.id;
      h.update({ ...toUpdate(req), theme: 'dark' });
    };

    loadDigitalDon()
      .then(api => {
        const slot = slotRef.current;
        if (cancelled || !slot || handleRef.current) return;
        const initial = requestRef.current;
        const handle = api.mount(slot, {
          ...(initial ? toUpdate(initial) : {}),
          theme: 'dark',
          search: search ? '1' : '0',
          height: initialHeight,
          onReady: () => {
            if (cancelled) return;
            readyRef.current = true;
            clearTimeout(readyTimer);
            setStatus('ready');
            sendPending();
          },
          onResult: raw => {
            const r = parseResult(raw);
            if (r && !cancelled) callbacksRef.current.onResult?.(r);
          },
          onHolders: raw => {
            const h = parseHolders(raw);
            if (h && !cancelled) callbacksRef.current.onHolders?.(h);
          },
        });
        if (!handle) { setStatus('failed'); return; }
        handleRef.current = handle;
        sentIdRef.current = initial ? initial.id : null;
        readyTimer = setTimeout(() => { if (!readyRef.current && !cancelled) setStatus('failed'); }, READY_TIMEOUT_MS);
      })
      .catch(() => { if (!cancelled) setStatus('failed'); });

    return () => {
      cancelled = true;
      clearTimeout(readyTimer);
      handleRef.current?.destroy();
      handleRef.current = null;
      readyRef.current = false;
      sentIdRef.current = null;
    };
    // `search` and `initialHeight` are mount-time options by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new request: send it now if the frame is ready, otherwise it goes out
  // from onReady above.
  useEffect(() => {
    requestRef.current = request;
    const h = handleRef.current;
    if (!h || !readyRef.current || !request || request.id === sentIdRef.current) return;
    sentIdRef.current = request.id;
    h.update({ ...toUpdate(request), theme: 'dark' });
  }, [request]);

  return (
    <div className="relative w-full max-w-[520px]" style={status === 'loading' ? { minHeight: initialHeight } : undefined}>
      {/* The loader appends the iframe here. Hidden, not removed, on failure:
          a slow frame that boots after the timeout still shows up. */}
      <div ref={slotRef} className={status === 'failed' ? 'hidden' : 'w-full'} />

      {status === 'loading' && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[9px] font-mono tracking-[0.2em] text-[var(--text-muted)] pointer-events-none"
          role="status"
        >
          LOADING DIGITALDON…
        </div>
      )}

      {status === 'failed' && (
        <div className="p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/40 text-[10px] font-mono leading-relaxed text-[var(--text-muted)]" role="status">
          The DigitalDon analyzer could not load here. A content blocker or the network may be stopping widget.digitaldon.net.
          <a
            href={analyzerLink(request, `${source}_fallback`)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Open it on digitaldon.net <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      )}
    </div>
  );
}
