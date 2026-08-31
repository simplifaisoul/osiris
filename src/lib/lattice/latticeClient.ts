import { latticeBaseUrl, type LatticeConfig } from './config';
import type { LatticeEntity } from './ontology';

function sandboxHeaders(config: LatticeConfig, extra?: Record<string, string>): Record<string, string> {
  return {
    "Anduril-Sandbox-Authorization": `Bearer ${config.sandboxToken}`,
    ...extra,
  };
}

export async function fetchAccessToken(config: LatticeConfig): Promise<string> {
  const url = `${latticeBaseUrl(config.endpoint)}/api/v1/oauth/token`;
  const res = await fetch(url, {
    method: "POST",
    headers: sandboxHeaders(config, {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    }),
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Lattice OAuth HTTP ${res.status}: ${body.slice(0, 240)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new Error("Lattice OAuth response missing access_token");
  }
  return data.access_token;
}

export function parseNdjsonEntities(raw: string): LatticeEntity[] {
  const out: LatticeEntity[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as { entity?: LatticeEntity; heartbeat?: unknown };
      if (event.entity) out.push(event.entity);
    } catch {
      // skip malformed line
    }
  }
  return out;
}

export async function streamEntities(config: LatticeConfig, accessToken: string): Promise<LatticeEntity[]> {
  const url = `${latticeBaseUrl(config.endpoint)}/api/v1/entities/stream`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...sandboxHeaders(config, {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/x-ndjson, application/json",
      }),
    },
    body: JSON.stringify({ heartbeatIntervalMs: 5000, preExistingOnly: false }),
    signal: AbortSignal.timeout(config.streamTimeoutMs),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Lattice stream HTTP ${res.status}: ${body.slice(0, 240)}`);
  }
  const raw = await res.text();
  return parseNdjsonEntities(raw);
}

export async function putEntity(
  config: LatticeConfig,
  accessToken: string,
  entity: LatticeEntity,
): Promise<LatticeEntity> {
  const url = `${latticeBaseUrl(config.endpoint)}/api/v1/entities`;
  const res = await fetch(url, {
    method: "PUT",
    headers: sandboxHeaders(config, {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(entity),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Lattice PUT HTTP ${res.status}: ${body.slice(0, 240)}`);
  }
  return (await res.json()) as LatticeEntity;
}

export async function getEntity(
  config: LatticeConfig,
  accessToken: string,
  entityId: string,
): Promise<LatticeEntity> {
  const url = `${latticeBaseUrl(config.endpoint)}/api/v1/entities/${encodeURIComponent(entityId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: sandboxHeaders(config, {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Lattice GET HTTP ${res.status}: ${body.slice(0, 240)}`);
  }
  return (await res.json()) as LatticeEntity;
}
