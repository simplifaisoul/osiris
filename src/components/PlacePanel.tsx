'use client';

import { useEffect, useState } from 'react';
import {
  X, MapPin, Clock, Phone, Globe, Accessibility, Star, Loader2,
  Navigation2, ExternalLink, Utensils, Building2, Quote,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — Place Intelligence Panel
   Open-source "what is here?" card: OSM tags + Wikipedia + Mangrove
   ═══════════════════════════════════════════════════════════════ */

export interface PlaceReview {
  rating: number | null;
  opinion: string;
  author: string;
  date: string;
}

export interface PlaceResult {
  name: string;
  category: string | null;
  lat: number;
  lng: number;
  address: string | null;
  details: Record<string, string>;
  description: { text: string; title: string; url: string; thumbnail: string | null } | null;
  reviews: { count: number; average: number | null; items: PlaceReview[] };
  osm: { type: string; id: number } | null;
}

interface PlacePanelProps {
  target: { lat: number; lng: number } | null;
  onClose: () => void;
  onRouteTo?: (place: { label: string; lat: number; lng: number }) => void;
}

const DETAIL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Hours: Clock,
  Phone: Phone,
  Website: Globe,
  Wheelchair: Accessibility,
  Cuisine: Utensils,
};

/** Mangrove ratings are 0–100; show them as familiar 5-star values. */
export function toStars(rating0to100: number): number {
  return Math.round((rating0to100 / 20) * 10) / 10;
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-2.5 h-2.5 ${
            i <= Math.round(value)
              ? 'text-[var(--gold-primary)] fill-[var(--gold-primary)]'
              : 'text-[var(--text-muted)]'
          }`}
        />
      ))}
    </span>
  );
}

export default function PlacePanel({ target, onClose, onRouteTo }: PlacePanelProps) {
  // Single state object seeded as "loading" — the parent keys this component by
  // target, so a new probe remounts it rather than resetting state in an effect.
  const [{ place, loading, error }, setState] = useState<{
    place: PlaceResult | null; loading: boolean; error: string | null;
  }>({ place: null, loading: true, error: null });

  const lat = target?.lat;
  const lng = target?.lng;

  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    let cancelled = false;

    fetch(`/api/place?lat=${lat}&lng=${lng}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) setState({ place: null, loading: false, error: data.error || 'Lookup failed' });
        else setState({ place: data, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled) setState({ place: null, loading: false, error: 'Place service unreachable' });
      });

    return () => { cancelled = true; };
  }, [lat, lng]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!target) return null;

  return (
    <div
      className="glass-panel overflow-hidden flex flex-col max-h-[min(72vh,620px)]"
      style={{ boxShadow: '0 16px 50px rgba(0,0,0,0.65)' }}
    >
      {/* header */}
      <div className="flex items-start gap-2 px-3 py-2.5 border-b border-[var(--border-secondary)]">
        <MapPin className="w-3.5 h-3.5 text-[var(--gold-primary)] flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-mono text-[var(--text-primary)] leading-tight truncate">
            {loading ? 'IDENTIFYING…' : place?.name || 'UNKNOWN LOCATION'}
          </div>
          {place?.category && (
            <div className="text-[8px] font-mono text-[var(--gold-primary)] tracking-[0.15em] uppercase mt-0.5">
              {place.category}
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="overflow-y-auto styled-scrollbar">
        {loading && (
          <div className="flex items-center gap-2 px-3 py-6 justify-center">
            <Loader2 className="w-4 h-4 text-[var(--gold-primary)] animate-spin" />
            <span className="text-[9px] font-mono text-[var(--text-muted)] tracking-wider">
              QUERYING OSM · WIKIPEDIA · MANGROVE
            </span>
          </div>
        )}

        {error && !loading && (
          <div className="px-3 py-4 text-[9px] font-mono text-[var(--alert-red)] tracking-wider">
            {error.toUpperCase()}
          </div>
        )}

        {place && !loading && (
          <>
            {place.description?.thumbnail && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={place.description.thumbnail}
                alt={place.name}
                className="w-full h-32 object-cover border-b border-[var(--border-secondary)]"
              />
            )}

            {place.address && (
              <div className="px-3 py-2 border-b border-[var(--border-secondary)]">
                <div className="text-[9px] font-mono text-[var(--text-muted)] leading-snug">{place.address}</div>
                <div className="text-[8px] font-mono text-[var(--text-muted)] opacity-60 mt-1">
                  {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
                </div>
              </div>
            )}

            {Object.keys(place.details).length > 0 && (
              <div className="px-3 py-2 border-b border-[var(--border-secondary)] flex flex-col gap-1.5">
                {Object.entries(place.details).map(([label, value]) => {
                  const Icon = DETAIL_ICONS[label] || Building2;
                  const isLink = /^https?:\/\//.test(value);
                  return (
                    <div key={label} className="flex items-start gap-2">
                      <Icon className="w-3 h-3 text-[var(--cyan-primary)] flex-shrink-0 mt-0.5" />
                      <span className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider w-16 flex-shrink-0">
                        {label}
                      </span>
                      {isLink ? (
                        <a
                          href={value} target="_blank" rel="noopener noreferrer"
                          className="text-[9px] font-mono text-[var(--cyan-primary)] hover:underline truncate flex-1"
                        >
                          {value.replace(/^https?:\/\//, '').slice(0, 40)}
                        </a>
                      ) : (
                        <span className="text-[9px] font-mono text-[var(--text-primary)] flex-1 break-words">{value}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {place.description && (
              <div className="px-3 py-2.5 border-b border-[var(--border-secondary)]">
                <div className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-[0.15em] mb-1.5">
                  About · Wikipedia
                </div>
                <p className="text-[9px] font-mono text-[var(--text-primary)] leading-relaxed">
                  {place.description.text.slice(0, 400)}
                  {place.description.text.length > 400 ? '…' : ''}
                </p>
                <a
                  href={place.description.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1.5 text-[8px] font-mono text-[var(--cyan-primary)] hover:underline"
                >
                  {place.description.title} <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            )}

            {/* reviews — open data, and honest when there are none */}
            <div className="px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-[0.15em]">
                  Reviews · Mangrove
                </span>
                {place.reviews.average !== null && (
                  <span className="flex items-center gap-1.5">
                    <Stars value={toStars(place.reviews.average)} />
                    <span className="text-[9px] font-mono text-[var(--gold-primary)]">
                      {toStars(place.reviews.average).toFixed(1)}
                    </span>
                    <span className="text-[8px] font-mono text-[var(--text-muted)]">({place.reviews.count})</span>
                  </span>
                )}
              </div>

              {place.reviews.count === 0 ? (
                <p className="text-[8px] font-mono text-[var(--text-muted)] leading-relaxed opacity-70">
                  No open reviews for this place. OSIRIS reads the public Mangrove dataset —
                  there is no keyless equivalent of a proprietary review corpus, and its coverage is sparse.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {place.reviews.items.map((r, i) => (
                    <div key={i} className="border-l border-[var(--border-active)] pl-2">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {r.rating !== null && <Stars value={toStars(r.rating)} />}
                        <span className="text-[8px] font-mono text-[var(--text-muted)]">{r.author}</span>
                        <span className="text-[8px] font-mono text-[var(--text-muted)] opacity-50 ml-auto">{r.date}</span>
                      </div>
                      <p className="text-[9px] font-mono text-[var(--text-primary)] leading-snug flex gap-1">
                        <Quote className="w-2.5 h-2.5 text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
                        {r.opinion.slice(0, 260)}{r.opinion.length > 260 ? '…' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {place && !loading && onRouteTo && (
        <button
          onClick={() => onRouteTo({ label: place.name, lat: place.lat, lng: place.lng })}
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 border-t border-[var(--border-secondary)] text-[9px] font-mono tracking-[0.15em] text-[var(--gold-primary)] hover:bg-[rgba(212,175,55,0.08)] transition-colors"
        >
          <Navigation2 className="w-3 h-3" />
          DIRECTIONS TO HERE
        </button>
      )}
    </div>
  );
}
