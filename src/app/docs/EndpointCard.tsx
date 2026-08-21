'use client';

import { useMemo, useState } from 'react';
import { endpointId, type ApiEndpoint } from './apiCatalog';
import { CodeBlock, CopyButton, type CodeTab } from './docsPrimitives';

const METHOD_STYLES: Record<string, string> = {
  GET: 'text-[#00E676] border-[#00E676]/30 bg-[#00E676]/10',
  POST: 'text-[#FF9500] border-[#FF9500]/30 bg-[#FF9500]/10',
};

/* ─────────────────────────────────────────────────────────────
   Request snippet generation
   ───────────────────────────────────────────────────────────── */

function buildTabs(ep: ApiEndpoint, url: string): CodeTab[] {
  const method = Array.isArray(ep.method) ? ep.method[0] : ep.method;
  const isPost = method === 'POST';
  const body = ep.bodyExample || '{}';

  const curl = isPost
    ? `curl -s -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`
    : `curl -s "${url}"`;

  const js = isPost
    ? `const res = await fetch("${url}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(${body.replace(/\n/g, '\n  ')})
});
const data = await res.json();`
    : `const res = await fetch("${url}");
const data = await res.json();`;

  const py = isPost
    ? `import requests

r = requests.post(
    "${url}",
    json=${body.replace(/\n/g, '\n    ').replace(/true/g, 'True').replace(/false/g, 'False').replace(/null/g, 'None')},
)
data = r.json()`
    : `import requests

r = requests.get("${url}")
data = r.json()`;

  return [
    { label: 'cURL', lang: 'bash', code: curl },
    { label: 'JavaScript', lang: 'javascript', code: js },
    { label: 'Python', lang: 'python', code: py },
  ];
}

/* ─────────────────────────────────────────────────────────────
   Endpoint card
   ───────────────────────────────────────────────────────────── */

