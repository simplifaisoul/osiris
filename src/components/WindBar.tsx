'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Pause, Play, SkipBack, SkipForward, Wind } from 'lucide-react';
import type { Map as MlMap } from 'maplibre-gl';
import type { WindField } from '@/lib/wind-field';
import { blendWind, bracketTime, sampleWind, WIND_BANDS, WIND_STYLE, type WindGrid, type WindStyle } from '@/lib/wind-layer';
import { WindOverlay } from '@/lib/wind-gl-layer';
import { WindParticles } from '@/lib/wind-particles';
import { AtCentre, BoxShell, Choice, clock, DAYS, IconButton, Legend, ResetButton, TextButton, TimeReadout, TimeTrack, Tune } from '@/components/TimeBox';

/**
 * OSIRIS — the Wind layer: its streamlines (or, with the layer's Particles
 * option, its particles), and the small box that holds its time slider and
 * controls.
 *
 * The slider runs from three days back to five days ahead of the newest GFS
 * run (see /api/wind), a frame every three hours. Between two frames the wind
 * is blended, so scrubbing and playing move smoothly instead of in three-hour
 * jumps. Frames are fetched as the slider nears them, never the whole run.
 * TUNE sets how the wind is drawn: how fast it runs, how long its tails are,
 * and how many streamlines or particles there are.
 *
 * Folding the box leaves a chip with the time on it; the wind keeps blowing
 * and playing keeps playing. With the layer's Time Controls switched off
 * there is no box at all, and the wind is drawn as it is now.
 */

const HOUR = 3600_000;
/** Model hours played per second. */
const RATES = [1, 3, 6, 12];
const MAX_FETCHES = 3;
const RETRY_MS = 30_000;
const STORE = 'osiris.wind';

const UNITS = { 'm/s': 1, 'km/h': 3.6, kn: 1.943844 } as const;
type Unit = keyof typeof UNITS;

interface Settings extends WindStyle {
  rate: number;
  unit: Unit;
  /** The box is open, rather than folded to its chip. */
  open: boolean;
}
// Folded to its chip until the visitor opens it.
const DEFAULTS: Settings = { ...WIND_STYLE, rate: 3, unit: 'km/h', open: false };
/** Settings saved before the box started folded carry an `open: true` nobody chose; theirs is not kept. */
const VERSION = 2;

type Frame = Omit<WindField, 'u' | 'v'> & { u: Int16Array; v: Int16Array };

function readSettings(): Settings {
  const out = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (typeof saved?.speed === 'number') out.speed = saved.speed;
    if (typeof saved?.trail === 'number') out.trail = saved.trail;
    if (typeof saved?.density === 'number') out.density = Math.min(2, saved.density);
    if (RATES.includes(saved?.rate)) out.rate = saved.rate;
    if (saved?.unit in UNITS) out.unit = saved.unit;
    if (saved?.v === VERSION && typeof saved?.open === 'boolean') out.open = saved.open;
  } catch { /* storage blocked or corrupt */ }
  return out;
}

const iso = (t: number) => new Date(t).toISOString();
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** How often the map-centre reading is taken: the wind changes as the map moves and as time plays. */
const CENTRE_MS = 250;

/** "+1D 6H", "−18H" — how far the slider is from now. */
function relative(t: number, now: number): string {
  const hours = Math.round((t - now) / HOUR);
  if (Math.abs(t - now) < HOUR / 2 || hours === 0) return 'NOW';
  const sign = hours > 0 ? '+' : '−';
  const d = Math.floor(Math.abs(hours) / 24);
  const h = Math.abs(hours) % 24;
  return `${sign}${d ? `${d}D` : ''}${d && h ? ' ' : ''}${h ? `${h}H` : ''}`;
}

