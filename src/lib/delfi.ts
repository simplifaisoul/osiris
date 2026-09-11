/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — Delfi AI bridge (client)
 *  Server-side client verso lo Studio AI di Delfi (rete locale).
 *  In locale Next raggiunge Delfi direttamente: nessun tunnel, nessun CORS.
 *  Per un domani pubblico basta puntare OSIRIS_DELFI_URL al reverse-proxy.
 * ═══════════════════════════════════════════════════════════════
 */

export const DELFI_URL = process.env.OSIRIS_DELFI_URL || 'http://localhost:7863';

export interface DelfiOptions {
  timeoutMs?: number;
}

/**
 * Inoltra un multipart a un endpoint dello Studio e ritorna il JSON.
 * Solleva con il messaggio d'errore di Delfi se la risposta non è ok.
 */
export async function delfiPostForm(
  path: string,
  form: FormData,
  opts: DelfiOptions = {},
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 300_000);
  try {
    const res = await fetch(`${DELFI_URL}${path}`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
      // niente cache: sono elaborazioni, non risorse
      cache: 'no-store',
    });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = null;
    }
    if (!res.ok) {
      const msg = (json && (json.error as string)) || `Delfi HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json ?? {};
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Delfi non ha risposto in tempo');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Ricostruisce un FormData da inoltrare, tenendo solo i campi attesi. */
export function pickForm(src: FormData, campi: string[]): FormData {
  const out = new FormData();
  for (const c of campi) {
    const v = src.get(c);
    if (v !== null) out.append(c, v as Blob | string);
  }
  return out;
}

/**
 * Route di proxy verso Delfi: rate limit → validazione campi → inoltro.
 * Tiene le route in dieci righe invece di ripetere lo stesso schema cinque volte.
 */
export async function proxyDelfi(
  req: Request,
  opts: {
    bucket: string;
    path: string;
    campi: string[];
    obbligatori: string[];
    max?: number;
    timeoutMs?: number;
  },
): Promise<Response> {
  const { rateLimit, clientIp } = await import('./rate-limit');
  if (!rateLimit(opts.bucket, clientIp(req), opts.max ?? 10)) {
    return Response.json({ error: 'Troppe richieste, riprova tra poco.' }, { status: 429 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: 'Attesa una form multipart.' }, { status: 400 });
  }
  for (const c of opts.obbligatori) {
    if (!form.get(c)) {
      return Response.json({ error: `Manca il campo "${c}".` }, { status: 400 });
    }
  }
  try {
    const out = await delfiPostForm(opts.path, pickForm(form, opts.campi), {
      timeoutMs: opts.timeoutMs,
    });
    return Response.json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore sconosciuto';
    return Response.json({ error: msg }, { status: 502 });
  }
}
