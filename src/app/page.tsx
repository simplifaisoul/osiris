'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, BarChart3, Newspaper, Search, X, Globe, MapPinned, Route, Radar, Satellite, Moon, ExternalLink, AlertTriangle, Activity, Database, Wifi, Play, Network, Crosshair, Bluetooth, Pentagon, Radio , PenLine } from 'lucide-react';
import IntelFeed from '@/components/IntelFeed';
import MarketsPanel from '@/components/MarketsPanel';
import ScmPanel from '@/components/ScmPanel';
import SearchBar from '@/components/SearchBar';
import DirectionsBar, { type RouteResult, type LiveLocation } from '@/components/DirectionsBar';
import NavigationView from '@/components/NavigationView';
import FlightWatchPanel, { type WatchedFlight, type FlightTelemetry, type AircraftDetail, type Airport } from '@/components/FlightWatchPanel';
import type { NavProgress } from '@/lib/navigation';
import type { LiveDetection } from '@/lib/malware-intel';
import ScaleBar from '@/components/ScaleBar';
import ErrorBoundary from '@/components/ErrorBoundary';
import { applySettings, loadSavedSettings } from '@/lib/style-tokens';
import SharePanel from '@/components/SharePanel';
import ViewPresets from '@/components/ViewPresets';
import KeyboardShortcuts from '@/components/KeyboardShortcuts';
import GlobalStatusBar from '@/components/GlobalStatusBar';
import LiveAlerts from '@/components/LiveAlerts';
import WorldRemote from '@/components/WorldRemote';
import ArcGISPanel from '@/components/ArcGISPanel';
const OsirisMap = dynamic(() => import('@/components/OsirisMap'), { ssr: false });
const LayerPanel = dynamic(() => import('@/components/LayerPanel'));
const SpaceCam = dynamic(() => import('@/components/SpaceCam'), { ssr: false });
const CameraViewer = dynamic(() => import('@/components/CameraViewer'));
const OsintPanel = dynamic(() => import('@/components/OsintPanel'));
const DrawingToolbar = dynamic(() => import('@/components/DrawingToolbar'), { ssr: false });
const DrawHud = dynamic(() => import('@/components/DrawHud'), { ssr: false });
// The measurement helpers are pure functions — importing them directly keeps
// them out of the lazy chunk, so a finished polygon can be measured whether or
// not the toolbar has loaded yet.
import { toShape, queryRing, type DrawMode, type DrawnShape, type DrawProgress, type DrawResult } from '@/lib/draw';
import { selectInPolygon } from '@/lib/aoi';
import { diffSweep, appendEvents, type WatchBaseline, type WatchEvent } from '@/lib/watch';
import { STORAGE_KEY, serializeShapes, deserializeShapes, shapesToGeoJSON, downloadFile } from '@/lib/aoi-export';
const TokenPanel = dynamic(() => import('@/components/TokenPanel'));
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Mobile if narrow, OR landscape phone (short height + moderate width)
      setIsMobile(w < 768 || (h < 500 && w < 1024));
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);
  return isMobile;
}
const UptimeClock = () => {
  const [uptime, setUptime] = useState('00:00:00');
  const startTime = useRef(0);
  if (startTime.current === 0) startTime.current = Date.now();
  useEffect(() => {
    const iv = setInterval(() => {
      const e = Math.floor((Date.now() - startTime.current) / 1000);
      setUptime(`${String(Math.floor(e/3600)).padStart(2,'0')}:${String(Math.floor((e%3600)/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`);
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  return <span className="hidden lg:inline">UPTIME: <span className="text-[var(--gold-primary)]">{uptime}</span></span>;
};

const ZuluClock = () => {
  const [time, setTime] = useState('');
  useEffect(() => {
    const iv = setInterval(() => {
      const now = new Date();
      setTime(`ZULU ${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}:${String(now.getUTCSeconds()).padStart(2,'0')}Z`);
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  return <span className="text-[var(--cyan-primary)] font-bold tabular-nums">{time || 'ZULU --:--:--Z'}</span>;
};

/** Real entity count — no fake throughput metrics */
const ActiveEntityCount = ({ data }: { data: Record<string, unknown[]> }) => {
  const count = useMemo(() => {
    if (!data) return 0;
    return Object.values(data).reduce((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0);
  }, [data]);
  return <span className="text-[var(--alert-green)] font-bold tabular-nums">{count.toLocaleString()}</span>;
};

/** Extracts a watchable YouTube URL from embed/channel URLs */
function getYouTubeWatchUrl(url: string): string {
  if (url.includes('channel=')) return `https://www.youtube.com/channel/${url.split('channel=')[1].split('&')[0]}/live`;
  if (url.includes('/embed/')) return `https://www.youtube.com/watch?v=${url.split('/embed/')[1].split('?')[0]}`;
  return url;
}

function ViewSegment({ active, onClick, title, icon: Icon, label, layoutId }: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  layoutId: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono font-medium tracking-[0.18em] transition-colors duration-200 ${
        active ? 'text-[var(--gold-light)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-md border border-[var(--border-active)] bg-[var(--gold-primary)]/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_14px_var(--gold-glow)]"
        />
      )}
      <Icon className="w-3.5 h-3.5 relative z-10" />
      <span className="hidden md:inline relative z-10">{label}</span>
    </button>
  );
}

export default function Dashboard() {
  const dataRef = useRef<any>({});
  const [dataVersion, setDataVersion] = useState(0);
  const data = dataRef.current;

  const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [mapView, setMapView] = useState({ zoom: 2.5, latitude: 20 });
  const [flyToLocation, setFlyToLocation] = useState<{ lat: number; lng: number; zoom?: number; ts: number } | null>(null);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const mouseCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const coordsDisplayRef = useRef<HTMLDivElement>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [regionDossier, setRegionDossier] = useState<any>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [activeCamera, setActiveCamera] = useState<any>(null);
  const [spaceWeather, setSpaceWeather] = useState<any>(null);
  const [showLayers, setShowLayers] = useState(true);
  const [showMarkets, setShowMarkets] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showSpaceCam, setShowSpaceCam] = useState(false);
  const [showScmPanel, setShowScmPanel] = useState(true);
  const [showIntel, setShowIntel] = useState(false);
  const [showDrawing, setShowDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  const [drawProgress, setDrawProgress] = useState<DrawProgress | null>(null);
  const [drawCommand, setDrawCommand] = useState<{ action: 'undo' | 'finish' | 'cancel'; seq: number } | null>(null);
  const sendDraw = useCallback((action: 'undo' | 'finish' | 'cancel') => {
    setDrawCommand(c => ({ action, seq: (c?.seq ?? 0) + 1 }));
  }, []);
  /** AOIs whose contents are being watched for arrivals and departures. */
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [watchEvents, setWatchEvents] = useState<WatchEvent[]>([]);
  const watchBaselines = useRef<Record<string, WatchBaseline>>({});
  const [selectedPolygon, setSelectedPolygon] = useState<string | null>(null);
  const [showDesktopSearch, setShowDesktopSearch] = useState(false);
  const [showDirections, setShowDirections] = useState(false);
  const [activeRoute, setActiveRoute] = useState<
    (RouteResult & {
      from: { lat: number; lng: number };
      to: { lat: number; lng: number };
      alternates?: Array<{ type: 'LineString'; coordinates: [number, number][] }>;
      activeSegment?: [number, number][] | null;
    }) | null
  >(null);
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  const [followUser, setFollowUser] = useState(false);
  const [navSession, setNavSession] = useState<
    { route: RouteResult; label: string; key: number } | null
  >(null);
  const [navProgress, setNavProgress] = useState<NavProgress | null>(null);
  const [watchedFlights, setWatchedFlights] = useState<WatchedFlight[]>([]);
  const [aircraftAirports, setAircraftAirports] = useState<Record<string, Airport[]>>({});

  // The popup lives in raw map HTML, so it hands aircraft over through a global.
  useEffect(() => {
    (window as unknown as { osirisWatchFlight?: (f: WatchedFlight) => void }).osirisWatchFlight = (f) => {
      if (!f?.icao24) return;
      setWatchedFlights((prev) =>
        prev.some((w) => w.icao24 === f.icao24) ? prev : [...prev, f].slice(-6));
    };
  }, []);

  const removeWatched = useCallback((icao24: string) => {
    setWatchedFlights((prev) => prev.filter((w) => w.icao24 !== icao24));
    setAircraftAirports((prev) => {
      const next = { ...prev };
      delete next[icao24];
      return next;
    });
  }, []);

  const handleAircraftDetail = useCallback((icao24: string, detail: AircraftDetail | null) => {
    const ports = [detail?.origin, detail?.destination]
      .filter((a): a is Airport => Boolean(a && Number.isFinite(a.lat) && Number.isFinite(a.lng)));
    setAircraftAirports((prev) => (ports.length ? { ...prev, [icao24]: ports } : prev));
  }, []);

  // Telemetry for watched aircraft, refreshed from whatever the feed last gave us.
  const watchTelemetry = useMemo(() => {
    const out: Record<string, FlightTelemetry> = {};
    if (!watchedFlights.length) return out;
    const buckets = [
      data?.commercial_flights, data?.private_flights,
      data?.private_jets, data?.military_flights,
    ];
    const wanted = new Set(watchedFlights.map((w) => w.icao24));
    for (const bucket of buckets) {
      for (const f of bucket || []) {
        if (f?.icao24 && wanted.has(f.icao24)) {
          out[f.icao24] = {
            lat: f.lat, lng: f.lng, alt: f.alt,
            speed_knots: f.speed_knots, heading: f.heading,
            grounded: f.grounded, squawk: f.squawk,
          };
        }
      }
    }
    return out;
  }, [watchedFlights, data]);

  // A navigation session owns its own position watch. The planner's watch dies
  // with the planner when guidance takes over the panel, so guidance cannot
  // depend on it — without this the banner sits on "waiting for a fix" forever.
  useEffect(() => {
    if (!navSession) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setLiveLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
      }),
      () => { /* the view already explains the HTTPS requirement */ },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [navSession]);
  const [showRemote, setShowRemote] = useState(false);
  const [showArcGIS, setShowArcGIS] = useState(false);
  const [arcgisLayers, setArcgisLayers] = useState<Array<{ id: string; title: string; url: string; geojson: any; color: string; visible: boolean; opacity: number }>>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number; bounds?: { west: number; south: number; east: number; north: number } } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'layers'|'markets'|'intel'|'search'|'recon'|'remote'|null>(null);
  const [mapProjection, setMapProjection] = useState<'globe'|'mercator'>('globe');
  const [mapStyle, setMapStyle] = useState<'dark'|'satellite'>('dark');
  const [sweepData, setSweepData] = useState<any>(null);
  const [scanTargets, setScanTargets] = useState<any[]>([]);
  const [drawnPolygons, setDrawnPolygons] = useState<DrawnShape[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [osirisTheme, setOsirisTheme] = useState<'core'|'ghost'>('core');

  useEffect(() => {
    document.body.className = osirisTheme === 'core' ? '' : `theme-${osirisTheme}`;
  }, [osirisTheme]);

  /* Style Studio overrides are inline on <body>, so they survive the theme
     swap above and only need reapplying once per load. */
  useEffect(() => {
    const saved = loadSavedSettings();
    if (saved) applySettings(saved);
  }, []);

  const isMobile = useIsMobile();
  const startTime = useRef(Date.now());
  const geocodeCache = useRef<Map<string, string>>(new Map());
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGeocodedPos = useRef<{ lat: number; lng: number } | null>(null);

  // ── DEFAULT: Most layers OFF — fast initial load ──
  const [activeLayers, setActiveLayers] = useState({
    flights: false,
    private: false,
    jets: false,
    military: false,
    maritime: true,
    satellites: false,
    sat_comms: false,
    sat_military: false,
    sat_navigation: false,
    sat_earth: false,
    sat_science: false,
    balloons: false,
    cctv: true,
    /* The live preview tiles over the camera dots — see CctvPreviews. */
    cctv_previews: true,
    live_news: true,
    earthquakes: true,
    fires: false,
    weather: false,
    radiation: false,
    infrastructure: false,
    global_incidents: true,
    war_alerts: false,
    day_night: true,
    cables: true,
    sdk_sea: true,
    sdk_air: true,
    sdk_naval: true,
    terrain_3d: false,
    malware: false,
    cyber_attacks: false,
    gdelt_events: false,
    cf_outages: false,
    cf_attacks: false,
  });
  // Server-side capability flags — gate layers that need credentials.
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({});
  const [liveFeedUrl, setLiveFeedUrl] = useState<string | null>(null);
  const [liveFeedName, setLiveFeedName] = useState('');
  const [liveFeedEmbedAllowed, setLiveFeedEmbedAllowed] = useState(true);

  // Splash screen
  useEffect(() => {
    const splashTimer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(splashTimer);
  }, []);

  // On mount: geolocate by IP and fly to user's city (after splash/map init)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Restore active layers from URL if present
    const p = new URLSearchParams(window.location.search);
    const layers = p.get('layers');
    if (layers) {
      const active = layers.split(',');
      setActiveLayers(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { (next as any)[k] = active.includes(k); });
        return next;
      });
    }

    // Probe which credential-gated feeds this deployment has configured, so the
    // layer panel can hide toggles that could never return data.
    fetch('/api/cloudflare-radar?probe=1')
      .then(r => (r.ok ? r.json() : null))
      .then(p => { if (p) setCapabilities(c => ({ ...c, cloudflare: !!p.configured })); })
      .catch(() => { /* leave the layer hidden */ });

    // Delay geolocation until map is ready (after splash screen clears)
    const geoTimer = setTimeout(() => {
      fetch('/api/geo')
        .then(r => r.json())
        .then(geo => {
          if (geo.status === 'success' && geo.lat && geo.lon) {
            setFlyToLocation({ lat: geo.lat, lng: geo.lon, ts: Date.now() });
            setMapView(v => ({ ...v, zoom: 12 }));
          }
        })
        .catch(() => { /* silent — keep default global view */ });
    }, 3000);

    return () => clearTimeout(geoTimer);
  }, []);

  // URL state: persist active layers only (lat/lon comes from IP geolocation on each load)
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (urlTimer.current) clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => {
      const active = Object.entries(activeLayers).filter(([,v]) => v).map(([k]) => k).join(',');
      const url = `${window.location.pathname}?layers=${active}`;
      window.history.replaceState(null, '', url);
    }, 1500);
  }, [activeLayers]);

  // Global Stats Fetch
  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(d => {
        if (d.stats) setGlobalStats(d.stats);
      })
      .catch(console.error);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as Element)?.tagName)) return;
      if (e.key === 'f' && !e.ctrlKey) {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      }
      if (e.key === 'l') setShowLayers(p => !p);
      if (e.key === 'm') setShowMarkets(p => !p);
      if (e.key === 'c') setShowScmPanel(p => !p);
      if (e.key === 'i') setShowIntel(p => !p);
      if (e.key === 's') { setShowDesktopSearch(p => !p); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); setShowSpaceCam(false); }
      if (e.key === 'r') setFlyToLocation({ lat: 20, lng: 0, ts: Date.now() });
      if (e.key === 'g') setMapProjection(p => p === 'globe' ? 'mercator' : 'globe');
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowDesktopSearch(true); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); setShowSpaceCam(false);
      }
    };
    const fsHandler = () => setIsFullscreen(!!document.fullscreenElement);
    window.addEventListener('keydown', handler);
    document.addEventListener('fullscreenchange', fsHandler);
    return () => { window.removeEventListener('keydown', handler); document.removeEventListener('fullscreenchange', fsHandler); };
  }, []);

  // Mouse coords + reverse geocode (Zero-Render)
  const handleMouseCoords = useCallback((coords: { lat: number; lng: number }) => {
    mouseCoordsRef.current = coords;
    if (coordsDisplayRef.current) {
      coordsDisplayRef.current.innerText = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
    }
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(async () => {
      if (lastGeocodedPos.current) {
        const d = Math.abs(coords.lat - lastGeocodedPos.current.lat) + Math.abs(coords.lng - lastGeocodedPos.current.lng);
        if (d < 0.5) return; // increased threshold — fewer geocode calls
      }
      const gk = `${coords.lat.toFixed(1)},${coords.lng.toFixed(1)}`; // coarser grid = more cache hits
      if (geocodeCache.current.has(gk)) { setLocationLabel(geocodeCache.current.get(gk)!); lastGeocodedPos.current = coords; return; }
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&zoom=10&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
        if (res.ok) {
          const d = await res.json();
          const a = d.address || {};
          const label = [a.city||a.town||a.village||a.county, a.state||a.region, a.country].filter(Boolean).join(', ') || 'Unknown';
          if (geocodeCache.current.size > 500) { const it = geocodeCache.current.keys(); for (let i=0;i<100;i++) { const k = it.next().value; if(k) geocodeCache.current.delete(k); }}
          geocodeCache.current.set(gk, label);
          setLocationLabel(label);
          lastGeocodedPos.current = coords;
        }
      } catch (e) { console.warn('[OSIRIS] Suppressed error:', e instanceof Error ? e.message : e); }
    }, 3000); // 3s debounce (was 1.5s)
  }, []);

  // Region dossier (right-click)
  const handleRightClick = useCallback(async (coords: { lat: number; lng: number }) => {
    setDossierLoading(true); setRegionDossier(null);
    try {
      const res = await fetch(`/api/region-dossier?lat=${coords.lat}&lng=${coords.lng}`);
      if (res.ok) setRegionDossier(await res.json());
    } catch (e) { console.warn('[OSIRIS] Suppressed error:', e instanceof Error ? e.message : e); } finally { setDossierLoading(false); }
  }, []);
  // Entity click handler (hoisted from JSX to comply with Rules of Hooks - Fixes #113)
  const handleEntityClick = useCallback((entity: any) => {
    if (entity?.type === 'cctv') setActiveCamera(entity);
    if (entity?.type === 'live_news' && entity.url) {
      setLiveFeedUrl(entity.url);
      setLiveFeedName(entity.name);
      setLiveFeedEmbedAllowed(entity.embed_allowed !== false);
    }
  }, []);

  // ── Drawing / AOI ──
  // OsirisMap already owns the draw interaction and the polygon rendering;
  // this only turns a finished ring into a measured, named, coloured record.
  // Restore drawn areas on load. Work that vanishes on refresh is work the
  // operator will not trust the tool with.
  useEffect(() => {
    try {
      const restored = deserializeShapes(localStorage.getItem(STORAGE_KEY));
      if (restored.length) setDrawnPolygons(restored);
    } catch { /* storage unavailable — start empty */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, serializeShapes(drawnPolygons)); } catch { /* quota or private mode */ }
  }, [drawnPolygons]);

  // ── Tripwires ──
  // Re-sweep every watched AOI whenever live data refreshes and record what
  // changed. Keyed off dataVersion rather than `data` so this runs once per
  // refresh instead of once per render.
  useEffect(() => {
    if (watched.size === 0) return;
    const now = Date.now();
    const fresh: WatchEvent[] = [];
    for (const shape of drawnPolygons) {
      if (!watched.has(shape.id)) continue;
      const ring = queryRing(shape);
      if (!ring) continue;
      const report = selectInPolygon(ring, dataRef.current as any);
      const prev = watchBaselines.current[shape.id] ?? null;
      const { baseline, events } = diffSweep(shape.id, report, prev, now);
      watchBaselines.current[shape.id] = baseline;
      fresh.push(...events);
    }
    if (fresh.length) setWatchEvents(log => appendEvents(log, fresh));
  }, [dataVersion, watched, drawnPolygons]);

  const toggleWatch = useCallback((id: string) => {
    setWatched(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Drop the baseline too, so re-arming starts clean rather than
        // reporting everything that moved while the watch was off.
        delete watchBaselines.current[id];
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDrawComplete = useCallback((result: DrawResult) => {
    setDrawnPolygons(prev => [toShape(result, prev, prev.length), ...prev]);
    // One shape per arming: staying armed after a finish is how you end up
    // with an accidental second AOI from the click that dismisses the first.
    setDrawMode(null);
    setDrawProgress(null);
  }, []);

  const handleExportGeoJSON = useCallback(() => {
    downloadFile(
      `osiris-aoi-${new Date().toISOString().slice(0, 10)}.geojson`,
      JSON.stringify(shapesToGeoJSON(drawnPolygons), null, 2),
      'application/geo+json',
    );
  }, [drawnPolygons]);

  // ── SHARED FETCH UTILITY (Fixes #107 — single definition, not 3 copies) ──
  /* `skipWhenHidden` is for background polling only — skipping a *user-initiated*
     load (a layer toggle, or first paint in a background tab) leaves the caller
     believing it fetched, so the layer stays empty until a full reload.
     Returns whether data actually landed, so callers can retry. */
  const fetchEndpoint = useCallback(async (
    url: string,
    transform?: (d: any) => any,
    options?: RequestInit,
    { skipWhenHidden = false }: { skipWhenHidden?: boolean } = {},
  ): Promise<boolean> => {
    if (skipWhenHidden && typeof document !== 'undefined' && document.hidden) return false;
    try {
      // Force the browser to bypass its local disk cache for real-time data
      const res = await fetch(url, { ...options, cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const d = transform ? transform(json) : json;
        dataRef.current = { ...dataRef.current, ...d };
        setDataVersion(v => v + 1);
        setBackendStatus('connected');
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[OSIRIS] Suppressed error:', e instanceof Error ? e.message : e);
      setBackendStatus('error');
      return false;
    }
  }, []);

  // ── PROGRESSIVE DATA LOADING (request-optimized) ──
  useEffect(() => {
    // Priority 1: Core feeds (always needed for panels)
    const eqUrl = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
    const eqTransform = (data: any) => ({ earthquakes: (data.features || []).map((f: any) => ({ id: f.id, lat: f.geometry?.coordinates?.[1] || 0, lng: f.geometry?.coordinates?.[0] || 0, depth: f.geometry?.coordinates?.[2] || 0, magnitude: f.properties?.mag, place: f.properties?.place, time: f.properties?.time, url: f.properties?.url, tsunami: f.properties?.tsunami, type: f.properties?.type, felt: f.properties?.felt, alert: f.properties?.alert })) });
    fetchEndpoint(eqUrl, eqTransform);
    fetchEndpoint('/api/news');
    /* A cold start can time out every upstream quote and return an all-empty
       feed. Waiting a full poll interval to find out leaves the panel blank for
       15 minutes, so retry a few times up-front until instruments actually land. */
    const marketRetries: ReturnType<typeof setTimeout>[] = [];
    const loadMarkets = async (attempt = 0) => {
      await fetchEndpoint('/api/markets', d => ({ markets: d }));
      if ((dataRef.current.markets?.count || 0) === 0 && attempt < 3) {
        marketRetries.push(setTimeout(() => loadMarkets(attempt + 1), 15000));
      }
    };
    const marketTimer = setTimeout(() => loadMarkets(), 800);

    // Priority 2: Space Weather (needed for MarketsPanel)
    const spaceTimer = setTimeout(async () => {
      try {
        const r = await fetch('/api/space-weather');
        if (r.ok) setSpaceWeather(await r.json());
      } catch (e) { console.warn('[OSIRIS] Suppressed error:', e instanceof Error ? e.message : e); }
    }, 5000);

    // Polling — OPTIMIZED intervals to minimize edge requests
    const intervals = [
      setInterval(() => fetchEndpoint(eqUrl, eqTransform, undefined, { skipWhenHidden: true }), 900000),  // 15 min (was 5)
      setInterval(() => fetchEndpoint('/api/news', undefined, undefined, { skipWhenHidden: true }), 1800000),        // 30 min (was 10)
      setInterval(() => fetchEndpoint('/api/markets', d => ({ markets: d }), undefined, { skipWhenHidden: true }), 900000), // 15 min (was 5)
    ];
    return () => {
      clearTimeout(marketTimer);
      marketRetries.forEach(clearTimeout);
      clearTimeout(spaceTimer);
      intervals.forEach(clearInterval);
    };
  }, [fetchEndpoint]);

  // ── LAYER-AWARE DATA LOADING — only fetch when layer is toggled ON ──
  const layerFetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {

    // Flights
    if (activeLayers.flights || activeLayers.military || activeLayers.jets || activeLayers.private) {
      if (!layerFetchedRef.current.has('flights')) {
        fetchEndpoint('/api/flights');
        layerFetchedRef.current.add('flights');
      }
    }
    // Satellites (any satellite sub-layer triggers fetch)
    const anySatLayer = activeLayers.satellites || activeLayers.sat_comms || activeLayers.sat_military || activeLayers.sat_navigation || activeLayers.sat_earth || activeLayers.sat_science;
    if (anySatLayer && !layerFetchedRef.current.has('satellites')) {
      // Keep the moment the positions were propagated for. The catalogue is
      // fetched once and never re-polled, so by the time an orbit is requested
      // these markers can be a long way out of date — the orbit route needs the
      // marker's epoch to draw a track that still passes through it.
      fetchEndpoint('/api/satellites', d => ({ ...d, satellites_at: d.timestamp }));
      layerFetchedRef.current.add('satellites');
    }
    // Fires
    if (activeLayers.fires && !layerFetchedRef.current.has('fires')) {
      fetchEndpoint('/api/fires');
      layerFetchedRef.current.add('fires');
    }
    // CCTV
    if (activeLayers.cctv && !layerFetchedRef.current.has('cctv')) {
      fetchEndpoint(`/api/cctv?region=all&_t=${Date.now()}`);
      layerFetchedRef.current.add('cctv');
    }
    // Maritime
    if (activeLayers.maritime && !layerFetchedRef.current.has('maritime')) {
      fetchEndpoint('/api/maritime', d => ({ maritime_ports: d.ports, maritime_chokepoints: d.chokepoints, maritime_ships: d.ships }));
      layerFetchedRef.current.add('maritime');
    }
    // Balloons
    if (activeLayers.balloons && !layerFetchedRef.current.has('balloons')) {
      fetchEndpoint('/api/balloons', d => ({ balloons: d.balloons }));
      layerFetchedRef.current.add('balloons');
    }
    // Radiation
    if (activeLayers.radiation && !layerFetchedRef.current.has('radiation')) {
      fetchEndpoint('/api/radiation', d => ({ radiation: d.stations }));
      layerFetchedRef.current.add('radiation');
    }
    // Live News
    if (activeLayers.live_news && !layerFetchedRef.current.has('live_news')) {
      fetchEndpoint('/api/live-news', d => ({ live_feeds: d.feeds }));
      layerFetchedRef.current.add('live_news');
    }
    // Weather
    if (activeLayers.weather && !layerFetchedRef.current.has('weather')) {
      fetchEndpoint('/api/weather', d => ({ weather_events: d.events }));
      layerFetchedRef.current.add('weather');
    }
    // Infrastructure
    if (activeLayers.infrastructure && !layerFetchedRef.current.has('infrastructure')) {
      fetchEndpoint('/api/infrastructure', d => ({ infrastructure: d.infrastructure }));
      layerFetchedRef.current.add('infrastructure');
    }
    // Global Incidents (GDELT)
    if (activeLayers.global_incidents && !layerFetchedRef.current.has('gdelt')) {
      fetchEndpoint('/api/gdelt', d => ({ gdelt: d.events }));
      layerFetchedRef.current.add('gdelt');
    }

    // Submarine Cables
    if (activeLayers.cables && !layerFetchedRef.current.has('cables')) {
      (async () => {
        try {
          const ts = Date.now();
      const res = await fetch(`/data/submarine-cables.json?v=${ts}`);
          if (res.ok) {
             const cablesData = await res.json();
             dataRef.current = { ...dataRef.current, submarine_cables: cablesData.features };
             setDataVersion(v => v + 1);
          }
        } catch (e) { console.warn('Cables fetch failed'); }
      })();
      layerFetchedRef.current.add('cables');
    }


    // Live Malware (abuse.ch) is pushed, not fetched — see the SSE subscription below.

    // Live Cyber Attacks (animated arcs)
    if ((activeLayers as any).cyber_attacks && !layerFetchedRef.current.has('cyber_attacks')) {
      fetchEndpoint('/api/cyber-attacks', d => ({ cyber_attacks: d.attacks }));
      layerFetchedRef.current.add('cyber_attacks');
    }

    /* Mark before awaiting so a re-render mid-flight cannot double-fetch, then
       release the mark if nothing landed — otherwise one failed request leaves
       the layer permanently empty. */
    const loadLayerOnce = (key: string, url: string, transform: (d: any) => any) => {
      if (layerFetchedRef.current.has(key)) return;
      layerFetchedRef.current.add(key);
      fetchEndpoint(url, transform).then(ok => {
        if (!ok) layerFetchedRef.current.delete(key);
      });
    };

    // GDELT 2.0 geocoded events
    if ((activeLayers as any).gdelt_events) {
      loadLayerOnce('gdelt_events', '/api/gdelt-events?limit=600', d => ({ gdelt_events: d.events }));
    }

    // Cloudflare Radar — one request backs both layers
    if ((activeLayers as any).cf_outages || (activeLayers as any).cf_attacks) {
      loadLayerOnce('cloudflare_radar', '/api/cloudflare-radar', d => ({
        cf_outages: d.outages ?? [],
        cf_attack_origins: d.attack_origins ?? [],
      }));
    }


  }, [activeLayers]);

  // ── LAYER-AWARE POLLING — only poll data for active layers ──
  useEffect(() => {
    const intervals: ReturnType<typeof setInterval>[] = [];
    if (activeLayers.flights || activeLayers.military || activeLayers.jets || activeLayers.private) {
      intervals.push(setInterval(() => fetchEndpoint('/api/flights'), 300000)); // 5 min (was 2 min)
    }

    if (activeLayers.balloons) {
      intervals.push(setInterval(() => fetchEndpoint('/api/balloons', d => ({ balloons: d.balloons })), 300000)); // 5m
    }
    if (activeLayers.radiation) {
      intervals.push(setInterval(() => fetchEndpoint('/api/radiation', d => ({ radiation: d.stations })), 300000)); // 5m
    }
    if (activeLayers.maritime) {
      intervals.push(setInterval(() => fetchEndpoint('/api/maritime', d => ({ maritime_ports: d.ports, maritime_chokepoints: d.chokepoints, maritime_ships: d.ships })), 10000)); // 10s
    }
    if ((activeLayers as any).cyber_attacks) {
      intervals.push(setInterval(() => {
        layerFetchedRef.current.delete('cyber_attacks');
        fetchEndpoint('/api/cyber-attacks', d => ({ cyber_attacks: d.attacks }));
        layerFetchedRef.current.add('cyber_attacks');
      }, 10000)); // 10s — rapid refresh
    }
    return () => intervals.forEach(clearInterval);
  }, [activeLayers, fetchEndpoint]);

  /* ── LIVE MALWARE — pushed over SSE while the layer is on ──
     Detections arrive when URLhaus reports them rather than on a timer, so
     there is no poll interval to tune and no request that re-downloads the
     same rows to discover nothing changed. The connection also carries the
     progressive geolocation fill, which is why a cold server paints the map in
     batches instead of staying empty and then snapping to full. */
  useEffect(() => {
    if (!activeLayers.malware) return;

    const source = new EventSource('/api/malware/stream');
    // Keyed by address: a host re-reported with a new payload updates its node
    // rather than stacking a second dot on the same coordinates.
    const byIp = new Map<string, LiveDetection>();
    // The server sends `status` at the end of every poll, so the first one
    // marks the end of the initial fill — anything after it is genuinely new
    // and worth drawing attention to.
    let filled = false;

    const commit = () => {
      dataRef.current = { ...dataRef.current, malware_threats: [...byIp.values()] };
      setDataVersion(v => v + 1);
    };

    source.onmessage = ev => {
      try {
        const event = JSON.parse(ev.data);
        if (event.type === 'snapshot') {
          byIp.clear();
          for (const d of event.detections) byIp.set(d.ip, d);
          commit();
        } else if (event.type === 'detections') {
          // Only a first sighting is an arrival. An existing host that served
          // another payload arrives with fresh:false and keeps whatever beacon
          // state it already had, so it does not re-flag itself as new.
          const beacon = filled && event.fresh;
          for (const d of event.detections) {
            byIp.set(d.ip, beacon ? { ...d, detected_at: Date.now() } : { ...d, detected_at: byIp.get(d.ip)?.detected_at });
          }
          commit();
        } else if (event.type === 'status') {
          filled = true;
          // Hosts that have gone dark since the last poll. The store prunes
          // these; without mirroring it here the map would only ever grow.
          if (event.retired?.length) {
            for (const ip of event.retired) byIp.delete(ip);
            commit();
          }
        }
        setBackendStatus('connected');
      } catch {
        // One malformed frame must not tear down the subscription.
      }
    };

    /* EventSource reconnects on its own, firing `error` on each attempt, and
       the store replays a snapshot on connect so a drop self-heals. Only a
       readyState of CLOSED means it has given up — reporting the transient
       ones would flag the backend as down every time a connection recycles. */
    source.onopen = () => setBackendStatus('connected');
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) setBackendStatus('error');
    };

    return () => source.close();
  }, [activeLayers.malware]);

  // CCTV: loaded once on layer toggle via layerFetchedRef (no viewport polling)

  // Reactive layer fetch: handled by layerFetchedRef above (no duplicate)

  // ── OSIRIS SDK — Intelligence Fusion Layer ──
  // Produces node coordinates for the SDK network mesh visualization.
  // Does NOT duplicate existing layer visuals — SDK layer is LINES ONLY.
  // Cameras are excluded — they have their own dedicated layer.
  useEffect(() => {
    const anyActive = activeLayers.sdk_sea || activeLayers.sdk_air || activeLayers.sdk_naval;
    if (!anyActive) {
      dataRef.current = { ...dataRef.current, sdk_entities: [] };
      return;
    }

    const sdkEntities: any[] = [];

    // Air domain (nodes only — no visual duplication)
    const allFlights = [
      ...(data.commercial_flights || []),
      ...(data.private_flights || []),
      ...(data.private_jets || []),
      ...(data.military_flights || []),
    ];
    // Sample flights to keep it clean (every Nth)
    const flightStep = Math.max(1, Math.floor(allFlights.length / 60));
    for (let i = 0; i < allFlights.length; i += flightStep) {
      const f = allFlights[i];
      if (!f.lat || !f.lng) continue;
      sdkEntities.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
        properties: { domain: 'AIR', name: f.callsign?.trim() || 'TRACK', source: 'ADS-B / OpenSky' },
      });
    }

    // Sea domain
    const ships = data.maritime_ships || [];
    const shipStep = Math.max(1, Math.floor(ships.length / 60));
    for (let i = 0; i < ships.length; i += shipStep) {
      const s = ships[i];
      if (!s.lat || !s.lng) continue;
      sdkEntities.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: { domain: 'SEA', name: s.name || `MMSI-${s.mmsi}`, source: 'AIS Stream' },
      });
    }

    // Events — Earthquakes
    if (data.earthquakes?.length) {
      for (const eq of data.earthquakes) {
        if (!eq.lat || !eq.lng) continue;
        sdkEntities.push({
          type: 'Feature', geometry: { type: 'Point', coordinates: [eq.lng, eq.lat] },
          properties: { domain: 'LAND', name: `M${eq.magnitude} ${eq.place || ''}`, source: 'USGS' },
        });
      }
    }

    // GDELT events
    if (data.gdelt?.length) {
      for (const g of data.gdelt) {
        if (!g.lat || !g.lng) continue;
        sdkEntities.push({
          type: 'Feature', geometry: { type: 'Point', coordinates: [g.lng, g.lat] },
          properties: { domain: 'INTEL', name: g.name || 'GDELT Event', source: 'GDELT Project' },
        });
      }
    }

    // News intel
    if (data.news?.length) {
      for (const n of data.news) {
        if (!n.coords || n.coords.length < 2) continue;
        sdkEntities.push({
          type: 'Feature', geometry: { type: 'Point', coordinates: [n.coords[1], n.coords[0]] },
          properties: { domain: 'INTEL', name: n.title || 'SIGINT', source: n.source || 'RSS Feed' },
        });
      }
    }

    dataRef.current = { ...dataRef.current, sdk_entities: sdkEntities };
  }, [dataVersion, activeLayers.sdk_sea, activeLayers.sdk_air, activeLayers.sdk_naval]);

  const totalFlights = useMemo(() => (
    (data.commercial_flights?.length||0)+(data.private_flights?.length||0)+(data.private_jets?.length||0)+(data.military_flights?.length||0)
  ), [data.commercial_flights, data.private_flights, data.private_jets, data.military_flights]);


  return (
    <main className="fixed inset-0 w-full h-full bg-[var(--bg-void)] overflow-hidden">

      {/* ── SPLASH ── */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="absolute inset-0 z-[999] flex flex-col items-center justify-center overflow-hidden"
            style={{ background: 'radial-gradient(ellipse at center, #0a0a14 0%, var(--bg-void) 70%)' }}
          >
            {/* ── Scanline CRT overlay ── */}
            <div className="absolute inset-0 pointer-events-none z-[1]" style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(212,175,55,0.015) 2px, rgba(212,175,55,0.015) 4px)',
              animation: 'splashScanDrift 8s linear infinite',
            }} />

            {/* ── V4.2 badge — top-left ── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="absolute top-6 left-6 z-[2] font-mono text-[11px] tracking-[0.3em] text-[var(--gold-primary)]"
            >
              V4.2
            </motion.div>



            {/* ── Geometric tactical logo ── */}
            <div className="relative w-40 h-40 mb-8 flex items-center justify-center z-[2]">
              {/* Outer ring — slow clockwise */}
              <motion.div
                initial={{ opacity: 0, scale: 0.6, rotate: 0 }}
                animate={{ opacity: 1, scale: 1, rotate: 360 }}
                transition={{ opacity: { duration: 0.6 }, scale: { duration: 0.8, ease: 'easeOut' }, rotate: { duration: 20, repeat: Infinity, ease: 'linear' } }}
                className="absolute inset-0 rounded-full"
                style={{ border: '1px solid rgba(212,175,55,0.2)' }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ background: 'var(--gold-primary)', boxShadow: '0 0 12px var(--gold-primary), 0 0 24px rgba(212,175,55,0.3)' }} />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1 h-1 rounded-full" style={{ background: 'rgba(212,175,55,0.5)', boxShadow: '0 0 6px rgba(212,175,55,0.3)' }} />
              </motion.div>

              {/* Middle ring — faster counter-clockwise */}
              <motion.div
                initial={{ opacity: 0, scale: 0.4, rotate: 0 }}
                animate={{ opacity: 1, scale: 1, rotate: -360 }}
                transition={{ opacity: { duration: 0.6, delay: 0.15 }, scale: { duration: 0.8, delay: 0.15, ease: 'easeOut' }, rotate: { duration: 12, repeat: Infinity, ease: 'linear' } }}
                className="absolute rounded-full"
                style={{ inset: '18px', border: '1px solid rgba(0,229,255,0.15)' }}
              >
                <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--cyan-primary)', boxShadow: '0 0 10px var(--cyan-primary), 0 0 20px rgba(0,229,255,0.2)' }} />
                <div className="absolute bottom-0 left-1/4 translate-y-1/2 w-1 h-1 rounded-full" style={{ background: 'rgba(0,229,255,0.4)' }} />
              </motion.div>

              {/* Inner ring — fastest clockwise */}
              <motion.div
                initial={{ opacity: 0, scale: 0.2, rotate: 0 }}
                animate={{ opacity: 1, scale: 1, rotate: 360 }}
                transition={{ opacity: { duration: 0.6, delay: 0.3 }, scale: { duration: 0.8, delay: 0.3, ease: 'easeOut' }, rotate: { duration: 7, repeat: Infinity, ease: 'linear' } }}
                className="absolute rounded-full"
                style={{ inset: '40px', border: '1px solid rgba(212,175,55,0.25)' }}
              >
                <div className="absolute top-0 left-1/4 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--gold-primary)', boxShadow: '0 0 8px var(--gold-primary)' }} />
              </motion.div>

              {/* Core circle + crosshair */}
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
                className="relative w-12 h-12 rounded-full flex items-center justify-center"
                style={{ border: '2px solid var(--gold-primary)', boxShadow: '0 0 20px rgba(212,175,55,0.15), inset 0 0 20px rgba(212,175,55,0.05)' }}
              >
                <motion.div
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-5 h-5 rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.4) 0%, rgba(212,175,55,0.05) 70%)' }}
                />
                {/* Crosshair lines */}
                <div className="absolute w-[1px] h-full" style={{ background: 'linear-gradient(to bottom, transparent, rgba(212,175,55,0.3), transparent)' }} />
                <div className="absolute w-full h-[1px]" style={{ background: 'linear-gradient(to right, transparent, rgba(212,175,55,0.3), transparent)' }} />
              </motion.div>

              {/* Faint pulsing radar sweep */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.15, 0], rotate: [0, 360] }}
                transition={{ opacity: { duration: 3, repeat: Infinity }, rotate: { duration: 3, repeat: Infinity, ease: 'linear' }, delay: 0.6 }}
                className="absolute inset-[10px] rounded-full"
                style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(212,175,55,0.15) 40deg, transparent 80deg)' }}
              />
            </div>

            {/* ── OSIRIS title — letter-by-letter stagger ── */}
            <div className="flex items-center gap-[2px] mb-3 z-[2]">
              {'OSIRIS'.split('').map((letter, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ delay: 0.5 + i * 0.08, duration: 0.5, ease: 'easeOut' }}
                  className="text-4xl md:text-5xl font-bold tracking-[0.5em] font-mono"
                  style={{ color: 'var(--text-heading)', textShadow: '0 0 30px rgba(212,175,55,0.2)' }}
                >
                  {letter}
                </motion.span>
              ))}
            </div>

            {/* ── Subtitle — typewriter reveal ── */}
            <div className="overflow-hidden mb-8 z-[2]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ delay: 1.2, duration: 0.8, ease: 'easeInOut' }}
                className="overflow-hidden whitespace-nowrap"
              >
                <p className="text-[11px] md:text-[10px] font-mono tracking-[0.5em] text-[var(--gold-primary)]" style={{ opacity: 0.8 }}>
                  GLOBAL INTELLIGENCE PLATFORM
                </p>
              </motion.div>
            </div>

            {/* ── Multi-stage progress bar ── */}
            <div className="w-64 md:w-80 z-[2]">
              {/* Thin progress track */}
              <div className="relative w-full h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(212,175,55,0.1)' }}>
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: ['0%', '25%', '50%', '78%', '100%'] }}
                  transition={{ duration: 2.2, delay: 0.5, times: [0, 0.25, 0.5, 0.75, 1], ease: 'easeInOut' }}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: 'linear-gradient(90deg, var(--gold-primary), var(--cyan-primary), var(--gold-primary))', boxShadow: '0 0 12px rgba(212,175,55,0.4)' }}
                />
              </div>

              {/* Status messages — cycling */}
              <div className="mt-3 h-4 flex items-center justify-center">
                {[
                  { text: 'ESTABLISHING SECURE CONNECTION...', delay: 0.5 },
                  { text: 'INITIALIZING FEEDS...', delay: 1.1 },
                  { text: 'CALIBRATING SENSORS...', delay: 1.7 },
                  { text: 'SYSTEM READY', delay: 2.2 },
                ].map((stage, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 1, 0] }}
                    transition={{ delay: stage.delay, duration: 0.6, times: [0, 0.1, 0.7, 1] }}
                    className="absolute text-[10px] font-mono tracking-[0.25em]"
                    style={{ color: i === 3 ? 'var(--cyan-primary)' : 'var(--text-muted)' }}
                  >
                    {stage.text}
                  </motion.span>
                ))}
              </div>
            </div>

            {/* ── Decorative grid lines ── */}
            <div className="absolute inset-0 pointer-events-none z-[0]" style={{ opacity: 0.03 }}>
              <div className="absolute inset-0" style={{
                backgroundImage: 'linear-gradient(rgba(212,175,55,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.5) 1px, transparent 1px)',
                backgroundSize: '60px 60px',
              }} />
            </div>

            {/* ── Corner frame accents ── */}
            {[
              { t: '10px', l: '10px', bw: '2px 0 0 2px' },
              { t: '10px', r: '10px', bw: '2px 2px 0 0' },
              { b: '10px', l: '10px', bw: '0 0 2px 2px' },
              { b: '10px', r: '10px', bw: '0 2px 2px 0' },
            ].map((pos, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                transition={{ delay: 0.8 + i * 0.1, duration: 0.5 }}
                className="absolute w-8 h-8 z-[2]"
                style={{ top: pos.t, bottom: pos.b, left: pos.l, right: pos.r, borderWidth: pos.bw, borderStyle: 'solid', borderColor: 'var(--gold-primary)' }}
              />
            ))}



            {/* ── Inline keyframe for scanline drift ── */}

          </motion.div>
        )}
      </AnimatePresence>



      {/* ── MAP ── */}
      <ErrorBoundary name="Map">
        <OsirisMap 
          key={osirisTheme}
          data={data} 
          activeLayers={activeLayers} 
          projection={mapProjection} 
          mapStyle={mapStyle === 'satellite' ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' : 'dark'} 
          onEntityClick={handleEntityClick} 
          onMouseCoords={handleMouseCoords} 
          onRightClick={handleRightClick} 
          onViewStateChange={setMapView} 
          flyToLocation={flyToLocation}
          sweepData={sweepData}
          scanTargets={scanTargets}
          demoMode={demoMode}
          theme={osirisTheme}
          arcgisLayers={arcgisLayers.filter(l => l.visible).map(l => ({ id: l.id, title: l.title, geojson: l.geojson, color: l.color, opacity: l.opacity }))}
          onMapCenter={setMapCenter}
          route={activeRoute}
          userLocation={
            navSession && navProgress
              ? { lat: navProgress.snapped[1], lng: navProgress.snapped[0], accuracy: liveLocation?.accuracy, heading: liveLocation?.heading }
              : liveLocation
          }
          followUser={followUser}
          onFollowInterrupt={() => setFollowUser(false)}
          navigating={Boolean(navSession)}
          drawMode={drawMode}
          onDrawProgress={setDrawProgress}
          drawCommand={drawCommand}
          onDrawCancel={() => { setDrawMode(null); setDrawProgress(null); }}
          onDrawComplete={handleDrawComplete}
          drawnPolygons={drawnPolygons}
          aircraftAirports={aircraftAirports}
        />
      </ErrorBoundary>

      {/* ── DIRECTIONS — opens beside the right-hand tool rail ── */}
      <div
        className="absolute top-3 z-[400] w-[min(92vw,372px)] pointer-events-auto"
        style={isMobile ? { left: '50%', transform: 'translateX(-50%)' } : { right: '56px' }}
      >
        {navSession ? (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
            <NavigationView
              key={navSession.key}
              route={navSession.route}
              destinationLabel={navSession.label}
              fix={liveLocation}
              onProgress={setNavProgress}
              following={followUser}
              onRecenter={() => setFollowUser(true)}
              onExit={() => { setNavSession(null); setNavProgress(null); setFollowUser(false); }}
              onReroute={async (fromPt) => {
                // Re-plan from where the driver actually is, to the same destination.
                const dest = navSession.route.geometry.coordinates.at(-1)!;
                try {
                  const res = await fetch(
                    `/api/directions?from=${fromPt.lat},${fromPt.lng}&to=${dest[1]},${dest[0]}&mode=auto`,
                  );
                  const data = await res.json();
                  if (res.ok && !data.error) {
                    setNavSession((n) => (n ? { ...n, route: data, key: Date.now() } : n));
                    setActiveRoute({ ...data, from: fromPt, to: { lat: dest[1], lng: dest[0] } });
                  }
                } catch { /* keep the old route rather than dropping guidance */ }
              }}
            />
          </motion.div>
        ) : null}

        {/* The planner stays mounted underneath a running session: unmounting it
            would discard the route you are driving, so ending guidance would
            drop you into an empty form instead of back onto your route. */}
        {showDirections && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: navSession ? 0 : 1, y: 0 }}
            className={navSession ? 'pointer-events-none h-0 overflow-hidden' : ''}
            aria-hidden={Boolean(navSession)}
          >
            <DirectionsBar
              center={mapCenter ? { lat: mapCenter.lat, lng: mapCenter.lng } : null}
              onRoute={(r) => setActiveRoute(r)}
              onLiveLocation={setLiveLocation}
              onFollowChange={setFollowUser}
              onActiveSegment={(seg) => setActiveRoute((r) => (r ? { ...r, activeSegment: seg } : r))}
              onStartNavigation={(r, label) => {
                setNavSession({ route: r, label, key: Date.now() });
                setFollowUser(true);
              }}
              onLocate={(lat, lng, zoom) => setFlyToLocation({ lat, lng, zoom, ts: Date.now() })}
              onClose={() => { setShowDirections(false); setActiveRoute(null); }}
            />
          </motion.div>
        )}
      </div>


      {/* ── FLIGHT WATCH ── */}
      {watchedFlights.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
          className="absolute top-3 z-[380] w-[min(92vw,290px)] pointer-events-auto
                     max-h-[calc(100vh-180px)] overflow-y-auto styled-scrollbar"
          style={{ left: isMobile ? '12px' : '120px' }}
        >
          <FlightWatchPanel
            watched={watchedFlights}
            telemetry={watchTelemetry}
            onRemove={removeWatched}
            onLocate={(lat, lng) => setFlyToLocation({ lat, lng, zoom: 8, ts: Date.now() })}
            onDetail={handleAircraftDetail}
          />
        </motion.div>
      )}

      {/* ── MAP VIEW CONTROLS ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 3.5 }}
        className="absolute bottom-[75px] md:bottom-[100px] z-[200] flex flex-col gap-1.5 pointer-events-none"
        style={{ left: isMobile ? '12px' : '120px' }}
      >
        {/* Unified Control Strip */}
        <div className="flex items-center gap-[3px] p-[3px] pointer-events-auto rounded-xl border border-[var(--border-primary)] bg-[var(--bg-panel)] backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
          <ViewSegment layoutId="view-projection" active={mapProjection === 'globe'} onClick={() => setMapProjection('globe')} title="3D Globe" icon={Globe} label="3D" />
          <ViewSegment layoutId="view-projection" active={mapProjection === 'mercator'} onClick={() => setMapProjection('mercator')} title="2D Map" icon={MapPinned} label="2D" />
          <div className="w-px h-5 mx-1 bg-[var(--border-secondary)]" />
          <ViewSegment layoutId="view-style" active={mapStyle === 'dark'} onClick={() => setMapStyle('dark')} title="Night Mode" icon={Moon} label="MAP" />
          <ViewSegment layoutId="view-style" active={mapStyle === 'satellite'} onClick={() => setMapStyle('satellite')} title="Satellite View" icon={Satellite} label="SAT" />
        </div>

        {/* Scale Bar */}
        {!isMobile && (
          <div className="pl-0.5">
            <ScaleBar zoom={mapView.zoom} latitude={mapView.latitude} />
          </div>
        )}
      </motion.div>

      {/* ── HEADER ── */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 2.5 }} className={`absolute top-4 z-[200] pointer-events-none flex flex-col`} style={{ left: isMobile ? '24px' : '64px', right: '24px' }}>
        <div className="flex items-center gap-3 w-fit">
          <svg viewBox="0 0 650 500" className="w-8 h-8 md:w-10 md:h-10 shrink-0 transition-colors duration-500 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]" fill="currentColor">
            <path d="m620.39,364.82c-0.53628-7.2677-1.7767-14.482-5.0286-21.276-9.4786-19.803-33.963-29.34-53.026-19.284-15.333,8.0885-22.563,29.331-13.578,45.149,6.873,12.099,23.072,18.235,35.622,10.228,4.4328-2.828,7.6343-7.2793,8.9938-12.286,1.3595-5.0063,0.68452-10.798-2.9392-15.401-2.2364-2.8407-5.4473-4.7654-9.1114-5.408-3.664-0.64263-8.1708,0.40388-10.875,3.9972-1.7829,2.3692-1.91,4.5449-1.4108,7.1127,0.24961,1.2839,0.78116,2.8399,2.3513,3.9972,1.5702,1.1573,4.2926,1.9424,5.5844,0.58783,1.1069-1.1607-0.67477-3.153-0.73029-4.7559-0.0388-0.83158-0.0772-1.7317,0.26004-2.4745,0.89679-1.1463,1.8493-1.342,3.4682-1.0581,1.6548,0.29023,3.6474,1.4542,4.5851,2.6452v0.0588c2.0224,2.5986,2.3717,5.5943,1.5284,8.6999-0.81645,3.0066-2.8568,5.919-5.4668,7.7006l-0.29391,0.23513c-8.5452,5.4516-18.484,0.70317-23.392-7.9366-6.7162-11.823-1.5113-26.282,10.285-32.505,15.078-7.9537,35.744,1.451,40.36,17.085,4.566,15.464,2.8715,30.938,0.27385,37.511l10.609,0.073c2.5579-12.089,1.9287-15.035,1.9287-22.696z" />
            <path d="m158.66,157a70.231,70.231,0,0,0,-14.44,42.81,70.235,70.235,0,1,0,140.47,0,70.231,70.231,0,0,0,-14.28,-42.81h-111.75z" />
            <path d="m140.86,465.53c-6.7333,0-8.7137-5.4462-12.181-25.899-2.4479-14.774-7.1068-28.463-10.502-43.043-3.0219-13.117-5.6425-20.332-9.6694-26.618-6.5526-10.229-6.3011-20.921,0.71691-30.481,6.33-8.6232,6.827-11.121,6.5471-32.901-0.13783-10.725-0.56403-21.286-0.94711-23.468-0.88077-5.0179-4.6148-7.6923-13.904-9.9586-8.4827-2.0695-16.525-2.2933-41.967-1.1681-18.144,0.80245-20.457,0.72323-22.75-0.77901-5.627-3.687-2.9527-8.8405,12.261-23.626,15.69-15.249,23.876-24.688,38.811-44.75,26.839-36.053,30.927-40.83,57.501-49.189,19.575-6.1582,26.691-9.0119,62.031-10.06,24.654-0.7309,38.767,2.5963,45.357,3.3466,25.219,2.8716,66.247,14.877,91.933,26.083,13.581,5.9249,14.042,6.1723,30.115,16.152,11.981,7.4391,18.733,10.459,35.44,15.034,34.886,9.553,56.753,7.7583,92,10.378,9.2579,0.68808,49.298,3.5149,74.5,4.4784,30.689,1.1732,35.835-2.0376,38.423,0.54994,2.0315,2.0315,0.5636,8.1815,0.6024,14.306,0.0237,3.7378-0.18399,7.6642-0.48569,11.602-8.1923-1.424-8.0353-1.3676-26.54-2.9165-1.6808-0.14069-16.718-1.6695-44.5-4.1726-11.867-1.0692-70.326-2.8448-105.5-3.9248-16.997-0.52189-34.357-4.7228-51-1.2347-5.7624,1.2076,2.387-1.1161-16,7.4812-36.313,14.051-55.853,23.79-104.5,32.83-30.774,4.5201-33.208,4.9745-36.376,7.2909-1.7456,1.2764-1.662,1.6171,1.6767,6.8363,3.5642,5.5717,14.275,15.81,29.699,28.389,51.619,43.564,115.05,77.431,162.89,98.598,22.221,9.5122,37.55,14.655,50.108,16.811,61.892,13.654,134.26-9.4938,136.11-56.959,0.0489-1.256,0.49928-6.001-0.1398-12.079-0.44539-4.2357-0.89625-7.3216-2.2932-11.095-3.9795-10.75-12.413-20.407-28.672-21.755-11.746,0.022-20.375,6.1561-23.95,16.17-4.5622,12.78,1.3185,27.071,14.023,29.565,6.6403,1.3038,11.222-0.5256,14.271-4.4679,3.3424-4.3221,3.72-12.026,1.3559-15.634-2.2757-3.4732-7.2459-5.2754-10.824-3.9248-3.6125,1.3636-4.9933,0.36555-0.6538-3.1839,0.38036-0.24867,0.77844-0.4586,1.191-0.63136,6.6675-2.7918,17.127,4.1226,17.913,14.135,0.7119,11.495-7.7045,20.279-19.249,20.94-6.5659,0.37574-14.594-1.9665-20.026-7.8035-13.425-14.428-9.1712-34.885,2.9586-45.762,4.6131-4.1366,7.7535-6.0583,14.065-7.4773,19.37-4.3554,37.69,4.5134,45.528,24.301,3.5645,8.9992,3.7675,16.201,3.8515,23.221,0.70438,58.895-65.742,87.202-131.95,82.517-28.009-2.4123-46.229-6.8095-80.495-20.915-36.58-12.09-143.44-68.32-207.96-120.33-18.846-15.317-30.511-22.813-33.055-21.24-0.61585,0.38062-0.98989,11.992-0.99221,30.802-0.004,28.758-0.1019,30.352-2.0717,33.583-3.2793,5.3791-4.935,17.725-5.9822,44.608-1.6327,41.914-2.675,60.915-3.4439,62.778-1.3963,3.383-7.0306,4.6642-13.289,4.6642zm221.62-252.27c0.41803-2.1707-4.6044-8.6243-11.231-13.08-10.396-6.9893-22.385-11.512-34.092-15.96-71.934-23.518-145.08-20.065-174.03-4.962-10.593,5.1512-14.126,7.777-22.813,15.582-4.1291,3.7102-9.5939,9.7305-12.144,13.379-5.133,7.3428-10.014,13.339-19.014,23.362-9.3026,10.359-14.5,16.774-14.5,17.897,0,1.5721,7.8962,3.1488,17.5,3.5809,81.15,10.292,230.44,14.198,270.32-39.799zm224.18-69.351c-16.558-0.50003-42.467-2.0158-63.5-4.8954-19.525-2.6732-39.047-6.067-58-11.467-17.982-5.123-35.124-12.85-52.5-19.754-7.7243-3.0694-15.32-6.4533-23-9.6318-8.319-3.4429-16.53-7.1723-25-10.224-15.523-5.5928-30.986-11.946-47.239-14.789-41.988-7.3464-85.261-8.7793-127.76-5.4986-23.554,1.8182-46.695,7.7124-69.5,13.878-17.863,4.8293-35.019,11.972-52.5,18.041-5.069,1.761-10.039,6.841-15.177,5.321-5.396-1.6-10.73-7.749-10.317-13.361,0.434-5.884,7.835-9.014,12.753-12.272,16.823-11.146,36.498-17.485,55.661-23.803,19.219-6.3349,38.923-12.127,59.072-14.001,54.326-5.0532,110.09-3.4301,163.5,7.7269,28.29,5.9098,53.945,20.759,81,30.92,31.437,11.806,61.76,27.444,94.5,34.909,33.045,7.534,83.745,9.6292,101.22,9.5911,6.5425-0.0143,6.7685,0.0708,8.3595,3.1475,1.8515,3.5805,3.1256,14.296,1.7926,15.077-1.3395,0.78418-21.593,1.4453-33.376,1.0894z" />
          </svg>
          <div className="flex flex-col items-start gap-0.5">
            <h1 className="text-lg md:text-xl font-bold tracking-[0.4em] text-[#D4AF37] font-mono">OSIRIS</h1>
            <span className="text-[9px] md:text-[10px] font-mono tracking-[0.2em] opacity-80 uppercase text-[#D4AF37]">OPEN SOURCE INTELLIGENCE</span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1.5 pl-[44px] min-w-0 pr-4">
          <span className="text-[9px] md:text-[9px] text-[var(--text-muted)] font-mono tracking-[0.2em] md:tracking-[0.3em] uppercase opacity-40 truncate">
            REAL-TIME GLOBAL MONITORING <span className="hidden md:inline">· FLIGHTS · MARITIME · SATELLITES · CCTV · WEATHER · CYBER THREATS</span>
          </span>
        </div>
      </motion.div>


      {/* ── TOP-RIGHT STATUS (desktop) ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3 }} className="status-bar-desktop absolute top-4 right-6 z-[200] pointer-events-none flex items-center gap-3 text-[10px] font-mono tracking-widest text-[var(--text-muted)]">

        <span className="hidden lg:inline-flex items-center gap-1.5">
          <ZuluClock />
        </span>

        <span className="flex items-center gap-1" title="Backend connection status">STATUS: <span className={backendStatus === 'connected' ? 'text-[var(--alert-green)]' : 'text-[var(--alert-red)]'}>{backendStatus === 'connected' ? 'LIVE' : backendStatus.toUpperCase()}</span></span>

        <span className="hidden lg:inline-flex items-center gap-1" title="Number of active data layers">
          <span className="text-[var(--cyan-primary)] font-bold">{Object.values(activeLayers).filter(Boolean).length}</span>
          <span className="opacity-60">LAYERS</span>
        </span>

        <span className="hidden lg:inline-flex items-center gap-1" title="Tracked entities on map">
          <ActiveEntityCount data={data} />
          <span className="opacity-60">ENTITIES</span>
        </span>

        {spaceWeather && <span className="hidden lg:inline" title={`Geomagnetic Storm Index — Kp${spaceWeather.kp_index}`}>SOLAR: <span style={{ color: spaceWeather.storm_color, fontWeight: 700 }}>Kp{spaceWeather.kp_index}</span></span>}

        <span className="text-[11px] font-bold tracking-[0.2em] text-[var(--text-muted)] opacity-50">V.4.1</span>
        
        <TokenPanel />

        <a href='https://ko-fi.com/M8D41ZYW4Z' target='_blank' rel='noopener noreferrer' className="pointer-events-auto glass-panel px-3 py-1.5 flex items-center gap-1.5 text-[9px] font-mono tracking-widest hover:opacity-80 transition-opacity border-[var(--gold-primary)]/40 bg-[var(--gold-primary)]/10 ml-3 shadow-[0_0_10px_rgba(255,215,0,0.1)]">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--gold-primary)] animate-osiris-pulse" />
          <span className="text-[var(--gold-primary)] font-bold">SUPPORT</span>
        </a>
      </motion.div>

      {/* ── MOBILE: Compact top status ── */}
      {/* The route planner claims the top of a phone screen; leaving this in
          place would put the support badge underneath the destination field. */}
      {isMobile && !showDirections && !navSession && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.5 }} className="absolute top-3 right-3 z-[200] pointer-events-auto flex items-center gap-2">
          <TokenPanel />
          <a href='https://ko-fi.com/M8D41ZYW4Z' target='_blank' rel='noopener noreferrer' className="glass-panel px-2 py-1 flex items-center gap-1.5 text-[9px] font-mono tracking-widest hover:opacity-80 transition-opacity border-[var(--gold-primary)]/40 bg-[var(--gold-primary)]/10">
            <div className="w-1 h-1 rounded-full bg-[var(--gold-primary)] animate-osiris-pulse" />
            <span className="text-[var(--gold-primary)] font-bold">SUPPORT</span>
          </a>
        </motion.div>
      )}



      {/* ── NEW SIDEBAR (Root Level) ── */}
      {showLayers && !isMobile && <LayerPanel data={data} activeLayers={activeLayers} setActiveLayers={setActiveLayers} theme={osirisTheme} setTheme={setOsirisTheme} capabilities={capabilities} />}



      {/* ── RIGHT TOOL STRIP (desktop only — mobile uses bottom nav) ── */}
      {!isMobile && <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-[250] pointer-events-auto bg-black/40 backdrop-blur-sm p-1 rounded-full border border-white/5">
        <div className="relative group">
          <button onClick={() => { setShowIntel(!showIntel); setShowMarkets(false); setShowAlerts(false); }} className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${showIntel ? 'bg-[var(--cyan-primary)]/20' : 'hover:bg-white/10'}`} title="OSINT Recon — IP lookup, network sweep, geolocation" aria-label="OSINT Recon" aria-expanded={showIntel}>
            <Radar className={`w-4 h-4 ${showIntel ? 'text-[var(--cyan-primary)]' : 'text-white/60'}`} />
            {showIntel && (
              <span
                aria-hidden="true"
                className="absolute -right-1 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-current text-[var(--cyan-primary)]"
              />
            )}
          </button>
          <span className="absolute right-11 top-1/2 -translate-y-1/2 px-2 py-1 text-[9px] font-mono tracking-wider text-white/80 bg-black/80 backdrop-blur-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">RECON</span>
          <AnimatePresence>
            {showIntel && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2 w-80">
                <OsintPanel onSweepVisualize={setSweepData} onScanGeolocate={(target, data) => {
                  setScanTargets(prev => {
                    const existing = prev.filter(t => t.id !== target);
                    return [{ id: target, timestamp: Date.now(), ...data }, ...existing].slice(0, 10);
                  });
                  setFlyToLocation({ lat: data.lat, lng: data.lng, ts: Date.now() });
                }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative group">
          <button onClick={() => { setShowIntel(false); setShowAlerts(false); setShowMarkets(false); setShowSpaceCam(v => !v); }} className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${showSpaceCam ? 'bg-[#00E5FF]/20' : 'hover:bg-white/10'}`} title="Live from Space — 24/7 video downlink from the ISS" aria-label="Live from Space" aria-expanded={showSpaceCam}>
            <Radio className={`w-4 h-4 ${showSpaceCam ? 'text-[#00E5FF]' : 'text-white/60'}`} />
            {showSpaceCam && (
              <span
                aria-hidden="true"
                className="absolute -right-1 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-current text-[#00E5FF]"
              />
            )}
          </button>
          <span className="absolute right-11 top-1/2 -translate-y-1/2 px-2 py-1 text-[9px] font-mono tracking-wider text-white/80 bg-black/80 backdrop-blur-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">SPACE</span>
          <AnimatePresence>
            {showSpaceCam && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2 w-80">
                <SpaceCam />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative group">
          <button onClick={() => { setShowMarkets(!showMarkets); setShowIntel(false); setShowAlerts(false); setShowSpaceCam(false); }} className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${showMarkets ? 'bg-[var(--gold-primary)]/20' : 'hover:bg-white/10'}`} title="Markets — crypto prices, space weather, global indices" aria-label="Markets" aria-expanded={showMarkets}>
            <BarChart3 className={`w-4 h-4 ${showMarkets ? 'text-[var(--gold-primary)]' : 'text-white/60'}`} />
            {showMarkets && (
              <span
                aria-hidden="true"
                className="absolute -right-1 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-current text-[var(--gold-primary)]"
              />
            )}
          </button>
          <span className="absolute right-11 top-1/2 -translate-y-1/2 px-2 py-1 text-[9px] font-mono tracking-wider text-white/80 bg-black/80 backdrop-blur-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">MARKETS</span>
          <AnimatePresence>
            {showMarkets && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2 w-80">
                <MarketsPanel data={data} spaceWeather={spaceWeather} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative group">
          <button onClick={() => { setShowAlerts(!showAlerts); setShowIntel(false); setShowMarkets(false); setShowDrawing(false); }} className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${showAlerts ? 'bg-[#FF3D3D]/20' : 'hover:bg-white/10'}`} title="Live Alerts — earthquakes, conflicts, breaking news" aria-label="Live Alerts" aria-expanded={showAlerts}>
            <AlertTriangle className={`w-4 h-4 ${showAlerts ? 'text-[#FF3D3D]' : 'text-white/60'}`} />
            {showAlerts && (
              <span
                aria-hidden="true"
                className="absolute -right-1 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-current text-[#FF3D3D]"
              />
            )}
          </button>
          <span className="absolute right-11 top-1/2 -translate-y-1/2 px-2 py-1 text-[9px] font-mono tracking-wider text-white/80 bg-black/80 backdrop-blur-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">ALERTS</span>
          <AnimatePresence>
            {showAlerts && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2 w-80">
                <LiveAlerts data={data} onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} onWatchFeed={(url, name) => { setLiveFeedUrl(url); setLiveFeedName(name); }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative group">
          <button onClick={() => { setShowDrawing(!showDrawing); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); setShowSpaceCam(false); }} className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${showDrawing ? 'bg-[#00E5FF]/20' : 'hover:bg-white/10'}`} title="Draw — measure areas of interest on the map" aria-label="Draw" aria-expanded={showDrawing}>
            <PenLine className={`w-4 h-4 ${showDrawing ? 'text-[#00E5FF]' : 'text-white/60'}`} />
            {showDrawing && (
              <span
                aria-hidden="true"
                className="absolute -right-1 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-current text-[#00E5FF]"
              />
            )}
          </button>
          <span className="absolute right-11 top-1/2 -translate-y-1/2 px-2 py-1 text-[9px] font-mono tracking-wider text-white/80 bg-black/80 backdrop-blur-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">DRAW</span>
        </div>

        <div className="relative group">
          <button onClick={() => { setShowDirections(!showDirections); if (showDirections) { setActiveRoute(null); } setShowDesktopSearch(false); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); setShowSpaceCam(false); setShowDrawing(false); }} className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${showDirections ? 'bg-[var(--gold-primary)]/20' : 'hover:bg-white/10'}`} title="Directions — turn-by-turn routing" aria-label="Directions" aria-expanded={showDirections}>
            <Route className={`w-4 h-4 ${showDirections ? 'text-[var(--gold-primary)]' : 'text-white/60'}`} />
            {showDirections && (
              <span
                aria-hidden="true"
                className="absolute -right-1 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-current text-[var(--gold-primary)]"
              />
            )}
          </button>
          <span className="absolute right-11 top-1/2 -translate-y-1/2 px-2 py-1 text-[9px] font-mono tracking-wider text-white/80 bg-black/80 backdrop-blur-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">ROUTE</span>
        </div>

        <div className="relative group">
          <button onClick={() => { setShowDesktopSearch(!showDesktopSearch); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); setShowSpaceCam(false); setShowDrawing(false); }} className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${showDesktopSearch ? 'bg-[var(--gold-primary)]/20' : 'hover:bg-white/10'}`} title="Search — find locations, cities, coordinates" aria-label="Search" aria-expanded={showDesktopSearch}>
            <Search className={`w-4 h-4 ${showDesktopSearch ? 'text-[var(--gold-primary)]' : 'text-white/60'}`} />
            {showDesktopSearch && (
              <span
                aria-hidden="true"
                className="absolute -right-1 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-current text-[var(--gold-primary)]"
              />
            )}
          </button>
          <span className="absolute right-11 top-1/2 -translate-y-1/2 px-2 py-1 text-[9px] font-mono tracking-wider text-white/80 bg-black/80 backdrop-blur-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">SEARCH</span>
          <AnimatePresence>
            {showDesktopSearch && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2 w-80">
                <SearchBar alwaysExpanded onLocate={(lat, lng, zoom) => { setFlyToLocation({ lat, lng, zoom, ts: Date.now() }); setShowDesktopSearch(false); }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Separator */}
        <div className="w-4 h-px bg-white/10 mx-auto" />

        {/* ── ARCGIS INTEL ── */}
        <div className="relative group">
          <button onClick={() => { setShowArcGIS(!showArcGIS); setShowRemote(false); }} className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${showArcGIS ? 'bg-[var(--gold-primary)]/20' : 'hover:bg-white/10'}`} title="ArcGIS — search & import geospatial intel layers" aria-label="ArcGIS" aria-expanded={showArcGIS}>
            <Database className={`w-4 h-4 ${showArcGIS ? 'text-[var(--gold-primary)]' : 'text-white/60'}`} />
            {showArcGIS && (
              <span
                aria-hidden="true"
                className="absolute -right-1 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-current text-[var(--gold-primary)]"
              />
            )}
            {arcgisLayers.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-[var(--gold-primary)] text-black text-[9px] font-mono font-bold leading-none px-0.5">{arcgisLayers.length}</span>}
          </button>
          <span className="absolute right-11 top-1/2 -translate-y-1/2 px-2 py-1 text-[9px] font-mono tracking-wider text-white/80 bg-black/80 backdrop-blur-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">ARCGIS</span>
          <AnimatePresence>
            {showArcGIS && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2 w-[340px]">
                <div className="glass-panel p-3 max-h-[70vh] overflow-y-auto styled-scrollbar">
                  <ArcGISPanel
                    onImportLayer={(layer) => setArcgisLayers(prev => [...prev.filter(l => l.id !== layer.id), { ...layer, color: layer.color || '#D4AF37', visible: true, opacity: layer.opacity ?? 0.8 }])}
                    onRemoveLayer={(id) => setArcgisLayers(prev => prev.filter(l => l.id !== id))}
                    onUpdateLayer={(id, updates) => setArcgisLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l))}
                    importedLayers={arcgisLayers}
                    mapBounds={mapCenter?.bounds || null}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>


        {/* Separator */}
        <div className="w-4 h-px bg-white/10 mx-auto" />

        {/* ── WORLD REMOTE ── */}
        <div className="relative group">
          <button onClick={() => { setShowRemote(!showRemote); setShowArcGIS(false); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); setShowSpaceCam(false); setShowDrawing(false); setShowDesktopSearch(false); }} className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${showRemote ? 'bg-[var(--cyan-primary)]/20' : 'hover:bg-white/10'}`} title="World Remote — control nearby Bluetooth devices (TVs, speakers, AC)" aria-label="World Remote" aria-expanded={showRemote}>
            <Bluetooth className={`w-4 h-4 ${showRemote ? 'text-[var(--cyan-primary)]' : 'text-white/60'}`} />
            {showRemote && (
              <span
                aria-hidden="true"
                className="absolute -right-1 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-current text-[var(--cyan-primary)]"
              />
            )}
          </button>
          <span className="absolute right-11 top-1/2 -translate-y-1/2 px-2 py-1 text-[9px] font-mono tracking-wider text-white/80 bg-black/80 backdrop-blur-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">REMOTE</span>
          <AnimatePresence>
            {showRemote && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2 w-80">
                <WorldRemote onClose={() => setShowRemote(false)} onPlaceOnMap={(devs) => {
                  setScanTargets(prev => {
                    const ids = new Set(prev.map((t: any) => t.id));
                    const next = [...prev];
                    devs.forEach(d => { if (!ids.has(d.id)) next.unshift({ id: d.id, name: d.name, lat: d.lat, lng: d.lng, type: d.type, color: d.color, timestamp: Date.now(), source: 'BLE' }); });
                    return next.slice(0, 20);
                  });
                  if (devs.length > 0) setFlyToLocation({ lat: devs[0].lat, lng: devs[0].lng, ts: Date.now() });
                }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>


      </div>}

      {/* ── LIVE FEED VIEWER OVERLAY ── */}
      <AnimatePresence>
        {liveFeedUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setLiveFeedUrl(null)}
          >
            <motion.div
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              className="w-[90vw] max-w-[900px] flex flex-col relative rounded-xl overflow-hidden border border-[var(--border-primary)] shadow-2xl bg-black"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#111] border-b border-[var(--border-primary)]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#FF4081] animate-osiris-pulse" />
                  <span className="text-[11px] font-mono font-bold text-white tracking-wider">{liveFeedName}</span>
                  <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-mono text-[10px] font-bold">LIVE STREAM</span>
                  {!liveFeedEmbedAllowed && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono text-[10px]">EXTERNAL ONLY</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={getYouTubeWatchUrl(liveFeedUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--border-primary)] hover:bg-[var(--gold-primary)] hover:text-black text-white transition-colors text-[10px] font-mono"
                  >
                    <span>Open in YouTube</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button onClick={() => setLiveFeedUrl(null)} className="text-white/70 hover:text-white transition-colors p-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body — iframe or external card */}
              {liveFeedEmbedAllowed ? (
                <div className="w-full aspect-video relative bg-black">
                  <iframe
                    src={liveFeedUrl}
                    className="w-full h-full absolute inset-0"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="w-full aspect-video flex items-center justify-center bg-black/95">
                  <div className="text-center px-8">
                    <div className="w-14 h-14 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center mx-auto mb-4">
                      <ExternalLink className="w-6 h-6 text-[#39FF14]" />
                    </div>
                    <p className="text-[12px] font-mono font-bold text-white tracking-widest mb-2">EMBED RESTRICTED</p>
                    <p className="text-[10px] font-mono text-white/50 mb-6 max-w-xs">
                      {liveFeedName} does not allow third-party embedding. Click below to open the live stream directly.
                    </p>
                    <a
                      href={getYouTubeWatchUrl(liveFeedUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded border border-[#39FF14]/40 text-[#39FF14] font-mono text-[11px] hover:bg-[#39FF14]/10 transition-colors tracking-wider"
                    >
                      <ExternalLink className="w-4 h-4" />
                      OPEN LIVE STREAM
                    </a>
                  </div>
                </div>
              )}

              {/* Footer — only show for embeddable feeds */}
              {liveFeedEmbedAllowed && (
                <div className="bg-[#111]/90 px-4 py-2.5 border-t border-[var(--border-primary)] flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-[var(--gold-primary)] shrink-0" />
                  <span className="text-[10px] font-mono text-white/70 leading-relaxed">
                    If you see &ldquo;Video unavailable&rdquo;, use <strong className="text-[var(--gold-primary)]">Open in YouTube</strong> above.
                  </span>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MOBILE UI ═══ */}
      {isMobile && (
        <>
          {/* Mobile Bottom Navigation */}
          <div className="mobile-nav">
            <div className="glass-panel mobile-nav-inner">
              {[
                { id: 'layers' as const, icon: Layers, label: 'LAYERS' },
                { id: 'markets' as const, icon: BarChart3, label: 'MARKETS' },
                { id: 'intel' as const, icon: Newspaper, label: 'INTEL' },
                { id: 'recon' as const, icon: Radar, label: 'RECON' },
                { id: 'search' as const, icon: Search, label: 'SEARCH' },
                // Routing was reachable only from the desktop tool rail, so a
                // phone could not open it at all. It sits next to SEARCH
                // because both answer "take me somewhere".
                { id: 'route' as const, icon: Route, label: 'ROUTE' },
                { id: 'remote' as const, icon: Bluetooth, label: 'REMOTE' },
              ].map(tab => {
                // Routing opens the planner at the top of the screen rather than
                // the bottom drawer — it needs the room above the keyboard, and
                // guidance has to stay readable while you drive.
                const isRoute = tab.id === 'route';
                const active = isRoute ? showDirections || Boolean(navSession) : mobilePanel === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (isRoute) {
                        // Mid-drive this must not touch anything: closing the
                        // planner clears the active route, which would take the
                        // line off the map underneath a driver. Guidance is
                        // ended from the navigation view's own exit.
                        if (navSession) return;
                        setMobilePanel(null);
                        setShowDirections((open) => {
                          if (open) setActiveRoute(null);
                          return !open;
                        });
                        return;
                      }
                      setMobilePanel(mobilePanel === tab.id ? null : tab.id);
                    }}
                    aria-pressed={active}
                    disabled={isRoute && Boolean(navSession)}
                    className={`mobile-nav-btn ${active ? 'active' : ''}`}
                  >
                    <tab.icon className={`w-4 h-4 ${tab.id === 'recon' ? 'text-[var(--cyan-primary)]' : ''}`} />
                    <span className={tab.id === 'recon' ? 'text-[var(--cyan-primary)]' : ''}>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile Drawer */}
          <AnimatePresence>
            {mobilePanel && (
              <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-[52px] left-0 right-0 z-[400] glass-panel rounded-b-none overflow-y-auto styled-scrollbar"
                style={{ maxHeight: 'min(55vh, calc(100dvh - 100px))', paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}
              >
                <div className="mobile-drawer-handle" />
                <div className="px-3 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="hud-text text-[10px] text-[var(--text-primary)]">
                      {mobilePanel === 'layers' ? 'LAYERS & STATS' : mobilePanel === 'markets' ? 'MARKETS & INTEL' : mobilePanel === 'intel' ? 'INTEL FEED' : mobilePanel === 'recon' ? 'OSIRIS RECON' : mobilePanel === 'remote' ? 'WORLD REMOTE' : 'SEARCH'}
                    </span>
                    <button onClick={() => setMobilePanel(null)} className="text-[var(--text-muted)] p-1"><X className="w-4 h-4" /></button>
                  </div>
                  {mobilePanel === 'layers' && (
                    <>
                      <div className="glass-panel-sm p-2 mb-2">
                        <div className="grid grid-cols-5 gap-1 text-center">
                          <div><div className="hud-label" style={{fontSize:'9px'}}>AIR</div><div className="hud-value text-[10px]">{totalFlights.toLocaleString()}</div></div>
                          <div><div className="hud-label" style={{fontSize:'9px'}}>SAT</div><div className="hud-value text-[10px]">{(data.satellites?.length||0)}</div></div>
                          <div><div className="hud-label" style={{fontSize:'9px'}}>CAM</div><div className="hud-value text-[10px]">{(data.cameras?.length||0)}</div></div>
                          <div><div className="hud-label" style={{fontSize:'9px'}}>WX</div><div className="hud-value text-[10px]" style={{color:'var(--accent-weather)'}}>{(data.weather_events?.length||0)}</div></div>
                          <div><div className="hud-label" style={{fontSize:'9px'}}>NUC</div><div className="hud-value text-[10px]" style={{color:'var(--accent-nuclear)'}}>{(data.infrastructure?.length||0)}</div></div>
                        </div>
                      </div>
                      <LayerPanel data={data} activeLayers={activeLayers} setActiveLayers={setActiveLayers} isMobile={true} theme={osirisTheme} setTheme={setOsirisTheme} capabilities={capabilities} />
                      <div className="mt-8">
                        <ViewPresets onNavigate={(lat, lng, zoom) => { setFlyToLocation({ lat, lng, ts: Date.now() }); setMapView(v => ({ ...v, zoom })); setMobilePanel(null); }} />
                      </div>
                    </>
                  )}
                  {mobilePanel === 'markets' && <MarketsPanel data={data} spaceWeather={spaceWeather} />}
                  {mobilePanel === 'intel' && <IntelFeed data={data} onLocate={(lat, lng) => { setFlyToLocation({ lat, lng, ts: Date.now() }); setMobilePanel(null); }} />}
                  {mobilePanel === 'search' && (
                    <div className="space-y-2">
                      <SearchBar onLocate={(lat, lng, zoom) => { setFlyToLocation({ lat, lng, zoom, ts: Date.now() }); setMobilePanel(null); }} />
                      <SharePanel mapView={mapView} activeLayers={activeLayers} mouseCoords={null} />
                    </div>
                  )}
                  {mobilePanel === 'recon' && (
                    <div className="space-y-2">
                      <OsintPanel isOpen={true} onClose={() => setMobilePanel(null)} isMobile={true} onSweepVisualize={setSweepData} />
                    </div>
                  )}
                  {mobilePanel === 'remote' && (
                    <WorldRemote onClose={() => setMobilePanel(null)} onPlaceOnMap={(devs) => {
                      setScanTargets(prev => {
                        const ids = new Set(prev.map((t: any) => t.id));
                        const next = [...prev];
                        devs.forEach(d => { if (!ids.has(d.id)) next.unshift({ id: d.id, name: d.name, lat: d.lat, lng: d.lng, type: d.type, color: d.color, timestamp: Date.now(), source: 'BLE' }); });
                        return next.slice(0, 20);
                      });
                      if (devs.length > 0) setFlyToLocation({ lat: devs[0].lat, lng: devs[0].lng, ts: Date.now() });
                    }} />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* ── BOTTOM CURSOR INFO (desktop) ── */}
      {!isMobile && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3, duration: 0.8 }} className="desktop-only absolute bottom-8 z-[200] pointer-events-auto" style={{ left: '72px' }}>
          <div className="flex items-center gap-5 text-[9px] font-mono tracking-widest text-[var(--text-muted)] opacity-60">
            <div className="flex gap-2 items-center" title="Cursor coordinates (hover over map)">
              <span>CURSOR</span>
              <span ref={coordsDisplayRef} className="text-[var(--gold-primary)] font-bold tabular-nums">—</span>
            </div>
            <div className="flex gap-2 items-center" title="Reverse-geocoded location name">
              <span>LOCATION</span>
              <span className="text-[var(--cyan-primary)] truncate max-w-[200px]">{locationLabel || 'HOVER MAP'}</span>
            </div>
            <div className="flex gap-2 items-center" title="Current zoom level">
              <span>ZOOM</span>
              <span className="text-[var(--gold-primary)] font-bold tabular-nums">{mapView.zoom.toFixed(1)}</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Scale bar is now integrated into the map controls section above */}

      {/* ── Region Dossier ── */}
      {(regionDossier || dossierLoading) && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="absolute top-16 md:top-20 left-2 right-2 md:left-1/2 md:right-auto md:-translate-x-1/2 z-[300] md:w-[480px] max-h-[65vh] overflow-y-auto styled-scrollbar">
          <div className="glass-panel p-5 osiris-glow">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-mono font-bold text-[var(--gold-primary)] tracking-wider">REGION DOSSIER</h2>
              <button onClick={() => { setRegionDossier(null); setDossierLoading(false); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs">✕</button>
            </div>
            {dossierLoading ? (
              <div className="text-center py-8">
                <div className="w-5 h-5 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <span className="text-[9px] font-mono text-[var(--text-muted)] tracking-widest">COMPILING INTEL...</span>
              </div>
            ) : regionDossier && (
              <div className="space-y-3">
                <div><div className="hud-label mb-0.5">LOCATION</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.location?.display_name}</div></div>
                {regionDossier.country && (
                  <div className="grid grid-cols-2 gap-2">
                    <div><div className="hud-label mb-0.5">COUNTRY</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.flag} {regionDossier.country.name}</div></div>
                    <div><div className="hud-label mb-0.5">CAPITAL</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.capital}</div></div>
                    <div><div className="hud-label mb-0.5">POPULATION</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.population?.toLocaleString()}</div></div>
                    <div><div className="hud-label mb-0.5">REGION</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.subregion || regionDossier.country.region}</div></div>
                    <div><div className="hud-label mb-0.5">LANGUAGES</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.languages?.join(', ')}</div></div>
                    <div><div className="hud-label mb-0.5">AREA</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.area?.toLocaleString()} km²</div></div>
                  </div>
                )}
                {regionDossier.head_of_state && (<div><div className="hud-label mb-0.5">HEAD OF STATE</div><div className="text-xs text-[var(--gold-primary)]">{regionDossier.head_of_state.name}</div><div className="text-[9px] text-[var(--text-muted)]">{regionDossier.head_of_state.position}</div></div>)}
                {regionDossier.wikipedia && (<div><div className="hud-label mb-1">INTELLIGENCE BRIEF</div><div className="flex gap-3">{regionDossier.wikipedia.thumbnail && <img src={regionDossier.wikipedia.thumbnail} alt="" className="w-14 h-14 rounded object-cover flex-shrink-0" />}<p className="text-[9px] text-[var(--text-secondary)] leading-relaxed">{regionDossier.wikipedia.extract}</p></div></div>)}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Camera Viewer ── */}
      <CameraViewer
        camera={activeCamera}
        onClose={() => setActiveCamera(null)}
        onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })}
      />

      {/* ── Entity Graph Panel ── */}
      {/* Guidance belongs over the map, where the clicking happens. */}
      {drawMode && (
        <DrawHud
          mode={drawMode}
          progress={drawProgress}
          onUndo={() => sendDraw('undo')}
          onFinish={() => sendDraw('finish')}
          onCancel={() => { sendDraw('cancel'); setDrawMode(null); setDrawProgress(null); }}
        />
      )}

      {showDrawing && (
        <div className="absolute right-12 top-1/2 -translate-y-1/2 z-[400] w-80 pointer-events-auto">
          <DrawingToolbar
            drawMode={drawMode}
            onSetDrawMode={setDrawMode}
            progress={drawProgress}
            polygons={drawnPolygons}
            onDeletePolygon={(id) => setDrawnPolygons(p => p.filter(x => x.id !== id))}
            onClearAll={() => { setDrawnPolygons([]); setSelectedPolygon(null); }}
            onExportGeoJSON={handleExportGeoJSON}
            selectedPolygon={selectedPolygon}
            onSelectPolygon={setSelectedPolygon}
            onRenamePolygon={(id, name) => setDrawnPolygons(p => p.map(x => x.id === id ? { ...x, name } : x))}
            data={data}
            onLocateEntity={(lat, lng) => setFlyToLocation({ lat, lng, zoom: 12, ts: Date.now() })}
            watched={watched}
            onToggleWatch={toggleWatch}
            watchEvents={watchEvents}
          />
        </div>
      )}

      {/* ── OVERLAYS ── */}
      <div className="vignette absolute inset-0 pointer-events-none z-[2]" />
      <div className="crt-scanlines absolute inset-0 pointer-events-none z-[3] opacity-[0.02]" />
      {/* Corner frames — using explicit classes for Tailwind JIT compatibility */}
      {[
        { pos: 'top-0 left-0', vAnchor: 'top-0', hAnchor: 'left-0', hGrad: 'bg-gradient-to-r', vGrad: 'bg-gradient-to-b' },
        { pos: 'top-0 right-0', vAnchor: 'top-0', hAnchor: 'right-0', hGrad: 'bg-gradient-to-l', vGrad: 'bg-gradient-to-b' },
        { pos: 'bottom-0 left-0', vAnchor: 'bottom-0', hAnchor: 'left-0', hGrad: 'bg-gradient-to-r', vGrad: 'bg-gradient-to-t' },
        { pos: 'bottom-0 right-0', vAnchor: 'bottom-0', hAnchor: 'right-0', hGrad: 'bg-gradient-to-l', vGrad: 'bg-gradient-to-t' },
      ].map((c, i) => (
        <div key={i} className={`absolute ${c.pos} w-16 h-16 pointer-events-none z-[1]`}>
          <div className={`absolute ${c.vAnchor} ${c.hAnchor} w-full h-[1px] ${c.hGrad} from-[var(--gold-primary)]/30 to-transparent`} />
          <div className={`absolute ${c.vAnchor} ${c.hAnchor} w-[1px] h-full ${c.vGrad} from-[var(--gold-primary)]/30 to-transparent`} />
        </div>
      ))}

      {/* Keyboard Shortcuts Overlay */}
      <KeyboardShortcuts />

      {/* ── GLOBAL STATUS TICKER (bottom) ── */}
      <GlobalStatusBar />

      {/* Shortcut hint — more visible */}
      <div className="desktop-only absolute bottom-[26px] right-5 z-[200] pointer-events-none text-[9px] font-mono text-[var(--text-muted)] opacity-50 tracking-widest" title="Press ? to see all keyboard shortcuts">
        Press <span className="text-[var(--gold-primary)] opacity-80">?</span> for shortcuts · <span className="text-[var(--gold-primary)] opacity-80">F</span> fullscreen · <span className="text-[var(--gold-primary)] opacity-80">R</span> reset view
      </div>


    </main>
  );
}
