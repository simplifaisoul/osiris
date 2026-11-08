'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Mountain, Spline, Hexagon, Droplets, Layers, Box, FileText, Download, Undo2, Loader2, X, Info, ChevronDown, ChevronRight, Scissors, Crosshair, RotateCw, ExternalLink, Link2, Check as CheckIcon, MapPin } from 'lucide-react';
import {
  useLidar, useCursorElevation, setRelief, setView, startDraw, cancelDraw, clearProfile, setProfileHover, clearField,
  setFieldMode, setFieldOpacity, setDetail, bestFit, setDesign, undoDesign, setRatio, selectSection, setContours,
  removeSplits, exportCsv, openReport, open3d, totals, ft, acres, yd3, CONTOUR_STEPS_FT, retryField, retryProfile, retryStretch,
  reopenCutout, clearCutout,
  type FieldState, type ProfileState, type Detail, type DrawPurpose, type CutoutState,
} from '@/lib/lidar/store';
import { type ReliefMode } from '@/lib/lidar/relief-tiles';
import { describeFlight } from '@/lib/lidar/usgs';
import { ELEVATION_RAMP } from '@/lib/lidar/grid';

/**
 * Terrain tab of the ArcGIS panel. The three things it does come first, each
 * saying what it is for: an elevation profile along a line, a field workbench
 * (elevation, drainage, cut/fill, rain in 3D), and a cut-out that lifts a box
 * of the map into its own 3D tab with its cameras and network hosts. Lidar
 * relief across the whole map sits below them.
 */

const GOLD = '#D4AF37';
const label = 'text-[9px] font-mono tracking-[0.2em] uppercase text-[var(--text-muted)]';
const box = 'rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5';
const btn = 'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-mono font-bold tracking-widest uppercase transition-colors disabled:opacity-40';
const goldBtn = `${btn} border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#D4AF37] hover:bg-[#D4AF37]/20`;
const quietBtn = `${btn} border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07] hover:text-white`;
const input = 'w-full rounded-md border border-white/10 bg-black/60 px-2 py-1.5 text-[11px] font-mono text-white tabular-nums focus:border-[#D4AF37]/50 focus:outline-none';

const gradient = (stops: typeof ELEVATION_RAMP) => `linear-gradient(to right, ${stops.map(([t, r, g, b]) => `rgb(${r},${g},${b}) ${t * 100}%`).join(', ')})`;
const fmt = (v: number, d = 0) => v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

type Tool = Exclude<DrawPurpose, 'split'>;
const TOOLS: { id: Tool; Icon: typeof Spline; name: string; blurb: string; hint: string }[] = [
  { id: 'profile', Icon: Spline, name: 'Profile', blurb: 'Heights along a line you draw', hint: 'Click along the line on the map, then double-click to finish.' },
  { id: 'field', Icon: Hexagon, name: 'Field', blurb: 'Drainage, cut / fill and rain in 3D', hint: 'Click the field corners on the map, then double-click the last one.' },
  { id: 'cutout', Icon: Scissors, name: 'Cut out', blurb: 'A box of the map in its own 3D tab, with its cameras and network hosts', hint: 'Click one corner of the box on the map, then the opposite corner.' },
];

/** Short names, so every rendering is one click away. */
const RELIEF_CHOICES: { id: ReliefMode | 'off'; label: string }[] = [
  { id: 'off', label: 'Off' }, { id: 'hillshade', label: 'Shaded' }, { id: 'tinted', label: 'Color + shade' }, { id: 'color', label: 'Color' },
  { id: 'slope', label: 'Slope' }, { id: 'contour2', label: '2 ft lines' }, { id: 'contour5', label: '5 ft lines' },
];

/** A farm field in Arkansas with good lidar: a known place to try the tools. */
const EXAMPLE = { lat: 35.862, lng: -90.163, zoom: 15 };

