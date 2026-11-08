'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, Network, Loader2, RotateCcw, Link2, Check, Eye, EyeOff, X, ExternalLink, Mountain, AlertTriangle } from 'lucide-react';
import CameraViewer from '@/components/CameraViewer';
import { cutoutPath, describeBox, type CutoutWater, type LngLatBox } from '@/lib/cutout';
import { loadCutoutTerrain, type CutoutTerrain } from '@/lib/cutout-terrain';
import { autoStretch, createCutoutScene, type CutoutScene, type Hover, type Pin } from '@/lib/cutout-scene';
import { loadCutoutCameras, loadCutoutHosts, type CutoutCamera, type NetHost } from '@/lib/cutout-data';
import type { FlowSummary, RainSettings, WaterMode } from '@/lib/cutout-water';
import type { FloodSummary, FlowDetail } from '@/lib/cutout-hydro';
import type { RainStats } from '@/lib/lidar/rain';
import { M_TO_FT } from '@/lib/lidar/usgs';
import WaterPanel, { depthText } from './WaterPanel';

/**
 * A cut-out on its own page: the box in 3D, and a list of the cameras and
 * network hosts inside it. A camera opens its live feed in the same viewer
 * the map uses; a host shows what the feeds say about it.
 */

const GOLD = '#D4AF37';
const MAX_PINS = 600;

type Load<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; error: string };

const coord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;

