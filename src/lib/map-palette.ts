/**
 * OSIRIS — map layer palette.
 *
 * The colours the *map* draws with, as opposed to the chrome around it: camera
 * dots, satellites, aircraft. They live as `--map-*` custom properties beside
 * the rest of the design tokens, so the two themes set them in globals.css and
 * the Style Studio overrides them the same way it overrides everything else.
 *
 * Everything here is pure. Reading the properties off the document is the
 * caller's job — `readMapPalette` takes the lookup as an argument.
 */

export interface MapPalette {
  cctv: string;
  satComms: string;
  satMilitary: string;
  satNavigation: string;
  satEarth: string;
  satScience: string;
  satOther: string;
  flightCivil: string;
  flightPrivate: string;
  flightGov: string;
  flightMilitary: string;
  flightUnknown: string;
}

export type MapPaletteKey = keyof MapPalette;

/** Custom property backing each entry. Must match the block in globals.css. */
export const MAP_VARS: Record<MapPaletteKey, string> = {
  cctv: '--map-cctv',
  satComms: '--map-sat-comms',
  satMilitary: '--map-sat-military',
  satNavigation: '--map-sat-navigation',
  satEarth: '--map-sat-earth',
  satScience: '--map-sat-science',
  satOther: '--map-sat-other',
  flightCivil: '--map-flight-civil',
  flightPrivate: '--map-flight-private',
  flightGov: '--map-flight-gov',
  flightMilitary: '--map-flight-military',
  flightUnknown: '--map-flight-unknown',
};

/**
 * The core theme's values, and the fallback when a property is missing.
 *
 * The satellite entries double as the "untouched" marker — see `satColorFor`.
 * They are duplicated in globals.css because CSS cannot import them; the test
 * suite pins the two copies together.
 */
export const MAP_DEFAULTS: MapPalette = {
  cctv: '#00e676',
  satComms: '#00e676',
  satMilitary: '#ff3d3d',
  satNavigation: '#448aff',
  satEarth: '#90ee90',
  satScience: '#ffd700',
  satOther: '#00e5ff',
  flightCivil: '#00e5ff',
  flightPrivate: '#ffd700',
  flightGov: '#ff9500',
  flightMilitary: '#ff0000',
  flightUnknown: '#546e7a',
};

export const MAP_PALETTE_KEYS = Object.keys(MAP_DEFAULTS) as MapPaletteKey[];

/** The sub-layers the catalogue is filtered by, in panel order. */
const SAT_CATEGORY: Record<string, MapPaletteKey> = {
  comms: 'satComms',
  military: 'satMilitary',
  navigation: 'satNavigation',
  earth_obs: 'satEarth',
  science: 'satScience',
  other: 'satOther',
};

/**
 * Colour for one satellite.
 *
 * The catalogue classifies by *mission*, which is finer than the six categories
 * the map filters by: Weather and Earth Observation are both `earth_obs` but
 * arrive as different colours. Flattening every satellite onto its category
 * would throw that away for everyone who never opens the Style Studio, so the
 * category colour is applied only once it has been moved off its default — an
 * untouched palette leaves the feed's own colours exactly as they were.
 */
export function satColorFor(category: string | undefined, missionColor: string | undefined, palette: MapPalette): string {
  const key = SAT_CATEGORY[category ?? ''] ?? 'satOther';
  const chosen = palette[key];
  const untouched = chosen.toLowerCase() === MAP_DEFAULTS[key].toLowerCase();
  return (untouched && missionColor) || chosen;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Expand shorthand and lowercase, so two spellings of a colour compare equal. */
function canonical(hex: string): string {
  const h = hex.slice(1).toLowerCase();
  return '#' + (h.length === 3 ? h.split('').map(c => c + c).join('') : h);
}

/**
 * Resolve a colour the CSS build may have rewritten.
 *
 * Lightning CSS minifies hex to a keyword wherever that is shorter, so
 * `--map-flight-military: #ff0000` comes back out of getComputedStyle as
 * `red`. Comparing that against the defaults would report the category as
 * customised and quietly discard the mission colours, so the value has to be
 * parsed rather than pattern-matched. A 2d context is the browser's own
 * parser; assigning a colour and reading it back yields `#rrggbb`.
 *
 * Two seeds and an agreement check, because a value the parser rejects leaves
 * `fillStyle` at whatever it already held — with one seed, garbage would come
 * back as that seed rather than as a rejection.
 */
let probe: CanvasRenderingContext2D | null | undefined;
function parseColorValue(value: string): string | null {
  if (probe === undefined) {
    probe = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  if (!probe) return null;
  probe.fillStyle = '#000000';
  probe.fillStyle = value;
  const a = probe.fillStyle;
  probe.fillStyle = '#ffffff';
  probe.fillStyle = value;
  const b = probe.fillStyle;
  return a === b && typeof a === 'string' && HEX.test(a) ? canonical(a) : null;
}

/**
 * Read the palette out of a resolved-style lookup, e.g. `getComputedStyle`.
 *
 * Anything that is not a colour — an unresolved var(), a stylesheet that has
 * not loaded, a string pasted in to escape the declaration — falls back rather
 * than reaching a paint property.
 */
export function readMapPalette(lookup: (varName: string) => string): MapPalette {
  const out = {} as MapPalette;
  for (const key of MAP_PALETTE_KEYS) {
    const raw = (lookup(MAP_VARS[key]) || '').trim();
    out[key] = (HEX.test(raw) ? canonical(raw) : parseColorValue(raw)) ?? MAP_DEFAULTS[key];
  }
  return out;
}
