'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus } from 'lucide-react';
import { MAP_DEFAULTS, MAP_VARS, type MapPaletteKey } from '@/lib/map-palette';
import { buildOverlays, type StyleSettings } from '@/lib/style-tokens';

/**
 * Style Studio — the examples.
 *
 * One specimen per control, drawn the way the app draws the real thing: the
 * same classes and the same custom properties, so a specimen cannot drift from
 * what its control changes. Fullscreen lays them all out as a board; the panel
 * docks the one for the control in hand under its header. The frame around
 * them is fixed, like the panel's own, so it stays readable whatever the theme
 * is set to.
 */

/** One per control row. The surface ramp follows `bg`, so it has no row. */
export type ControlKey =
  | Exclude<keyof StyleSettings, 'map' | 'bgPrimary' | 'bgSecondary' | 'bgTertiary'>
  | MapPaletteKey;

interface Specimen {
  k: ControlKey;
  label: string;
  /** Where on screen the real thing turns up. */
  where: string;
  body: React.ReactNode;
}

/** A patch of map for a specimen to sit on: ground, or sky over the horizon. */
function Patch({ sky, children }: { sky?: boolean; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 120 72" className="block w-full h-auto rounded" aria-hidden="true">
      <rect width="120" height="72" fill={sky ? '#04050a' : '#10151d'} />
      {sky
        ? <path d="M-20 80 Q60 40 140 80Z" fill="#10151d" />
        : <path d="M0 24h120M0 48h120M30 0v72M60 0v72M90 0v72" stroke="#fff" strokeOpacity=".05" />}
      {children}
    </svg>
  );
}

/* The aircraft icon, point for point as OsirisMap rasterises it at 24px. */
const PLANE = [[0, -0.4], [-0.12, 0.1], [-0.4, 0.2], [-0.4, 0.3], [-0.12, 0.15], [0, 0.35], [0.12, 0.15], [0.4, 0.3], [0.4, 0.2], [0.12, 0.1]]
  .map(([x, y]) => `${x * 24},${y * 24}`).join(' ');

const SATS: [MapPaletteKey, string][] = [
  ['satComms', 'Comms'], ['satMilitary', 'Military'], ['satNavigation', 'Navigation'],
  ['satEarth', 'Earth obs'], ['satScience', 'Science'], ['satOther', 'Other'],
];

const PLANES: [MapPaletteKey, string, number][] = [
  ['flightCivil', 'Civil', 40], ['flightPrivate', 'Private', -25], ['flightGov', 'Government', 80],
  ['flightMilitary', 'Military', -70], ['flightUnknown', 'Unknown', 15],
];

/* Solid, dashed and dotted, as src/lib/oi/arcs.ts tells the three tones apart. */
const ARCS: [MapPaletteKey, string, string, string | undefined][] = [
  ['oiSupport', 'Aligned', 'Solid arc: the two ends agree.', undefined],
  ['oiOppose', 'Opposed', 'Dashed arc: they dispute each other.', '6 4'],
  ['oiNeutral', 'Neutral', 'Dotted arc: linked evidence.', '0.1 5'],
];

/** The on-screen pad from MapControls, as a still at three-quarter size. */
function Pad({ on }: { on: boolean }) {
  const cell = 'w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-secondary)]';
  const icon = { className: 'w-3 h-3', strokeWidth: 1.5 };
  return (
    <div className={`flex items-center gap-[3px] p-[3px] rounded-xl border border-[var(--border-secondary)] bg-black/60 ${on ? '' : 'opacity-25'}`}>
      <div className="flex flex-col gap-[3px]">
        <span className={cell}><Plus {...icon} /></span>
        <span className={cell}><Minus {...icon} /></span>
      </div>
      <div className="h-9 w-px mx-1 bg-[var(--border-secondary)]" />
      <div className="grid grid-cols-3 grid-rows-3 gap-[3px]">
        <span className={`${cell} col-start-2 row-start-1`}><ChevronUp {...icon} /></span>
        <span className={`${cell} col-start-1 row-start-2`}><ChevronLeft {...icon} /></span>
        <span className={`${cell} col-start-3 row-start-2`}><ChevronRight {...icon} /></span>
        <span className={`${cell} col-start-2 row-start-3`}><ChevronDown {...icon} /></span>
      </div>
    </div>
  );
}

/** Something bright to sit behind a panel, so opacity and blur have work to do. */
function Busy({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full h-[76px] rounded flex items-center justify-center"
      style={{ background: 'repeating-linear-gradient(45deg, #2b6cff 0 8px, #ffb000 8px 16px, #12141c 16px 24px)' }}
    >
      {children}
    </div>
  );
}

