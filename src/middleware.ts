import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';

// Analytics is opt-in and fails closed. This previously hardcoded a Umami
// website ID and an internal Umami host, so every self-hosted deployment
// silently reported its visitors' IPs to that instance. Analytics now fire
// only when BOTH UMAMI_WEBSITE_ID and UMAMI_HOST are explicitly configured.
const UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID;
const UMAMI_HOST = process.env.UMAMI_HOST;

export function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!UMAMI_WEBSITE_ID || !UMAMI_HOST) {
    return NextResponse.next();
  }

  const url = request.nextUrl.pathname;

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
  const userAgent = request.headers.get('user-agent') || 'Unknown OSIRIS Client';

  const basePayload = {
    hostname: request.nextUrl.hostname,
    language: "en-US",
    referrer: request.headers.get('referer') || "",
    screen: "1920x1080",
    title: "OSIRIS",
    url: url,
    website: UMAMI_WEBSITE_ID,
  };

  const endpoint = `${UMAMI_HOST.replace(/\/$/, '')}/api/send`;

  const pageView = fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent, 'x-forwarded-for': ip },
    body: JSON.stringify({ payload: basePayload, type: "event" })
  }).catch(() => {});

  const ipEvent = fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent, 'x-forwarded-for': ip },
    body: JSON.stringify({
      payload: { ...basePayload, name: "Network Log", data: { IP: ip } },
      type: "event"
    })
  }).catch(() => {});

  event.waitUntil(Promise.all([pageView, ipEvent]));

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
