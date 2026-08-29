import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  MAP_DEFAULTS,
  MAP_PALETTE_KEYS,
  MAP_VARS,
  readMapPalette,
  satColorFor,
  type MapPalette,
} from './map-palette';

const palette = (o: Partial<MapPalette> = {}): MapPalette => ({ ...MAP_DEFAULTS, ...o });

describe('satColorFor', () => {
  it('keeps the feed\'s own mission colour while the category is untouched', () => {
    // Weather and Earth Observation are both earth_obs but arrive as different
    // colours; nobody who never opens the studio should lose that.
    expect(satColorFor('earth_obs', '#87ceeb', palette())).toBe('#87ceeb');
    expect(satColorFor('earth_obs', '#90ee90', palette())).toBe('#90ee90');
  });

  it('takes over the whole category once that swatch is moved', () => {
    const p = palette({ satEarth: '#ff00ff' });
    expect(satColorFor('earth_obs', '#87ceeb', p)).toBe('#ff00ff');
    expect(satColorFor('earth_obs', '#90ee90', p)).toBe('#ff00ff');
    // and leaves every other category alone
    expect(satColorFor('military', '#ff3d3d', p)).toBe('#ff3d3d');
  });

  it('ignores the case the default is written in', () => {
    expect(satColorFor('military', '#abcdef', palette({ satMilitary: '#FF3D3D' }))).toBe('#abcdef');
  });

  it('files an unknown or missing category under other', () => {
    const p = palette({ satOther: '#123456' });
    expect(satColorFor('debris', '#00e5ff', p)).toBe('#123456');
    expect(satColorFor(undefined, '#00e5ff', p)).toBe('#123456');
  });

  it('still returns a colour when the feed supplies none', () => {
    expect(satColorFor('comms', undefined, palette())).toBe(MAP_DEFAULTS.satComms);
    expect(satColorFor('comms', '', palette())).toBe(MAP_DEFAULTS.satComms);
  });
});

describe('readMapPalette', () => {
  it('reads every entry, trimming what getComputedStyle returns', () => {
    const out = readMapPalette(name => (name === '--map-cctv' ? '  #ff0000 ' : ''));
    expect(out.cctv).toBe('#ff0000');
  });

  it('canonicalises so two spellings of one colour compare equal', () => {
    // satColorFor decides "untouched" by comparing against MAP_DEFAULTS, so a
    // shorthand or upper-case value must not read as a customisation.
    expect(readMapPalette(() => '#0F0').cctv).toBe('#00ff00');
    expect(readMapPalette(() => '#00E676').cctv).toBe('#00e676');
  });

  it('falls back for anything missing or not a colour', () => {
    // An unresolved var() or a stylesheet that has not loaded yields ''.
    expect(readMapPalette(() => '').satMilitary).toBe(MAP_DEFAULTS.satMilitary);
    expect(readMapPalette(() => 'red; } * { display: none }').cctv).toBe(MAP_DEFAULTS.cctv);
    // Keywords and rgb() need a parser; without a DOM there is none, so they
    // fall back here. In the browser they resolve — which is the point: the
    // CSS build rewrites #ff0000 to `red` on its way to getComputedStyle.
    expect(readMapPalette(() => 'rgb(1,2,3)').cctv).toBe(MAP_DEFAULTS.cctv);
  });
});

describe('globals.css', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

  /** The value `--name: ` is declared with, at its first (i.e. :root) mention. */
  const declared = (name: string): string | null => {
    const at = css.indexOf(name + ':');
    if (at < 0) return null;
    return css.slice(at + name.length + 1, css.indexOf(';', at)).trim().toLowerCase();
  };

  it('declares every property the palette reads', () => {
    for (const key of MAP_PALETTE_KEYS) {
      expect(declared(MAP_VARS[key]), MAP_VARS[key]).not.toBeNull();
    }
  });

  it('agrees with MAP_DEFAULTS, which satColorFor compares against', () => {
    // The two copies cannot import each other, and a silent drift would make
    // every satellite category read as "customised" and flatten the map.
    for (const key of MAP_PALETTE_KEYS) {
      expect(declared(MAP_VARS[key]), MAP_VARS[key]).toBe(MAP_DEFAULTS[key]);
    }
  });

  it('leaves the satellite categories at their defaults in the ghost theme', () => {
    // Overriding them there would permanently suppress the feed's own colours.
    const ghost = css.slice(css.indexOf('body.theme-ghost'), css.indexOf('@theme inline'));
    for (const key of MAP_PALETTE_KEYS.filter(k => k.startsWith('sat'))) {
      expect(ghost, MAP_VARS[key] + ' overridden in ghost').not.toContain(MAP_VARS[key]);
    }
  });
});
