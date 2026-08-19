'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { API_GROUPS, ENDPOINT_COUNT, endpointId } from './apiCatalog';
import { Callout, Code, CodeBlock, Pre, Section } from './docsPrimitives';
import EndpointCard from './EndpointCard';
import CommandPalette, { buildPaletteItems } from './CommandPalette';

const GUIDE_SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'quickstart', title: 'Quick Start' },
  { id: 'self-hosting', title: 'Self-Hosting' },
  { id: 'configuration', title: 'Configuration' },
  { id: 'interface', title: 'Interface Guide' },
  { id: 'shortcuts', title: 'Keyboard Shortcuts' },
];

const API_SECTIONS = [
  { id: 'api', title: 'Conventions' },
  ...API_GROUPS.map(g => ({ id: `api-${g.id}`, title: g.title })),
];

const ALL_SECTIONS = [...GUIDE_SECTIONS, ...API_SECTIONS];
const FALLBACK_ORIGIN = 'https://osirisai.live';

export default function DocsClient() {
  const [active, setActive] = useState('overview');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [origin, setOrigin] = useState(FALLBACK_ORIGIN);
  const mainRef = useRef<HTMLElement>(null);

  const paletteItems = useMemo(() => buildPaletteItems(ALL_SECTIONS), []);

  /* Snippets should reference the instance the reader is actually on. */
  useEffect(() => setOrigin(window.location.origin), []);

  /* Belt-and-braces scroll unlock: globals.css handles this via :has(),
     but release the lock imperatively for engines without :has() support. */
  useEffect(() => {
    const supportsHas = typeof CSS !== 'undefined' && CSS.supports?.('selector(:has(*))');
    if (supportsHas) return;
    const { documentElement: html, body } = document;
    const prev = { html: html.style.cssText, body: body.style.cssText };
    for (const el of [html, body]) {
      el.style.height = 'auto';
      el.style.overflowY = 'auto';
      el.style.overflowX = 'hidden';
    }
    return () => {
      html.style.cssText = prev.html;
      body.style.cssText = prev.body;
    };
  }, []);

  /* Scroll-spy + reading progress. */
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -72% 0px', threshold: 0 }
    );
    ALL_SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  /* ⌘K / Ctrl-K, and "/" as a plain-keyboard alternative. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* Close the mobile drawer once a destination is chosen. */
  const closeNav = useCallback(() => setNavOpen(false), []);

  const activeIdx = ALL_SECTIONS.findIndex(s => s.id === active);
  const prev = activeIdx > 0 ? ALL_SECTIONS[activeIdx - 1] : null;
  const next = activeIdx >= 0 && activeIdx < ALL_SECTIONS.length - 1 ? ALL_SECTIONS[activeIdx + 1] : null;

  const navLink = (s: { id: string; title: string }) => (
    <a
      key={s.id}
      href={`#${s.id}`}
      onClick={closeNav}
      className={`relative block pl-4 pr-3 py-[7px] text-[12.5px] rounded-r-md transition-all duration-200 ${
        active === s.id
          ? 'text-[var(--gold-primary)] bg-[var(--gold-primary)]/[0.07] font-medium'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]'
      }`}
    >
      <span
        className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full transition-all duration-200 ${
          active === s.id ? 'h-[70%] bg-[var(--gold-primary)]' : 'h-0 bg-transparent'
        }`}
      />
      {s.title}
    </a>
  );

  return (
    <div className="docs-root min-h-screen bg-[var(--bg-void)] text-[var(--text-primary)] antialiased">
      {/* Ambient wash — keeps the page from reading as a flat black slab */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(900px 480px at 12% -8%, rgba(212,175,55,0.07), transparent 65%), radial-gradient(760px 420px at 92% 4%, rgba(0,229,255,0.05), transparent 62%)',
        }}
      />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} />

      {/* ── Header ── */}
      <header className="sticky top-0 z-[300] border-b border-white/[0.06] bg-[var(--bg-void)]/85 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 h-14 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <svg
              viewBox="0 0 650 500"
              className="w-6 h-6 text-[var(--gold-primary)] transition-all group-hover:drop-shadow-[0_0_10px_rgba(212,175,55,0.6)]"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M158.66,157a70.231,70.231,0,0,0-14.44,42.81,70.235,70.235,0,1,0,140.47,0,70.231,70.231,0,0,0-14.28-42.81h-111.75z" />
              <path d="m140.86,465.53c-6.7333,0-8.7137-5.4462-12.181-25.899-2.4479-14.774-7.1068-28.463-10.502-43.043-3.0219-13.117-5.6425-20.332-9.6694-26.618-6.5526-10.229-6.3011-20.921,0.71691-30.481,6.33-8.6232,6.827-11.121,6.5471-32.901-0.13783-10.725-0.56403-21.286-0.94711-23.468-0.88077-5.0179-4.6148-7.6923-13.904-9.9586-8.4827-2.0695-16.525-2.2933-41.967-1.1681-18.144,0.80245-20.457,0.72323-22.75-0.77901-5.627-3.687-2.9527-8.8405,12.261-23.626,15.69-15.249,23.876-24.688,38.811-44.75,26.839-36.053,30.927-40.83,57.501-49.189,19.575-6.1582,26.691-9.0119,62.031-10.06,24.654-0.7309,38.767,2.5963,45.357,3.3466,25.219,2.8716,66.247,14.877,91.933,26.083,13.581,5.9249,14.042,6.1723,30.115,16.152,11.981,7.4391,18.733,10.459,35.44,15.034,34.886,9.553,56.753,7.7583,92,10.378,9.2579,0.68808,49.298,3.5149,74.5,4.4784,30.689,1.1732,35.835-2.0376,38.423,0.54994,2.0315,2.0315,0.5636,8.1815,0.6024,14.306,0.0237,3.7378-0.18399,7.6642-0.48569,11.602-8.1923-1.424-8.0353-1.3676-26.54-2.9165-1.6808-0.14069-16.718-1.6695-44.5-4.1726-11.867-1.0692-70.326-2.8448-105.5-3.9248-16.997-0.52189-34.357-4.7228-51-1.2347-5.7624,1.2076,2.387-1.1161-16,7.4812-36.313,14.051-55.853,23.79-104.5,32.83-30.774,4.5201-33.208,4.9745-36.376,7.2909-1.7456,1.2764-1.662,1.6171,1.6767,6.8363,3.5642,5.5717,14.275,15.81,29.699,28.389,51.619,43.564,115.05,77.431,162.89,98.598,22.221,9.5122,37.55,14.655,50.108,16.811,61.892,13.654,134.26-9.4938,136.11-56.959,0.0489-1.256,0.49928-6.001-0.1398-12.079-0.44539-4.2357-0.89625-7.3216-2.2932-11.095-3.9795-10.75-12.413-20.407-28.672-21.755-11.746,0.022-20.375,6.1561-23.95,16.17-4.5622,12.78,1.3185,27.071,14.023,29.565,6.6403,1.3038,11.222-0.5256,14.271-4.4679,3.3424-4.3221,3.72-12.026,1.3559-15.634-2.2757-3.4732-7.2459-5.2754-10.824-3.9248-3.6125,1.3636-4.9933,0.36555-0.6538-3.1839,0.38036-0.24867,0.77844-0.4586,1.191-0.63136,6.6675-2.7918,17.127,4.1226,17.913,14.135,0.7119,11.495-7.7045,20.279-19.249,20.94-6.5659,0.37574-14.594-1.9665-20.026-7.8035-13.425-14.428-9.1712-34.885,2.9586-45.762,4.6131-4.1366,7.7535-6.0583,14.065-7.4773,19.37-4.3554,37.69,4.5134,45.528,24.301,3.5645,8.9992,3.7675,16.201,3.8515,23.221,0.70438,58.895-65.742,87.202-131.95,82.517-28.009-2.4123-46.229-6.8095-80.495-20.915-36.58-12.09-143.44-68.32-207.96-120.33-18.846-15.317-30.511-22.813-33.055-21.24-0.61585,0.38062-0.98989,11.992-0.99221,30.802-0.004,28.758-0.1019,30.352-2.0717,33.583-3.2793,5.3791-4.935,17.725-5.9822,44.608-1.6327,41.914-2.675,60.915-3.4439,62.778-1.3963,3.383-7.0306,4.6642-13.289,4.6642z" />
            </svg>
            <span className="flex flex-col leading-none">
              <span className="text-[13px] font-bold tracking-[0.3em] text-[var(--gold-primary)] font-mono">
                OSIRIS
              </span>
              <span className="text-[10px] font-mono tracking-[0.22em] text-[var(--text-muted)] uppercase mt-[3px]">
                Docs
              </span>
            </span>
          </Link>

          <div className="flex-1" />

          {/* Palette trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="group flex items-center gap-2 px-3 h-8 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:border-[var(--gold-primary)]/30 hover:bg-white/[0.04] transition-colors"
            aria-label="Search documentation"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--gold-primary)] transition-colors" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="hidden sm:inline text-[11.5px] text-[var(--text-muted)] font-mono">Search</span>
            <kbd className="hidden sm:inline text-[11px] font-mono px-1.5 py-0.5 rounded border border-white/10 text-[var(--text-muted)]">
              ⌘K
            </kbd>
          </button>

          <a
            href="https://github.com/simplifaisoul/osiris"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className="hidden sm:flex items-center justify-center w-8 h-8 rounded-lg border border-white/[0.08] bg-white/[0.02] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-white/20 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
              <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
            </svg>
          </a>

          <Link
            href="/"
            className="hidden md:inline-flex items-center gap-1.5 text-[12px] font-mono tracking-[0.15em] uppercase px-3 h-8 rounded-lg border border-[var(--gold-primary)]/30 bg-[var(--gold-primary)]/[0.08] text-[var(--gold-primary)] hover:bg-[var(--gold-primary)]/[0.18] transition-colors"
          >
            Launch Map
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>

          <button
            onClick={() => setNavOpen(v => !v)}
            aria-label="Toggle navigation"
            aria-expanded={navOpen}
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.08] text-[var(--text-muted)] hover:text-[var(--gold-primary)]"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {navOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>

        {/* Reading progress */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-transparent">
          <div
            className="h-full bg-gradient-to-r from-[var(--gold-primary)] to-[var(--cyan-primary)] transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Mobile drawer scrim */}
      {navOpen && (
        <div className="lg:hidden fixed inset-0 top-14 z-[250] bg-black/60 backdrop-blur-sm" onClick={closeNav} />
      )}

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 md:px-8 flex gap-8 xl:gap-12">
        {/* ── Left sidebar ── */}
        <nav
          className={`${
            navOpen
              ? 'translate-x-0 opacity-100'
              : '-translate-x-4 opacity-0 pointer-events-none lg:translate-x-0 lg:opacity-100 lg:pointer-events-auto'
          } fixed lg:sticky top-14 left-0 bottom-0 lg:bottom-auto z-[260] lg:z-auto w-64 lg:w-56 shrink-0 lg:h-[calc(100vh-3.5rem)] overflow-y-auto styled-scrollbar bg-[var(--bg-void)] lg:bg-transparent border-r lg:border-r-0 border-white/[0.06] py-6 pr-2 pl-2 lg:pl-0 transition-all duration-200`}
        >
          <div className="text-[11px] font-mono tracking-[0.3em] uppercase text-[var(--text-muted)]/70 pl-4 mb-2">
            Guide
          </div>
          {GUIDE_SECTIONS.map(navLink)}

          <div className="text-[11px] font-mono tracking-[0.3em] uppercase text-[var(--text-muted)]/70 pl-4 mb-2 mt-7">
            API Reference
          </div>
          {API_SECTIONS.map(navLink)}

          <div className="mt-8 mx-2 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
            <div className="text-[12px] font-mono text-[var(--text-secondary)] leading-relaxed">
              <span className="text-[var(--gold-primary)] font-bold">{ENDPOINT_COUNT}</span> endpoints, no key
              required.
            </div>
          </div>
        </nav>

        {/* ── Content ── */}
        <main ref={mainRef} className="flex-1 min-w-0 py-12 lg:py-16 max-w-3xl">
          {/* Hero */}
          <div className="mb-20">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-[var(--cyan-primary)]/20 bg-[var(--cyan-primary)]/[0.05] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--alert-green)] animate-pulse" />
              <span className="text-[11px] font-mono tracking-[0.2em] uppercase text-[var(--text-secondary)]">
                Open Source · MIT
              </span>
            </div>

            <h1 className="text-[38px] md:text-[52px] leading-[1.05] font-bold tracking-[-0.02em] mb-5">
              <span className="text-[var(--text-heading)]">Build on the</span>
              <br />
              <span className="bg-gradient-to-r from-[var(--gold-primary)] via-[#F0D060] to-[var(--cyan-primary)] bg-clip-text text-transparent">
                OSIRIS platform
              </span>
            </h1>

            <p className="text-[15px] leading-[1.75] text-[var(--text-secondary)] max-w-[42rem]">
              OSIRIS aggregates aviation, maritime, seismic, conflict, cyber, and OSINT feeds onto a single
              GPU-rendered map — and exposes every one of them as a plain HTTP endpoint. This is the same API the
              dashboard runs on. There is no separate, privileged internal tier.
            </p>

            <div className="flex flex-wrap gap-3 mt-8">
              <a
                href="#quickstart"
                className="inline-flex items-center gap-2 px-4 h-10 rounded-lg text-[12px] font-mono tracking-wider uppercase border border-[var(--gold-primary)]/40 bg-[var(--gold-primary)]/10 text-[var(--gold-primary)] hover:bg-[var(--gold-primary)]/20 transition-colors"
              >
                Quick Start
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
              <a
                href="#api"
                className="inline-flex items-center gap-2 px-4 h-10 rounded-lg text-[12px] font-mono tracking-wider uppercase border border-white/[0.1] bg-white/[0.02] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-white/20 transition-colors"
              >
                API Reference
              </a>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-10">
              {[
                { n: String(ENDPOINT_COUNT), l: 'Endpoints' },
                { n: '20+', l: 'Live feeds' },
                { n: '0', l: 'Keys required' },
              ].map(s => (
                <div key={s.l} className="rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-3">
                  <div className="text-[24px] font-bold text-[var(--gold-primary)] font-mono leading-none">{s.n}</div>
                  <div className="text-[12px] font-mono tracking-[0.15em] uppercase text-[var(--text-muted)] mt-1.5">
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── GUIDE ── */}
          <Section id="overview" eyebrow="Guide" title="Overview">
            <p>
              Every data point on the map is rendered through WebGL via MapLibre GL, which is what lets the interface
              hold thousands of concurrent entities at 60fps. The application is a Next.js app: the map and HUD run in
              the browser, and each live feed is normalised by a route under <Code>/api</Code> before it reaches the
              client.
            </p>
            <p>
              That boundary is deliberate. Upstream sources disagree about formats, rate limits, and CORS policy, so
              the API layer absorbs those differences and hands back consistent JSON.
            </p>
            <Callout tone="good" title="No credentials needed">
              Aviation, maritime, satellites, fires, earthquakes, weather, news, and CVE data all come from public
              keyless feeds. Keys only matter for the optional RECON scanner and for raising rate limits.
            </Callout>
          </Section>

          <Section id="quickstart" eyebrow="Guide" title="Quick Start">
            <p>
              Every read endpoint is a plain <Code>GET</Code> returning JSON. Nothing below needs authentication —
              paste any of it into a terminal.
            </p>
            <CodeBlock
              label="Fetch live aircraft"
              tabs={[
                { label: 'cURL', lang: 'bash', code: `curl -s ${origin}/api/flights | jq '.commercial_flights | length'` },
                {
                  label: 'JavaScript',
                  lang: 'javascript',
                  code: `const res = await fetch("${origin}/api/flights");
const { commercial_flights, military_flights } = await res.json();
console.log(commercial_flights.length, "commercial;", military_flights.length, "military");`,
                },
                {
                  label: 'Python',
                  lang: 'python',
                  code: `import requests

data = requests.get("${origin}/api/flights").json()
print(len(data["commercial_flights"]), "commercial")`,
                },
              ]}
            />
            <p>
              If you only need magnitudes rather than geometry, <Code>/api/stats</Code> is the right endpoint to poll —
              it collapses the heavy feeds into a handful of counters.
            </p>
            <Pre label="Aggregate counters" lang="bash">{`curl -s ${origin}/api/stats
# { "stats": { "flights": 9241, "sats": 2043, "cctv": 2117,
#              "weather": 58, "nuclear": 191, "incidents": 412 },
#   "timestamp": "2026-07-29T12:00:00Z" }`}</Pre>
            <p>The OSINT lookups each take one subject, so they compose cleanly in a pipeline:</p>
            <Pre label="Passive subdomain enumeration" lang="bash">{`curl -s "${origin}/api/osint/certs?domain=example.com" | jq -r '.subdomains[]'`}</Pre>
            <Callout tone="info" title="Try before you write code">
              Every GET endpoint in the reference below has a <strong>Send request</strong> button that runs it against
              this instance and shows the live response.
            </Callout>
          </Section>

          <Section id="self-hosting" eyebrow="Guide" title="Self-Hosting">
            <p>OSIRIS needs Node 20+ and no database. A local instance is three commands:</p>
            <Pre label="Local development" lang="bash">{`git clone https://github.com/simplifaisoul/osiris.git
cd osiris
npm install
npm run dev        # http://localhost:3000`}</Pre>
            <p>For a production build, or to run the checks:</p>
            <Pre label="Build and test" lang="bash">{`npm run build && npm start
npm run lint
npm test           # vitest
npm run test:live  # includes tests that hit live upstream feeds`}</Pre>
            <p>
              A <Code>Dockerfile</Code> and <Code>docker-compose.yml</Code> ship with the repository. The container
              always listens on port 3000 internally; <Code>OSIRIS_PORT</Code> controls the host port it is published
              on.
            </p>
            <Pre label="Docker" lang="bash">{`cp .env.example .env
docker compose up -d`}</Pre>
          </Section>

          <Section id="configuration" eyebrow="Guide" title="Configuration">
            <p>
              Copy <Code>.env.example</Code> to <Code>.env</Code>. Read that file before filling anything in — most of
              the keys it lists are reserved for future sources and are not consumed by the current code.
            </p>
            <h3 className="text-[13px] font-mono tracking-[0.15em] uppercase text-[var(--text-primary)] pt-2">
              Read by the application
            </h3>
            <div className="space-y-2">
              {[
                {
                  k: 'SCANNER_URL / SCANNER_KEY',
                  v: 'Points at the separate RECON scanner backend. SCANNER_KEY must equal that backend’s OSIRIS_KEY. Leave both empty to disable RECON — /api/scanner then returns 503 by design.',
                },
                {
                  k: 'SDK_INGEST_KEY',
                  v: 'Shared secret for /api/sdk/ingest. The endpoint fails closed: while this is unset, ingestion is disabled and returns 503.',
                },
                {
                  k: 'OSIRIS_TELEGRAM_CHANNELS',
                  v: 'Comma-separated public Telegram channel names (no @) for the Telegram OSINT layer, overriding the curated default set.',
                },
                {
                  k: 'OSIRIS_PORT',
                  v: 'Host port the UI is published on. The container itself always listens on 3000.',
                },
              ].map(row => (
                <div
                  key={row.k}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5 hover:border-white/[0.13] transition-colors"
                >
                  <div className="font-mono text-[11.5px] text-[var(--gold-primary)] mb-1.5">{row.k}</div>
                  <div className="text-[12.5px] leading-[1.7] text-[var(--text-secondary)]">{row.v}</div>
                </div>
              ))}
            </div>
            <h3 className="text-[13px] font-mono tracking-[0.15em] uppercase text-[var(--text-primary)] pt-4">
              Optional — higher rate limits only
            </h3>
            <p>
              <Code>FIRMS_API_KEY</Code>, <Code>OPENSKY_CLIENT_ID</Code>, <Code>OPENSKY_CLIENT_SECRET</Code>,{' '}
              <Code>N2YO_API_KEY</Code>, <Code>AIS_API_KEY</Code>. The public keyless feeds are used unless you extend
              the code to prefer these.
            </p>
            <Callout tone="warn" title="Secrets hygiene">
              Generate secrets with <Code>openssl rand -hex 32</Code>. Never commit a populated <Code>.env</Code> —
              only <Code>.env.example</Code> belongs in version control.
            </Callout>
          </Section>

          <Section id="interface" eyebrow="Guide" title="Interface Guide">
            <p>
              The map fills the viewport and every control floats above it. Panels are toggles rather than
              destinations, so you can build up exactly the picture you need and drop the rest.
            </p>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {[
                {
                  k: 'Layer Panel',
                  v: 'The left rail. Switches individual feeds on and off, and carries the theme selector.',
                },
                {
                  k: 'RECON Toolkit',
                  v: 'DNS, WHOIS, certificate transparency, IP and ASN enrichment, breach checks, sanctions, CVE lookup, port scanning.',
                },
                {
                  k: 'Intel Feed',
                  v: 'A running stream of incoming events across every enabled feed.',
                },
                {
                  k: 'Region Dossier',
                  v: 'Right-click the map for a composite summary of that location from every feed covering it.',
                },
                {
                  k: 'Entity Graph',
                  v: 'Link analysis, expanding one node at a time into its neighbours.',
                },
                {
                  k: 'Status Bar',
                  v: 'Community and docs links on the left, then a live ticker of prices and significant seismic events.',
                },
              ].map(row => (
                <div
                  key={row.k}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5 hover:border-[var(--cyan-primary)]/25 transition-colors"
                >
                  <div className="font-mono text-[11.5px] text-[var(--cyan-primary)] mb-1.5">{row.k}</div>
                  <div className="text-[12.5px] leading-[1.7] text-[var(--text-secondary)]">{row.v}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="shortcuts" eyebrow="Guide" title="Keyboard Shortcuts">
            <p>
              Press <Code>?</Code> at any time inside the application to bring up this list.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                { key: 'F', desc: 'Toggle fullscreen' },
                { key: 'S', desc: 'Share current view' },
                { key: 'L', desc: 'Toggle layer panel' },
                { key: 'M', desc: 'Toggle markets panel' },
                { key: 'I', desc: 'Toggle intel feed' },
                { key: 'R', desc: 'Reset to global view' },
                { key: '?', desc: 'Show help' },
                { key: 'ESC', desc: 'Close panels / popups' },
              ].map(s => (
                <div
                  key={s.key}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] px-3.5 py-2.5"
                >
                  <kbd className="font-mono text-[11px] min-w-[2.4rem] text-center px-2 py-1 rounded-md border border-[var(--gold-primary)]/30 bg-[var(--gold-primary)]/[0.08] text-[var(--gold-primary)]">
                    {s.key}
                  </kbd>
                  <span className="text-[12.5px] text-[var(--text-secondary)]">{s.desc}</span>
                </div>
              ))}
            </div>
            <p className="pt-2">
              In these docs, <Code>⌘K</Code> (or <Code>/</Code>) opens search from anywhere on the page.
            </p>
          </Section>

          {/* ── API REFERENCE ── */}
          <Section id="api" eyebrow="API Reference" title="Conventions">
            <p>
              All routes live under <Code>/api</Code> on whatever origin serves the application. Reads are{' '}
              <Code>GET</Code>, writes are <Code>POST</Code> with a JSON body. Nothing requires authentication except{' '}
              <Code>/api/sdk/ingest</Code> and <Code>/api/github-webhook</Code>.
            </p>
            <div className="space-y-2.5">
              {[
                {
                  k: 'Errors',
                  v: 'Failures return a non-2xx status with an `error` key, often alongside `detail` carrying the upstream message. Most routes proxy third parties, so treat upstream failure as normal — check response.ok before reading the body.',
                },
                {
                  k: 'Caching',
                  v: 'Routes set their own Cache-Control TTLs: typically 45–60s for fast-moving feeds, up to a day for static reference data. Polling faster than the TTL gains nothing but load. Where a route advertises refreshInterval, use it.',
                },
                {
                  k: 'Rate limits',
                  v: 'The three AI endpoints allow 5 requests per minute per IP and return 429 beyond that. Other routes are bounded indirectly by their upstream sources.',
                },
                { k: 'Timestamps', v: 'Every timestamp field is ISO 8601 in UTC.' },
              ].map(row => (
                <div key={row.k} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5">
                  <div className="font-mono text-[11.5px] text-[var(--gold-primary)] mb-1.5">{row.k}</div>
                  <div className="text-[12.5px] leading-[1.7] text-[var(--text-secondary)]">{row.v}</div>
                </div>
              ))}
            </div>
            <Callout tone="warn" title="Responsible use">
              The RECON scanner and <Code>/api/osint/sweep</Code> generate traffic against the targets you name. Only
              point them at infrastructure you own or have written authorisation to test. The remaining OSINT routes
              are passive and query third-party datasets rather than the subject itself.
            </Callout>
          </Section>

          {API_GROUPS.map(group => (
            <Section key={group.id} id={`api-${group.id}`} eyebrow="API Reference" title={group.title}>
              <p>{group.blurb}</p>
              <div className="space-y-2.5 pt-1">
                {group.endpoints.map(ep => (
                  <EndpointCard key={endpointId(ep)} ep={ep} origin={origin} />
                ))}
              </div>
            </Section>
          ))}

          {/* Prev / next */}
          {(prev || next) && (
            <div className="grid sm:grid-cols-2 gap-3 mt-4 mb-12">
              {prev ? (
                <a
                  href={`#${prev.id}`}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 hover:border-[var(--gold-primary)]/30 transition-colors"
                >
                  <div className="text-[11px] font-mono tracking-[0.2em] uppercase text-[var(--text-muted)] mb-1">
                    ← Previous
                  </div>
                  <div className="text-[13px] text-[var(--text-primary)]">{prev.title}</div>
                </a>
              ) : (
                <div />
              )}
              {next && (
                <a
                  href={`#${next.id}`}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 hover:border-[var(--gold-primary)]/30 transition-colors sm:text-right"
                >
                  <div className="text-[11px] font-mono tracking-[0.2em] uppercase text-[var(--text-muted)] mb-1">
                    Next →
                  </div>
                  <div className="text-[13px] text-[var(--text-primary)]">{next.title}</div>
                </a>
              )}
            </div>
          )}

          {/* Footer */}
          <footer className="border-t border-white/[0.06] pt-6 pb-16 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-mono text-[var(--text-muted)]">
            {[
              { href: 'https://github.com/simplifaisoul/osiris', label: 'GitHub' },
              { href: 'https://discord.gg/EPaFD5FFKf', label: 'Discord' },
              { href: 'https://x.com/soulsimplifai', label: 'X' },
              { href: 'https://github.com/simplifaisoul/osiris/issues', label: 'Report an issue' },
            ].map(l => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--gold-primary)] transition-colors"
              >
                {l.label}
              </a>
            ))}
            <span className="ml-auto opacity-60">MIT Licensed</span>
          </footer>
        </main>

        {/* ── Right rail: on this page ── */}
        <aside className="hidden xl:block w-52 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto styled-scrollbar py-16">
          <div className="text-[11px] font-mono tracking-[0.3em] uppercase text-[var(--text-muted)]/70 mb-3">
            On this page
          </div>
          <div className="space-y-0.5">
            {ALL_SECTIONS.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`block text-[11.5px] py-1 transition-colors ${
                  active === s.id
                    ? 'text-[var(--gold-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {s.title}
              </a>
            ))}
          </div>

          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="mt-6 flex items-center gap-1.5 text-[12px] font-mono tracking-[0.15em] uppercase text-[var(--text-muted)] hover:text-[var(--gold-primary)] transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m18 15-6-6-6 6" />
            </svg>
            Back to top
          </button>
        </aside>
      </div>
    </div>
  );
}
