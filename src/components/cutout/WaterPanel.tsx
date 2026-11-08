'use client';

import { CloudRain, Spline, WavesArrowUp, Droplets, Play, Pause, RotateCcw } from 'lucide-react';
import type { RainStats } from '@/lib/lidar/rain';
import { RAIN_SPEEDS, type FlowSummary, type RainSettings, type RainSpeed, type WaterMode } from '@/lib/cutout-water';
import { formatArea, type FloodSummary, type FlowDetail } from '@/lib/cutout-hydro';
import { M_TO_FT } from '@/lib/lidar/usgs';

/**
 * The cut-out's water tools: a rain storm run over the ground, the paths
 * water takes downhill, and a water level raised over the block.
 */

const BLUE = '#4FA3FF';
const M_TO_IN = 39.3700787;

const MODES: { id: Exclude<WaterMode, 'off'>; name: string; icon: React.ReactNode; blurb: string }[] = [
  { id: 'rain', name: 'Rain', icon: <CloudRain className="h-4 w-4" />, blurb: 'Rain falls on the ground and runs downhill. Watch where it flows, where it pools, and how much runs off.' },
  { id: 'flow', name: 'Flow paths', icon: <Spline className="h-4 w-4" />, blurb: 'The paths rain takes downhill, wider where more ground drains into them. Blue patches are where water would stand.' },
  { id: 'flood', name: 'Water level', icon: <WavesArrowUp className="h-4 w-4" />, blurb: 'Raise or lower a flat water level across the whole block to see which ground goes under.' },
];

const STORMS: { name: string; rainInHr: number; stormMin: number }[] = [
  { name: 'Shower', rainInHr: 0.5, stormMin: 30 },
  { name: 'Downpour', rainInHr: 1.5, stormMin: 60 },
  { name: 'Cloudburst', rainInHr: 3, stormMin: 60 },
];

const DETAILS: { id: FlowDetail; name: string }[] = [
  { id: 'main', name: 'Main' }, { id: 'more', name: 'More' }, { id: 'all', name: 'All' },
];

export function clock(sec: number) {
  const m = Math.floor(sec / 60), h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}` : `${m}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

export function depthText(m: number) {
  const inches = m * M_TO_IN;
  return inches < 12 ? `${inches < 1 ? inches.toFixed(2) : inches.toFixed(1)} in` : `${(m * M_TO_FT).toFixed(1)} ft`;
}

export interface WaterPanelProps {
  ready: boolean;
  mode: WaterMode;
  onMode: (m: WaterMode) => void;
  rain: RainSettings;
  onRain: (s: RainSettings) => void;
  running: boolean;
  onPlay: (on: boolean) => void;
  onReset: () => void;
  stats: RainStats | null;
  detail: FlowDetail;
  onDetail: (d: FlowDetail) => void;
  flow: FlowSummary | null;
  levelFt: number;
  rangeFt: [number, number];
  onLevel: (ft: number) => void;
  flood: FloodSummary | null;
}

export default function WaterPanel(p: WaterPanelProps) {
  const current = MODES.find(m => m.id === p.mode);
  return (
    <section className="w-80 rounded-lg border border-white/10 bg-black/85 font-mono backdrop-blur" aria-label="Water">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <Droplets className="h-3.5 w-3.5" style={{ color: BLUE }} />
        <span className="text-[9px] uppercase tracking-[0.25em] text-white/55">Water</span>
      </div>
      <div className="grid grid-cols-3 gap-1 p-2" role="tablist" aria-label="Water">
        {MODES.map(m => {
          const on = p.mode === m.id;
          return (
            <button
              key={m.id} role="tab" aria-selected={on} data-water={m.id} disabled={!p.ready}
              onClick={() => p.onMode(on ? 'off' : m.id)}
              title={on ? `Hide ${m.name.toLowerCase()}` : m.blurb}
              className={`flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[9.5px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-40 ${on ? 'bg-[#1554D6]/25 text-white' : 'border-white/10 text-white/60 hover:border-white/25 hover:text-white'}`}
              style={on ? { borderColor: `${BLUE}aa` } : undefined}
            >
              <span style={{ color: on ? BLUE : undefined }}>{m.icon}</span>{m.name}
            </button>
          );
        })}
      </div>
      <p className="px-3 pb-2.5 text-[10px] leading-relaxed text-white/55">
        {current ? current.blurb : 'See how water moves over this ground: run a storm, trace the flow paths, or raise a water level.'}
      </p>
      {p.mode === 'rain' && <Rain {...p} />}
      {p.mode === 'flow' && <Flow {...p} />}
      {p.mode === 'flood' && <Flood {...p} />}
    </section>
  );
}

