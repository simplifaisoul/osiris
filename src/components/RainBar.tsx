'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloudRain, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { ErrorEvent, Map as MlMap, MapSourceDataEvent } from 'maplibre-gl';
import { CLOUDS_LAYER } from '@/lib/live-clouds';
import { bracketTime } from '@/lib/wind-layer';
import { AtCentre, BoxShell, Choice, clock, IconButton, Legend, ResetButton, TextButton, TimeReadout, TimeTrack, Tune } from '@/components/TimeBox';

/**
 * OSIRIS — the Rain layer: RainViewer's radar mosaic, and the small box that
 * plays its last two hours as a loop.
 *
 * Every frame (one each ten minutes, see /api/rain) is its own raster layer.
 * RainViewer lets a viewer have 500 tiles a minute, 300 in a burst, so the
 * tiles are its 512 px ones (a quarter as many), only the frames the slider
 * needs are shown, two loading at once, and a refusal (429) stops the loop and
 * goes back to the newest frame for a minute. Between two frames the radar crossfades, so the rain
 * drifts rather than jumps; playing waits at a frame that hasn't arrived, and
 * rests on the newest before going round again. Left on the newest frame, the
 * radar follows each new one as it lands.
 *
 * Folding the box leaves a chip with the time on it, and the loop goes on.
 * With the layer's Time Controls switched off there is no box at all, and the
 * radar is the newest frame.
 */

const MIN = 60_000;
const FRAME = 10 * MIN;
/** Radar minutes played per second. */
const RATES = [10, 20, 40];
/** At the newest frame, the loop rests this long before going round. */
const HOLD_MS = 1200;
/** Frames loading tiles at once. */
const MAX_LOADING = 2;
/** After RainViewer refuses a tile, how long to ask only for the newest frame. */
const BUSY_MS = 60_000;
const PREFIX = 'rain-radar-';
const STORE = 'osiris.rain';
const ATTRIBUTION = 'Rain: <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>';

/** RainViewer's Universal Blue scale, the only one its free tiles come in, by dBZ. */
const RAIN_SCALE = [
  { value: '10', color: 'rgba(206,192,135,0.6)', name: 'Drizzle' },
  { value: '15', color: '#88ddee', name: 'Light rain' },
  { value: '20', color: '#00a3e0', name: 'Light rain' },
  { value: '25', color: '#0077aa', name: 'Moderate rain' },
  { value: '30', color: '#005588', name: 'Moderate rain' },
  { value: '35', color: '#ffee00', name: 'Heavy rain' },
  { value: '40', color: '#ffaa00', name: 'Heavy rain' },
  { value: '45', color: '#ff4400', name: 'Very heavy rain' },
  { value: '50', color: '#c10000', name: 'Storm' },
  { value: '55', color: '#ffaaff', name: 'Hail' },
  { value: '60', color: '#ff77ff', name: 'Hail' },
  { value: '65', color: '#ffffff', name: 'Large hail' },
];
const SNOW_SCALE = [
  { value: '10', color: '#bfffff', name: 'Light snow' },
  { value: '20', color: '#7fbfff', name: 'Light snow' },
  { value: '30', color: '#4f8fff', name: 'Moderate snow' },
  { value: '40', color: '#2f6fff', name: 'Heavy snow' },
  { value: '50', color: '#0f4fff', name: 'Heavy snow' },
  { value: '60', color: '#002fff', name: 'Very heavy snow' },
];

/** '#rrggbb' or 'rgba(r,g,b,a)' as [r, g, b]. */
const rgbOf = (color: string): number[] =>
  color.startsWith('#') ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) : color.slice(5).split(',').slice(0, 3).map(Number);
const SCALE = [...RAIN_SCALE, ...SNOW_SCALE].map(s => ({ ...s, rgb: rgbOf(s.color) }));

/** What the radar shows at a point: the nearest step of its scale, or nothing. */
type Reading = { name: string; dbz: string; color: string } | 'none';
function classify([r, g, b, a]: number[]): Reading {
  if (a < 24) return 'none';
  let best = SCALE[0];
  let bestD = Infinity;
  for (const s of SCALE) {
    const d = (r - s.rgb[0]) ** 2 + (g - s.rgb[1]) ** 2 + (b - s.rgb[2]) ** 2;
    if (d < bestD) { bestD = d; best = s; }
  }
  return { name: best.name, dbz: best.value, color: best.color };
}

