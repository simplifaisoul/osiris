import { catalogue, frameOf, FrameError } from '@/lib/vision/frames';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';

/**
 * OSIRIS — a camera's current still frame, for the built-in detector.
 *
 * GET /api/cctv/frame?id=<camera id>
 *   returns  the picture (JPEG, PNG, WebP or GIF), with X-Frame-At: when it was fetched
 *
 * The browser can only read the pixels of a picture from OSIRIS's own site, and
 * most camera hosts serve theirs without permission for anyone else to, so the
 * detector's frames come through here. It takes a camera's id, never a URL:
 * only cameras in OSIRIS's catalogue can be fetched.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id')?.trim().slice(0, 200);
  if (!id) return fail(400, 'Name a camera: ?id=<camera id>');
  // A watch asks for a frame every few seconds; this is room for several at once, not for scraping.
  if (isRateLimited(`cctv-frame:${getClientIp(request)}`, 90)) return fail(429, 'Too many frames in a minute. Wait a moment.');

  let cameras;
  try {
    cameras = await catalogue();
  } catch {
    cameras = null;
  }
  if (!cameras) return fail(503, 'The camera list is still loading. Try again in a moment.');
  const camera = cameras.cameras.get(id);
  if (!camera) return fail(404, 'No camera with that id');

  try {
    const frame = await frameOf(camera);
    return new Response(new Uint8Array(frame.bytes), {
      headers: {
        'Content-Type': frame.type,
        // The same few seconds OSIRIS holds a frame: a busy camera is fetched once, however many people are watching it.
        'Cache-Control': 'public, max-age=4',
        'X-Frame-At': frame.at,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    if (err instanceof FrameError) return fail(err.status, err.message);
    return fail(502, 'The camera could not be reached');
  }
}