export default function CutoutView({ box, problem, initialWater = null }: { box: LngLatBox | null; problem: string | null; initialWater?: CutoutWater | null }) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CutoutScene | null>(null);
  const [terrain, setTerrain] = useState<Load<CutoutTerrain>>({ status: 'loading' });
  const [cameras, setCameras] = useState<Load<CutoutCamera[]>>({ status: 'loading' });
  const [hosts, setHosts] = useState<Load<NetHost[]>>({ status: 'loading' });
  const [imagery, setImagery] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [stretch, setStretch] = useState(1);
  const [show, setShow] = useState({ cctv: true, net: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  /** Bumped when the 3D scene is up, so pins and settings are pushed into it. */
  const [sceneReady, setSceneReady] = useState(0);
  const [listTab, setListTab] = useState<'cctv' | 'net'>('cctv');
  const [water, setWater] = useState<WaterMode>(initialWater ?? 'off');
  const [rain, setRain] = useState<RainSettings>({ rainInHr: 1.5, stormMin: 60, speed: 'normal' });
  const [running, setRunning] = useState(false);
  const [rainStats, setRainStats] = useState<RainStats | null>(null);
  const [detail, setDetail] = useState<FlowDetail>('more');
  const [flow, setFlow] = useState<FlowSummary | null>(null);
  const [rangeFt, setRangeFt] = useState<[number, number]>([0, 100]);
  const [levelFt, setLevelFt] = useState(0);
  const [flood, setFlood] = useState<FloodSummary | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  // Heights, cameras and hosts all load at once; the block goes up when the heights land.
  useEffect(() => {
    if (!box || problem) return;
    const ctl = new AbortController();
    loadCutoutTerrain(box, ctl.signal).then(
      t => { setTerrain({ status: 'ready', value: t }); setStretch(autoStretch(t)); },
      e => { if (!ctl.signal.aborted) setTerrain({ status: 'error', error: e instanceof Error ? e.message : 'Elevation did not load' }); },
    );
    loadCutoutCameras(box, ctl.signal).then(
      v => setCameras({ status: 'ready', value: v }),
      () => { if (!ctl.signal.aborted) setCameras({ status: 'error', error: 'Cameras did not load' }); },
    );
    loadCutoutHosts(box, ctl.signal, v => setHosts({ status: 'ready', value: v })).then(
      v => setHosts({ status: 'ready', value: v }),
      () => { if (!ctl.signal.aborted) setHosts({ status: 'error', error: 'Network feeds did not load' }); },
    );
    return () => ctl.abort();
  }, [box, problem]);

  const t = terrain.status === 'ready' ? terrain.value : null;
  const stretchRef = useRef(stretch);
  useEffect(() => { stretchRef.current = stretch; }, [stretch]);

  // Build the block once the heights are in.
  useEffect(() => {
    if (!t || !host.current) return;
    let disposed = false;
    const el = host.current;
    createCutoutScene(el, t, {
      stretch: stretchRef.current,
      onPick: id => { setSelected(id); setListTab(id.startsWith('cam-') ? 'cctv' : 'net'); },
      onImagery: ok => setImagery(ok ? 'ready' : 'failed'),
      onRain: (st, on) => { setRainStats(st); setRunning(on); },
      onHover: setHover,
    }).then(s => {
      if (disposed) { s.dispose(); return; }
      sceneRef.current = s;
      // The water level runs from the lowest land to the highest, starting a little above the lowest.
      const [lo, hi] = s.water.landRange();
      const loFt = Math.floor(lo * M_TO_FT), hiFt = Math.max(loFt + 1, Math.ceil(hi * M_TO_FT));
      setRangeFt([loFt, hiFt]);
      setLevelFt(Math.round(loFt + Math.min(20, Math.max(3, (hiFt - loFt) * 0.05))));
      setSceneReady(v => v + 1);
    }, e => setSceneError(e instanceof Error ? e.message : '3D view did not start'));
    return () => { disposed = true; sceneRef.current?.dispose(); sceneRef.current = null; };
  }, [t]);

  useEffect(() => { sceneRef.current?.setStretch(stretch); }, [stretch, sceneReady]);

  // Water: the mode and its settings are pushed into the scene as they change.
  useEffect(() => { sceneRef.current?.water.setMode(water); }, [water, sceneReady]);
  useEffect(() => { sceneRef.current?.water.setRain(rain); }, [rain, sceneReady]);
  useEffect(() => {
    if (water === 'flow' && sceneRef.current) setFlow(sceneRef.current.water.flow(detail));
  }, [water, detail, sceneReady]);
  useEffect(() => {
    if (water === 'flood' && sceneRef.current) setFlood(sceneRef.current.water.flood(levelFt / M_TO_FT));
  }, [water, levelFt, sceneReady]);
  // A link that asks for rain opens with the storm already running.
  const autoRain = useRef(initialWater === 'rain');
  useEffect(() => {
    if (sceneReady && autoRain.current) { autoRain.current = false; sceneRef.current?.water.play(true); }
  }, [sceneReady]);
  // The address carries the water mode, so a copied link opens the same view.
  useEffect(() => {
    if (box && !problem) window.history.replaceState(window.history.state, '', cutoutPath(box, water === 'off' ? null : water));
  }, [box, problem, water]);

  const camList = useMemo(() => (cameras.status === 'ready' ? cameras.value : []), [cameras]);
  const hostList = useMemo(() => (hosts.status === 'ready' ? hosts.value : []), [hosts]);
  const camById = useMemo(() => new Map(camList.map(c => [`cam-${c.id}`, c])), [camList]);
  const hostById = useMemo(() => new Map(hostList.map(h => [h.id, h])), [hostList]);

  useEffect(() => {
    const pins: Pin[] = [];
    if (show.cctv) for (const c of camList.slice(0, MAX_PINS)) pins.push({ id: `cam-${c.id}`, kind: 'cctv', lng: c.lng, lat: c.lat, label: String(c.name ?? 'Camera'), live: !!c.stream_url });
    if (show.net) for (const h of hostList) pins.push({ id: h.id, kind: 'net', lng: h.lng, lat: h.lat, label: `${h.ip} · ${h.family}` });
    sceneRef.current?.setPins(pins);
  }, [camList, hostList, show, sceneReady]);

  useEffect(() => { sceneRef.current?.setSelected(selected); }, [selected, sceneReady]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
      // Space runs and pauses the storm, unless a control has the keyboard.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === ' ' && water === 'rain' && tag !== 'INPUT' && tag !== 'BUTTON' && tag !== 'TEXTAREA') {
        e.preventDefault();
        sceneRef.current?.water.play(!running);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [water, running]);

  const pick = (id: string) => { setSelected(id); sceneRef.current?.focus(id); };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard refused */ }
  };

  if (!box || problem) {
    return (
      <Shell>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <AlertTriangle className="h-6 w-6 text-[#D4AF37]" />
          <p className="max-w-md text-[12px] font-mono leading-relaxed text-white/80">{problem}</p>
          <Link href="/" className="rounded-md border border-[#D4AF37]/50 px-4 py-2 text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-[#D4AF37] hover:bg-[#D4AF37]/10">Open the map</Link>
        </div>
      </Shell>
    );
  }

  const center: [number, number] = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  const selCam = selected ? camById.get(selected) ?? null : null;
  const selHost = selected ? hostById.get(selected) ?? null : null;
  const busy = terrain.status === 'loading' || (!!t && sceneReady === 0 && !sceneError);

  return (
    <Shell>
      <div ref={host} className="absolute inset-0" />

      {/* Top left: where this came from */}
      <div className="absolute left-4 top-4 flex items-center gap-3">
        <Link href="/" className="rounded-md border border-white/15 bg-black/80 px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-[0.3em] text-[#D4AF37] backdrop-blur hover:border-[#D4AF37]/60">OSIRIS</Link>
        <button onClick={copyLink} className="flex items-center gap-1.5 rounded-md border border-white/15 bg-black/80 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-white/75 backdrop-blur hover:border-[#D4AF37]/50 hover:text-[#D4AF37]" title="Copy this cut-out's link">
          {copied ? <Check className="h-3.5 w-3.5 text-[var(--alert-green,#00E676)]" /> : <Link2 className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      {/* Title */}
      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 text-center">
        <div className="text-[11px] font-mono font-bold uppercase tracking-[0.4em] text-[#D4AF37]">Cut-out · {describeBox(box)}</div>
        <div className="mt-1 text-[10px] font-mono tabular-nums text-white/50">
          {coord(center[1], 'N', 'S')}, {coord(center[0], 'E', 'W')}
          {t && <> · {Math.round(t.minZ * M_TO_FT).toLocaleString()}–{Math.round(t.maxZ * M_TO_FT).toLocaleString()} ft · {stretch}× height</>}
        </div>
      </div>

      {/* Right: what stands inside */}
      <aside className="absolute right-4 top-4 flex max-h-[calc(100vh-7rem)] w-72 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/85 backdrop-blur">
        <div className="px-3 pt-2 text-[9px] font-mono uppercase tracking-[0.25em] text-white/45">In this cut-out</div>
        <div className="grid grid-cols-2 gap-1 p-2" role="tablist" aria-label="In this cut-out">
          <Tab on={listTab === 'cctv'} onClick={() => setListTab('cctv')} icon={<Camera className="h-3.5 w-3.5" />} name="CCTV" color="#00E676" load={cameras} count={camList.length} />
          <Tab on={listTab === 'net'} onClick={() => setListTab('net')} icon={<Network className="h-3.5 w-3.5" />} name="Network" color="#FF3B6B" load={hosts} count={hostList.length} />
        </div>
        <div className="styled-scrollbar flex-1 overflow-y-auto border-t border-white/10">
          {listTab === 'cctv' ? (
          <Group
            title="CCTV" load={cameras} count={camList.length}
            shown={show.cctv} onToggle={() => setShow(s => ({ ...s, cctv: !s.cctv }))} empty="No cameras in this box."
          >
            {camList.slice(0, MAX_PINS).map(c => (
              <Row key={String(c.id)} active={selected === `cam-${c.id}`} onClick={() => pick(`cam-${c.id}`)}
                title={String(c.name ?? 'Camera')} detail={String(c.source ?? '')} live={!!c.stream_url} />
            ))}
            {camList.length > MAX_PINS && <p className="px-3 py-1.5 text-[9px] font-mono text-white/40">Showing the first {MAX_PINS} of {camList.length.toLocaleString()}.</p>}
          </Group>
          ) : (
          <Group
            title="network" load={hosts} count={hostList.length}
            shown={show.net} onToggle={() => setShow(s => ({ ...s, net: !s.net }))} empty="No known C2 hosts placed in this box."
          >
            {hostList.map(h => (
              <Row key={h.id} active={selected === h.id} onClick={() => pick(h.id)} title={`${h.ip}${h.port ? `:${h.port}` : ''}`} detail={`${h.role} · ${h.family}${h.place ? ` · ${h.place}` : ''}`} />
            ))}
          </Group>
          )}
        </div>
        <p className="border-t border-white/10 px-3 py-2 text-[9px] font-mono leading-relaxed text-white/35">
          Network hosts are placed by IP address, which is right to about the city, not the building.
        </p>
      </aside>

      {/* Bottom left: water, then the view controls */}
      <div className="styled-scrollbar absolute bottom-4 left-4 flex max-h-[calc(100vh-6rem)] flex-col items-start gap-2 overflow-y-auto">
      {t && (
        <WaterPanel
          ready={sceneReady > 0} mode={water} onMode={setWater}
          rain={rain} onRain={setRain} running={running}
          onPlay={on => sceneRef.current?.water.play(on)} onReset={() => sceneRef.current?.water.resetRain()} stats={rainStats}
          detail={detail} onDetail={setDetail} flow={flow}
          levelFt={levelFt} rangeFt={rangeFt} onLevel={setLevelFt} flood={flood}
        />
      )}
      <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/85 px-3 py-2 backdrop-blur">
        <Mountain className="h-4 w-4 text-[#D4AF37]" />
        <label className="flex items-center gap-2">
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/50">Height</span>
          <input
            type="range" min={1} max={50} value={stretch} onChange={e => setStretch(+e.target.value)}
            className="h-1 w-32 cursor-pointer appearance-none rounded-full"
            style={{ background: `linear-gradient(to right, ${GOLD} ${((stretch - 1) / 49) * 100}%, rgba(255,255,255,0.15) ${((stretch - 1) / 49) * 100}%)`, accentColor: GOLD }}
            aria-label="Height stretch"
          />
          <span className="w-8 text-right text-[10px] font-mono tabular-nums text-white/80">{stretch}×</span>
        </label>
        <button onClick={() => sceneRef.current?.resetView()} className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white" title="Reset view"><RotateCcw className="h-4 w-4" /></button>
      </div>
      </div>

      {/* Bottom centre: the ground under the pointer, or how to move around */}
      {sceneReady > 0 && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/80 px-3.5 py-1.5 text-[10px] font-mono tabular-nums text-white/75 backdrop-blur">
          {hover ? (
            <>
              <b className="text-white">{Math.round(hover.z * M_TO_FT).toLocaleString('en-US')} ft</b>
              <span className="text-white/45"> ({Math.round(hover.z).toLocaleString('en-US')} m)</span>
              {hover.water !== null && hover.water > 0.0005 && (
                <> · <span style={{ color: '#4FA3FF' }}>{water === 'flood' ? 'under ' : water === 'flow' ? 'stands ' : 'water '}{depthText(hover.water)}</span></>
              )}
              <span className="text-white/45"> · {coord(hover.lat, 'N', 'S')}, {coord(hover.lng, 'E', 'W')}</span>
            </>
          ) : (
            <span className="text-white/45">Drag to turn · right-drag to move · scroll to zoom</span>
          )}
        </div>
      )}

      {selHost && <HostCard h={selHost} onClose={() => setSelected(null)} />}

      <CameraViewer camera={selCam} onClose={() => setSelected(null)} onLocate={() => selected && sceneRef.current?.focus(selected)} />

      {busy && !sceneError && terrain.status !== 'error' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[11px] font-mono text-[#D4AF37]">
          <Loader2 className="h-4 w-4 animate-spin" />Cutting the area out of the map…
        </div>
      )}
      {(terrain.status === 'error' || sceneError) && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[11px] font-mono text-red-400">
          {terrain.status === 'error' ? `Elevation did not load: ${terrain.error}. Reload to try again.` : sceneError}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-4 right-4 text-right text-[9px] font-mono leading-relaxed text-white/35">
        {imagery === 'failed' && <div className="text-red-400/80">Satellite imagery did not load</div>}
        <div>Imagery © Esri, Maxar, Earthstar Geographics</div>
        <div>Elevation: {t ? t.note : '…'}</div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="fixed inset-0 overflow-hidden bg-black text-white" aria-label="Map cut-out">{children}</main>;
}

function Tab({ on, onClick, icon, name, color, load, count }: {
  on: boolean; onClick: () => void; icon: React.ReactNode; name: string; color: string; load: Load<unknown>; count: number;
}) {
  return (
    <button
      role="tab" aria-selected={on} onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-md border py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.18em] transition-colors ${on ? 'bg-white/[0.07] text-white' : 'border-transparent text-white/50 hover:text-white'}`}
      style={on ? { borderColor: `${color}66` } : undefined}
    >
      <span style={{ color }}>{icon}</span>{name}
      <span className="tabular-nums" style={{ color }}>
        {load.status === 'ready' ? count.toLocaleString() : load.status === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : '!'}
      </span>
    </button>
  );
}

function Group({ title, load, count, shown, onToggle, empty, children }: {
  title: string; load: Load<unknown>; count: number; shown: boolean; onToggle: () => void; empty: string; children: React.ReactNode;
}) {
  return (
    <section className="py-1">
      {load.status === 'ready' && count > 0 && (
        <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[9px] font-mono uppercase tracking-[0.18em] text-white/45 hover:text-white" aria-pressed={shown}>
          {shown ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {shown ? `Showing ${title} pins on the block` : `${title} pins hidden`}
        </button>
      )}
      {load.status === 'loading' && <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono text-white/45"><Loader2 className="h-3 w-3 animate-spin" />Looking…</div>}
      {load.status === 'error' && <p className="px-3 py-1.5 text-[10px] font-mono text-red-400/90">{load.error}</p>}
      {load.status === 'ready' && count === 0 && <p className="px-3 py-1.5 text-[10px] font-mono text-white/40">{empty}</p>}
      {load.status === 'ready' && count > 0 && <div className="flex flex-col">{children}</div>}
    </section>
  );
}

function Row({ title, detail, live, active, onClick }: { title: string; detail: string; live?: boolean; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${active ? 'bg-[#D4AF37]/15' : 'hover:bg-white/[0.05]'}`}>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[10.5px] font-mono ${active ? 'text-[#F1D77A]' : 'text-white/85'}`}>{title}</span>
        {detail && <span className="block truncate text-[9px] font-mono text-white/40">{detail}</span>}
      </span>
      {live && <span className="shrink-0 rounded-sm bg-red-500/15 px-1 text-[8px] font-mono font-bold tracking-widest text-red-400">LIVE</span>}
    </button>
  );
}

function HostCard({ h, onClose }: { h: NetHost; onClose: () => void }) {
  const rows: [string, string][] = [
    ['Role', h.role], ['Malware', h.family], ...(h.status ? [['Status', h.status] as [string, string]] : []),
    ['Network', h.asName || 'unknown'], ['Located', h.place ? `${h.place} (by IP)` : 'by IP'],
    ['Seen', [h.firstSeen, h.lastSeen].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' → ') || 'not dated'],
    ['Source', h.source],
  ];
  return (
    <div className="absolute bottom-16 right-4 w-80 rounded-lg border border-[#FF3B6B]/40 bg-black/90 p-3 font-mono backdrop-blur">
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4 text-[#FF3B6B]" />
        <span className="text-[13px] font-bold tabular-nums text-white">{h.ip}{h.port ? `:${h.port}` : ''}</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-white/50 hover:bg-white/10 hover:text-white" title="Close"><X className="h-3.5 w-3.5" /></button>
      </div>
      <dl className="mt-2 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[10px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="uppercase tracking-wider text-white/40">{k}</dt>
            <dd className="break-words text-white/85">{v}</dd>
          </div>
        ))}
      </dl>
      {h.reference && /^https:\/\//.test(h.reference) && (
        <a href={h.reference} target="_blank" rel="noopener noreferrer" className="mt-2.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#D4AF37] hover:underline">
          Listing <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
