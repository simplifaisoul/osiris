import { currentFrameUrl } from '../singapore';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — a Singapore traffic camera's current picture.
 *
 * GET /api/cctv/singapore?id=<camera number>
 *   302 to the picture on images.data.gov.sg, or 404 when the camera has none
 *
 * LTA gives every picture a new link, so a camera's feed_url points here and
 * the link is looked up when the picture is asked for (see ../singapore.ts).
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
