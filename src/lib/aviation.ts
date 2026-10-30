/** The default commercial aircraft sample ratio; the panel's sub-toggle
 *  offers the whole feed instead. Shared so the map and the panel agree. */
export const COMMERCIAL_SAMPLE_RATIO = 10;

/**
 * Turn a flown path into one segment per pair of reports, so MapLibre can
 * colour each stretch by the altitude carried at its end. A final segment can
 * be appended from the path's tip to the aircraft's current position, which
 * closes the gap between a track trimmed to the feed's fix time and the icon.
 */
export function trackFeatures(track: unknown, altitudes: unknown, final?: { lng: number; lat: number; alt?: number | null }): any[] {
  const pts = Array.isArray(track) ? track : [];
  const alts = Array.isArray(altitudes) ? altitudes : [];
  const features: any[] = [];
  const add = (a: any, b: any, alt: number) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return;
    if (![a[0], a[1], b[0], b[1]].every(Number.isFinite)) return;
    if (a[0] === b[0] && a[1] === b[1]) return;
    features.push({ type: 'Feature', properties: { alt }, geometry: { type: 'LineString', coordinates: [a, b] } });
  };
  // A missing fix falls back to the previous report's altitude; the first one
  // has nothing to inherit, so it starts at sea level.
  const altAt = (i: number) => typeof alts[i] === 'number' ? alts[i] : (typeof alts[i - 1] === 'number' ? alts[i - 1] : 0);

  for (let i = 1; i < pts.length; i++) add(pts[i - 1], pts[i], altAt(i));

  if (final && Number.isFinite(final.lng) && Number.isFinite(final.lat) && pts.length) {
    const alt = typeof final.alt === 'number' && Number.isFinite(final.alt) ? final.alt : altAt(pts.length - 1);
    add(pts[pts.length - 1], [final.lng, final.lat], alt);
  }
  return features;
}

