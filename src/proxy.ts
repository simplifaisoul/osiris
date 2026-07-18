import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const correlationId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const connectedProfile = process.env.DEPLOYMENT_PROFILE === 'OSIRIS_CONNECTED';
  const connectSources = connectedProfile ? "'self' https: wss:" : "'self'";
  const imageSources = connectedProfile ? "'self' data: blob: https:" : "'self' data: blob:";
  const mediaSources = connectedProfile ? "'self' blob: https:" : "'self' blob:";
  const frameSources = connectedProfile ? "'self' https:" : "'self'";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources}`,
    "font-src 'self' data:",
    `connect-src ${connectSources}`,
    "worker-src 'self' blob:",
    `media-src ${mediaSources}`,
    `frame-src ${frameSources}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', correlationId);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Correlation-Id', correlationId);

  const telemetryEndpoint = process.env.UMAMI_ENDPOINT;
  const websiteId = process.env.UMAMI_WEBSITE_ID;
  if (process.env.TELEMETRY_ENABLED === 'true' && telemetryEndpoint && websiteId) {
    const pageView = fetch(new URL('/api/send', telemetryEndpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': request.headers.get('user-agent') || 'OSIRIS Client',
      },
      body: JSON.stringify({
        type: 'event',
        payload: {
          hostname: request.nextUrl.hostname,
          language: request.headers.get('accept-language') || 'unknown',
          referrer: '',
          screen: 'unknown',
          title: 'OSIRIS',
          url: request.nextUrl.pathname,
          website: websiteId,
        },
      }),
    }).catch(() => undefined);
    event.waitUntil(pageView);
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
