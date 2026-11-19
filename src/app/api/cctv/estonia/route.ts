import { currentFrameUrl } from '../estonia';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — an Estonian road camera's current picture.
 *
 * GET /api/cctv/estonia?id=<camera number>
 *   302 to the picture on www.tarktee.ee, or 404 when the camera has none
 *
 * Every picture has its own file name, so a camera's feed_url points here and
 * the link is looked up when the picture is asked for (see ../estonia.ts).
 * The lookup is shared and made at most once a minute, whoever is watching.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const url = await currentFrameUrl(id);
  if (!url) {
    return Response.json({ error: 'That camera has no current picture' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'public, max-age=30' } });
}