export default function LidarPanel({ mapBounds, onSatellite, onFlyTo }: {
  mapBounds?: { west: number; south: number; east: number; north: number } | null;
  onSatellite?: () => void;
  onFlyTo?: (lat: number, lng: number, zoom: number) => void;
}) {
  const s = useLidar();
  const [help, setHelp] = useState(false);

  useEffect(() => { setView(mapBounds ?? null); }, [mapBounds]);

  const toggleTool = (id: Tool) => {
    if (s.drawing === id) { cancelDraw(); return; }
    if (id !== 'profile') onSatellite?.();
    startDraw(id);
  };
  const tryExample = () => {
    onSatellite?.();
    onFlyTo?.(EXAMPLE.lat, EXAMPLE.lng, EXAMPLE.zoom);
    if (s.relief.opacity === 0) setRelief({ mode: 'hillshade', opacity: 0.75 });
  };
  const idle = !s.drawing && !s.profile && !s.field && !s.cutout;
  const tool = TOOLS.find(t => t.id === s.drawing);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Coverage under the map centre */}
      <div className="flex items-center gap-2 px-1">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.coverage?.covered ? 'bg-[var(--alert-green)]' : 'bg-white/25'}`} />
        <span className="truncate text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
          {s.coverage?.text ?? 'USGS 3DEP lidar · move the map to check coverage'}
        </span>
      </div>

      {/* What it does, one click each */}
      <div className="flex flex-col gap-1.5" role="group" aria-label="Terrain tools">
        {TOOLS.map(t => {
          const on = s.drawing === t.id;
          return (
            <button
              key={t.id}
              onClick={() => toggleTool(t.id)}
              aria-pressed={on}
              data-tool={t.id}
              className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${on ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15' : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'}`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${on ? 'border-[#D4AF37]/60 bg-[#D4AF37]/20 text-[#D4AF37]' : 'border-white/10 bg-black/40 text-white/75'}`}>
                <t.Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[11px] font-mono font-bold uppercase tracking-[0.18em] ${on ? 'text-[#D4AF37]' : 'text-white/90'}`}>{t.name}</span>
                <span className="block text-[10px] font-mono leading-snug text-white/45">{t.blurb}</span>
              </span>
              {on && <span className="shrink-0 text-[9px] font-mono uppercase tracking-widest text-white/50">Cancel</span>}
            </button>
          );
        })}
        {tool && <p className="px-1 text-[10px] font-mono leading-relaxed text-[#D4AF37]/90">{tool.hint}</p>}
        {idle && onFlyTo && (
          <button onClick={tryExample} className="flex items-center gap-1.5 self-start px-1 text-[10px] font-mono text-white/55 hover:text-[#D4AF37]">
            <MapPin className="h-3 w-3" />New here? Try it on an example field
          </button>
        )}
      </div>

      {s.cutout && <CutoutCard c={s.cutout} />}
      {s.profile && <ProfileCard p={s.profile} />}
      {s.field && <FieldCard f={s.field} drawing={s.drawing} />}

      <ReliefSection />

      <button onClick={() => setHelp(v => !v)} className="flex items-center gap-1 px-1 text-left">
        <Info className="h-3 w-3 text-white/40" />
        <span className={label}>Help &amp; data sources</span>
      </button>
      {help && (
        <div className="px-1 text-[10px] font-mono leading-relaxed text-[var(--text-muted)]">
          <p>Elevation: USGS 3D Elevation Program — 1 m lidar where flown, raw heights, no key. Cut-outs outside the US use the open Terrain Tiles on AWS (about 30 m).</p>
          <p className="mt-1">Imagery: Esri World Imagery (Maxar, Earthstar Geographics) — the SAT basemap.</p>
          <p className="mt-1">Flight dates and quality level: USGS 3DEP Elevation Index.</p>
          <p className="mt-1">Drainage floods the field from its edge (Priority-Flood) to find flow paths, outlets and standing water. Cut/fill grades each section to a plane, balancing cut to fill at the ratio set.</p>
          <p className="mt-1">A cut-out shows the CCTV cameras and the Network Intel C2 hosts inside its box. Hosts are placed by IP address, to about the city.</p>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Map relief ─────────────── */

function ReliefSection() {
  const s = useLidar();
  const [shadows, setShadows] = useState(false);
  const on = s.relief.opacity > 0;
  const current = on ? s.relief.mode : 'off';
  return (
    <div className={box}>
      <div className="flex items-center justify-between">
        <span className={label}><Mountain className="mr-1 inline h-2.5 w-2.5" />Lidar relief on the map</span>
        <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: on ? GOLD : 'rgba(255,255,255,0.35)' }}>
          {on ? `${Math.round(s.relief.opacity * 100)}%` : 'OFF'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Lidar rendering">
        {RELIEF_CHOICES.map(c => {
          const sel = current === c.id;
          return (
            <button
              key={c.id}
              role="radio"
              aria-checked={sel}
              data-mode={c.id}
              onClick={() => (c.id === 'off' ? setRelief({ opacity: 0 }) : setRelief({ mode: c.id, opacity: s.relief.opacity || 0.75 }))}
              className={`rounded-md border px-2 py-1 text-[9.5px] font-mono font-bold uppercase tracking-wider transition-colors ${sel ? 'border-[#D4AF37]/60 bg-[#D4AF37]/20 text-[#D4AF37]' : 'border-white/10 bg-black/30 text-white/60 hover:border-white/25 hover:text-white'}`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {on && (s.relief.mode === 'tinted' || s.relief.mode === 'color') && !s.relief.stretch && (
        s.relief.fitting === 'failed'
          ? <Failed text="USGS did not answer, so the colours could not be fitted to this view." onRetry={retryStretch} />
          : <Busy text="Fitting colours to this view…" />
      )}
      {on && (
        <>
          <div className="mt-2 flex items-center gap-2">
            <span className={label}>Opacity</span>
            <input
              type="range" min={5} max={100} value={Math.round(s.relief.opacity * 100)}
              onChange={e => setRelief({ opacity: +e.target.value / 100 })}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
              style={{ background: `linear-gradient(to right, ${GOLD} ${s.relief.opacity * 100}%, rgba(255,255,255,0.1) ${s.relief.opacity * 100}%)`, accentColor: GOLD }}
              aria-label="Lidar layer opacity"
            />
          </div>
          <button onClick={() => setShadows(v => !v)} className="mt-2 flex w-full items-center gap-1 text-left">
            {shadows ? <ChevronDown className="h-3 w-3 text-white/40" /> : <ChevronRight className="h-3 w-3 text-white/40" />}
            <span className={label}>Sun &amp; height</span>
          </button>
          {shadows && (
            <div className="mt-1.5 flex flex-col gap-1.5">
              <Slider name="Sun azimuth" value={s.relief.az} min={0} max={360} unit="°" onChange={az => setRelief({ az })} />
              <Slider name="Sun altitude" value={s.relief.alt} min={5} max={85} unit="°" onChange={alt => setRelief({ alt })} />
              <Slider name="Exaggeration" value={s.relief.ex} min={1} max={30} unit="×" onChange={ex => setRelief({ ex })} />
            </div>
          )}
        </>
      )}
      <CursorReadout />
    </div>
  );
}

/* ─────────────── Cut-out ─────────────── */

function CutoutCard({ c }: { c: CutoutState }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(new URL(c.path, window.location.origin).href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard refused */ }
  };
  return (
    <div className={box}>
      <div className="flex items-center justify-between">
        <span className={label}><Scissors className="mr-1 inline h-2.5 w-2.5" />Cut-out · {c.label}</span>
        <button onClick={clearCutout} className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white" title="Clear cut-out"><X className="h-3 w-3" /></button>
      </div>
      {c.error ? (
        <p className="mt-2 text-[10px] font-mono leading-relaxed text-red-400">{c.error}</p>
      ) : (
        <>
          <p className="mt-1.5 text-[10px] font-mono leading-relaxed text-white/60">
            {c.opened ? 'Opened in a new tab: the box in 3D with its cameras, network hosts and water.' : 'Your browser held the new tab back. Open it here:'}
          </p>
          <div className="mt-2 flex gap-1.5">
            <button onClick={() => reopenCutout()} className={`${goldBtn} flex-1 py-2`}><ExternalLink className="h-3 w-3" />{c.opened ? 'Open again' : 'Open in new tab'}</button>
            <button onClick={copy} className={quietBtn} title="Copy link">{copied ? <CheckIcon className="h-3 w-3 text-[var(--alert-green)]" /> : <Link2 className="h-3 w-3" />}</button>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[9px] font-mono uppercase tracking-wider text-white/40">Open with</span>
            {([['rain', 'Rain'], ['flow', 'Flow paths'], ['flood', 'Water level']] as const).map(([w, name]) => (
              <button key={w} onClick={() => reopenCutout(w)} data-cutout-water={w}
                className="flex-1 rounded border border-[#4FA3FF]/30 py-1 text-[9px] font-mono font-bold uppercase tracking-wider text-[#8CC4FF] hover:border-[#4FA3FF]/70 hover:bg-[#1554D6]/20">
                {name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Slider({ name, value, min, max, unit, onChange }: { name: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-20 text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)]">{name}</span>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(+e.target.value)} className="h-1 flex-1 cursor-pointer" style={{ accentColor: GOLD }} />
      <span className="w-9 text-right text-[10px] font-mono tabular-nums text-white/80">{Math.round(value)}{unit}</span>
    </label>
  );
}

function CursorReadout() {
  const c = useCursorElevation();
  if (!c) return null;
  return (
    <div className="mt-2 flex items-center gap-1.5 border-t border-white/[0.06] pt-2 text-[10px] font-mono tabular-nums text-white/80">
      <Crosshair className="h-3 w-3 text-[#D4AF37]" />
      <span className="font-bold text-white">{ft(c.m).toFixed(2)} ft</span>
      <span className="text-[var(--text-muted)]">({c.m.toFixed(2)} m)</span>
    </div>
  );
}

/* ─────────────── Profile ─────────────── */

function ProfileCard({ p }: { p: ProfileState }) {
  const W = 300, H = 120, PAD = 4;
  const pts = p.samples.filter(s => s.z !== null) as { distM: number; z: number }[];
  const geom = useMemo(() => {
    if (pts.length < 2) return null;
    const total = p.samples[p.samples.length - 1].distM || 1;
    let lo = Infinity, hi = -Infinity;
    for (const s of pts) { lo = Math.min(lo, s.z); hi = Math.max(hi, s.z); }
    const pad = Math.max(0.3, (hi - lo) * 0.1);
    const y0 = lo - pad, y1 = hi + pad;
    const X = (d: number) => PAD + (d / total) * (W - 2 * PAD);
    const Y = (z: number) => H - PAD - ((z - y0) / (y1 - y0)) * (H - 2 * PAD);
    const line = pts.map((s, k) => `${k ? 'L' : 'M'}${X(s.distM).toFixed(1)},${Y(s.z).toFixed(1)}`).join('');
    const area = `${line}L${X(pts[pts.length - 1].distM).toFixed(1)},${H}L${X(pts[0].distM).toFixed(1)},${H}Z`;
    let rise = 0, fall = 0;
    for (let k = 1; k < pts.length; k++) { const d = pts[k].z - pts[k - 1].z; if (d > 0) rise += d; else fall -= d; }
    return { total, lo, hi, line, area, X, Y, rise, fall, grade: ((pts[pts.length - 1].z - pts[0].z) / total) * 100 };
  }, [p.samples]); // eslint-disable-line react-hooks/exhaustive-deps
  const svgRef = useRef<SVGSVGElement>(null);
  const hover = p.hover !== null ? p.samples[p.hover] : null;
  const miles = (geom?.total ?? 0) / 1609.344;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!geom || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const d = ((e.clientX - rect.left) / rect.width * W - PAD) / (W - 2 * PAD) * geom.total;
    let best = 0;
    for (let k = 1; k < p.samples.length; k++) if (Math.abs(p.samples[k].distM - d) < Math.abs(p.samples[best].distM - d)) best = k;
    setProfileHover(best);
  };

  return (
    <div className={box}>
      <div className="flex items-center justify-between">
        <span className={label}><Spline className="mr-1 inline h-2.5 w-2.5" />Elevation profile</span>
        <button onClick={clearProfile} className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white" title="Clear profile"><X className="h-3 w-3" /></button>
      </div>
      {p.status === 'loading' && <Busy text="Sampling USGS elevation…" />}
      {p.status === 'error' && <Failed text={p.error ?? 'Profile failed'} onRetry={retryProfile} />}
      {p.status === 'ready' && geom && (
        <>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full cursor-crosshair rounded bg-black/40" onMouseMove={onMove} onMouseLeave={() => setProfileHover(null)}>
            <path d={geom.area} fill="rgba(0,229,255,0.12)" />
            <path d={geom.line} fill="none" stroke="#00E5FF" strokeWidth={1.4} />
            {hover && hover.z !== null && (
              <>
                <line x1={geom.X(hover.distM)} x2={geom.X(hover.distM)} y1={0} y2={H} stroke="rgba(255,255,255,0.35)" strokeWidth={0.8} />
                <circle cx={geom.X(hover.distM)} cy={geom.Y(hover.z)} r={3} fill="#00E5FF" stroke="#000" />
              </>
            )}
          </svg>
          <div className="mt-1 flex justify-between text-[9px] font-mono tabular-nums text-[var(--text-muted)]">
            <span>{hover ? `${fmt(ft(hover.distM))} ft` : '0'}</span>
            <span className="text-white/85">{hover && hover.z !== null ? `${ft(hover.z).toFixed(2)} ft` : ''}</span>
            <span>{miles >= 0.2 ? `${miles.toFixed(2)} mi` : `${fmt(ft(geom.total))} ft`}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <Stat k="Low" v={`${ft(geom.lo).toFixed(1)} ft`} />
            <Stat k="High" v={`${ft(geom.hi).toFixed(1)} ft`} />
            <Stat k="Relief" v={`${ft(geom.hi - geom.lo).toFixed(1)} ft`} />
            <Stat k="Climb" v={`${ft(geom.rise).toFixed(1)} ft`} />
            <Stat k="Drop" v={`${ft(geom.fall).toFixed(1)} ft`} />
            <Stat k="Grade" v={`${geom.grade.toFixed(2)}%`} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{k}</div>
      <div className="truncate text-[11px] font-mono font-bold tabular-nums" style={{ color: color ?? '#fff' }}>{v}</div>
    </div>
  );
}

function Busy({ text }: { text: string }) {
  return <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-[#D4AF37]"><Loader2 className="h-3 w-3 animate-spin" />{text}</div>;
}

function Failed({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="mt-2 flex items-start gap-2">
      <p className="flex-1 text-[10px] font-mono leading-relaxed text-red-400">{text}</p>
      {onRetry && (
        <button onClick={onRetry} className={`${btn} shrink-0 border-white/15 text-white/80 hover:border-[#D4AF37]/50 hover:text-[#D4AF37]`}>
          <RotateCw className="h-3 w-3" />Try again
        </button>
      )}
    </div>
  );
}

/* ─────────────── Field ─────────────── */

function FieldCard({ f, drawing }: { f: FieldState; drawing: string | null }) {
  return (
    <div className={box}>
      <div className="flex items-center justify-between">
        <span className={label}><Hexagon className="mr-1 inline h-2.5 w-2.5" />Field</span>
        <button onClick={clearField} className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white" title="Clear area"><X className="h-3 w-3" /></button>
      </div>

      {f.status === 'loading' && (
        <div className="mt-2">
          <Busy text={`Downloading lidar… ${f.progress[0]}/${f.progress[1]}`} />
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-[#D4AF37] transition-all" style={{ width: `${(f.progress[0] / Math.max(1, f.progress[1])) * 100}%` }} />
          </div>
        </div>
      )}
      {f.status === 'error' && <Failed text={f.error ?? 'Lidar download failed'} onRetry={/USGS/.test(f.error ?? '') ? retryField : undefined} />}

      {f.status === 'ready' && f.stats && (
        <>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[20px] font-mono font-bold tabular-nums text-white">{acres(f.stats.areaM2).toFixed(1)}</span>
            <span className="text-[11px] font-mono text-white/70">ac</span>
            <span className="ml-auto text-right text-[9px] font-mono tabular-nums leading-tight text-[var(--text-muted)]">
              {ft(f.stats.minZ).toFixed(1)} to {ft(f.stats.maxZ).toFixed(1)} ft<br />{ft(f.stats.maxZ - f.stats.minZ).toFixed(1)} ft relief
            </span>
          </div>
          <div className="mt-0.5 text-[9px] font-mono text-[var(--text-muted)]">
            {f.flight ? `${describeFlight(f.flight)} · ${f.grid!.ground.toFixed(2)} m cells` : `USGS 3DEP · ${f.grid!.ground.toFixed(2)} m cells`}
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-black/40 p-0.5">
            {(['elevation', 'drainage', 'cutfill'] as const).map(m => (
              <button
                key={m}
                onClick={() => setFieldMode(m)}
                className={`rounded-md py-1.5 text-[9px] font-mono font-bold uppercase tracking-widest transition-colors ${f.mode === m ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-white/55 hover:text-white'}`}
              >
                {m === 'elevation' ? 'Elevation' : m === 'drainage' ? 'Drainage' : 'Cut / Fill'}
              </button>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className={label}>{f.mode === 'cutfill' ? 'Cut/fill' : 'Elevation'}</span>
            <input type="range" min={0} max={100} value={Math.round(f.opacity * 100)} onChange={e => setFieldOpacity(+e.target.value / 100)} className="h-1 flex-1 cursor-pointer" style={{ accentColor: GOLD }} aria-label="Field layer opacity" />
            <span className="w-8 text-right text-[10px] font-mono tabular-nums text-white/80">{Math.round(f.opacity * 100)}%</span>
          </div>

          {f.busy && <Busy text={f.busy} />}
          {!f.busy && f.mode === 'elevation' && f.range && (
            <div className="mt-2">
              <div className="h-2 rounded-sm" style={{ background: gradient(ELEVATION_RAMP) }} />
              <div className="mt-0.5 flex justify-between text-[9px] font-mono tabular-nums text-[var(--text-muted)]">
                <span>{ft(f.range[0]).toFixed(1)} ft</span><span>{ft(f.range[1]).toFixed(1)} ft</span>
              </div>
            </div>
          )}
          {!f.busy && f.mode === 'drainage' && f.drainage && <DrainageView f={f} />}
          {!f.busy && f.mode === 'cutfill' && f.cutfill && <CutFillView f={f} drawing={drawing} />}
        </>
      )}
    </div>
  );
}

function DrainageView({ f }: { f: FieldState }) {
  const d = f.drainage!;
  return (
    <div className="mt-2.5 flex flex-col gap-2">
      <p className="text-[10px] font-mono leading-relaxed text-white/85">
        <span className="font-bold text-white">{d.outlets.length} outlet{d.outlets.length === 1 ? '' : 's'}</span>
        {' · '}water stands on <span className="font-bold text-[#5AC8FF]">{acres(d.pondAreaM2).toFixed(1)} ac</span>
        {' '}({fmt(yd3(d.pondVolumeM3))} yd³)
      </p>
      {d.outlets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {d.outlets.slice(0, 8).map((o, k) => (
            <span key={k} className="rounded-full border border-[#1554D6]/50 bg-[#1554D6]/15 px-2 py-0.5 text-[9px] font-mono tabular-nums text-[#9CC3FF]">
              {acres(o.areaM2).toFixed(1)} ac
            </span>
          ))}
          {d.edgeAreaM2 > 0 && <span className="px-1 text-[9px] font-mono text-[var(--text-muted)]">+{acres(d.edgeAreaM2).toFixed(1)} ac sheds over the edge</span>}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className={label}>Detail</span>
        <select value={f.detail} onChange={e => setDetail(e.target.value as Detail)} className={`${input} flex-1`} aria-label="Drainage detail">
          <option value="fine">Fine</option>
          <option value="normal">Normal</option>
          <option value="main">Main only</option>
        </select>
      </div>
      <button onClick={open3d} className={`${btn} border-[#1554D6]/60 bg-[#1554D6]/25 text-[#BFD7FF] hover:bg-[#1554D6]/40 py-2`}>
        <Droplets className="h-3.5 w-3.5" /> Rain in 3D
      </button>
    </div>
  );
}

type NumberFieldProps = { value: number; onCommit: (v: number) => void; step: number; suffix: string; aria: string };

/* Keyed by value, so an outside change (best fit, undo) starts a fresh edit. */
function NumberField(props: NumberFieldProps) {
  return <NumberInput key={props.value} {...props} />;
}

function NumberInput({ value, onCommit, step, suffix, aria }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const commit = () => { const v = parseFloat(text); if (Number.isFinite(v) && v !== value) onCommit(v); else setText(String(value)); };
  return (
    <div className="relative">
      <input
        type="number" step={step} value={text} aria-label={aria}
        onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()}
        className={`${input} pr-6`}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-white/40">{suffix}</span>
    </div>
  );
}

function CutFillView({ f, drawing }: { f: FieldState; drawing: string | null }) {
  const cf = f.cutfill!;
  const t = totals(cf);
  const [more, setMore] = useState(cf.splits.length > 0);
  const sel = cf.sections[cf.selected] ?? cf.sections[0];
  const multi = cf.sections.length > 1;
  return (
    <div className="mt-2.5 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5">
          <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-red-300/80">Cut</div>
          <div className="text-[15px] font-mono font-bold tabular-nums text-[#FF6B6B]">{fmt(t.cutYd3)}<span className="ml-1 text-[9px] text-red-300/70">yd³</span></div>
        </div>
        <div className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1.5">
          <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-blue-300/80">Fill</div>
          <div className="text-[15px] font-mono font-bold tabular-nums text-[#6FA8FF]">{fmt(t.fillYd3)}<span className="ml-1 text-[9px] text-blue-300/70">yd³</span></div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Stat k="Area" v={`${t.acres.toFixed(2)} ac`} />
        <Stat k="Cut / acre" v={`${fmt(t.cutPerAcre)} yd³`} />
        <Stat k="Cut : fill" v={t.ratio.toFixed(2)} />
        <Stat k="Max cut" v={`${t.maxCutFt.toFixed(2)} ft`} color="#FF8A8A" />
        <Stat k="Max fill" v={`${t.maxFillFt.toFixed(2)} ft`} color="#8AB8FF" />
        <Stat k="Sections" v={String(cf.sections.length)} />
      </div>

      {multi && (
        <div className="overflow-hidden rounded-md border border-white/10">
          <table className="w-full text-[9px] font-mono tabular-nums">
            <thead className="bg-white/[0.04] text-[var(--text-muted)]">
              <tr><th className="px-1.5 py-1 text-left font-normal"></th><th className="px-1 font-normal text-right">ac</th><th className="px-1 font-normal text-right">cut</th><th className="px-1 font-normal text-right">fill</th><th className="px-1 font-normal text-right">yd³/ac</th><th className="px-1.5 font-normal text-right">slope</th></tr>
            </thead>
            <tbody>
              {cf.sections.map((s, k) => {
                const ac = acres(s.section.areaM2);
                return (
                  <tr key={k} onClick={() => selectSection(k)} className={`cursor-pointer ${k === cf.selected ? 'bg-[#D4AF37]/15 text-[#F1D77A]' : 'text-white/80 hover:bg-white/[0.05]'}`}>
                    <td className="px-1.5 py-1 font-bold">S{k + 1}</td>
                    <td className="px-1 text-right">{ac.toFixed(1)}</td>
                    <td className="px-1 text-right">{fmt(yd3(s.result.cutM3))}</td>
                    <td className="px-1 text-right">{fmt(yd3(s.result.fillM3))}</td>
                    <td className="px-1 text-right">{ac ? fmt(yd3(s.result.cutM3) / ac) : 0}</td>
                    <td className="px-1.5 text-right">{s.design.slopePct.toFixed(2)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {multi && <span className={`${label} px-0.5`}>Editing S{cf.selected + 1}</span>}
      <div className="flex gap-1.5">
        <button onClick={() => bestFit(multi ? cf.selected : -1)} className={`${goldBtn} flex-1 py-2`}>Best fit{multi ? ` S${cf.selected + 1}` : ''}</button>
        {multi && <button onClick={() => bestFit(-1)} className={`${quietBtn} flex-1`}>Best fit all</button>}
        <button onClick={undoDesign} disabled={!cf.history.length} className={quietBtn} title="Undo design change"><Undo2 className="h-3 w-3" /></button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex flex-col gap-1">
          <span className={label}>Slope</span>
          <NumberField value={+sel.design.slopePct.toFixed(3)} step={0.01} suffix="%" aria="Design slope percent" onCommit={v => setDesign(cf.selected, v, sel.design.headingDeg)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Heading</span>
          <NumberField value={+sel.design.headingDeg.toFixed(1)} step={1} suffix="°" aria="Design heading degrees" onCommit={v => setDesign(cf.selected, sel.design.slopePct, v)} />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <span className={label}><Layers className="mr-1 inline h-2.5 w-2.5" />Contours</span>
        <select value={cf.intervalFt} onChange={e => setContours({ intervalFt: +e.target.value })} className={`${input} w-24`} aria-label="Contour interval">
          {CONTOUR_STEPS_FT.map(v => <option key={v} value={v}>{v.toFixed(2)} ft</option>)}
        </select>
      </div>
      <div className="flex gap-3 px-0.5">
        <Check on={cf.showExisting} onChange={v => setContours({ showExisting: v })} text="Existing" swatch="#101010" />
        <Check on={cf.showDesign} onChange={v => setContours({ showDesign: v })} text="Design" swatch="#FF9D2E" />
      </div>

      <button onClick={() => setMore(v => !v)} className="flex items-center gap-1 text-left">
        {more ? <ChevronDown className="h-3 w-3 text-white/40" /> : <ChevronRight className="h-3 w-3 text-white/40" />}
        <span className={label}>More options</span>
      </button>
      {more && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            <button onClick={() => (drawing === 'split' ? cancelDraw() : startDraw('split'))} className={`${drawing === 'split' ? goldBtn : quietBtn} flex-1`}>
              <Scissors className="h-3 w-3" /> Add split line
            </button>
            <button onClick={removeSplits} disabled={!cf.splits.length} className={`${quietBtn} flex-1`}>Remove splits</button>
          </div>
          <label className="flex items-center gap-2">
            <span className={`${label} flex-1`}>Cut : fill ratio</span>
            <div className="w-24"><NumberField value={cf.ratio} step={0.05} suffix="" aria="Cut to fill ratio" onCommit={setRatio} /></div>
          </label>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        <button onClick={openReport} className={goldBtn}><FileText className="h-3 w-3" />PDF</button>
        <button onClick={() => exportCsv('existing')} className={quietBtn}><Download className="h-3 w-3" />Existing</button>
        <button onClick={() => exportCsv('design')} className={quietBtn}><Download className="h-3 w-3" />Design</button>
      </div>
      <button onClick={open3d} className={`${quietBtn} py-2`}><Box className="h-3.5 w-3.5" /> Rain in 3D (existing or design)</button>
    </div>
  );
}

function Check({ on, onChange, text, swatch }: { on: boolean; onChange: (v: boolean) => void; text: string; swatch: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-mono text-white/80">
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} style={{ accentColor: GOLD }} />
      <span className="inline-block h-0.5 w-3" style={{ background: swatch, outline: '1px solid rgba(255,255,255,0.25)' }} />
      {text}
    </label>
  );
}