/** Radar tiles read for the map-centre line, a few kept: the map has most of them cached already. */
const tiles = new Map<string, Promise<HTMLImageElement>>();
function tileImage(url: string): Promise<HTMLImageElement> {
  let image = tiles.get(url);
  if (!image) {
    image = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    image.catch(() => tiles.delete(url));
    tiles.set(url, image);
    if (tiles.size > 16) tiles.delete(tiles.keys().next().value!);
  }
  return image;
}
let probe: CanvasRenderingContext2D | null = null;
function pixelAt(img: HTMLImageElement, x: number, y: number): number[] {
  probe ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  if (!probe) return [0, 0, 0, 0];
  probe.imageSmoothingEnabled = false;
  probe.clearRect(0, 0, 1, 1);
  probe.drawImage(img, x, y, 1, 1, 0, 0, 1, 1);
  return [...probe.getImageData(0, 0, 1, 1).data];
}

interface Settings {
  opacity: number;
  /** Snow in its own blues, rather than as rain. */
  snow: boolean;
  rate: number;
  /** The box is open, rather than folded to its chip. */
  open: boolean;
}
// Folded to its chip until the visitor opens it.
const DEFAULTS: Settings = { opacity: 0.75, snow: true, rate: 20, open: false };
/** Settings saved before the box started folded carry an `open: true` nobody chose; theirs is not kept. */
const VERSION = 2;

function readSettings(): Settings {
  const out = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (typeof saved?.opacity === 'number') out.opacity = Math.min(1, Math.max(0.2, saved.opacity));
    if (typeof saved?.snow === 'boolean') out.snow = saved.snow;
    if (RATES.includes(saved?.rate)) out.rate = saved.rate;
    if (saved?.v === VERSION && typeof saved?.open === 'boolean') out.open = saved.open;
  } catch { /* storage blocked or corrupt */ }
  return out;
}

type Frame = { time: number; path: string };
type Radar = { host: string; frames: Frame[] };

/** Under the clouds, which hang above the rain; else under the place names. */
function beneath(map: MlMap): string | undefined {
  const satellite = map.getLayer('satellite-layer') && map.getLayoutProperty('satellite-layer', 'visibility') !== 'none';
  const firstLabel = map.getStyle().layers.find(layer => layer.type === 'symbol')?.id;
  const before = map.getLayer(CLOUDS_LAYER) ? CLOUDS_LAYER : satellite || !firstLabel ? 'day-night-fill' : firstLabel;
  return map.getLayer(before) ? before : undefined;
}

/** "−40MIN", "−1H 20MIN" — how long before now. */
function ago(ms: number): string {
  const mins = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `−${h ? `${h}H` : ''}${h && m ? ' ' : ''}${m || !h ? `${m}MIN` : ''}`;
}

/** Local half hours in range. */
function halfHours(first: number, last: number): number[] {
  const d = new Date(first);
  d.setMinutes(d.getMinutes() <= 30 ? 30 : 60, 0, 0);
  if (d.getTime() - 30 * MIN >= first) d.setTime(d.getTime() - 30 * MIN);
  const out: number[] = [];
  for (let t = d.getTime(); t <= last; t += 30 * MIN) out.push(t);
  return out;
}

const same = (a: ReadonlySet<number>, b: ReadonlySet<number>) => a.size === b.size && [...a].every(t => b.has(t));

