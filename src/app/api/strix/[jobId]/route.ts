import { NextResponse } from 'next/server';

/**
 * OSIRIS — Strix job-status proxy. Polls a running/completed pentest job on the
 * private Strix backend. Same gating as the parent route: feature must be
 * configured, and the caller must present a valid operator key.
 */

const STRIX_URL = process.env.STRIX_URL || '';
const STRIX_KEY = process.env.STRIX_KEY || '';
const OPERATOR_KEY = process.env.OPERATOR_KEY || '';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!STRIX_URL || !STRIX_KEY || !OPERATOR_KEY) {
    return NextResponse.json({ error: 'Strix not configured' }, { status: 503 });
  }

  const provided = req.headers.get('x-operator-key') || '';
  if (!provided || !timingSafeEqual(provided, OPERATOR_KEY)) {
    return NextResponse.json({ error: 'Unauthorized', detail: 'Valid operator key required.' }, { status: 401 });
  }

  const { jobId } = await ctx.params;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  try {
    const res = await fetch(`${STRIX_URL}/pentest/${encodeURIComponent(jobId)}`, {
      headers: { 'X-OSIRIS-KEY': STRIX_KEY },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: 'Strix backend unreachable', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
