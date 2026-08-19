'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Radio, Maximize2, X } from 'lucide-react';

/**
 * OSIRIS — LIVE FROM SPACE
 *
 * 24/7 downlink from cameras mounted outside the International Space Station.
 *
 * The feed list is deliberately short. Every candidate was checked against
 * three conditions, not one: the video must be OK (not UNPLAYABLE), it must be
 * live right now, and it must be embeddable. Eleven well-known "24/7 ISS"
 * streams were tested and only these three passed — the official NASA ISS
 * video ids are all UNPLAYABLE now, and several popular mirrors are live but
 * refuse embedding, which renders as an error box inside the panel rather than
 * as a missing feed. That is why the list is not longer.
 *
 * Sen leads because it is the camera operator rather than a mirror: those are
 * its own 4K cameras mounted on the ISS. The other two are re-broadcasts and
 * share a channel, so they are one failure away from going dark together.
 */

interface SpaceFeed {
  id: string;
  label: string;
  detail: string;
  videoId: string;
}

const FEEDS: SpaceFeed[] = [
  {
    id: 'sen-4k',
    label: '4K EARTH',
    detail: "Sen · 4K cameras mounted on the ISS",
    videoId: 'fO9e9jnhYK8',
  },
  {
    id: 'iss-earth',
    label: 'EARTH VIEW',
    detail: 'ISS external camera · nadir',
    videoId: 'tj4knR4r1UU',
  },
  {
    id: 'iss-overview',
    label: 'OVERVIEW CAM',
    detail: 'ISS overview camera · wide',
    videoId: 'OKQEMp2555A',
  },
];

// The ISS orbits at roughly 408 km and circles the planet about every 93
// minutes, which is the only "location" this camera has.
const ORBIT_ALT_KM = 408;

/**
 * YouTube picks its resolution from the *rendered size of the player*, not from
 * anything in the embed URL — the old `vq` and `hd` parameters are ignored. In
 * the 320px-wide rail this panel lives in, that means a 320x180 player and a
 * correctly-chosen 144p stream. Sen publishes up to 2160p, so the only way to
 * actually see it is to give the player a big viewport, which is what the
 * expanded view is for.
 *
 * The overlay is portalled to document.body: the tool rail is inside a
 * translated ancestor, and a transform makes position:fixed resolve against
 * that ancestor instead of the viewport, so rendering it in place would trap it
 * in the sidebar.
 */
function buildEmbedSrc(videoId: string, big: boolean): string {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    playsinline: '1',
    modestbranding: '1',
    rel: '0',
  });
  // Only meaningful in the expanded player; harmless in the docked one.
  if (big) params.set('vq', 'hd1080');
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export default function SpaceCam() {
  const [active, setActive] = useState(FEEDS[0]);
  const [expanded, setExpanded] = useState(false);

  // Escape closes the expanded view — it covers the whole map.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  return (
    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-panel)] backdrop-blur-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-secondary)]/40">
        <Radio className="w-3.5 h-3.5 text-[#00E5FF]" />
        <span className="text-[12px] font-mono font-bold tracking-widest text-[#00E5FF]">
          LIVE FROM SPACE
        </span>
        <span className="ml-auto flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF3D3D] animate-pulse" />
          <span className="text-[10px] font-mono tracking-wider text-[var(--text-muted)]">24/7</span>
        </span>
        <button
          onClick={() => setExpanded(true)}
          title="Expand — a bigger player is what makes YouTube serve HD"
          className="ml-1 p-1 rounded hover:bg-[var(--hover-accent)] text-[var(--text-muted)] hover:text-[#00E5FF] transition-colors"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
      </div>

      <div className="relative w-full group/player" style={{ aspectRatio: '16 / 9', background: '#000' }}>
        <iframe
          key={active.videoId}
          src={buildEmbedSrc(active.videoId, false)}
          title={`ISS live — ${active.label}`}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
        {/* At 320px wide YouTube will only ever send a low-resolution rendition,
            so the panel says so rather than looking broken. */}
        <button
          onClick={() => setExpanded(true)}
          className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-mono tracking-wider text-[#00E5FF] opacity-0 group-hover/player:opacity-100 transition-opacity"
        >
          EXPAND FOR HD ↗
        </button>
      </div>

      {FEEDS.length > 1 && (
        <div className="flex gap-1 px-2 pt-2">
          {FEEDS.map(f => (
            <button
              key={f.id}
              onClick={() => setActive(f)}
              className={`flex-1 px-2 py-1.5 rounded text-[10px] font-mono tracking-wider transition-colors border ${
                active.id === f.id
                  ? 'border-[#00E5FF]/40 bg-[#00E5FF]/15 text-[#00E5FF]'
                  : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--hover-accent)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-mono text-[var(--text-secondary)] truncate">{active.detail}</div>
          <div className="text-[10px] font-mono text-[var(--text-muted)]">
            ALT ~{ORBIT_ALT_KM} KM · ORBIT ~93 MIN
          </div>
        </div>
        <a
          href={`https://www.youtube.com/watch?v=${active.videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border-secondary)]/40 text-[10px] font-mono text-[var(--text-muted)] hover:text-[#00E5FF] hover:border-[#00E5FF]/40 transition-colors flex-shrink-0"
        >
          SOURCE <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>

      {expanded && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9000] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 md:p-8"
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-full max-w-[1600px]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <Radio className="w-4 h-4 text-[#00E5FF]" />
              <span className="text-[12px] font-mono font-bold tracking-widest text-[#00E5FF]">
                LIVE FROM SPACE
              </span>
              <span className="text-[12px] font-mono text-[var(--text-muted)]">· {active.detail}</span>
              <span className="ml-auto flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF3D3D] animate-pulse" />
                <span className="text-[11px] font-mono tracking-wider text-[var(--text-muted)]">24/7</span>
              </span>
              <button
                onClick={() => setExpanded(false)}
                title="Close (Esc)"
                className="p-1.5 rounded hover:bg-white/10 text-[var(--text-muted)] hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sized off the viewport so the player is large enough for YouTube
                to step up to 1080p/4K. Capped by height as well as width so a
                wide monitor does not push the controls off-screen. */}
            <div
              className="relative w-full mx-auto"
              style={{ aspectRatio: '16 / 9', maxHeight: '82vh', background: '#000' }}
            >
              <iframe
                key={`big-${active.videoId}`}
                src={buildEmbedSrc(active.videoId, true)}
                title={`ISS live expanded — ${active.label}`}
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
            </div>

            <div className="flex items-center gap-2 mt-3">
              {FEEDS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setActive(f)}
                  className={`px-3 py-1.5 rounded text-[12px] font-mono tracking-wider transition-colors border ${
                    active.id === f.id
                      ? 'border-[#00E5FF]/40 bg-[#00E5FF]/15 text-[#00E5FF]'
                      : 'border-white/10 text-[var(--text-muted)] hover:bg-white/10'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <span className="ml-auto text-[11px] font-mono text-[var(--text-muted)]">
                ALT ~{ORBIT_ALT_KM} KM · ORBIT ~93 MIN · ESC TO CLOSE
              </span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
