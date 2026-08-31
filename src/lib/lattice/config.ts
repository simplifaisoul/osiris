/**
 * Lattice connection config. No secrets in this file.
 * LATTICE_ENV_TOKEN and LATTICE_SANDBOX_TOKEN are the same credential
 * (Sandboxes Bearer). ENV_TOKEN is the name used by other doors.
 */

export type LatticeConfig = {
  endpoint: string;
  clientId: string;
  clientSecret: string;
  sandboxToken: string;
  enabled: boolean;
  streamTimeoutMs: number;
};

function firstEnv(env: NodeJS.ProcessEnv, names: string[]): string {
  for (const name of names) {
    const v = env[name]?.trim();
    if (v) return v;
  }
  return "";
}

export function latticeBaseUrl(endpoint: string): string {
  let host = endpoint.trim();
  let scheme = "https";
  if (host.startsWith("http://")) {
    scheme = "http";
    host = host.slice("http://".length);
  } else if (host.startsWith("https://")) {
    host = host.slice("https://".length);
  }
  host = host.replace(/\/+$/, "");
  const bare = host.split(":")[0]?.toLowerCase() ?? "";
  if (scheme === "https" && (bare === "127.0.0.1" || bare === "localhost" || bare === "::1")) {
    scheme = "http";
  }
  return `${scheme}://${host}`;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): LatticeConfig | null {
  const endpoint = firstEnv(env, ["LATTICE_ENDPOINT"]);
  const clientId = firstEnv(env, ["LATTICE_CLIENT_ID"]);
  const clientSecret = firstEnv(env, ["LATTICE_CLIENT_SECRET"]);
  const sandboxToken = firstEnv(env, ["LATTICE_ENV_TOKEN", "LATTICE_SANDBOX_TOKEN"]);
  if (!endpoint || !clientId || !clientSecret || !sandboxToken) return null;

  const enabledRaw = firstEnv(env, ["LATTICE_ENABLED"]);
  const enabled = enabledRaw === "" ? true : enabledRaw !== "0" && enabledRaw.toLowerCase() !== "false";
  const timeoutRaw = firstEnv(env, ["LATTICE_STREAM_TIMEOUT_MS"]);
  const streamTimeoutMs = timeoutRaw ? Number(timeoutRaw) : 8000;

  return {
    endpoint,
    clientId,
    clientSecret,
    sandboxToken,
    enabled,
    streamTimeoutMs: Number.isFinite(streamTimeoutMs) && streamTimeoutMs > 0 ? streamTimeoutMs : 8000,
  };
}

export function isConfigured(config: LatticeConfig | null): config is LatticeConfig {
  return config !== null;
}
