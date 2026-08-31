/**
 * OSIRIS — helpers for the IBI 511 traveler-information platform.
 *
 * Several state DOTs run the same vendor stack behind different domains, and
 * they all expose cameras the same way: a DataTables endpoint at
 * `/List/GetData/Cameras` that pages 100 rows at a time, with each row's
 * position as WKT. Utah and Nevada both read through here.
 */

/** Build the URL-encoded DataTables `query` parameter for a given page. */
export function buildQuery(start: number, length: number): string {
  const query = {
    columns: [
      { data: null, name: '' },
      { name: 'sortOrder', s: true },
      { name: 'roadway', s: true },
      { data: 3, name: '' },
    ],
    order: [{ column: 1, dir: 'asc' }],
    start,
    length,
    search: { value: '' },
  };
  return encodeURIComponent(JSON.stringify(query));
}

/** Parse a `POINT (lng lat)` WKT string into coordinates. */
export function parseWkt(wkt?: string | null): { lat: number; lng: number } | null {
  if (!wkt) return null;
  const m = wkt.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
  if (!m) return null;
  const lng = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
