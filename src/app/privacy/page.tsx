import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Bot, Camera, ChevronDown, ExternalLink, HardDrive, KeyRound, Map as MapIcon, MessageCircle, Search, ShieldCheck, Sparkles, UserX, EyeOff,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'Privacy at OSIRIS, in plain words: no accounts, no tracking, your settings on your device, and exactly which services hear from us when you use a feature.',
  alternates: { canonical: '/privacy' },
};

/**
 * Every statement on this page is drawn from the code in this repository, not
 * from a template; when a data flow changes, this page changes with it.
 *
 * Reviewed 2026-10-04 against: src/app/api/geo, src/app/api/osint/*,
 * src/app/api/ai/*, src/app/api/oi/*, src/lib/oi/* (client, service, web,
 * newsroom, markets), src/lib/sanctions.ts, src/lib/sherlock.ts,
 * src/lib/chainIntel.ts, src/app/page.tsx (IP location, storage),
 * src/components/OsirisMap.tsx (base map, satellite), src/app/globals.css
 * (fonts), src/components/LiveAlerts.tsx, src/lib/live-clouds.ts,
 * src/lib/donbot.ts, src/components/oi/assist/voice.ts, the CCTV sources, and
 * every localStorage and sessionStorage key in src/.
 */

const REVIEWED = '4 October 2026';

/* ───────────── The pieces ───────────── */

