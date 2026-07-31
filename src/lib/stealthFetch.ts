/**
 * OSIRIS — Stealth Fetch Utility
 * Sends a rotating real-browser User-Agent so upstream feeds that reject the
 * default Node/undici UA (several of the traffic-camera endpoints do) still
 * respond. Adds a hard request timeout on top of plain fetch().
 *
 * This deliberately does NOT forge client-IP headers. An earlier revision sent
 * randomised `X-Forwarded-For` / `X-Real-IP` values drawn from live residential
 * ISP allocations to spread requests past per-IP rate limits. That was dropped:
 * it wrote real strangers' IP addresses into third parties' access logs, it
 * violates the terms of several of the upstream feeds, and it bought almost
 * nothing — serious rate limiters key on the TCP source address, and the
 * `s-maxage` CDN caching on these routes already collapses many viewers into
 * one upstream request. If a feed does rate-limit us, raise its `s-maxage` or
 * register a free API key (OpenSky, NASA FIRMS) instead.
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
];

function randomInt(max: number): number {
  return Math.floor(Math.random() * (max + 1));
}

function randomUA(): string {
  return USER_AGENTS[randomInt(USER_AGENTS.length - 1)];
}

/**
 * Generate browser-like headers for a stealth fetch request.
 * Merges with any existing headers you pass in.
 */
export function stealthHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  return {
    'User-Agent': randomUA(),
    'Accept-Language': 'en-US,en;q=0.9',
    ...extraHeaders,
  };
}

/**
 * Perform a fetch with stealth headers injected automatically.
 * Drop-in replacement for global fetch() with identical signature.
 */
export async function stealthFetch(
  url: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const headers = stealthHeaders(
    init?.headers ? Object.fromEntries(
      init.headers instanceof Headers
        ? init.headers.entries()
        : Array.isArray(init.headers)
          ? init.headers
          : Object.entries(init.headers)
    ) : undefined
  );

  const controller = new AbortController();
  if (init?.signal) {
    init.signal.addEventListener('abort', () => controller.abort());
  }

  const timeoutId = setTimeout(() => controller.abort(new Error('stealthFetch Hard Timeout')), 30000);

  try {
    const res = await fetch(url, { ...init, headers, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