function Rain({ rain, onRain, running, onPlay, onReset, stats }: WaterPanelProps) {
  const storm = rain.stormMin * 60;
  const started = !!stats && stats.time > 0;
  const raining = !!stats && stats.time < storm;
  const totalIn = rain.rainInHr * rain.stormMin / 60;
  return (
    <div className="border-t border-white/10 px-3 pb-3 pt-2.5">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPlay(!running)} data-rain-play
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#1554D6] py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-[#1E66F0]"
        >
          {running ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />{started ? 'Resume' : 'Start rain'}</>}
        </button>
        <button onClick={onReset} disabled={!started} className="rounded-md border border-white/10 p-2 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30" title="Dry the ground and start again">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 text-[10px] tabular-nums text-white/70" aria-live="polite">
        {!started ? <span className="text-white/45">Ready · {totalIn.toFixed(2)} in over {clock(storm)}</span>
          : raining ? <><span style={{ color: BLUE }}>Raining {clock(stats!.time)}</span> of {clock(storm)} · <b className="text-white">{(stats!.fellM * M_TO_IN).toFixed(2)} in</b> fell</>
          : <><span className="text-[#D4AF37]">Running off · {clock(stats!.time)}</span> · storm over, <b className="text-white">{(stats!.fellM * M_TO_IN).toFixed(2)} in</b> fell</>}
      </div>
      {started && stats && (
        <dl className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
          <Stat name="Deepest" value={depthText(stats.deepestM)} hint="Usually a hollow, or a stream held back by a road bank" />
          <Stat name="Over 1 in deep" value={formatArea(stats.overInchM2)} />
          <Stat name="Ran off" value={`${(stats.ranOffM * M_TO_IN).toFixed(2)} in`} hint="Water that left the cut-out or reached the sea" />
          <Stat name="Still on ground" value={`${(stats.onFieldM * M_TO_IN).toFixed(2)} in`} />
        </dl>
      )}
      <div className="mt-2.5 grid grid-cols-3 gap-1">
        {STORMS.map(s => {
          const on = s.rainInHr === rain.rainInHr && s.stormMin === rain.stormMin;
          return (
            <button key={s.name} onClick={() => onRain({ ...rain, rainInHr: s.rainInHr, stormMin: s.stormMin })}
              className={`rounded border py-1 text-[9px] font-bold uppercase tracking-wider ${on ? 'border-[#4FA3FF]/70 bg-[#1554D6]/25 text-white' : 'border-white/10 text-white/55 hover:text-white'}`}>
              {s.name}
            </button>
          );
        })}
      </div>
      <Range name="Rain" value={rain.rainInHr} min={0.25} max={4} step={0.25} text={`${rain.rainInHr.toFixed(2)} in/hr`} onChange={v => onRain({ ...rain, rainInHr: v })} />
      <Range name="Storm" value={rain.stormMin} min={15} max={360} step={15} text={`${clock(storm)} · ${totalIn.toFixed(2)} in`} onChange={v => onRain({ ...rain, stormMin: v })} />
      <div className="mt-2.5 flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-wider text-white/45">Speed</span>
        <div className="grid flex-1 grid-cols-3 gap-1">
          {(Object.keys(RAIN_SPEEDS) as RainSpeed[]).map(sp => (
            <button key={sp} onClick={() => onRain({ ...rain, speed: sp })}
              className={`rounded py-1 text-[9px] font-bold uppercase tracking-wider ${rain.speed === sp ? 'bg-[#1554D6]/50 text-white' : 'text-white/50 hover:text-white'}`}>
              {sp}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-white/35">Space starts and pauses. No soak-in, and no culverts: a road across a stream holds water back like a dam. It shows where water goes and stands, not a flood forecast.</p>
    </div>
  );
}

function Flow({ detail, onDetail, flow }: WaterPanelProps) {
  return (
    <div className="border-t border-white/10 px-3 pb-3 pt-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-wider text-white/45">Show</span>
        <div className="grid flex-1 grid-cols-3 gap-1">
          {DETAILS.map(d => (
            <button key={d.id} onClick={() => onDetail(d.id)} data-flow-detail={d.id}
              className={`rounded border py-1 text-[9px] font-bold uppercase tracking-wider ${detail === d.id ? 'border-[#4FA3FF]/70 bg-[#1554D6]/25 text-white' : 'border-white/10 text-white/55 hover:text-white'}`}>
              {d.name}
            </button>
          ))}
        </div>
      </div>
      {flow && (
        <dl className="mt-2.5 grid grid-cols-2 gap-1.5 text-[10px]">
          <Stat name="Flow paths" value={flow.paths.toLocaleString('en-US')} />
          <Stat name="Biggest outflow drains" value={flow.biggestM2 ? formatArea(flow.biggestM2) : 'none'} hint="Ground draining to the busiest point where water leaves the cut-out" />
          {flow.pondKnown
            ? <Stat name="Standing water" value={flow.pondM2 ? formatArea(flow.pondM2) : 'none'} hint="Hollows that fill before water can run on" />
            : <Stat name="Standing water" value="Needs lidar" hint="30 m elevation cannot tell a real hollow from noise" />}
          <Stat name="Leaves at" value={`${flow.outlets} ${flow.outlets === 1 ? 'place' : 'places'}`} />
        </dl>
      )}
      <div className="mt-2.5 flex items-center gap-3 text-[9px] text-white/45">
        <span className="flex items-center gap-1.5"><span className="h-[3px] w-5 rounded" style={{ background: 'linear-gradient(to right, #96E1FF, #2D8CFF)' }} />Flow, wider as more drains in</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#46AAFF]/70" />Stands</span>
      </div>
    </div>
  );
}

function Flood({ levelFt, rangeFt, onLevel, flood }: WaterPanelProps) {
  const [lo, hi] = rangeFt;
  const step = hi - lo > 400 ? 5 : hi - lo > 60 ? 1 : 0.5;
  const pct = hi > lo ? ((levelFt - lo) / (hi - lo)) * 100 : 0;
  return (
    <div className="border-t border-white/10 px-3 pb-3 pt-2.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/55">Water at</span>
        <span className="flex items-center gap-1 tabular-nums text-white">
          <Nudge label="Lower 1 ft" onClick={() => onLevel(Math.max(lo, levelFt - 1))}>−</Nudge>
          <b>{levelFt.toLocaleString('en-US', { maximumFractionDigits: 1 })} ft</b>
          <Nudge label="Raise 1 ft" onClick={() => onLevel(Math.min(hi, levelFt + 1))}>+</Nudge>
          <span className="text-white/45">({(levelFt / M_TO_FT).toFixed(1)} m)</span>
        </span>
      </div>
      <div className="mt-0.5 text-right text-[9px] text-white/35">above sea level</div>
      <input
        type="range" min={lo} max={hi} step={step} value={levelFt} onChange={e => onLevel(+e.target.value)} aria-label="Water level"
        className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full"
        style={{ background: `linear-gradient(to right, ${BLUE} ${pct}%, rgba(255,255,255,0.15) ${pct}%)`, accentColor: BLUE }}
      />
      <div className="mt-1 flex justify-between text-[9px] tabular-nums text-white/35">
        <span>{Math.round(lo).toLocaleString('en-US')} ft</span><span>{Math.round(hi).toLocaleString('en-US')} ft</span>
      </div>
      {flood && (
        <dl className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
          <Stat name="Under water" value={flood.areaM2 ? formatArea(flood.areaM2) : 'none'} />
          <Stat name="Of the land" value={`${Math.round(flood.share * 100)}%`} />
          <Stat name="Deepest" value={flood.deepestM ? depthText(flood.deepestM) : '—'} />
        </dl>
      )}
      <p className="mt-2 text-[9px] leading-relaxed text-white/35">A flat level over the whole block: low ground behind higher ground shows as under water too.</p>
    </div>
  );
}

function Nudge({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className="flex h-5 w-5 items-center justify-center rounded border border-white/15 text-[12px] leading-none text-white/70 hover:border-[#4FA3FF]/70 hover:text-white">
      {children}
    </button>
  );
}

function Stat({ name, value, hint }: { name: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1.5" title={hint}>
      <dt className="text-[8.5px] uppercase tracking-wider text-white/40">{name}</dt>
      <dd className="mt-0.5 font-bold tabular-nums text-white">{value}</dd>
    </div>
  );
}

function Range({ name, value, min, max, step, text, onChange }: { name: string; value: number; min: number; max: number; step: number; text: string; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="mt-2.5 block">
      <div className="flex justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/55">{name}</span>
        <span className="tabular-nums text-white/85">{text}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}
        className="mt-1.5 h-1 w-full cursor-pointer appearance-none rounded-full"
        style={{ background: `linear-gradient(to right, ${BLUE} ${pct}%, rgba(255,255,255,0.15) ${pct}%)`, accentColor: BLUE }} />
    </label>
  );
}