function Pledge({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-primary)] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--gold-primary)]/10 text-[var(--gold-light)]">{icon}</span>
        <h3 className="text-[13px] font-semibold text-[var(--text-heading,var(--text-primary))]">{title}</h3>
      </div>
      <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--text-muted)]">{children}</p>
    </div>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-8">
      <h2 className="text-lg font-semibold tracking-wide">{title}</h2>
      {intro && <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{intro}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** One thing you might do, what it involves, and (a click away) exactly who hears from us. */
function Flow({ icon, title, summary, services, children }: {
  icon: ReactNode; title: string; summary: ReactNode; services?: { name: string; what: string }[]; children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-primary)] bg-white/[0.02] p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--cyan-primary)]/10 text-[var(--cyan-primary)]">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold">{title}</h3>
          <div className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">{summary}</div>
          {children}
          {services && services.length > 0 && (
            <details className="group mt-3">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-[12px] text-[var(--cyan-primary)] hover:underline [&::-webkit-details-marker]:hidden">
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                Which services, exactly
              </summary>
              <ul className="mt-3 flex flex-col gap-2 border-l border-[var(--border-primary)] pl-4">
                {services.map(s => (
                  <li key={s.name} className="text-[12.5px] leading-relaxed">
                    <span className="font-mono text-[11.5px] text-[var(--text-primary)]">{s.name}</span>
                    <span className="text-[var(--text-muted)]"> · {s.what}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

const STORED: { what: string; detail: string }[] = [
  { what: 'Your AI key for OI', detail: 'Kept for this browser tab only, and gone when you close it, unless you tick “Remember on this device”.' },
  { what: 'Your OI settings and recent predictions', detail: 'Which provider and model you use, whether replies are read aloud, and a list of your last 25 predictions so you can reopen them.' },
  { what: 'Your OI Assist conversation', detail: 'For this tab only, so a reload does not lose it.' },
  { what: 'Areas you draw on the map', detail: 'So a refresh does not wipe your work.' },
  { what: 'How the map looks', detail: 'Your Style Studio colours and the last city the map opened on.' },
  { what: 'Your market watchlist and recent fingerprint searches', detail: 'So they are there next time. The search list can be cleared from the search panel.' },
];

const PROMISES: { icon: ReactNode; title: string; body: string }[] = [
  { icon: <UserX className="h-4 w-4" />, title: 'No account, ever', body: 'There is nothing to sign up for and nothing to log in to. We do not know who you are, and we have not asked.' },
  { icon: <EyeOff className="h-4 w-4" />, title: 'No tracking', body: 'No analytics, no advertising networks, no tracking cookies. We do not build a profile of you or of what you do here.' },
  { icon: <HardDrive className="h-4 w-4" />, title: 'Your things stay with you', body: 'Your settings, history and keys are kept in your own browser, where you can see them and clear them. Not on our servers.' },
  { icon: <KeyRound className="h-4 w-4" />, title: 'Your AI key is yours', body: 'Used only for the request you make, passed straight to the provider you chose, and never stored on our servers or written to a log.' },
];

/* ───────────── The page ───────────── */

export default function PrivacyPage() {
  return (
    // docs-root releases the full-screen map's scroll lock (see globals.css), so the page scrolls.
    <main className="docs-root min-h-screen bg-[var(--bg-primary)] px-5 py-14 text-[var(--text-primary)] sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="font-mono text-[11px] tracking-widest text-[var(--text-muted)] hover:text-[var(--cyan-primary)]">
          ← OSIRIS
        </Link>

        <header className="mt-8">
          <p className="font-mono text-[11px] tracking-[0.25em] text-[var(--gold-primary)]">PRIVACY</p>
          <h1 className="mt-2 text-3xl font-bold tracking-wide sm:text-4xl">Privacy, in plain words</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--text-muted)]">
            OSIRIS is a window onto public information: flights, ships, cameras, news, markets and more, gathered onto
            one map. We built it so you can use it without telling us who you are. This page says what that means in
            practice, and, where a feature needs to ask another service for something, exactly which one.
          </p>
        </header>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {PROMISES.map(p => <Pledge key={p.title} icon={p.icon} title={p.title}>{p.body}</Pledge>)}
        </div>

        <Section id="short" title="The short version">
          <ul className="flex flex-col gap-3 text-sm leading-relaxed text-[var(--text-muted)]">
            {[
              'Most of what you see comes from public sources. To show it, our server asks those sources, much as your browser would.',
              'When you look something up, the question goes to the service that holds the answer, and only for that lookup.',
              'Your preferences and history live in your browser. Clearing this site’s data in your browser removes all of it.',
              'Features that use AI run on the key and provider you choose, and we pass your request straight through.',
              'We do not keep a record of what you search. Your address is held only briefly, in memory, to keep usage fair for everyone.',
              'The site reaches you through Cloudflare, which carries the connection between your browser and our server, as it does for much of the web.',
            ].map(t => (
              <li key={t} className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--gold-light)]" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="device" title="What stays on your device"
          intro="These are kept in your browser’s own storage on this device. We never receive them unless a feature you use needs one, like your AI key for an OI request. Clearing this site’s data in your browser settings removes them all.">
          <div className="divide-y divide-[var(--border-primary)]/60 rounded-xl border border-[var(--border-primary)]">
            {STORED.map(s => (
              <div key={s.what} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6">
                <span className="text-[13px] font-medium sm:w-56 sm:flex-shrink-0">{s.what}</span>
                <span className="text-[13px] leading-relaxed text-[var(--text-muted)]">{s.detail}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="services" title="When we reach out to other services"
          intro="OSIRIS does not keep a database of intelligence of its own: it asks public services in real time. Here is what that involves, by what you are doing. Each service treats what it receives under its own privacy policy.">
          <div className="flex flex-col gap-3">
            <Flow icon={<MapIcon className="h-4 w-4" />} title="Opening the map"
              summary={<>
                So the map can open over your part of the world, our server asks an IP location service roughly where your
                connection is. It is a city-level guess, it is not stored, and if it cannot tell, the map opens on a
                well-covered city instead. The map itself (its tiles, the satellite view when you switch to it, and the
                typefaces) loads from the services that draw it, as with any website that shows a map.
              </>}
              services={[
                { name: 'ipapi.co, then freeipapi.com, then ip-api.com', what: 'your connection’s IP address, asked from our server, to place the map' },
                { name: 'CARTO (basemaps.cartocdn.com)', what: 'the map tiles for the part of the world in view' },
                { name: 'Esri (server.arcgisonline.com)', what: 'satellite imagery, only when you switch to the satellite view' },
                { name: 'Photon (photon.komoot.io)', what: 'what you type in the place search, and where the map is looking, asked from your browser' },
                { name: 'Google Fonts', what: 'the typefaces the site uses' },
              ]} />

            <Flow icon={<Search className="h-4 w-4" />} title="Looking something up"
              summary={<>
                The RECON tools answer by asking the public service that holds the answer, from our server. That service
                sees the email, domain, address or name you looked up, but not who you are. Two checks never leave our
                server at all: <span className="text-[var(--text-primary)]">phone numbers</span> are read with a library
                that runs here, and <span className="text-[var(--text-primary)]">sanctions searches</span> run against a
                copy of the published list we keep.
              </>}
              services={[
                { name: 'XposedOrNot', what: 'an email address, for breach checks' },
                { name: 'Hudson Rock', what: 'an email or domain, for infostealer checks' },
                { name: 'Shodan InternetDB, RIPE, RDAP, Google Public DNS, crt.sh', what: 'a host, address or domain, for infrastructure, ownership, DNS and certificate lookups' },
                { name: 'ip-api.com, Tor Project, AlienVault OTX', what: 'an IP address or indicator, for location and threat checks' },
                { name: 'CIRCL and MITRE', what: 'a CVE number, for vulnerability details' },
                { name: 'GitHub, and a dozen public profile sites', what: 'a username, to see where it is in use' },
                { name: 'maclookup.app', what: 'a hardware (MAC) address, for its maker' },
                { name: 'mempool.space, Blockscout, the public Solana network, CoinGecko', what: 'a wallet address, and prices to value it' },
              ]} />

            <Flow icon={<Camera className="h-4 w-4" />} title="Watching cameras and live alerts"
              summary={<>
                Camera pictures and streams come straight from whoever runs each camera (a road authority, a harbour, a
                city) or from the video service it uses, such as YouTube, which may set its own cookies when a video plays.
                A few alerts carry photos that load from Telegram when you open them, and the Live Clouds layer loads its
                imagery from NOAA while it is switched on. In each case the service sees an ordinary request from your
                browser, as for any picture on the web.
              </>} />

            <Flow icon={<Sparkles className="h-4 w-4" />} title="Using OI, on your own AI key"
              summary={<>
                OI runs on the AI provider and key you choose. When you start a prediction, talk to OI Assist or check your
                key, your request goes from our server to that provider: your question and any data you add for a
                prediction, or the conversation and what is on the map for Assist. The provider sees our server’s address,
                not yours. Your key is used for that request and nothing else.
              </>}
              services={[
                { name: 'The provider you choose', what: 'OpenAI, Anthropic, Google, OpenRouter, Groq, DeepSeek, xAI, Mistral, Alibaba Cloud or Cheaper Inference: your key and your request' },
                { name: 'News publishers’ feeds, GDELT, Wikipedia', what: 'a few keywords from your question, to find the reporting and background a prediction reads; the articles found are then read from their publishers' },
                { name: 'Yahoo Finance', what: 'the ticker of a price your question is about, for its price history and its news' },
                { name: 'Polymarket and Manifold', what: 'a few keywords from your question, to find what prediction markets price it at; and, for the suggestions on the ask form, nothing about you at all' },
                { name: 'Photon and Nominatim (OpenStreetMap)', what: 'a place name, when you search for one or OI looks one up' },
              ]}>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
                A prediction has its own link so it can be shared: anyone you give the link to can open it, and it is kept
                on our server for three hours after it finishes. The microphone in OI Assist uses your browser’s own
                speech recognition (in Chrome and Edge, a Google or Microsoft service); we only ever receive the words.
              </p>
            </Flow>

            <Flow icon={<Bot className="h-4 w-4" />} title="AI briefings and token scans"
              summary={<>
                The briefing, analysis and overview buttons send the feed headlines they summarise to Google Gemini, on this
                site’s own key. A DonBot token scan opens DigitalDon’s scanner in a sealed frame, which receives the token
                you scan.
              </>} />
          </div>
        </Section>

        <Section id="good-to-know" title="Good to know">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { t: 'A lookup is a question to someone else', b: 'The service that answers a lookup sees what was asked. If what you are researching is sensitive, keep that in mind before you search.' },
              { t: 'Shared links are open', b: 'Anyone with a prediction’s link can open it while it is kept. Share it with the people you mean to.' },
              { t: 'AI is a starting point', b: 'Briefings and predictions are written by language models. OI shows its sources so you can check them, and you should.' },
              { t: 'Scan only what you may', b: 'Scans are rate limited and kept away from private networks, but whether you may scan a system is between you and its owner.' },
            ].map(x => (
              <div key={x.t} className="rounded-xl border border-[var(--border-primary)] bg-white/[0.02] p-4">
                <h3 className="text-[13px] font-semibold">{x.t}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">{x.b}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="choices" title="Your choices">
          <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-[var(--text-muted)]">
            <li><span className="text-[var(--text-primary)]">Clear everything</span> by clearing this site’s data in your browser settings.</li>
            <li><span className="text-[var(--text-primary)]">Keep your AI key to one session</span> by leaving “Remember on this device” unticked; it is then forgotten when the tab closes.</li>
            <li><span className="text-[var(--text-primary)]">Use only what you need</span>: map layers, cameras and AI features reach out only when you switch them on or use them.</li>
            <li><span className="text-[var(--text-primary)]">Run your own copy</span>: OSIRIS is open source, so you can host it yourself and decide who operates it.</li>
          </ul>
        </Section>

        <Section id="contact" title="Questions?">
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            If something here is unclear, or you think we have missed something, tell us and we will put it right.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <a href="https://github.com/simplifaisoul/osiris/issues" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-primary)] px-3.5 py-2 text-[13px] hover:border-[var(--cyan-primary)] hover:text-[var(--cyan-primary)]">
              <ExternalLink className="h-4 w-4" /> Open an issue on GitHub
            </a>
            <a href="https://discord.gg/umBykEpb98" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-primary)] px-3.5 py-2 text-[13px] hover:border-[var(--cyan-primary)] hover:text-[var(--cyan-primary)]">
              <MessageCircle className="h-4 w-4" /> Ask on Discord
            </a>
          </div>
        </Section>

        <p className="mt-14 border-t border-[var(--border-primary)]/60 pt-5 text-[12px] text-[var(--text-muted)]">
          Last checked against the code on {REVIEWED}. When a feature changes what it shares, this page changes with it.
        </p>
      </div>
    </main>
  );
}
