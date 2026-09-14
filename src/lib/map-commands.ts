export type MapCommand =
  | { type: 'locate'; query: string; cameras: boolean }
  | { type: 'coordinates'; lat: number; lng: number }
  | { type: 'zoom'; delta: number }
  | { type: 'reset' }
  | { type: 'layer'; layer: string; enabled: boolean }
  | { type: 'panel'; panel: 'layers' | 'intel' | 'markets' | 'search'; open: boolean }
  | { type: 'help' };

const LAYERS: Record<string, string> = {
  cameras: 'cctv', cctv: 'cctv', 'camera grid': 'cctv_previews',
  'cctv grid': 'cctv_previews', flights: 'flights', satellites: 'satellites',
  earthquakes: 'earthquakes', fires: 'fires', weather: 'weather',
  ships: 'maritime', maritime: 'maritime', news: 'live_news',
};

/** Explicit grammar shared by typed and spoken input; unknown text does nothing. */
export function parseMapCommand(input: string): MapCommand | null {
  const text = input.trim().replace(/^\//, '').replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  const lower = text.toLowerCase().replace(/^please /, '');
  if (lower === 'help' || lower === 'commands') return { type: 'help' };
  if (/^(?:reset(?: view)?|global view|go home)$/.test(lower)) return { type: 'reset' };
  if (/^zoom (in|out)$/.test(lower)) return { type: 'zoom', delta: lower.endsWith('in') ? 1 : -1 };
  const panel = lower.match(/^(open|close) (layers|intel|markets|search)(?: panel)?$/);
  if (panel) return { type: 'panel', panel: panel[2] as 'layers' | 'intel' | 'markets' | 'search', open: panel[1] === 'open' };
  const layer = lower.match(/^(show|hide|enable|disable) (.+?)(?: layer)?$/);
  if (layer && Object.hasOwn(LAYERS, layer[2])) {
    return { type: 'layer', layer: LAYERS[layer[2]], enabled: ['show', 'enable'].includes(layer[1]) };
  }
  const cameraPlace = lower.match(/^show (?:cameras|cctv) (?:in|near) (.+)$/);
  if (cameraPlace) return { type: 'locate', query: cameraPlace[1], cameras: true };
  const place = lower.match(/^(?:fly to|go to|navigate to|locate|find) (.+)$/);
  if (place) {
    const coords = place[1].match(/^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$/);
    if (coords) {
      const lat = Number(coords[1]), lng = Number(coords[2]);
      return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { type: 'coordinates', lat, lng } : null;
    }
    return { type: 'locate', query: place[1], cameras: false };
  }
  return null;
}

export const COMMAND_HELP = 'Try “show cameras in London”, “fly to Austin”, “show cameras in Houston”, “zoom in”, “hide flights”, “open layers”, or “reset view”.';
