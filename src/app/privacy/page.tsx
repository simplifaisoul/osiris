import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Data & Privacy',
  description:
    'What the hosted OSIRIS instance sends to third parties, when it does so, and what that means for the confidentiality of an investigation.',
  alternates: { canonical: '/privacy' },
};

/**
 * Every claim on this page is drawn from the code in this repository, not from
 * a template. When a data flow changes, this page changes with it.
 *
 * Reviewed 2026-09-17 against: src/app/api/geo, src/app/api/osint/*,
 * src/app/api/ai/*, src/app/page.tsx, src/components/LiveAlerts.tsx.
 * DigitalDon row added with src/components/DigitalDonWidget.tsx and
 * src/lib/digitaldon.ts.
 */

const SERVICES: { service: string; sent: string; when: string }[] = [
  { service: 'ipapi.co, freeipapi.com, ip-api.com', sent: 'Your apparent IP address', when: 'Three seconds after the dashboard loads, to centre the map near you' },
  { service: 'api.xposedornot.com', sent: 'The email address you search', when: 'Breach lookups' },
  { service: 'cavalier.hudsonrock.com', sent: 'The email or domain you search', when: 'Infostealer lookups' },
  { service: 'internetdb.shodan.io, stat.ripe.net, rdap.org, dns.google', sent: 'The host, IP or domain you search', when: 'Infrastructure lookups' },
  { service: 'crt.sh', sent: 'The domain you search', when: 'Certificate transparency lookups' },
  { service: 'api.github.com', sent: 'The username you search', when: 'GitHub account lookups' },
  { service: 'otx.alienvault.com, cve.circl.lu, cveawg.mitre.org', sent: 'The indicator or CVE you search', when: 'Threat and vulnerability lookups' },
  { service: 'Google Gemini', sent: 'The feed context you submit for analysis, including Live Alerts headlines', when: 'AI briefing, analysis and overview requests, when the instance has a Gemini key' },
  { service: 'Telegram (cdn*.telesco.pe)', sent: 'Your IP address, as with any image request', when: 'When you expand a Live Alert that has a photo or video preview' },
  { service: 'widget.digitaldon.net (and, from inside its frame, api.dexscreener.com, api.geckoterminal.com, api.digitaldon.net)', sent: 'The token address or ticker you search, this site\'s hostname, and your IP address. The widget counts anonymous usage per site with a random id it keeps in its own frame; no cookie', when: 'Only after you open Markets → Crypto → DeFi, or run a RECON Token Scan' },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-[11px] font-mono tracking-widest text-[var(--text-muted)] hover:text-[var(--cyan-primary)]">
          ← OSIRIS
        </Link>

        <h1 className="mt-6 text-2xl font-bold tracking-wide">Data &amp; Privacy</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
          OSIRIS is a front end over public data sources. It does not hold an intelligence
          database of its own: nearly every panel answers by querying somebody else&apos;s service
          in real time. That has a consequence worth stating plainly, because it is easy to miss.
        </p>

        <section className="mt-8 rounded-lg border border-[var(--alert-orange)]/30 bg-[var(--alert-orange)]/5 p-4">
          <h2 className="text-sm font-bold tracking-widest text-[var(--alert-orange)]">
            YOUR QUERY LEAVES THIS INSTANCE
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            When you look up an email address, domain or IP, that value is forwarded to the
            upstream provider that answers the lookup. The provider sees what you searched for,
            and the search itself can reveal what you are investigating. Self-hosting OSIRIS
            changes who operates the front end — it does not stop these outbound queries. If the
            subject of an investigation is sensitive, treat every lookup as disclosed to the
            provider listed below.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-bold tracking-widest">AUTOMATIC IP GEOLOCATION</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Three seconds after the dashboard loads, the browser calls <code>/api/geo</code>. The
            server reads your apparent IP address from the usual proxy headers and asks an external
            geolocation provider where it is, so the map can open near you rather than on the middle
            of the Atlantic. Interacting with the page before that — a click, a key press — cancels
            the request and the map stays where it is. Nothing about the result is written to your
            account, because there are no accounts.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-bold tracking-widest">WHERE DATA GOES</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border-primary)]">
                  <th className="py-2 pr-4 font-medium">Service</th>
                  <th className="py-2 pr-4 font-medium">What is sent</th>
                  <th className="py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {SERVICES.map(row => (
                  <tr key={row.service} className="border-b border-[var(--border-primary)]/40 align-top">
                    <td className="py-2 pr-4 font-mono text-[11px] text-[var(--cyan-primary)]">{row.service}</td>
                    <td className="py-2 pr-4 text-[var(--text-muted)]">{row.sent}</td>
                    <td className="py-2 text-[var(--text-muted)]">{row.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
            Each service applies its own privacy policy and retention to what it receives. OSIRIS
            does not control, and cannot undo, what an upstream provider keeps.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-bold tracking-widest">AI FEATURES</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Briefings and correlation are produced by Google Gemini from the feed context the
            request carries. Do not paste confidential source material into them. A briefing is a
            language model&apos;s summary of its input: fluent prose is not verification, and the
            claims inside still need checking against the underlying feeds.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-bold tracking-widest">SCANNING</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Active scans are rate limited, restricted to a safe subset, and blocked against private
            and reserved address space. That is a safety floor, not permission: scanning
            infrastructure you are not authorised to test may be unlawful where you or the target
            are located, and authorisation remains yours to obtain.
          </p>
        </section>

        <p className="mt-10 text-[11px] text-[var(--text-muted)]">
          Last reviewed against the codebase: 17 September 2026.
        </p>
      </div>
    </main>
  );
}
