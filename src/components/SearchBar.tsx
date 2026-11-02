'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { Loader2, Navigation, Route, Search, SearchX, X } from 'lucide-react';
import { searchPlaces, type GeoResult } from '@/lib/geosearch';
import { forgetRecent, loadRecent, rememberPlace, type RecentPlace } from '@/lib/recent-places';
import { Key, PlaceRow, type PlaceLike } from './places';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — Search
   A place, an address, a landmark or a pair of coordinates, and the map
   flies there. Before anything is typed it offers where you are and where
   you went last; each result can be handed to Directions as the destination.
   Ctrl+F (⌘F) from anywhere, arrows and Enter to choose, Shift+Enter for
   directions, Esc to close.
   ═══════════════════════════════════════════════════════════════ */

interface Hit extends PlaceLike {
  /** How close to fly. */
  zoom: number;
}

interface SearchBarProps {
  onLocate: (lat: number, lng: number, zoom?: number) => void;
  /** Where the map is looking. Results near it rank first, and each shows how far it is. */
  center?: { lat: number; lng: number } | null;
  /** Close the panel: Esc on an empty box, a click elsewhere, or a pick. */
  onClose?: () => void;
  /** Hand a place to Directions as the destination. */
  onDirections?: (place: PlaceLike) => void;
  /** Inside another container (the phone drawer): no frame of its own. */
  embedded?: boolean;
}

/** How close to fly for each kind /api/geosearch returns. */
const ZOOM_BY_KIND: Record<string, number> = {
  address: 18,
  street: 16,
  poi: 16,
  city: 12,
  region: 8,
  country: 5,
  place: 13,
  coordinate: 15,
};

const TRY = ['Eiffel Tower', '10 Downing Street', '35.6586, 139.7454'];

