
import { NextResponse } from 'next/server';

/**
 * OSIRIS — Live News Feeds v3
 * embed_allowed: true  → can be iframed directly (YouTube allows it for these channels)
 * embed_allowed: false → YouTube/broadcaster blocks embedding; open externally instead
 *
 * Tested against X-Frame-Options and YouTube's embed restrictions.
 * Channels that show "Video unavailable" or refuse iframe are marked false.
 */

const LIVE_FEEDS = [
  // ── North America ──
  // NBC/CBS/ABC/Bloomberg block YouTube embeds for their live streams
  { id: 'nbcnews',   name: 'NBC News NOW',  city: 'New York',      country: 'US', lat: 40.759, lng: -73.980, url: 'https://www.youtube.com/channel/UCeY0bbntWzzVIaj2z3QigXg/live', embed_allowed: false, category: 'mainstream', language: 'en' },
  { id: 'cbsnews',   name: 'CBS News 24/7', city: 'New York',      country: 'US', lat: 40.764, lng: -73.973, url: 'https://www.youtube.com/channel/UC8p1vwvWtl6T73JiExfWs1g/live', embed_allowed: false, category: 'mainstream', language: 'en' },
  { id: 'abcnews',   name: 'ABC News Live', city: 'New York',      country: 'US', lat: 40.763, lng: -73.979, url: 'https://www.youtube.com/channel/UCBi2mrWuNuyYy4gbM6fU18Q/live', embed_allowed: false, category: 'mainstream', language: 'en' },
  { id: 'bloomberg', name: 'Bloomberg TV',  city: 'New York',      country: 'US', lat: 40.756, lng: -73.988, url: 'https://www.youtube.com/channel/UC_vQ72b7v5n2938v9d5c80w/live', embed_allowed: false, category: 'finance',    language: 'en' },
  { id: 'cspan',     name: 'C-SPAN',        city: 'Washington DC', country: 'US', lat: 38.897, lng: -77.036, url: 'https://www.youtube.com/channel/UCb--64Gl51jIEVE-GLDAVTg/live',  embed_allowed: false, category: 'government', language: 'en' },
  { id: 'cbc',       name: 'CBC News',      city: 'Toronto',       country: 'CA', lat: 43.644, lng: -79.387, url: 'https://www.youtube.com/channel/UCKy1dAqELon0zgzZPOz9SVw/live',  embed_allowed: false, category: 'mainstream', language: 'en' },

  // ── Europe — generally embed-friendly ──
  { id: 'skynews',   name: 'Sky News',      city: 'London', country: 'GB', lat: 51.500, lng:  -0.118, url: 'https://www.youtube.com/embed/live_stream?channel=UCoMdktPbSTixAyNGwb-UYkQ&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
  { id: 'france24en',name: 'France 24 EN',  city: 'Paris',  country: 'FR', lat: 48.830, lng:   2.280, url: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAEFg&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
  { id: 'dwnews',    name: 'DW News',       city: 'Berlin', country: 'DE', lat: 52.508, lng:  13.376, url: 'https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRaCZg&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
  { id: 'euronews',  name: 'Euronews',      city: 'Lyon',   country: 'FR', lat: 45.764, lng:   4.836, url: 'https://www.youtube.com/embed/live_stream?channel=UCtUbOIRGKZkW7555n6x6q6g&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
  { id: 'trtworld',  name: 'TRT World',     city: 'Istanbul',country:'TR', lat: 41.008, lng:  28.978, url: 'https://www.youtube.com/embed/live_stream?channel=UC7fWeaHZQg1p9-4v98L1D1A&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
  { id: 'ukrinform', name: 'UKRINFORM',     city: 'Kyiv',   country: 'UA', lat: 50.450, lng:  30.523, url: 'https://www.youtube.com/embed/live_stream?channel=UCaDkCK6iFHPE0lmpaYL-WxQ&autoplay=1&mute=1', embed_allowed: true, category: 'conflict',  language: 'en' },

  // ── Middle East / Africa ──
  { id: 'aljazeera', name: 'Al Jazeera EN', city: 'Doha',           country: 'QA', lat: 25.286, lng:  51.534, url: 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'en' },
  { id: 'almayadeen',name: 'Al Mayadeen',   city: 'Beirut',         country: 'LB', lat: 33.888, lng:  35.495, url: 'https://www.youtube.com/embed/live_stream?channel=UCZCFHCU-2eGF7V5ciMkoPHw&autoplay=1&mute=1', embed_allowed: true,  category: 'conflict',   language: 'ar' },
  { id: 'lbcilebanon',name:'LBCI Lebanon',  city: 'Beirut',         country: 'LB', lat: 33.893, lng:  35.501, url: 'https://www.youtube.com/embed/live_stream?channel=UCpE6gpKewomi17XDyPfpFjA&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'ar' },
  { id: 'africanews', name: 'Africanews',   city: 'Pointe-Noire',   country: 'CG', lat: -4.778, lng:  11.865, url: 'https://www.youtube.com/embed/live_stream?channel=UC5T2fB_W0Z31T0c8yN36a8A&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'en' },
  { id: 'sabcnews',   name: 'SABC News',    city: 'Johannesburg',   country: 'ZA', lat:-26.204, lng:  28.047, url: 'https://www.youtube.com/embed/live_stream?channel=UC8yH-uI81UUtEMDsowQyx1g&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'en' },

  // ── Asia Pacific ──
  { id: 'nhkworld', name: 'NHK World',    city: 'Tokyo',     country: 'JP', lat: 35.690, lng: 139.692, url: 'https://www.youtube.com/embed/live_stream?channel=UCSPEjw8F2nQDtmUKPFNF7_A&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'en' },
  { id: 'cna',      name: 'CNA 24/7',    city: 'Singapore', country: 'SG', lat:  1.290, lng: 103.852, url: 'https://www.youtube.com/embed/live_stream?channel=UC83jt4dlz1Gjl58fzQrrKZg&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'en' },
  { id: 'wion',     name: 'WION',        city: 'New Delhi', country: 'IN', lat: 28.614, lng:  77.209, url: 'https://www.youtube.com/embed/live_stream?channel=UC_gUM8rL-Lrg6O3adPW9K1g&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'en' },
  { id: 'abcau',    name: 'ABC Australia',city: 'Sydney',    country: 'AU', lat:-33.867, lng: 151.207, url: 'https://www.youtube.com/embed/live_stream?channel=UC5iLnYoF4Ryb63YdGD9RfWQ&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'en' },
  { id: 'arirang',  name: 'Arirang TV',  city: 'Seoul',     country: 'KR', lat: 37.566, lng: 126.978, url: 'https://www.youtube.com/embed/live_stream?channel=UCw9-5Y1CjW7Qy1Yf5q1y2-Q&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'en' },
  // CGTN blocks embeds from non-Chinese IPs often
  { id: 'cgtn',     name: 'CGTN',        city: 'Beijing',   country: 'CN', lat: 39.904, lng: 116.407, url: 'https://www.youtube.com/channel/UCgrNz-aDmcr2uuto8_DL2jg/live',                                embed_allowed: false, category: 'state',      language: 'en' },

  // ── Latin America / State ──
  { id: 'telesur', name: 'teleSUR EN', city: 'Caracas', country: 'VE', lat: 10.491, lng: -66.902, url: 'https://www.youtube.com/embed/live_stream?channel=UCmuTmpLY35O3csvhyA6vrkg&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'en' },
  // RT is blocked/removed from YouTube in many regions — external link only
  { id: 'rt',      name: 'RT News',    city: 'Moscow',  country: 'RU', lat: 55.755, lng:  37.617, url: 'https://rumble.com/c/RTNewsEN',                                                                  embed_allowed: false, category: 'state',      language: 'en' },
];

export async function GET() {
  return NextResponse.json({
    feeds: LIVE_FEEDS,
    total: LIVE_FEEDS.length,
    categories: ['mainstream', 'government', 'finance', 'conflict', 'state'],
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800' },
  });
}

