'use client';

import { Box } from 'lucide-react';

/** Pieces shared by the satellite and aircraft cards. */

/** Only a literal hex colour reaches an inline style. */
export function colorSafe(value: string | undefined): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(value ?? '')) ? String(value) : 'var(--cyan-primary)';
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compass(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function Field({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] font-mono tracking-[0.15em] text-[var(--text-muted)]">{label}</div>
      <div
        className="truncate text-[11px] font-mono tabular-nums text-[var(--text-primary)]"
        style={color ? { color } : undefined}
        title={value}
      >
        {value}
      </div>
      {sub && <div className="truncate text-[9px] font-mono tabular-nums text-[var(--text-secondary)]">{sub}</div>}
    </div>
  );
}

export type Picture = 'view' | 'model';

/** VIEW / 3D MODEL: which picture the card shows. */
export function PictureToggle({ picture, onChange, accent }: { picture: Picture; onChange: (p: Picture) => void; accent: string }) {
  return (
    <div className="flex overflow-hidden rounded bg-black/60 text-[8px] font-mono tracking-[0.14em]" role="group" aria-label="Picture">
      {([['view', 'VIEW'], ['model', '3D MODEL']] as const).map(([key, text]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          aria-pressed={picture === key}
          className={`flex items-center gap-1 px-1.5 py-1 transition-colors ${picture === key ? 'bg-white/15' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
          style={picture === key ? { color: accent } : undefined}
        >
          {key === 'model' && <Box className="h-2.5 w-2.5" />}
          {text}
        </button>
      ))}
    </div>
  );
}
