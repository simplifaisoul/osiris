import type { Metadata, Viewport } from "next";
import ErrorBoundary from '@/components/ErrorBoundary';
import "./globals.css";

const SITE_URL = "https://osirisai.live";
const SITE_NAME = "OSIRIS";
const SITE_TITLE = "OSIRIS — Платформа разведки по открытым источникам | Онлайн-трекинг рейсов, камеры CCTV, OSINT-инструменты и многое другое";
const SITE_DESCRIPTION = "Открытая альтернатива Palantir. Отслеживайте более 10 000 самолётов, 2 000 спутников и камеры видеонаблюдения по всему миру в реальном времени на 3D-глобусе. Сканирование портов (Nmap), DNS-запросы, WHOIS, анализ SSL-сертификатов и разведка угроз — прямо в браузере. Более 20 живых лент данных: землетрясения, лесные пожары, ядерные объекты, киберугрозы и глобальные конфликты. Бесплатно и с открытым исходным кодом.";

export const viewport: Viewport = {
  themeColor: "#D4AF37",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | OSIRIS Intelligence",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    // OSINT Tools - Primary focus
    "OSINT tools", "free OSINT tools", "online OSINT toolkit", "OSINT framework",
    "nmap online", "nmap scanner online", "free nmap scan", "port scanner online",
    "DNS lookup tool", "WHOIS lookup", "reverse DNS", "DNS records",
    "SSL certificate checker", "certificate transparency", "cert lookup",
    "BGP routing lookup", "ASN lookup", "IP geolocation",
    "threat intelligence", "threat intel lookup", "IP reputation check",
    "network reconnaissance", "recon tools", "penetration testing tools",
    "cybersecurity tools", "infosec tools", "security scanner",
    "linux OSINT tools", "kali linux tools online", "OSINT browser tools",
    
    // Intelligence Platform
    "OSINT", "open source intelligence", "intelligence platform", "global intelligence",
    "geospatial intelligence", "GEOINT", "SIGINT", "real-time tracking",
    "palantir alternative", "open source palantir", "intelligence dashboard",
    
    // Tracking & Data
    "flight tracker", "aircraft tracking", "ADS-B tracker", "live flight radar",
    "satellite tracking", "ISS tracker", "space station tracker",
    "CCTV cameras live", "security cameras worldwide", "live cameras",
    "earthquake monitor", "seismic activity", "USGS earthquake",
    "wildfire tracker", "NASA FIRMS", "active fires",
    "nuclear facilities map", "nuclear power plants",
    "severe weather alerts", "weather radar",
    "cyber threats dashboard", "CVE tracker",
    "space weather", "solar storm", "GPS jamming",
    "defense stocks", "commodities tracker",
    
    // Brand
    "osiris", "osirisai", "osirisai.live",
  ],
  authors: [{ name: "Osiris Project", url: SITE_URL }],
  creator: "Osiris Project",
  publisher: "Osiris Project",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/android-chrome-512x512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
    ],
    shortcut: "/favicon.ico",
    other: [
      {
        rel: "apple-touch-icon-precomposed",
        url: "/apple-touch-icon.png",
      },
    ],
  },
  manifest: "/site.webmanifest",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "OSIRIS — Открытая альтернатива Palantir | Рейсы, CCTV, спутники и OSINT-инструменты онлайн",
    description: "Более 10 тыс. самолётов, 2 тыс. спутников и камеры CCTV на 3D-глобусе. Nmap, DNS, WHOIS и разведка угроз прямо в браузере. 20+ живых разведывательных лент. Бесплатно. Открытый код.",
    type: "website",
    siteName: SITE_NAME,
    locale: "ru_RU",
    url: SITE_URL,
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "OSIRIS — платформа разведки по открытым источникам с онлайн-трекингом и OSINT-инструментами",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "🛰️ OSIRIS — Открытая альтернатива Palantir | Онлайн-трекинг + OSINT-инструменты",
    description: "Более 10 тыс. рейсов, спутники и CCTV по всему миру. Nmap, DNS и WHOIS прямо в браузере. 20+ живых лент разведки. Бесплатно и с открытым кодом.",
    creator: "@simplifaisoul",
    site: "@simplifaisoul",
    images: [`${SITE_URL}/og-image.png`],
  },
  category: "technology",
  classification: "Intelligence & Security",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "OSIRIS",
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#06060C",
    "msapplication-config": "none",
  },
};

// JSON-LD Structured Data
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "OSIRIS — Набор OSINT-инструментов и разведывательная платформа",
  alternateName: ["OSIRIS", "OsirisAI", "Osiris OSINT"],
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "SecurityApplication",
  operatingSystem: "Веб",
  browserRequirements: "Требуется современный веб-браузер",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
  featureList: [
    "Nmap port scanning from the browser — no install required",
    "DNS record lookup (A, AAAA, MX, NS, TXT, CNAME)",
    "WHOIS domain registration lookup",
    "SSL/TLS certificate transparency search",
    "BGP routing & ASN lookup",
    "IP geolocation & threat intelligence",
    "Real-time flight tracking (10,000+ aircraft via ADS-B)",
    "Satellite tracking (2,000+ objects including ISS)",
    "Worldwide CCTV camera monitoring (1,400+ feeds)",
    "Earthquake monitoring (USGS live feed)",
    "Wildfire detection (NASA FIRMS satellite data)",
    "Nuclear facility mapping (worldwide)",
    "Severe weather alerts & tracking",
    "Cyber threat & CVE intelligence",
    "Space weather & solar storm monitoring",
    "GPS jamming detection",
    "Defense & commodity market tracking",
    "SIGINT news aggregation feed",
    "Interactive 3D globe with day/night cycle",
    "Region intelligence dossier reports",
  ],
  screenshot: `${SITE_URL}/og-image.png`,
  author: {
    "@type": "Organization",
    name: "Osiris Project",
    url: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" dir="ltr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="canonical" href={SITE_URL} />
        
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

      </head>
      <body className="antialiased">
        <ErrorBoundary name="OSIRIS Core">
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