/** A small screen carrying one of the full-screen overlays. */
function Screen({ image }: { image?: string }) {
  return (
    <div className="relative w-full h-[76px] rounded overflow-hidden" style={{ background: 'linear-gradient(135deg, #24406b, #101624 55%, #4a2f1a)' }}>
      {image
        ? <div className="absolute inset-0" style={{ backgroundImage: image }} />
        : <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono tracking-[0.2em] text-white/40">OFF</span>}
    </div>
  );
}

/**
 * A dot that crosses its track on a CSS transition, so the Speed knob's rule
 * retimes it exactly as it retimes the rest of the app.
 */
function Mover() {
  const [far, setFar] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setFar(f => !f), 1500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="w-full h-1 rounded-full bg-white/10">
      <div className={`w-3 h-3 -mt-1 rounded-full bg-[var(--gold-primary)] transition-[margin] duration-[600ms] ${far ? 'ml-[calc(100%-12px)]' : 'ml-0'}`} />
    </div>
  );
}

/** Every example, grouped and ordered as the panel lists its controls. */
function specimens(s: StyleSettings): { title: string; items: Specimen[] }[] {
  const fx = buildOverlays(s);
  const fill = (key: MapPaletteKey) => ({ fill: `var(${MAP_VARS[key]})` });
  const stroke = (key: MapPaletteKey) => ({ stroke: `var(${MAP_VARS[key]})` });

  return [
    {
      title: 'Accent',
      items: [
        {
          k: 'accent', label: 'Primary', where: 'Buttons, active states, outlines and readouts.',
          body: (
            <>
              <span className="btn-tactical">Engage</span>
              <span className="px-2 py-1 rounded text-[9px] font-mono tracking-wider border border-[var(--border-active)] bg-[var(--gold-primary)]/15 text-[var(--gold-light)]">ACTIVE</span>
            </>
          ),
        },
        {
          k: 'accent2', label: 'Secondary', where: 'Links, tabs and the second kind of button.',
          body: (
            <>
              <span className="btn-tactical btn-tactical--cyan">Scan</span>
              <span className="text-[10px] font-mono text-[var(--cyan-primary)] underline">OPEN SOURCE</span>
            </>
          ),
        },
        {
          k: 'glow', label: 'Glow', where: 'The halo around bright numbers and markers.',
          body: (
            <>
              <span className="stat-value-glow text-2xl">60,572</span>
              <span className="notification-pulse notification-pulse--gold" />
            </>
          ),
        },
      ],
    },
    {
      title: 'Signal',
      items: [
        {
          k: 'alertRed', label: 'Critical', where: 'Top-severity alerts, falling prices, errors.',
          body: (
            <>
              <span className="threat-badge-critical">Critical</span>
              <span className="text-[11px] font-mono text-[var(--alert-red)]">▼ 2.4%</span>
            </>
          ),
        },
        {
          k: 'alertOrange', label: 'Warning', where: 'High-severity alerts and cautions.',
          body: (
            <>
              <span className="threat-badge-high">High</span>
              <span className="px-2 py-1 rounded-md border border-[var(--alert-orange)]/40 bg-[var(--alert-orange)]/10 text-[10px] font-mono text-[var(--alert-orange)]">Feed delayed</span>
            </>
          ),
        },
        {
          k: 'alertGreen', label: 'Nominal', where: 'Live and healthy states, rising prices.',
          body: (
            <>
              <span className="threat-badge-nominal">Nominal</span>
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--alert-green)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--alert-green)] animate-osiris-pulse" />▲ 1.8%
              </span>
            </>
          ),
        },
        {
          k: 'alertBlue', label: 'Info', where: 'Held in reserve: nothing on screen draws with it yet.',
          body: <span className="w-7 h-7 rounded-full bg-[var(--alert-blue)]" />,
        },
      ],
    },
    {
      title: 'Map controls',
      items: [
        {
          k: 'mapControls', label: 'Pan/zoom pad',
          where: s.mapControls ? 'Bottom right of the map. Hold a button to keep moving.' : 'Hidden. Scroll and drag still move the map.',
          body: <Pad on={s.mapControls} />,
        },
      ],
    },
    {
      title: 'Map layers: cameras',
      items: [
        {
          k: 'cctv', label: 'Dots & labels', where: 'Each camera on the map, and its name once you zoom in.',
          body: (
            <Patch>
              <circle cx="60" cy="28" r="14" fill="#000" opacity=".35" style={{ filter: 'blur(3px)' }} />
              <circle cx="60" cy="28" r="8" fillOpacity=".9" stroke="#000" strokeOpacity=".9" strokeWidth="2.5" style={fill('cctv')} />
              <text x="60" y="54" textAnchor="middle" fontSize="9" fillOpacity=".8" stroke="#000" strokeWidth="3" style={{ ...fill('cctv'), paintOrder: 'stroke' }}>
                I-95 at Exit 12
              </text>
            </Patch>
          ),
        },
      ],
    },
    {
      title: 'Map layers: satellites',
      items: SATS.map(([key, label]) => ({
        k: key, label,
        where: s.map[key].toLowerCase() === MAP_DEFAULTS[key].toLowerCase()
          ? 'Default: each one keeps its own mission colour.'
          : 'Every satellite in this group takes this colour.',
        body: (
          <Patch sky>
            <path d="M-10 40 Q60 12 130 40" fill="none" stroke="#fff" strokeOpacity=".1" strokeDasharray="2 3" />
            <circle cx="60" cy="26" r="9" opacity=".3" style={{ ...fill(key), filter: 'blur(2px)' }} />
            <circle cx="60" cy="26" r="4" style={fill(key)} />
          </Patch>
        ),
      })),
    },
    {
      title: 'Map layers: aircraft',
      items: PLANES.map(([key, label, heading]) => ({
        k: key, label, where: `The plane icon for ${label.toLowerCase()} flights.`,
        body: (
          <Patch>
            <polygon points={PLANE} transform={`translate(60 36) rotate(${heading}) scale(1.5)`} style={fill(key)} />
          </Patch>
        ),
      })),
    },
    {
      title: 'Map layers: OI',
      items: ARCS.map(([key, label, where, dash]) => ({
        k: key, label, where,
        body: (
          <Patch sky>
            <path d="M24 63 Q60 -6 96 63" fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray={dash} style={stroke(key)} />
            <circle cx="24" cy="63" r="2.5" style={fill(key)} />
            <circle cx="96" cy="63" r="2.5" style={fill(key)} />
          </Patch>
        ),
      })),
    },
    {
      title: 'Surface',
      items: [
        {
          k: 'bg', label: 'Background', where: 'The page itself, and the three surface steps built from it.',
          body: (
            <div className="flex w-full h-[76px] rounded overflow-hidden border border-white/20">
              {['--bg-void', '--bg-primary', '--bg-secondary', '--bg-tertiary'].map(v => (
                <span key={v} className="flex-1" style={{ background: `var(${v})` }} />
              ))}
            </div>
          ),
        },
        {
          k: 'panelAlpha', label: 'Panel', where: 'How much of the map shows through a panel.',
          body: (
            <Busy>
              <span className="px-3 py-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-panel)] text-[10px] font-mono text-[var(--text-primary)]">PANEL</span>
            </Busy>
          ),
        },
        {
          k: 'borderAlpha', label: 'Border', where: 'Outlines of panels and buttons. Active ones are stronger.',
          body: (
            <>
              <span className="px-2 py-2 rounded-lg border border-[var(--border-primary)] text-[9px] font-mono text-white/40">REST</span>
              <span className="px-2 py-2 rounded-lg border border-[var(--border-active)] text-[9px] font-mono text-white/40">ACTIVE</span>
            </>
          ),
        },
        {
          k: 'blur', label: 'Blur',
          where: s.blur === null ? 'AUTO: each panel keeps its own blur.' : 'How far every panel smears what is behind it.',
          body: (
            <Busy>
              <span className="w-3/4 h-10 rounded-lg border border-white/15 bg-black/20 backdrop-blur-xl" />
            </Busy>
          ),
        },
        {
          k: 'radius', label: 'Radius', where: 'Corners of chips, buttons and panels.',
          body: (
            <>
              <span className="w-9 h-9 rounded border border-white/40" />
              <span className="w-9 h-9 rounded-lg border border-white/40" />
              <span className="w-9 h-9 rounded-2xl border border-white/40" />
            </>
          ),
        },
      ],
    },
    {
      title: 'Text',
      items: [
        {
          k: 'textPrimary', label: 'Primary', where: 'The main reading text.',
          body: <span className="text-[13px] text-[var(--text-primary)]">14 vessels in the strait</span>,
        },
        {
          k: 'textSecondary', label: 'Secondary', where: 'Supporting detail beside it.',
          body: <span className="text-[12px] text-[var(--text-secondary)]">Updated 2 minutes ago</span>,
        },
        {
          k: 'textMuted', label: 'Muted', where: 'Small labels, hints and placeholders.',
          body: <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Source · AIS</span>,
        },
        {
          k: 'textHeading', label: 'Heading', where: 'Titles and names.',
          body: <span className="text-[15px] font-semibold text-[var(--text-heading)]">Strait of Hormuz</span>,
        },
      ],
    },
    {
      title: 'Typography',
      items: [
        {
          k: 'fontUi', label: 'UI font', where: 'Sentences in panels and cards.',
          body: <span className="text-[13px] text-white/80" style={{ fontFamily: 'var(--font-body)' }}>Aa Bb Cc 0123</span>,
        },
        {
          k: 'fontMono', label: 'Mono font', where: 'Labels, readouts and coordinates.',
          body: <span className="text-[12px] font-mono text-white/80">ZULU 20:36:18Z</span>,
        },
        {
          k: 'tracking', label: 'Tracking',
          where: s.tracking === null ? 'AUTO: each label keeps its own spacing.' : 'The gap between letters on every mono label.',
          body: <span className="text-[11px] font-mono uppercase text-white/80">Live UI tokens</span>,
        },
      ],
    },
    {
      title: 'Motion & FX',
      items: [
        {
          k: 'motion', label: 'Speed', where: s.motion === 0 ? 'Off: changes snap into place.' : 'How long fades and slides take.',
          body: <Mover />,
        },
        { k: 'scanlines', label: 'Scanlines', where: 'Fine lines across the whole screen.', body: <Screen image={fx.scanlines} /> },
        { k: 'grain', label: 'Grain', where: 'Film noise across the whole screen.', body: <Screen image={fx.grain} /> },
        { k: 'vignette', label: 'Vignette', where: 'Darkened edges of the whole screen.', body: <Screen image={fx.vignette} /> },
      ],
    },
  ];
}