export default function EndpointCard({ ep, origin }: { ep: ApiEndpoint; origin: string }) {
  const methods = Array.isArray(ep.method) ? ep.method : [ep.method];
  const primary = methods[0];
  const id = endpointId(ep);

  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((ep.params || []).map(p => [p.name, (p.example || '').split(' | ')[0] || '']))
  );

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ status: number; ms: number; body: string; ok: boolean } | null>(null);

  /** Live URL reflecting whatever the reader has typed into the param inputs. */
  const liveUrl = useMemo(() => {
    const qs = (ep.params || [])
      .filter(p => values[p.name]?.trim())
      .map(p => `${p.name}=${encodeURIComponent(values[p.name].trim())}`)
      .join('&');
    return `${ep.path}${qs ? `?${qs}` : ''}`;
  }, [ep, values]);

  const tabs = useMemo(() => buildTabs(ep, `${origin}${liveUrl}`), [ep, origin, liveUrl]);

  const canTry = primary === 'GET' && !ep.requiresAuth;
  const missingRequired = (ep.params || []).filter(p => p.required && !values[p.name]?.trim());

  const run = async () => {
    setRunning(true);
    setResult(null);
    const started = performance.now();
    try {
      const res = await fetch(liveUrl, { headers: { Accept: 'application/json' } });
      const ms = Math.round(performance.now() - started);
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* not JSON — show the raw body */
      }
      const truncated = pretty.length > 4000 ? `${pretty.slice(0, 4000)}\n\n… truncated` : pretty;
      setResult({ status: res.status, ms, body: truncated, ok: res.ok });
    } catch (e) {
      setResult({
        status: 0,
        ms: Math.round(performance.now() - started),
        ok: false,
        body: `Request failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      id={id}
      className={`scroll-mt-28 rounded-xl border bg-white/[0.012] transition-colors ${
        open ? 'border-[var(--gold-primary)]/30' : 'border-white/[0.07] hover:border-white/[0.14]'
      }`}
    >
      {/* ── Header row ── */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full text-left p-4 flex items-start gap-3 group"
      >
        <div className="flex flex-col gap-1 shrink-0 pt-0.5">
          {methods.map(m => (
            <span
              key={m}
              className={`text-[10px] font-mono font-bold tracking-widest px-1.5 py-0.5 rounded border text-center ${METHOD_STYLES[m]}`}
            >
              {m}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-mono text-[12.5px] text-[var(--text-primary)] font-medium break-all mb-1">
            {ep.path}
          </div>
          <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{ep.summary}</p>
        </div>

        <svg
          viewBox="0 0 24 24"
          className={`w-4 h-4 shrink-0 mt-0.5 text-[var(--text-muted)] group-hover:text-[var(--gold-primary)] transition-all ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* ── Expanded detail ── */}
      {open && (
        <div className="px-4 pb-4 -mt-1">
          {/* Params */}
          {ep.params && ep.params.length > 0 && (
            <div className="mb-4">
              <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-[var(--text-muted)] mb-2">
                Query parameters
              </div>
              <div className="space-y-2">
                {ep.params.map(p => (
                  <div key={p.name} className="grid grid-cols-1 sm:grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-1 items-start">
                    <div className="flex items-center gap-1.5 pt-1.5">
                      <span className="font-mono text-[11.5px] text-[var(--gold-primary)]">{p.name}</span>
                      {p.required ? (
                        <span className="text-[9px] font-mono tracking-wider uppercase text-[var(--alert-red)]/80">
                          required
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono tracking-wider uppercase text-[var(--text-muted)]">
                          optional
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <input
                        value={values[p.name] ?? ''}
                        onChange={e => setValues(v => ({ ...v, [p.name]: e.target.value }))}
                        placeholder={p.example || p.name}
                        aria-label={`${p.name} value`}
                        className="w-full px-2.5 py-1.5 rounded-md text-[11.5px] font-mono bg-black/40 border border-white/[0.08] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--gold-primary)]/40"
                      />
                      <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)] mt-1">{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Request body */}
          {ep.bodyExample && (
            <>
              <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-[var(--text-muted)] mb-1">
                Request body
              </div>
              <CodeBlock dense tabs={[{ label: 'JSON', lang: 'json', code: ep.bodyExample }]} />
            </>
          )}

          {/* Request snippets */}
          <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-[var(--text-muted)] mb-1 mt-4">
            Request
          </div>
          <CodeBlock dense tabs={tabs} />

          {/* Try it */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {canTry ? (
              <>
                <button
                  onClick={run}
                  disabled={running || missingRequired.length > 0}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono tracking-[0.15em] uppercase px-3 py-1.5 rounded-md border border-[var(--gold-primary)]/40 bg-[var(--gold-primary)]/10 text-[var(--gold-primary)] hover:bg-[var(--gold-primary)]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {running ? (
                    <span className="w-2.5 h-2.5 rounded-full border border-current border-t-transparent animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                  {running ? 'Running' : 'Send request'}
                </button>
                {missingRequired.length > 0 && (
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">
                    Fill {missingRequired.map(p => p.name).join(', ')} first
                  </span>
                )}
                <CopyButton value={`${origin}${liveUrl}`} />
              </>
            ) : (
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                {ep.requiresAuth
                  ? 'Requires a credential — run this from your own client.'
                  : 'POST endpoint — run this from your own client.'}
              </span>
            )}
          </div>

          {/* Live response */}
          {result && (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-[var(--text-muted)]">
                  Response
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                    result.ok
                      ? 'text-[#00E676] border-[#00E676]/30 bg-[#00E676]/10'
                      : 'text-[#FF3D3D] border-[#FF3D3D]/30 bg-[#FF3D3D]/10'
                  }`}
                >
                  {result.status || 'ERR'}
                </span>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">{result.ms}ms</span>
              </div>
              <CodeBlock dense tabs={[{ label: 'JSON', lang: 'json', code: result.body }]} />
            </div>
          )}

          {/* Returns */}
          <div className="mt-4">
            <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-[var(--text-muted)] mb-1.5">
              Response keys
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ep.returns.map(r => (
                <span
                  key={r}
                  className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-[var(--cyan-primary)]/[0.07] border border-[var(--cyan-primary)]/20 text-[var(--cyan-primary)]/90"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>

          {/* Env */}
          {ep.env && ep.env.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-[var(--text-muted)]">
                Environment
              </span>
              {ep.env.map(e => (
                <span
                  key={e}
                  className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-[var(--gold-primary)]/[0.07] border border-[var(--gold-primary)]/20 text-[var(--gold-primary)]"
                >
                  {e}
                </span>
              ))}
            </div>
          )}

          {/* Notes */}
          {ep.notes && (
            <p className="mt-4 text-[11px] leading-[1.75] text-[var(--text-muted)] border-l-2 border-[var(--gold-primary)]/25 pl-3">
              {ep.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
