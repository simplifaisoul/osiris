
import { NextResponse } from 'next/server';

/**
 * OSIRIS — News Intelligence API
 * Aggregates RSS feeds from major international sources
 * Risk scoring and geo-coordinate mapping
 */

const FEEDS: Record<string, string> = {
  BBC: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  AlJazeera: 'https://www.aljazeera.com/xml/rss/all.xml',
  NPR: 'https://feeds.npr.org/1004/rss.xml',
  GDACS: 'https://www.gdacs.org/xml/rss.xml',
  NHK: 'https://www3.nhk.or.jp/nhkworld/rss/world.xml',
  BBCEurope: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml',
  Dnevnik: 'https://www.dnevnik.bg/rss/',
  Actualno: 'https://www.actualno.com/rss/actualno.xml',
  Mediapool: 'https://www.mediapool.bg/rss/',
};

const BG_NEWS_SOURCES = new Set(['Dnevnik', 'Actualno', 'Mediapool']);

const SOFIA_COORDS: [number, number] = [42.698, 25.485];

const RSS_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; OSIRIS/1.0; +https://github.com/simplifaisoul/osiris)',
  Accept: 'application/rss+xml, application/xml, text/xml, */*',
};

const RISK_KEYWORDS = ['war','missile','strike','attack','crisis','tension','military','conflict','defense','clash','nuclear','invasion','bomb','drone','weapon','sanctions','ceasefire','escalation'];

const KEYWORD_COORDS: Record<string, [number, number]> = {
  'ukraine': [49.487, 31.272], 'kyiv': [50.450, 30.523], 'russia': [61.524, 105.318],
  'moscow': [55.755, 37.617], 'israel': [31.046, 34.851], 'gaza': [31.416, 34.333],
  'iran': [32.427, 53.688], 'lebanon': [33.854, 35.862], 'syria': [34.802, 38.996],
  'yemen': [15.552, 48.516], 'china': [35.861, 104.195], 'taiwan': [23.697, 120.960],
  'north korea': [40.339, 127.510], 'south korea': [35.907, 127.766],
  'japan': [36.204, 138.252], 'afghanistan': [33.939, 67.709], 'pakistan': [30.375, 69.345],
  'india': [20.593, 78.962], 'sudan': [12.862, 30.217], 'nigeria': [9.082, 8.675],
  'egypt': [26.820, 30.802], 'libya': [26.335, 17.228], 'somalia': [5.152, 46.199],
  'ethiopia': [9.145, 40.489], 'venezuela': [7.119, -66.589], 'mexico': [23.634, -102.552],
  'united states': [38.907, -77.036], 'washington': [38.907, -77.036],
  'europe': [48.800, 2.300], 'middle east': [31.500, 34.800],
  'africa': [0.000, 25.000], 'asia': [34.000, 100.000],
  'south china sea': [15.000, 115.000], 'red sea': [20.000, 38.500],
  'persian gulf': [26.500, 51.500], 'strait of hormuz': [26.600, 56.300],
  'black sea': [43.500, 34.000], 'arctic': [75.000, 0.000],
  // Balkans
  'bulgaria': [42.698, 25.485], 'sofia': [42.698, 25.485],
  'plovdiv': [42.136, 24.745], 'varna': [43.214, 27.915],
  'burgas': [42.504, 27.462], 'ruse': [43.835, 25.965],
  'balkans': [42.000, 22.000], 'greece': [39.074, 21.824],
  'serbia': [44.016, 21.005], 'romania': [45.943, 24.967],
  'turkey': [39.000, 35.000],
};

function scoreRisk(title: string, summary: string): number {
  const text = (title + ' ' + summary).toLowerCase();
  let score = 1;
  for (const kw of RISK_KEYWORDS) {
    if (text.includes(kw)) score += 2;
  }
  return Math.min(10, score);
}

function findCoords(text: string): [number, number] | null {
  const lower = text.toLowerCase();
  for (const [keyword, coords] of Object.entries(KEYWORD_COORDS)) {
    if (lower.includes(keyword)) return coords;
  }
  return null;
}

// generateAssessment() REMOVED — was fabricating fake probabilistic threat
// percentages using Math.random(). See Issue #116.
// The risk_score field (from scoreRisk()) is deterministic and retained.

// Simple XML parsing for RSS (no external dependency needed in serverless)
function parseRSSItems(xml: string): any[] {
  const items: any[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const getTag = (tag: string) => {
      const m = itemXml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return (m?.[1] || m?.[2] || '').trim();
    };

    items.push({
      title: getTag('title').replace(/<[^>]+>/g, ''),
      link: getTag('link'),
      pubDate: getTag('pubDate'),
      description: getTag('description').replace(/<[^>]+>/g, '').substring(0, 200),
    });
  }
  return items;
}

export async function GET() {
  try {
    // Fetch all feeds in parallel
    const feedPromises = Object.entries(FEEDS).map(async ([source, url]) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: RSS_FETCH_HEADERS });
        if (!res.ok) return [];
        const xml = await res.text();
        const items = parseRSSItems(xml);
        return items.slice(0, 5).map(item => ({ ...item, source }));
      } catch {
        return [];
      }
    });

    const feedResults = await Promise.allSettled(feedPromises);
    const allArticles: any[] = [];

    for (const result of feedResults) {
      if (result.status === 'fulfilled') {
        allArticles.push(...result.value);
      }
    }

    // Score, classify, and sort
    const newsItems = allArticles.map(article => {
      const riskScore = scoreRisk(article.title, article.description || '');
      const keywordCoords = findCoords(article.title + ' ' + (article.description || ''));
      const coords = keywordCoords ?? (BG_NEWS_SOURCES.has(article.source) ? SOFIA_COORDS : null);

      return {
        title: article.title,
        link: article.link,
        published: article.pubDate,
        source: article.source,
        risk_score: riskScore,
        coords: coords ? [coords[0], coords[1]] : null,
        coords_default: !keywordCoords && BG_NEWS_SOURCES.has(article.source),
        machine_assessment: null,
      };
    });

    // Sort by risk score descending
    newsItems.sort((a, b) => b.risk_score - a.risk_score);

    return NextResponse.json({
      news: newsItems,
      total: newsItems.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('News fetch error:', error);
    return NextResponse.json({ news: [], error: 'Failed to fetch news' }, { status: 500 });
  }
}