/** `group` is spelled out where the example stands alone, with no heading over it. */
function Caption({ it, group }: { it: Specimen; group?: string }) {
  return (
    <>
      {group && <div className="text-[8px] font-mono tracking-[0.2em] uppercase text-white/30 pb-0.5">{group}</div>}
      <div className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/60">{it.label}</div>
      <div className="text-[9px] font-mono leading-snug text-white/30 pt-0.5">{it.where}</div>
    </>
  );
}

const Focus = createContext<ControlKey | null>(null);

function Spot({ it }: { it: Specimen }) {
  const focus = useContext(Focus);
  const on = focus === it.k;
  return (
    <figure
      data-spot={it.k}
      className={`flex flex-col w-[calc(50%-4px)] sm:w-[168px] rounded-lg border p-2.5 scroll-my-4 transition-opacity ${
        on ? 'border-white/60 bg-white/[0.06]' : 'border-white/[0.07]'
      } ${focus && !on ? 'opacity-40' : ''}`}
    >
      <div className="flex-1 min-h-[76px] flex flex-wrap items-center justify-center gap-2">{it.body}</div>
      <figcaption className="pt-2"><Caption it={it} /></figcaption>
    </figure>
  );
}

/** The whole board, for fullscreen. `focus` is the control in hand. */
export default function StyleStudioStage({ s, focus, className = '' }: {
  s: StyleSettings; focus: ControlKey | null; className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  /* Bring the example for the control in hand into view. */
  useEffect(() => {
    if (focus) root.current?.querySelector(`[data-spot="${focus}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focus]);

  return (
    <Focus.Provider value={focus}>
      <div ref={root} className={`overflow-y-auto px-3 sm:px-5 py-4 ${className}`} aria-label="Examples of what each control changes">
        <div className="pb-4">
          <div className="text-[11px] font-mono tracking-[0.22em] uppercase text-white/60">Examples</div>
          <div className="text-[9px] font-mono tracking-[0.1em] uppercase text-white/25">Point at a control and the thing it changes lights up</div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-5">
          {specimens(s).map(group => (
            <section key={group.title} className="flex flex-col min-w-0">
              <h3 className="text-[9px] font-mono font-normal tracking-[0.25em] uppercase text-white/25 border-b border-white/[0.07] pb-1 mb-2">
                {group.title}
              </h3>
              <div className="flex flex-wrap gap-2">
                {group.items.map(it => <Spot key={it.k} it={it} />)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Focus.Provider>
  );
}

/**
 * The one example for the control in hand, docked in the panel.
 *
 * Its height is fixed. Were it to follow its contents, the list underneath
 * would slide beneath the pointer and summon a different example.
 */
export function StyleStudioExample({ s, k, className = '' }: {
  s: StyleSettings; k: ControlKey | null; className?: string;
}) {
  const group = k ? specimens(s).find(g => g.items.some(i => i.k === k)) : undefined;
  const it = group?.items.find(i => i.k === k);
  return (
    <div className={`h-[108px] px-3 flex items-center gap-3 bg-white/[0.03] ${className}`}>
      {it ? (
        <>
          <div key={it.k} data-spot={it.k} className="w-[146px] shrink-0 flex flex-wrap items-center justify-center gap-2">{it.body}</div>
          <div className="min-w-0"><Caption it={it} group={group?.title} /></div>
        </>
      ) : (
        <p className="w-full text-center text-[9px] font-mono tracking-[0.1em] uppercase leading-relaxed text-white/30">
          Point at a control to see<br />an example of what it changes
        </p>
      )}
    </div>
  );
}