export default function RainBar({ mapRef, mapStyle, controls = true, onOff }: {
  mapRef: React.RefObject<MlMap | null>;
  /** The base map; the radar is placed again when it changes. */
  mapStyle?: string;
  /** Show the box; off, the radar is the newest frame. */
  controls?: boolean;
  onOff?: () => void;
}) {
  const [radar, setRadar] = useState<Radar | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set());
  const loadedRef = useRef(loaded);
  /** The slider; Infinity follows the newest frame. */
  const [time, setTime] = useState(Infinity);
  const timeRef = useRef(time);
  const [now, setNow] = useState(() => Date.now());
  const [playing, setPlaying] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [settings, setSettings] = useState<Settings>(readSettings);
  /** Until when RainViewer is to be left alone: it refused a tile. */
  const [busyUntil, setBusyUntil] = useState(0);
  const busy = busyUntil > now;
  /** The radar at the middle of the map, in the frame on screen. */
  const [centre, setCentre] = useState<Reading | null>(null);

  /** Frames with a source and layer on the map, and the snow setting they were made with. */
  const added = useRef(new Set<number>());
  const addedSnow = useRef<boolean | null>(null);
  /** Frames whose layer is visible, and so loading or loaded. */
  const shown = useRef(new Set<number>());
  /** Shown frames the map has rendered since: it has asked for their tiles, or found them cached. */
  const rendered = useRef(new Set<number>());
  const painted = useRef(new Map<number, number>());
  const checkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const seek = useCallback((t: number) => {
    timeRef.current = t;
    setTime(t);
  }, []);

  useEffect(() => { loadedRef.current = loaded; }, [loaded]);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ ...settings, v: VERSION })); } catch { /* storage blocked */ }
  }, [settings]);

  useEffect(() => { timeRef.current = time; }, [time]);

  // No controls, no loop: back to the newest frame, and stop.
  const [hadControls, setHadControls] = useState(controls);
  if (hadControls !== controls) {
    setHadControls(controls);
    if (!controls) { setPlaying(false); setTime(Infinity); }
  }

  // The frames. A new one lands every ten minutes.
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch('/api/rain')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: Radar) => {
        if (cancelled || !body?.frames?.length) return;
        setUnavailable(false);
        setRadar(prev => (prev && prev.host === body.host && prev.frames.length === body.frames.length
          && prev.frames[0].time === body.frames[0].time && prev.frames.at(-1)!.time === body.frames.at(-1)!.time ? prev : body));
      })
      .catch(() => { if (!cancelled) setUnavailable(true); });
    load();
    const refresh = setInterval(load, 2 * MIN);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => { cancelled = true; clearInterval(refresh); clearInterval(tick); };
  }, []);

  /** Which shown frames have their tiles in. At most every 80 ms: while the loop plays the map renders every frame. */
  const checkLoaded = useCallback(() => {
    if (checkTimer.current) return;
    checkTimer.current = setTimeout(() => {
      checkTimer.current = undefined;
      const map = mapRef.current;
      if (!map) return;
      const ready = new Set<number>();
      for (const t of shown.current) {
        const id = PREFIX + t;
        if (rendered.current.has(t) && map.getSource(id) && map.isSourceLoaded(id)) ready.add(t);
      }
      setLoaded(prev => (same(prev, ready) ? prev : ready));
    }, 80);
  }, [mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const frames = added.current;
    const seen = rendered.current;
    const paint = painted.current;
    const onData = (e: MapSourceDataEvent) => { if (e.sourceId?.startsWith(PREFIX)) checkLoaded(); };
    // Listening for errors stops MapLibre logging them, so anything not ours is logged as it would have been.
    const onError = (e: ErrorEvent & { sourceId?: string }) => {
      if (!e.sourceId?.startsWith(PREFIX)) { console.error(e.error); return; }
      if ((e.error as { status?: number } | undefined)?.status !== 429) return;
      const until = Date.now() + BUSY_MS;
      setBusyUntil(until);
      setNow(Date.now());
      setPlaying(false);
      seek(Infinity);
      setTimeout(() => setNow(Date.now()), BUSY_MS + 100);
    };
    const onRender = () => {
      if (shown.current.size === rendered.current.size) return;
      for (const t of shown.current) rendered.current.add(t);
      checkLoaded();
    };
    map.on('sourcedata', onData);
    map.on('error', onError);
    map.on('render', onRender);
    map.on('idle', checkLoaded);
    return () => {
      map.off('sourcedata', onData);
      map.off('error', onError);
      map.off('render', onRender);
      map.off('idle', checkLoaded);
      clearTimeout(checkTimer.current);
      checkTimer.current = undefined;
      // The layer is off: take every frame away.
      for (const t of frames) {
        if (map.getLayer(PREFIX + t)) map.removeLayer(PREFIX + t);
        if (map.getSource(PREFIX + t)) map.removeSource(PREFIX + t);
      }
      frames.clear();
      addedSnow.current = null;
      shown.current = new Set();
      seen.clear();
      paint.clear();
    };
  }, [mapRef, checkLoaded, seek]);

  // A source and a hidden layer per frame; frames that left the run go.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !radar) return;
    const keep = new Set(radar.frames.map(f => f.time));
    const redo = addedSnow.current !== settings.snow;
    for (const t of [...added.current]) {
      if (keep.has(t) && !redo) continue;
      if (map.getLayer(PREFIX + t)) map.removeLayer(PREFIX + t);
      if (map.getSource(PREFIX + t)) map.removeSource(PREFIX + t);
      added.current.delete(t);
      shown.current.delete(t);
      rendered.current.delete(t);
      painted.current.delete(t);
    }
    addedSnow.current = settings.snow;
    const before = beneath(map);
    for (const f of radar.frames) {
      if (added.current.has(f.time)) continue;
      const id = PREFIX + f.time;
      map.addSource(id, {
        type: 'raster', tileSize: 512, maxzoom: 7, attribution: ATTRIBUTION,
        tiles: [`${radar.host}${f.path}/512/{z}/{x}/{y}/2/1_${settings.snow ? 1 : 0}.png`],
      });
      map.addLayer({
        id, type: 'raster', source: id, layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-opacity-transition': { duration: 0, delay: 0 } },
      }, before);
      added.current.add(f.time);
    }
    checkLoaded();
  }, [mapRef, radar, settings.snow, checkLoaded]);

  // Satellite or map underneath: put the radar back in its place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const before = beneath(map);
    for (const t of [...added.current].sort((a, b) => a - b)) {
      if (map.getLayer(PREFIX + t)) map.moveLayer(PREFIX + t, before);
    }
  }, [mapRef, mapStyle]);

  const times = useMemo(() => radar?.frames.map(f => f.time) ?? [], [radar]);
  const first = times[0] ?? 0;
  const last = times.at(-1) ?? 0;
  const at = radar ? Math.min(last, Math.max(first, time)) : 0;
  const [i0, i1, w] = radar ? bracketTime(times, at) : [0, 0, 0];

  // Show the frames on screen, and while it plays the ones it's heading for,
  // coming round to the start near the end. Two load at a time.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !radar) return;
    const n = times.length;
    const order = !controls || busy ? [n - 1]
      : playing ? [i0, i1, i1 + 1, i1 + 2].map(i => i % n)
      : w <= 0 ? [i0] : w >= 1 ? [i1] : [i0, i1];
    const next = new Set<number>();
    let loading = 0;
    for (const i of order) {
      const t = times[i];
      if (t === undefined || next.has(t) || !added.current.has(t)) continue;
      const ready = loadedRef.current.has(t);
      if (!ready && loading >= MAX_LOADING) continue;
      if (!ready) loading++;
      next.add(t);
    }
    // Until one of them is in, keep up whatever is on screen now.
    if (![...next].some(t => loadedRef.current.has(t))) {
      for (const t of shown.current) if ((painted.current.get(t) ?? 0) > 0) next.add(t);
    }
    for (const t of added.current) {
      const on = next.has(t);
      if (on === shown.current.has(t)) continue;
      map.setLayoutProperty(PREFIX + t, 'visibility', on ? 'visible' : 'none');
      rendered.current.delete(t);
    }
    shown.current = next;
    // Nothing changed on screen means no render to wait for.
    if (next.size && [...next].every(t => rendered.current.has(t))) checkLoaded();
    else map.triggerRepaint();
  }, [mapRef, radar, times, settings.snow, i0, i1, w, playing, loaded, controls, busy, checkLoaded]);

  // Paint the two frames either side of the slider, crossfading between them.
  // While one is still loading, hold the other; with neither, keep what's up.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !radar) return;
    const a = times[i0];
    const b = times[i1];
    const hasA = loaded.has(a);
    const hasB = loaded.has(b);
    if (!hasA && !hasB) return;
    const mix = hasA && hasB ? w : hasB ? 1 : 0;
    for (const t of added.current) {
      const target = t === a ? settings.opacity * (1 - mix) : t === b ? settings.opacity * mix : 0;
      const value = Math.round(target * 1000) / 1000;
      if (painted.current.get(t) === value) continue;
      map.setPaintProperty(PREFIX + t, 'raster-opacity', value);
      painted.current.set(t, value);
    }
  }, [mapRef, radar, times, settings.snow, settings.opacity, i0, i1, w, loaded]);

  // The radar at the middle of the map: the pixel there in the frame on
  // screen, from the 512 px tile the map itself shows (so mostly cached),
  // read again when the map settles or the frame changes.
  const centreFrame = radar?.frames[w < 0.5 ? i0 : i1];
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !radar || !centreFrame || !controls || busy) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sample = () => {
      const { lng, lat } = map.getCenter();
      const z = Math.max(0, Math.min(7, Math.floor(map.getZoom())));
      const n = 2 ** z;
      const x = ((lng + 180) / 360) * n;
      const rad = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
      const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
      const tx = ((Math.floor(x) % n) + n) % n;
      const ty = Math.min(n - 1, Math.max(0, Math.floor(y)));
      tileImage(`${radar.host}${centreFrame.path}/512/${z}/${tx}/${ty}/2/1_${settings.snow ? 1 : 0}.png`)
        .then(img => {
          if (cancelled) return;
          const size = img.naturalWidth || 512;
          const px = Math.min(size - 1, Math.floor((x - Math.floor(x)) * size));
          const py = Math.min(size - 1, Math.floor((y - Math.floor(y)) * size));
          const next = classify(pixelAt(img, px, py));
          setCentre(prev => (prev && next !== 'none' && prev !== 'none' && prev.dbz === next.dbz && prev.name === next.name ? prev : next));
        })
        .catch(() => { /* refused or offline: keep the last reading */ });
    };
    const soon = () => { clearTimeout(timer); timer = setTimeout(sample, 250); };
    soon();
    map.on('moveend', soon);
    return () => { cancelled = true; clearTimeout(timer); map.off('moveend', soon); };
  }, [mapRef, radar, centreFrame, controls, busy, settings.snow]);

  // Play: radar time runs at `rate` minutes a second, waits at frames that
  // haven't arrived, rests on the newest, then goes round again.
  useEffect(() => {
    if (!playing || times.length < 2) return;
    const start = times[0];
    const end = times.at(-1)!;
    let raf = 0;
    let lastFrame = performance.now();
    let held = 0;
    const step = (frameAt: number) => {
      const dt = Math.min(frameAt - lastFrame, 100);
      lastFrame = frameAt;
      const cur = Math.min(end, Math.max(start, timeRef.current));
      if (cur >= end) {
        held += dt;
        if (held >= HOLD_MS && loadedRef.current.has(start)) { held = 0; seek(start); }
      } else {
        const next = Math.min(end, cur + dt * settings.rate * MIN / 1000);
        const [a, b] = bracketTime(times, next);
        if (loadedRef.current.has(times[a]) && loadedRef.current.has(times[b])) seek(next);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, times, settings.rate, seek]);

  if (!controls) return null;

  const live = time === Infinity;
  /** Where the slider lands; the end of the track means "follow the newest". */
  const place = (t: number) => seek(t >= last ? Infinity : t);
  const togglePlay = () => {
    if (!playing && at >= last) seek(first);
    if (playing && at >= last) seek(Infinity);
    setPlaying(p => !p);
  };
  const stepFrame = (dir: 1 | -1) => {
    const target = dir > 0 ? times.find(t => t > at + 1) : times.findLast(t => t < at - 1);
    if (target !== undefined) place(target);
  };
  const update = (patch: Partial<Settings>) => setSettings(s => ({ ...s, ...patch }));

  const date = new Date(at);
  const rel = live || (!playing && at >= last) ? 'LIVE' : ago(now - at);
  const tone = rel === 'LIVE' ? 'text-[var(--gold-light)]' : 'text-white/55';
  const waiting = !!radar && !((w >= 1 || loaded.has(times[i0])) && (w <= 0 || loaded.has(times[i1])));
  const marks = radar ? halfHours(first, last) : [];

  return (
    <BoxShell
      icon={CloudRain} title="Rain" source="RAINVIEWER"
      open={settings.open} playing={playing} tuning={tuning} tuneLabel="Tune the radar"
      onOpen={() => update({ open: true })}
      onFold={() => { setTuning(false); update({ open: false }); }}
      onTune={() => setTuning(o => !o)}
      onOff={onOff}
      chip={radar && (
        <>
          <span className="text-[10.5px] font-semibold tracking-wider text-[var(--gold-light)] tabular-nums">{clock(date)}</span>
          <span className={`text-[9px] tracking-wider tabular-nums ${tone}`}>{rel}</span>
        </>
      )}
      tune={(
        <>
          <Tune label="OPACITY" value={settings.opacity} min={0.2} max={1} step={0.05}
            format={v => `${Math.round(v * 100)}%`} onChange={opacity => update({ opacity })} />
          <Legend title="RAIN · dBZ · LIGHT → HEAVY → HAIL" steps={RAIN_SCALE} />
          {settings.snow && <Legend title="SNOW · dBZ" steps={SNOW_SCALE} />}
          <div className="flex items-center gap-2">
            <span className="text-[8.5px] tracking-[0.18em] text-white/40">SNOW</span>
            <Choice label="How snow is drawn" value={settings.snow ? 'own' : 'rain'} onChange={v => update({ snow: v === 'own' })}
              options={[{ value: 'own', label: 'IN BLUE' }, { value: 'rain', label: 'AS RAIN' }]} />
            <ResetButton onClick={() => setSettings(s => ({ ...DEFAULTS, open: s.open }))} />
          </div>
        </>
      )}
    >
      {radar ? (
        <TimeReadout at={date} rel={rel} note={busy ? 'LOOP BACK IN 1 MIN' : undefined} tone={tone} waiting={waiting} live={rel === 'LIVE'} />
      ) : (
        <div className="min-h-[34px] pt-1 text-[10px] tracking-[0.18em] text-white/40">{unavailable ? 'RADAR UNAVAILABLE — RETRYING' : 'LOADING RADAR…'}</div>
      )}

      {radar && (
        <AtCentre title={centre && centre !== 'none' ? `About ${centre.dbz} dBZ on radar` : undefined}>
          {!centre ? <span className="text-white/30">—</span>
            : centre === 'none' ? <span className="text-white/45">NO RAIN ON RADAR</span>
            : (
              <>
                <span aria-hidden="true" className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: centre.color }} />
                <span className="text-[var(--gold-light)]">{centre.name.toUpperCase()}</span>
                <span className="text-white/45">~{centre.dbz} dBZ</span>
              </>
            )}
        </AtCentre>
      )}

      <div className="mt-1 flex items-center gap-0.5">
        <IconButton label="Back ten minutes" onClick={() => stepFrame(-1)} disabled={!radar || busy || at <= first}><SkipBack className="w-3.5 h-3.5" strokeWidth={1.6} /></IconButton>
        <IconButton label={playing ? 'Pause' : 'Play the last two hours'} onClick={togglePlay} disabled={busy || times.length < 2} active={playing}>
          {playing ? <Pause className="w-3.5 h-3.5" strokeWidth={1.8} /> : <Play className="w-3.5 h-3.5" strokeWidth={1.8} />}
        </IconButton>
        <IconButton label="Forward ten minutes" onClick={() => stepFrame(1)} disabled={!radar || busy || at >= last}><SkipForward className="w-3.5 h-3.5" strokeWidth={1.6} /></IconButton>
        <div className="ml-auto flex items-center gap-0.5">
          {radar && rel !== 'LIVE' && <TextButton onClick={() => { setPlaying(false); seek(Infinity); }}>LIVE</TextButton>}
          <TextButton title="Loop speed: radar minutes per second"
            onClick={() => update({ rate: RATES[(RATES.indexOf(settings.rate) + 1) % RATES.length] })}>
            {settings.rate}MIN/S
          </TextButton>
        </div>
      </div>

      {radar && (
        <TimeTrack
          first={first} last={last} now={now} at={at} step={FRAME / 10}
          times={times} loaded={loaded}
          ticks={marks} labels={marks.map(t => ({ at: t, label: clock(new Date(t)) }))}
          ariaLabel="Rain time"
          valueText={`${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}, ${rel === 'LIVE' ? 'latest radar' : `${Math.round((now - at) / MIN)} minutes ago`}`}
          onSeek={t => { if (busy) return; setPlaying(false); place(t); }}
          onSpace={togglePlay}
        />
      )}
    </BoxShell>
  );
}
