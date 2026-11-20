import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';
import { search, type Schema } from '@/lib/sanctions';

// Standalone US sanctions search (free, no key) backed by the OpenSanctions
// `us_ofac_sdn` mirror. Substring + alias-aware match, schema-filterable.

const ALLOWED_SCHEMAS: Schema[] = [
  'Person',
  'Organization',
  'Company',
  'Vessel',
  'Airplane',
  'LegalEntity',
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('query') || '').trim();
  const schemaParam = searchParams.get('schema');
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '25', 10), 1), 100);

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
  }
  if (query.length < 4) {
    return NextResponse.json(
      { error: 'Query must be at least 4 characters' },
      { status: 400 }
    );
  }

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  let schema: Schema | undefined;
  if (schemaParam) {
    if (!ALLOWED_SCHEMAS.includes(schemaParam as Schema)) {
      return NextResponse.json(
        { error: `Invalid schema. Allowed: ${ALLOWED_SCHEMAS.join(', ')}` },
        { status: 400 }
      );
    }
    schema = schemaParam as Schema;
  }

  try {
    const matches = await search(query, { schema, limit });
    return NextResponse.json({
      query,
      schema: schema ?? null,
      total: matches.length,
      matches,
      source: 'US sanctions (OpenSanctions us_sanctions + us_fcc_covered_list)',
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Sanctions lookup failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
