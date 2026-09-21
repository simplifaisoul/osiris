'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, MapPin, Navigation, Building2, Globe2, Landmark } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — Enhanced Search / Locate Bar
   Street-level geocoding with intelligent zoom levels
   Ctrl+F / Cmd+F keyboard shortcut support
   ═══════════════════════════════════════════════════════════════ */

interface SearchResult {
  label: string;
  lat: number;
  lng: number;
  type: string;          // nominatim type (e.g. 'house', 'road', 'city')
  importance: number;    // nominatim importance score
  category: string;      // nominatim class (e.g. 'place', 'highway', 'building')
  zoomLevel: number;     // computed ideal zoom
}

interface SearchBarProps {
  onLocate: (lat: number, lng: number, zoom?: number) => void;
  alwaysExpanded?: boolean;
}

// Map Nominatim result types to appropriate zoom levels
/** How close to fly for each kind /api/geosearch returns. */
const ZOOM_BY_KIND: Record<string, number> = {
  address: 18,
  street: 16,
  poi: 16,
  city: 12,
  region: 8,
  country: 5,
  place: 13,
};


// Icon for result type
function getResultIcon(type: string, category: string) {
  if (['house', 'building', 'address', 'shop', 'amenity', 'office'].includes(type) || category === 'building') {
    return <Building2 className="w-3 h-3 text-[var(--cyan-primary)] flex-shrink-0" />;
  }
  if (['road', 'street', 'highway', 'path'].includes(type) || category === 'highway') {
    return <Navigation className="w-3 h-3 text-[var(--alert-green)] flex-shrink-0" />;
  }
  if (['country', 'continent', 'state'].includes(type)) {
    return <Globe2 className="w-3 h-3 text-[var(--gold-primary)] flex-shrink-0" />;
  }
  if (['city', 'town', 'village', 'municipality'].includes(type)) {
    return <Landmark className="w-3 h-3 text-[#FF9500] flex-shrink-0" />;
  }
  return <MapPin className="w-3 h-3 text-[var(--gold-primary)] flex-shrink-0" />;
}

// Format label: keep it concise
function formatLabel(displayName: string): { primary: string; secondary: string } {
  const parts = displayName.split(',').map(s => s.trim());
  if (parts.length <= 1) return { primary: parts[0] || '', secondary: '' };
  return {
    primary: parts.slice(0, 2).join(', '),
    secondary: parts.slice(2, 4).join(', '),
  };
}

