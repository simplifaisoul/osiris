'use client';
/**
 * OSIRIS OI: the price, world by world.
 *
 * On a question about a price, the cone the market's own moves allow (the
 * band 80% of the resampled paths stay inside, and their middle), from today
 * to the horizon, with the level the question is about; and inside it, each
 * simulated world's course for the price as the actors and the market played
 * it, period by period, filling in while the run goes. A world that reached
 * the level is marked where it did.
 */
import { useEffect, useRef, useState } from 'react';
import { priceText } from '@/lib/oi/quant';
import type { RunState } from '@/lib/oi/state';
import { LABEL, T } from './theme';

/** Each world's colour, down one gold scale: the first (the likeliest course) in bright gold, then champagne, ivory and greys. */
export const WORLD_COLORS = ['var(--gold-light)', 'var(--oi-alt)', '#E8E6E0', '#8C877C', 'var(--gold-dim)'];

const DAY = 86_400_000;

export function PriceFan({ s, height = 156 }: { s: RunState; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const q = s.quant;
  if (!q?.fan?.length || !s.periods.length) return null;
  const level = s.frame?.measure?.threshold;
  const today = s.periods[0].start;
  const t0 = Date.parse(today), t1 = Date.parse(q.fan[q.fan.length - 1].date);
  const band = [{ date: today, p10: q.price, p50: q.price, p90: q.price }, ...q.fan];
  const worlds = s.worlds.map((world, i) => ({
    world,
    color: WORLD_COLORS[i % WORLD_COLORS.length],
    path: [{ date: today, v: q.price, hit: false }, ...s.points.filter(p => p.world === world && p.price)
      .map(p => ({ date: s.periods.find(x => x.index === p.period)?.end ?? today, v: p.price!.close, hit: p.resolved === 'yes' && level !== undefined }))],
    ranges: s.points.filter(p => p.world === world && p.price).map(p => p.price!),
  }));
  // A world settled early repeats its last point: drawn once.
  for (const x of worlds) x.path = x.path.filter((p, i, a) => i === 0 || p.date !== a[i - 1].date);
  const values = [...band.flatMap(b => [b.p10, b.p90]), ...worlds.flatMap(x => x.ranges.flatMap(h => [h.low, h.high])), ...(level !== undefined ? [level] : [])];
  const lo0 = Math.min(...values), hi0 = Math.max(...values);
  const pad = (hi0 - lo0) * 0.08 || hi0 * 0.05 || 1;
  const lo = lo0 - pad, hi = hi0 + pad;
  const L = 6, R = 64, Tp = 10, B = 22;
  const x = (d: string) => L + ((Date.parse(d) - t0) / Math.max(DAY, t1 - t0)) * Math.max(1, w - L - R);
  const y = (v: number) => Tp + (1 - (v - lo) / (hi - lo)) * (height - Tp - B);
  const line = (pts: { date: string; v: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const money = (v: number) => priceText(v, q.currency);
  const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <div>
      <div ref={box} className="relative w-full" style={{ height }}>
        {w > 0 && (
          <svg width={w} height={height} className="absolute inset-0 overflow-visible" role="img" aria-label={`${q.symbol}: the market's cone of paths to ${q.fan[q.fan.length - 1].date}, and each simulated world's course`}>
            {s.periods.map(p => <line key={p.index} x1={x(p.end)} x2={x(p.end)} y1={Tp} y2={height - B} style={{ stroke: 'var(--border-secondary)' }} strokeDasharray="2 4" />)}
            <path d={`${line(band.map(b => ({ date: b.date, v: b.p90 })))} ${band.slice().reverse().map(b => `L${x(b.date).toFixed(1)},${y(b.p10).toFixed(1)}`).join(' ')} Z`}
              style={{ fill: 'rgba(232,230,224,0.06)', stroke: 'none' }} />
            <path d={line(band.map(b => ({ date: b.date, v: b.p50 })))} fill="none" strokeDasharray="3 4" strokeWidth={1} style={{ stroke: 'rgba(232,230,224,0.45)' }} />
            {level !== undefined && (
              <g>
                <line x1={L} x2={w - R} y1={y(level)} y2={y(level)} strokeDasharray="5 4" strokeWidth={1.2} style={{ stroke: T.gold }} />
                <text x={w - R + 4} y={y(level) + 3} className="font-mono" style={{ fontSize: 9, fill: T.goldLight }}>{money(level)}</text>
              </g>
            )}
            {worlds.map(wd => (
              <g key={wd.world}>
                <path d={line(wd.path)} fill="none" strokeWidth={1.7} strokeLinejoin="round" style={{ stroke: wd.color }} />
                {wd.path.slice(1).map((p, i) => p.hit
                  ? <rect key={i} x={x(p.date) - 4} y={y(level!) - 4} width={8} height={8} transform={`rotate(45 ${x(p.date)} ${y(level!)})`} style={{ fill: wd.color }}><title>{`World ${wd.world} reached ${money(level!)}`}</title></rect>
                  : <circle key={i} cx={x(p.date)} cy={y(p.v)} r={2.4} style={{ fill: wd.color }} />)}
                {wd.path.length > 1 && (
                  <text x={x(wd.path[wd.path.length - 1].date) + 6} y={y(wd.path[wd.path.length - 1].v) + 3} className="font-mono" style={{ fontSize: 9, fill: wd.color, stroke: 'rgba(0,0,0,0.9)', strokeWidth: 3, paintOrder: 'stroke' }}>
                    {wd.world} {money(wd.path[wd.path.length - 1].v)}
                  </text>
                )}
              </g>
            ))}
            <circle cx={x(today)} cy={y(q.price)} r={3} style={{ fill: 'var(--text-heading)' }} />
            <text x={L} y={height - 6} className="font-mono" style={{ fontSize: 9.5, fill: 'var(--text-muted)' }}>{short(today)} · {money(q.price)}</text>
            <text x={w - R} y={height - 6} textAnchor="end" className="font-mono" style={{ fontSize: 9.5, fill: 'var(--text-muted)' }}>{short(q.fan[q.fan.length - 1].date)}</text>
          </svg>
        )}
      </div>
      <p className={`mt-1.5 ${LABEL} text-[var(--text-muted)] flex flex-wrap gap-x-3 gap-y-0.5`}>
        <span><span className="inline-block w-2.5 h-2 align-middle rounded-sm mr-1" style={{ background: 'rgba(232,230,224,0.18)' }} />80% of the market&apos;s own paths</span>
        {worlds.map(wd => <span key={wd.world}><span className="inline-block w-2.5 h-[2px] align-middle mr-1" style={{ background: wd.color }} />World {wd.world}</span>)}
      </p>
    </div>
  );
}