const parseCoords = (s: string): { lat: number; lng: number } | null => {
  const m = s.trim().match(/^([+-]?\d+\.?\d*)[,\s]+([+-]?\d+\.?\d*)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
};

export default function SearchBar({ onLocate, center = null, onClose, onDirections, embedded = false }: SearchBarProps) {
  const [value, setValue] = useState('');
  const [results, setResults] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  // The query the current results answer, so "no results" is never shown for a search still on its way.
  const [answered, setAnswered] = useState('');
  const [selected, setSelected] = useState(0);
  const [recent, setRecent] = useState<RecentPlace[]>(() => (typeof window === 'undefined' ? [] : loadRecent()));
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 50); return () => clearTimeout(t); }, []);

  // Ctrl+F / ⌘F while open: back to the box, with what is in it selected.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  // A click anywhere else closes it, except on the button that toggles it (which closes it itself).
  useEffect(() => {
    if (!onClose || embedded) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (boxRef.current?.contains(t as Node) || t?.closest('[data-search-toggle]')) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, embedded]);

  const typing = value.trim().length > 0;
  const you: Hit = { label: 'Your location', context: locateNote || 'Fly to where you are', lat: 0, lng: 0, kind: 'current', zoom: 14 };
  const items: Hit[] = typing ? results : [you, ...recent.map(r => ({ ...r, zoom: ZOOM_BY_KIND[r.kind ?? ''] ?? 13 }))];
  const active = Math.min(selected, Math.max(0, items.length - 1));

  const search = useCallback((q: string) => {
    setValue(q);
    setSelected(0);
    if (timerRef.current) clearTimeout(timerRef.current);

    const coords = parseCoords(q);
    if (coords) {
      abortRef.current?.abort();
      setLoading(false);
      setResults([{ label: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`, context: 'Coordinates', ...coords, kind: 'coordinate', zoom: 15 }]);
      setAnswered(q);
      return;
    }
    if (q.trim().length < 2) { abortRef.current?.abort(); setResults([]); setLoading(false); setAnswered(q); return; }

    /* Photon from the browser, Nominatim only through our own route (see
       lib/geosearch.ts). It sends where the map is looking, so "Notre-Dame"
       over Montreal is the basilica rather than a village in Normandy, and
       abandons the lookup for an earlier keystroke, so a slow reply for "Par"
       can never land after the one for "Paris". */
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const show = (found: GeoResult[]) => setResults(found.map(r => ({
        label: r.name, context: r.context, lat: r.lat, lng: r.lng, kind: r.kind || 'place', zoom: ZOOM_BY_KIND[r.kind] ?? 13,
      })));
      try {
        const found = await searchPlaces(q, center, ctrl.signal, show);
        if (ctrl.signal.aborted) return;
        show(found);
      } catch {
        // An abandoned lookup is not a failure; the newer one owns the list.
        if (ctrl.signal.aborted) return;
        setResults([]);
      }
      setAnswered(q);
      setLoading(false);
    }, 380);
  }, [center]);

  /** Where you are: the browser's fix when it will give one, else the network's rough idea. */
  const locate = useCallback(async () => {
    setLocating(true);
    setLocateNote('');
    const fix = await new Promise<GeolocationPosition | null>(resolve => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    });
    if (fix) {
      onLocate(fix.coords.latitude, fix.coords.longitude, 15);
      setLocating(false);
      onClose?.();
      return;
    }
    try {
      const d = await (await fetch('/api/geo')).json();
      if (d?.lat && d?.lon) {
        onLocate(d.lat, d.lon, 11);
        setLocating(false);
        onClose?.();
        return;
      }
    } catch { /* fall through to the note */ }
    setLocateNote('Location unavailable: allow it in the browser, or search instead');
    setLocating(false);
  }, [onLocate, onClose]);

  const go = (h: Hit) => {
    if (h.kind === 'current') { void locate(); return; }
    onLocate(h.lat, h.lng, h.zoom);
    setRecent(rememberPlace({ label: h.label, context: h.context, lat: h.lat, lng: h.lng, kind: h.kind }));
    setValue('');
    setResults([]);
    onClose?.();
  };

  const directions = (h: Hit) => {
    if (!onDirections || h.kind === 'current') return;
    setRecent(rememberPlace({ label: h.label, context: h.context, lat: h.lat, lng: h.lng, kind: h.kind }));
    onDirections({ label: h.label, context: h.context, lat: h.lat, lng: h.lng, kind: h.kind });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (value) { search(''); } else onClose?.();
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const h = items[active];
      if (!h) return;
      if (e.shiftKey) directions(h); else go(h);
    }
  };

  const noResults = typing && !loading && answered === value && value.trim().length >= 2 && results.length === 0;

  return (
    <div ref={boxRef} className={embedded ? 'flex flex-col' : 'glass-panel tool-glass relative overflow-hidden flex flex-col max-h-[min(72vh,600px)]'}>
      {!embedded && <span aria-hidden className="absolute inset-x-0 top-0 h-px z-10" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--gold-rgb),0.7) 30%, rgba(var(--gold-rgb),0.7) 70%, transparent)' }} />}

      {/* ── the box ── */}
      <div className={`relative flex items-center gap-3 flex-shrink-0 ${embedded ? 'h-12 px-3.5 rounded-xl border border-[var(--border-primary)] bg-black/40 focus-within:border-[var(--border-active)]' : 'h-14 px-4 border-b border-[var(--border-secondary)]'}`}>
        <Search className="w-[18px] h-[18px] flex-shrink-0 text-[var(--gold-primary)]" />
        <input
          ref={inputRef}
          value={value}
          onChange={e => search(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search places, addresses or coordinates"
          aria-label="Search places"
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={listId}
          aria-activedescendant={items.length ? `${listId}-${active}` : undefined}
          className="flex-1 min-w-0 bg-transparent text-[15px] text-[var(--text-heading)] outline-none placeholder:text-[var(--text-muted)]"
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-[var(--gold-primary)]" aria-label="Searching" />}
        {value ? (
          <button onClick={() => { search(''); inputRef.current?.focus(); }} aria-label="Clear the search"
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-white/[0.06] transition-colors">
            <X className="w-4 h-4" />
          </button>
        ) : !embedded && (
          <span className="hidden md:flex items-center gap-1 flex-shrink-0" aria-hidden><Key>Ctrl</Key><Key>F</Key></span>
        )}
        {/* While a search is on its way, a line of gold runs under the box. */}
        {loading && !embedded && <span aria-hidden className="absolute left-0 right-0 bottom-[-1px] h-px overflow-hidden"><span className="tool-scan block h-full w-1/3" /></span>}
      </div>

      {/* ── what to choose from ── */}
      <div className={`min-h-0 overflow-y-auto styled-scrollbar ${embedded ? 'pt-3' : 'p-2'}`}>
        {!typing && (
          <span className={`block px-3 pt-1 pb-1.5 text-[10px] font-mono tracking-[0.14em] uppercase text-[var(--text-muted)] ${embedded ? 'px-1' : ''}`}>
            {recent.length ? 'Jump to' : 'Start here'}
          </span>
        )}
        <div id={listId} role="listbox" aria-label={typing ? 'Places found' : 'Suggestions'} className="flex flex-col gap-0.5">
          {items.map((h, i) => (
            <PlaceRow key={`${h.kind}-${h.label}-${h.lat}-${i}`} id={`${listId}-${i}`} place={h} query={typing ? value : ''} on={i === active}
              onPick={() => go(h)} onHover={() => setSelected(i)} from={center}
              kindOverride={!typing && h.kind !== 'current' ? 'recent' : undefined}
              trailing={h.kind === 'current'
                ? (locating ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-[var(--gold-primary)]" /> : undefined)
                : onDirections && (
                  <button onClick={() => directions(h)} aria-label={`Directions to ${h.label}`} title="Directions (Shift+Enter)"
                    className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all ${i === active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'} border-[rgba(var(--gold-rgb),0.35)] text-[var(--gold-light)] bg-[rgba(var(--gold-rgb),0.06)] hover:bg-[rgba(var(--gold-rgb),0.16)]`}>
                    <Route className="w-4 h-4" />
                  </button>
                )} />
          ))}
        </div>

        {!typing && recent.length > 0 && (
          <button onClick={() => { forgetRecent(); setRecent([]); setSelected(0); }}
            className="mt-1 ml-3 text-[10.5px] text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors">
            Clear recent places
          </button>
        )}

        {!typing && (
          <div className={`mt-3 mb-1 flex flex-wrap items-center gap-1.5 ${embedded ? '' : 'px-3'}`}>
            <span className="text-[10px] font-mono tracking-[0.14em] uppercase text-[var(--text-muted)] mr-1">Try</span>
            {TRY.map(t => (
              <button key={t} onClick={() => { search(t); inputRef.current?.focus(); }}
                className="h-7 px-2.5 rounded-full border border-[var(--border-secondary)] bg-white/[0.02] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-heading)] hover:border-[var(--border-primary)] transition-colors">
                {t}
              </button>
            ))}
          </div>
        )}

        {noResults && (
          <div role="status" className="flex flex-col items-center text-center px-6 py-8">
            <span className="w-11 h-11 rounded-full flex items-center justify-center border border-[var(--border-secondary)] bg-white/[0.02]">
              <SearchX className="w-5 h-5 text-[var(--text-muted)]" />
            </span>
            <p className="mt-3 text-[13px] text-[var(--text-heading)]">No places match “{value.trim()}”</p>
            <p className="mt-1 max-w-[320px] text-[11.5px] leading-relaxed text-[var(--text-muted)]">
              Try a city, a street, a landmark, or coordinates such as 48.8584, 2.2945.
            </p>
          </div>
        )}

        {typing && loading && results.length === 0 && (
          <div className="flex flex-col gap-0.5" aria-hidden>
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <span className="w-8 h-8 rounded-lg bg-white/[0.04] animate-pulse" />
                <span className="flex-1 flex flex-col gap-1.5">
                  <span className="h-3 rounded bg-white/[0.05] animate-pulse" style={{ width: `${62 - i * 12}%` }} />
                  <span className="h-2.5 rounded bg-white/[0.03] animate-pulse" style={{ width: `${44 - i * 8}%` }} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── keys and credit ── */}
      <div className={`flex items-center gap-3 flex-shrink-0 text-[10px] text-[var(--text-muted)] ${embedded ? 'pt-2' : 'px-4 h-9 border-t border-[var(--border-secondary)]'}`}>
        {!embedded && (
          <span className="hidden md:flex items-center gap-2.5">
            <span className="flex items-center gap-1"><Key>↑</Key><Key>↓</Key> move</span>
            <span className="flex items-center gap-1"><Key>↵</Key> go</span>
            {onDirections && <span className="flex items-center gap-1"><Key>⇧</Key><Key>↵</Key><Navigation className="w-3 h-3" /> route</span>}
            <span className="flex items-center gap-1"><Key>Esc</Key> close</span>
          </span>
        )}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="ml-auto hover:text-[var(--gold-light)] transition-colors">
          © OpenStreetMap
        </a>
      </div>
    </div>
  );
}