export default function SearchBar({ onLocate, alwaysExpanded = false }: SearchBarProps) {
  const [open, setOpen] = useState(alwaysExpanded);
  const [value, setValue] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Ctrl+F / Cmd+F keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 50);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  // Close when clicking outside
  useEffect(() => {
    if (!open || alwaysExpanded) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setResults([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, alwaysExpanded]);

  const parseCoords = (s: string): { lat: number; lng: number } | null => {
    const m = s.trim().match(/^([+-]?\d+\.?\d*)[,\s]+([+-]?\d+\.?\d*)$/);
    if (!m) return null;
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
    return null;
  };

  const handleSearch = useCallback(async (q: string) => {
    setValue(q);
    setSelectedIdx(-1);

    // Direct coordinate input
    const coords = parseCoords(q);
    if (coords) {
      setResults([{
        label: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
        ...coords,
        type: 'coordinate',
        importance: 1,
        category: 'coordinate',
        zoomLevel: 15,
      }]);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) { setResults([]); return; }

    /* Through our own route, never straight to Nominatim: one cache and one
       budget for every visitor instead of one search per person per keystroke.
       See lib/nominatim.ts — the public instance allows one request a second
       across everybody using it, and this box was a large part of us being
       well over that. The debounce is longer for the same reason. */
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/geosearch?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults((data.results || []).map((r: { name: string; context: string; lat: number; lng: number; kind: string; score?: number }) => ({
          label: [r.name, r.context].filter(Boolean).join(', '),
          lat: r.lat,
          lng: r.lng,
          type: r.kind || 'unknown',
          importance: r.score ?? 0,
          category: r.kind || 'unknown',
          zoomLevel: ZOOM_BY_KIND[r.kind] ?? 13,
        })));
      } catch { setResults([]); }
      setLoading(false);
    }, 500);
  }, []);

  const handleSelect = (r: SearchResult) => {
    onLocate(r.lat, r.lng, r.zoomLevel);
    if (!alwaysExpanded) setOpen(false);
    setValue('');
    setResults([]);
    setSelectedIdx(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (alwaysExpanded) {
        setValue('');
        setResults([]);
        inputRef.current?.blur();
      } else {
        setOpen(false);
        setValue('');
        setResults([]);
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < results.length) {
        handleSelect(results[selectedIdx]);
      } else if (results.length > 0) {
        handleSelect(results[0]);
      }
    }
  };

  if (!open && !alwaysExpanded) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 glass-panel-sm px-3 py-2 text-[10px] font-mono tracking-[0.15em] text-[var(--text-muted)] hover:text-[var(--gold-primary)] hover:border-[var(--border-active)] transition-all hover:shadow-[0_0_12px_rgba(212,175,55,0.08)]"
      >
        <Search className="w-3 h-3" />
        CMD: LOCATE
      </button>
    );
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="flex items-center gap-2 glass-panel px-3 py-2.5 !border-[var(--border-active)] transition-all"
        style={{ boxShadow: '0 0 20px rgba(212,175,55,0.05), inset 0 0 20px rgba(0,0,0,0.2)' }}
      >
        <Search className="w-3.5 h-3.5 text-[var(--gold-primary)] flex-shrink-0" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="SEARCH ADDRESS, CITY, OR COORDINATES..."
          className="flex-1 bg-transparent text-[11px] text-[var(--text-primary)] font-mono tracking-wider outline-none placeholder:text-[var(--text-muted)]"
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <div className="w-3 h-3 border border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin" />}
        <span className="text-[9px] text-[var(--text-muted)] font-mono opacity-50 hidden md:inline">CTRL+F</span>
        {(value || !alwaysExpanded) && (
          <button onClick={() => {
            if (alwaysExpanded) { setValue(''); setResults([]); }
            else { setOpen(false); setValue(''); setResults([]); }
          }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-1 glass-panel overflow-hidden max-h-[320px] overflow-y-auto styled-scrollbar z-[9999]"
          style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 1px rgba(212,175,55,0.2)' }}
        >
          {results.map((r, i) => {
            const { primary, secondary } = formatLabel(r.label);
            const isSelected = i === selectedIdx;
            return (
              <button
                key={i}
                onClick={() => handleSelect(r)}
                onMouseEnter={() => setSelectedIdx(i)}
                className={`w-full text-left px-3 py-2.5 transition-colors border-b border-[var(--border-secondary)] last:border-0 flex items-start gap-2.5 ${
                  isSelected ? 'bg-[rgba(212,175,55,0.08)]' : 'hover:bg-[var(--hover-accent)]'
                }`}
              >
                <div className="mt-0.5">{getResultIcon(r.type, r.category)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-[var(--text-primary)] font-mono truncate leading-tight">{primary}</div>
                  {secondary && (
                    <div className="text-[9px] text-[var(--text-muted)] font-mono truncate mt-0.5">{secondary}</div>
                  )}
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider">
                    {r.type === 'coordinate' ? 'COORDS' : r.type}
                  </span>
                  <span className="text-[9px] text-[var(--gold-primary)] font-mono opacity-40">
                    Z{r.zoomLevel}
                  </span>
                </div>
              </button>
            );
          })}
          {/* Results come from OpenStreetMap, through Photon and Nominatim. */}
          <div className="px-3 py-1.5 border-t border-[var(--border-secondary)] text-[8.5px] font-mono tracking-wider text-[var(--text-muted)]">
            PLACES ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--gold-primary)]"
            >
              OPENSTREETMAP CONTRIBUTORS
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
