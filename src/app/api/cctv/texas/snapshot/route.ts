import { TEXAS_DISTRICTS, TXDOT_BASE } from '../../texas';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const district = params.get('district') || '';
  const id = params.get('id') || '';
  if (!Object.hasOwn(TEXAS_DISTRICTS, district) || !id.trim() || id.length > 256 || /[\x00-\x1f]/.test(id)) {
    return new Response('Invalid camera', { status: 400 });
  }
  try {
    // TxDOT serves base64 JPEGs in JSON, not image URLs. Decode only that fixed
    // upstream here so both the preview grid and full viewer can use an <img>.
    const query = new URLSearchParams({ districtCode: district, icdId: id });
    const response = await fetch(`${TXDOT_BASE}GetCctvSnapshotByIcdId?${query}`, {
      signal: AbortSignal.timeout(8000), next: { revalidate: 20 },
    });
    if (!response.ok) throw new Error(`TxDOT HTTP ${response.status}`);
    const data = await response.json();
    if (!data?.snippet) return new Response('Snapshot unavailable', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    if (typeof data.snippet !== 'string' || data.snippet.length > 8_000_000) throw new Error('Invalid snapshot');
    const image = Buffer.from(data.snippet, 'base64');
    if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) {
      return new Response('Snapshot unavailable', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return new Response(image, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=20', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return new Response('Snapshot unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
