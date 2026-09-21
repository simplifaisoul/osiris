import { NextResponse } from 'next/server';
import { ATTRIBUTION, nominatim } from '@/lib/nominatim';

/**
 * OSIRIS — Region Dossier API
 * Provides country intelligence for any coordinate (right-click on map)
 * Fix #115: Steps 2-4 now run in parallel via Promise.allSettled
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '0');
  const lng = parseFloat(searchParams.get('lng') || '0');

  try {
    /* Step 1: Reverse geocode to get country (must complete first — other steps depend on it).
       Through lib/nominatim.ts, which holds one budget and one cache for the whole
       app, and rounded to the degree: a dossier is about a country, so neighbouring
       right-clicks should not each cost a request. */
    const geoData = await nominatim<{ address?: Record<string, string>; display_name?: string }>('reverse', {
      lat: Math.round(lat).toString(),
      lon: Math.round(lng).toString(),
      zoom: '5',
      addressdetails: '1',
    });

    let countryName = '';
    let countryCode = '';
    let locationInfo: any = {};

    if (geoData) {
      const addr = geoData.address || {};
      countryName = addr.country || '';
      countryCode = addr.country_code?.toUpperCase() || '';
      locationInfo = {
        city: addr.city || addr.town || addr.village || '',
        state: addr.state || addr.region || '',
        country: countryName,
        country_code: countryCode,
        display_name: geoData.display_name,
      };
    }

    // Steps 2-3: Run in PARALLEL after geocode
    const [wikiResult, wdResult] = await Promise.allSettled([

      // Step 2: Fetch Wikipedia summary
      (async () => {
        const wikiQuery = locationInfo.city || countryName;
        if (!wikiQuery) return null;
        try {
          const res = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiQuery)}`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (res.ok) {
            const wiki = await res.json();
            return {
              title: wiki.title,
              extract: wiki.extract?.substring(0, 500),
              thumbnail: wiki.thumbnail?.source,
            };
          }
        } catch (e) { console.warn('[OSIRIS] Wikipedia fetch error:', e instanceof Error ? e.message : e); }
        return null;
      })(),

      // Step 3: Fetch all country info & head of state from Wikidata SPARQL
      (async () => {
        if (!countryName) return null;
        try {
          const safe = countryName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          const sparql = `
          SELECT ?leaderLabel ?positionLabel ?population ?area ?capitalLabel ?regionLabel ?flagUrl (GROUP_CONCAT(DISTINCT ?langLabel; separator=", ") AS ?languages) (GROUP_CONCAT(DISTINCT ?currLabel; separator=", ") AS ?currencies)
          WHERE { 
            ?country wdt:P31/wdt:P279* wd:Q6256; 
                     rdfs:label "${safe}"@en. 
            OPTIONAL { 
              ?country wdt:P6 ?leader. 
              OPTIONAL { ?leader wdt:P39 ?position. }
            }
            OPTIONAL { ?country wdt:P1082 ?population. } 
            OPTIONAL { ?country wdt:P2046 ?area. } 
            OPTIONAL { ?country wdt:P36 ?capital. } 
            OPTIONAL { ?country wdt:P30 ?region. } 
            OPTIONAL { ?country wdt:P37 ?lang. } 
            OPTIONAL { ?country wdt:P38 ?curr. } 
            OPTIONAL { ?country wdt:P41 ?flagUrl. } 
            SERVICE wikibase:label { 
              bd:serviceParam wikibase:language "en". 
              ?leader rdfs:label ?leaderLabel.
              ?position rdfs:label ?positionLabel.
              ?capital rdfs:label ?capitalLabel. 
              ?region rdfs:label ?regionLabel. 
              ?lang rdfs:label ?langLabel. 
              ?curr rdfs:label ?currLabel. 
            } 
          } 
          GROUP BY ?leaderLabel ?positionLabel ?population ?area ?capitalLabel ?regionLabel ?flagUrl
          LIMIT 1`;
          
          const res = await fetch(
            `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`,
            {
              signal: AbortSignal.timeout(6000),
              headers: { 'User-Agent': 'OsirisIntelPlatform/1.0', 'Accept': 'application/json' },
            }
          );
          if (res.ok) {
            const wd = await res.json();
            return wd.results?.bindings?.[0] || null;
          }
        } catch (e) { console.warn('[OSIRIS] Wikidata fetch error:', e instanceof Error ? e.message : e); }
        return null;
      })(),
    ]);

    const wikiSummary = wikiResult.status === 'fulfilled' ? wikiResult.value : null;
    const wdData      = wdResult.status   === 'fulfilled' ? wdResult.value   : null;

    let countryData = null;
    let headOfState = null;

    if (wdData) {
      headOfState = wdData.leaderLabel ? {
        name: wdData.leaderLabel.value,
        position: wdData.positionLabel?.value || 'Head of State',
      } : null;

      countryData = {
        name: countryName,
        official_name: countryName,
        capital: wdData.capitalLabel?.value,
        population: wdData.population?.value ? parseInt(wdData.population.value, 10) : undefined,
        area: wdData.area?.value ? parseFloat(wdData.area.value) : undefined,
        region: wdData.regionLabel?.value,
        subregion: wdData.regionLabel?.value,
        languages: wdData.languages?.value ? wdData.languages.value.split(', ') : [],
        currencies: wdData.currencies?.value ? wdData.currencies.value.split(', ') : [],
        flag_url: wdData.flagUrl?.value,
        timezones: [],
      };
    }

    return NextResponse.json({
      coordinates: { lat, lng },
      location: locationInfo,
      country: countryData,
      head_of_state: headOfState,
      wikipedia: wikiSummary,
      /** The place this dossier is about was named by OpenStreetMap. */
      attribution: ATTRIBUTION,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error) {
    console.error('Region dossier error:', error);
    return NextResponse.json({ error: 'Failed to fetch region data' }, { status: 500 });
  }
}