export default function WindBar({ mapRef, controls = true, particles = false, onOff }: {
  mapRef: React.RefObject<MlMap | null>;
  /** Show the box; off, the wind is drawn as it is now. */
  controls?: boolean;
  /** Draw particles coloured by speed, the classic look, instead of streamlines. */
  particles?: boolean;
  onOff?: () => void;
}) {
  const overlay = useRef<WindOverlay | WindParticles | null>(null);
  const frames = useRef(new Map<number, Frame>());
  const fetching = useRef(new Set<number>());
  const failed = useRef(new Map<number, number>());
  const blended = useRef<WindGrid | undefined>(undefined);
  const runRef = useRef(0);

  const [timeline, setTimeline] = useState<{ run: number; times: number[] } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set());
  const [time, setTime] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const timeRef = useRef(time);
  const [playing, setPlaying] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [settings, setSettings] = useState<Settings>(readSettings);
  /** The tuning as last set, for a drawing made after it (switching looks). */
  const style = useRef<WindStyle>({ speed: settings.speed, trail: settings.trail, density: settings.density });
  /** The wind drawn at the middle of the map: m/s, and the bearing it blows from. */
  const [centre, setCentre] = useState<{ speed: number; from: number } | null>(null);

  const seek = useCallback((t: number) => {
    timeRef.current = t;
    setTime(t);
  }, []);
  useEffect(() => { timeRef.current = time; }, [time]);

  // No controls, no time travel: back to now, and stop.
  const [hadControls, setHadControls] = useState(controls);
  if (hadControls !== controls) {
    setHadControls(controls);
    if (!controls) { setPlaying(false); setTime(now); }
  }

  // The drawing, for as long as the layer is on: streamlines on a custom map
  // layer, or particles on a canvas over the map. Switching looks hands the
  // new one the wind and tuning the old one had.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const wind = particles ? new WindParticles(map) : new WindOverlay(map);
    wind.setStyle(style.current);
    if (blended.current) wind.setField(blended.current);
    overlay.current = wind;
    return () => { wind.remove(); overlay.current = null; };
  }, [mapRef, particles]);

  useEffect(() => {
    style.current = { speed: settings.speed, trail: settings.trail, density: settings.density };
    overlay.current?.setStyle(style.current);
    try { localStorage.setItem(STORE, JSON.stringify({ ...settings, v: VERSION })); } catch { /* storage blocked */ }
  }, [settings]);

  // Which run, and so which times. A new run lands every six hours.
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch('/api/wind')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((index: { run: string; times: string[] }) => {
        if (cancelled) return;
        const run = Date.parse(index.run);
        setUnavailable(false);
        if (run === runRef.current) return;
        runRef.current = run;
        frames.current.clear();
        failed.current.clear();
        setLoaded(new Set());
        setTimeline({ run, times: index.times.map(Date.parse) });
      })
      .catch(() => { if (!cancelled && !runRef.current) setUnavailable(true); });
    load();
    const refresh = setInterval(load, 30 * 60_000);
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => { cancelled = true; clearInterval(refresh); clearInterval(tick); };
  }, []);

  const want = useCallback((t: number | undefined) => {
    if (t === undefined || frames.current.has(t) || fetching.current.has(t)) return;
    if (fetching.current.size >= MAX_FETCHES || (failed.current.get(t) ?? 0) > Date.now()) return;
    const run = runRef.current;
    fetching.current.add(t);
    fetch(`/api/wind?run=${iso(run)}&t=${iso(t)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((field: WindField | null) => {
        if (run !== runRef.current) return;
        if (!field?.u) { failed.current.set(t, Date.now() + RETRY_MS); return; }
        frames.current.set(t, { ...field, u: Int16Array.from(field.u), v: Int16Array.from(field.v) });
        setLoaded(new Set(frames.current.keys()));
      })
      .catch(() => failed.current.set(t, Date.now() + RETRY_MS))
      .finally(() => fetching.current.delete(t));
  }, []);

  const first = timeline?.times[0] ?? 0;
  const last = timeline?.times.at(-1) ?? 0;
  const at = timeline ? Math.min(last, Math.max(first, controls ? time : now)) : time;
  const [i0, i1, w] = timeline ? bracketTime(timeline.times, at) : [0, 0, 0];

  // Draw the wind at the slider, and fetch what it needs next: the frames
  // either side of it first, then those it is heading towards.
  useEffect(() => {
    if (!timeline) return;
    const { times } = timeline;
    want(times[i0]);
    want(times[i1]);
    for (let d = 1; d <= (playing ? 4 : 1); d++) {
      want(times[i1 + d]);
      if (!playing) want(times[i0 - d]);
    }
    const a = frames.current.get(times[i0]);
    const b = frames.current.get(times[i1]);
    if (!a && !b) return; // keep showing the last wind until these arrive
    blended.current = blendWind(a ?? b!, b ?? a!, a && b ? w : 0, blended.current);
    overlay.current?.setField(blended.current);
  }, [timeline, i0, i1, w, loaded, playing, want]);

  // The wind at the middle of the map, read off what the particles ride.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !controls) return;
    const read = () => {
      const field = blended.current;
      if (!field) return;
      const { lng, lat } = map.getCenter();
      const wind = sampleWind(field, lng, lat);
      const next = wind ? { speed: Math.hypot(wind[0], wind[1]), from: (Math.atan2(-wind[0], -wind[1]) * 180 / Math.PI + 360) % 360 } : null;
      setCentre(prev => (prev && next && Math.abs(prev.speed - next.speed) < 0.05 && Math.abs(prev.from - next.from) < 1 ? prev : next));
    };
    const id = setInterval(read, CENTRE_MS);
    return () => clearInterval(id);
  }, [mapRef, controls]);

  // Play: the model clock runs at `rate` hours a second, and waits at a frame
  // that hasn't arrived rather than run ahead of the data.
  useEffect(() => {
    if (!playing || !timeline) return;
    const { times } = timeline;
    const end = times.at(-1)!;
    let raf = 0;
    let lastFrame = performance.now();
    const step = (frameAt: number) => {
      const dt = Math.min(frameAt - lastFrame, 100);
      lastFrame = frameAt;
      const next = Math.min(end, timeRef.current + dt * settings.rate * HOUR / 1000);
      const [a, b] = bracketTime(times, next);
      if (frames.current.has(times[a]) && frames.current.has(times[b])) {
        seek(next);
        if (next >= end) { setPlaying(false); return; }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, timeline, settings.rate, seek]);

  if (!controls) return null;

  const togglePlay = () => {
    if (!playing && timeline && at >= last) seek(first);
    setPlaying(p => !p);
  };
  const stepFrame = (dir: 1 | -1) => {
    if (!timeline) return;
    const { times } = timeline;
    const target = dir > 0 ? times.find(t => t > at + 1) : times.findLast(t => t < at - 1);
    if (target !== undefined) seek(target);
  };
  const update = (patch: Partial<Settings>) => setSettings(s => ({ ...s, ...patch }));

  const date = new Date(at);
  const rel = relative(at, now);
  const kind = rel === 'NOW' ? 'NOW' : at > now ? 'FORECAST' : 'PAST';
  const tone = kind === 'FORECAST' ? 'text-[var(--gold-primary)]' : kind === 'NOW' ? 'text-[var(--gold-light)]' : 'text-white/55';
  const waiting = !!timeline && !(loaded.has(timeline.times[i0]) && loaded.has(timeline.times[i1]));
  const days = timeline ? dayMarks(first, last) : [];
  const centreBand = centre ? WIND_BANDS.findLast(b => centre.speed >= b.from) ?? WIND_BANDS[0] : null;

  return (
    <BoxShell
      icon={Wind} title="Wind" source="NOAA GFS"
      open={settings.open} playing={playing} tuning={tuning} tuneLabel="Tune the wind"
      onOpen={() => update({ open: true })}
      onFold={() => { setTuning(false); update({ open: false }); }}
      onTune={() => setTuning(o => !o)}
      onOff={onOff}
      chip={timeline && (
        <>
          <span className="text-[10.5px] font-semibold tracking-wider text-[var(--gold-light)] tabular-nums">{DAYS[date.getDay()]} {clock(date)}</span>
          <span className={`text-[9px] tracking-wider tabular-nums ${tone}`}>{rel}</span>
        </>
      )}
      tune={(
        <>
          <Tune label="FLOW SPEED" value={settings.speed} min={0.25} max={3} step={0.05}
            format={v => `${v.toFixed(2)}×`} onChange={speed => update({ speed })} />
          <Tune label="TAIL" value={settings.trail} min={4} max={60} step={1}
            format={v => (v < 12 ? 'SHORT' : v < 30 ? 'MEDIUM' : 'LONG')} onChange={trail => update({ trail })} />
          <Tune label="DENSITY" value={settings.density} min={0.25} max={2} step={0.05}
            format={v => `${v.toFixed(2)}×`} onChange={density => update({ density })} />
          {/* Particles take their speed band's colour; streamlines are one colour, so have no scale. */}
          {particles && (
            <Legend title={`WIND SPEED · ${settings.unit.toUpperCase()}`} steps={WIND_BANDS.map(band => ({
              color: `rgba(${band.rgb.join(',')},${band.alpha})`,
              value: String(Math.round(band.from * UNITS[settings.unit])),
              name: band.name,
            }))} />
          )}
          <div className="flex items-center gap-2">
            <Choice label="Wind speed unit" value={settings.unit} onChange={unit => update({ unit })}
              options={(Object.keys(UNITS) as Unit[]).map(unit => ({ value: unit, label: unit.toUpperCase() }))} />
            <ResetButton onClick={() => setSettings(s => ({ ...DEFAULTS, unit: s.unit, open: s.open }))} />
          </div>
        </>
      )}
    >
      {timeline ? (
        <TimeReadout at={date} rel={rel} note={rel !== 'NOW' ? kind : undefined} tone={tone} waiting={waiting} />
      ) : (
        <div className="min-h-[34px] pt-1 text-[10px] tracking-[0.18em] text-white/40">{unavailable ? 'WIND DATA UNAVAILABLE — RETRYING' : 'LOADING NOAA GFS…'}</div>
      )}

      {timeline && (
        <AtCentre title={centreBand?.name}>
          {centre && centreBand ? (
            <>
              {/* Points the way the wind is going; with particles, in its speed band's colour. */}
              <ArrowUp aria-hidden="true" className="w-3 h-3 shrink-0 text-[var(--gold-light)]" strokeWidth={2.2}
                style={{ transform: `rotate(${centre.from + 180}deg)`, ...(particles ? { color: `rgb(${centreBand.rgb.join(',')})` } : {}) }} />
              <span className="text-[var(--gold-light)]">{Math.round(centre.speed * UNITS[settings.unit])} {settings.unit.toUpperCase()}</span>
              <span className="text-white/45">FROM {POINTS[Math.round(centre.from / 22.5) % 16]}</span>
            </>
          ) : <span className="text-white/30">—</span>}
        </AtCentre>
      )}

      <div className="mt-1 flex items-center gap-0.5">
        <IconButton label="Back three hours" onClick={() => stepFrame(-1)} disabled={!timeline || at <= first}><SkipBack className="w-3.5 h-3.5" strokeWidth={1.6} /></IconButton>
        <IconButton label={playing ? 'Pause' : 'Play'} onClick={togglePlay} disabled={!timeline} active={playing}>
          {playing ? <Pause className="w-3.5 h-3.5" strokeWidth={1.8} /> : <Play className="w-3.5 h-3.5" strokeWidth={1.8} />}
        </IconButton>
        <IconButton label="Forward three hours" onClick={() => stepFrame(1)} disabled={!timeline || at >= last}><SkipForward className="w-3.5 h-3.5" strokeWidth={1.6} /></IconButton>
        <div className="ml-auto flex items-center gap-0.5">
          {timeline && rel !== 'NOW' && <TextButton onClick={() => seek(Math.min(last, Math.max(first, Date.now())))}>NOW</TextButton>}
          <TextButton title="Playback speed: model hours per second"
            onClick={() => update({ rate: RATES[(RATES.indexOf(settings.rate) + 1) % RATES.length] })}>
            {settings.rate}H/S
          </TextButton>
        </div>
      </div>

      {timeline && (
        <TimeTrack
          first={first} last={last} now={now} at={at} step={HOUR}
          times={timeline.times} loaded={loaded}
          ticks={days.map(d => d.at).filter(t => t > first)}
          labels={days.filter(d => d.label).map(d => ({ at: d.mid, label: d.label! }))}
          ariaLabel="Wind time"
          valueText={`${date.toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}, ${rel === 'NOW' ? 'now' : `${rel} ${kind.toLowerCase()}`}`}
          onSeek={t => { setPlaying(false); seek(t); }}
          onSpace={togglePlay}
        />
      )}
    </BoxShell>
  );
}

/** Local midnights in range, and a day label centred on each day's stretch when there's room. */
function dayMarks(first: number, last: number): { at: number; mid: number; label: string | null }[] {
  const out: { at: number; mid: number; label: string | null }[] = [];
  const start = new Date(first);
  start.setHours(0, 0, 0, 0);
  for (let d = start; d.getTime() < last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const at = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const from = Math.max(at, first);
    const to = Math.min(end, last);
    const roomy = to - from >= 14 * HOUR;
    out.push({ at: from, mid: (from + to) / 2, label: roomy ? DAYS[d.getDay()] : null });
  }
  return out;
}
