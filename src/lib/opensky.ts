/**
 * OSIRIS — OpenSky OAuth2 client credentials.
 *
 * OpenSky metes its API by the day and by source address. The anonymous pool is
 * small and shared: once it is spent every call answers 429 until the window
 * resets, which quietly empties the map because the failure is a status code
 * rather than empty airspace. A free account gets its own budget, and one token
 * serves both the live state feed and the flown-track lookup.
 *
 * Two caches, on purpose: the token is reused until shortly before it expires,
 * and a failed login is not retried on every request that needs it.
 */

let token: string | null = null;
let tokenExpiry = 0;
let retryAfter = 0;
/** Whether the most recent login attempt succeeded. */
let tokenOk = false;

const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

/** True when credentials are configured — regardless of whether login worked. */
export function hasOpenSkyCreds(): boolean {
  return Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET);
}

/** A bearer token for the OpenSky API, or null when anonymous access is used. */
export async function openskyToken(): Promise<string | null> {
  const id = process.env.OPENSKY_CLIENT_ID;
  const secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (token && Date.now() < tokenExpiry) return token;
  // A rejected client is not going to start working on the next request; back
  // off for the token's nominal lifetime instead of logging in on every call.
  if (Date.now() < retryAfter) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn('[OSIRIS] OpenSky token failed:', res.status);
      tokenOk = false;
      retryAfter = Date.now() + 15 * 60 * 1000;
      return null;
    }
    const data = await res.json();
    if (!data.access_token) {
      console.warn('[OSIRIS] OpenSky token response missing access_token');
      tokenOk = false;
      retryAfter = Date.now() + 15 * 60 * 1000;
      return null;
    }
    token = data.access_token;
    tokenOk = true;
    tokenExpiry = Date.now() + ((data.expires_in || 1800) - 60) * 1000;
    return token;
  } catch (e) {
    console.warn('[OSIRIS] OpenSky token error:', e);
    tokenOk = false;
    retryAfter = Date.now() + 60_000;
    return null;
  }
}

/** Whether the most recent login attempt succeeded. */
export function openskyTokenOk(): boolean {
  return tokenOk;
}
