
import { NextResponse } from 'next/server';

/**
 * OSIRIS — Severe Weather & Anomalies API
 * Fetches active natural events from NASA EONET (Earth Observatory Natural Event Tracker)
 * Tracks: Severe Storms (Hurricanes/Typhoons), Volcanoes, Sea Ice
 */

export async function GET() {
  try {
    // Fetch currently open events from EONET v3
    const res = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100', {
      signal: AbortSignal.timeout(10000), // Cache for 30 minutes (events don't change by the second)
    });

    if (!res.ok) throw new Error(`NASA EONET API returned ${res.status}`);

    const data = await res.json();
    const events = [];

    for (const event of data.events || []) {
      // Get the most recent geometry point
      const geom = event.geometry && event.geometry.length > 0 ? event.geometry[event.geometry.length - 1] : null;
      if (!geom || geom.type !== 'Point') continue; // Skip polygons for now

      const category = event.categories?.[0]?.id || 'unknown';
      
      // We already track wildfires via FIRMS, so we skip EONET wildfires
      if (category === 'wildfires') continue;

      let typeLabel = 'Event';
      let icon = 'alert';
      let severity = 'low';

      if (category === 'severeStorms') {
        typeLabel = 'Severe Storm';
        icon = 'cyclone';
        severity = 'high';
      } else if (category === 'volcanoes') {
        typeLabel = 'Volcano Eruption';
        icon = 'volcano';
        severity = 'high';
      } else if (category === 'seaIce') {
        typeLabel = 'Iceberg / Sea Ice';
        icon = 'ice';
        severity = 'medium';
      } else if (category === 'earthquakes') {
        continue; // Handled by USGS
      } else {
        typeLabel = event.categories?.[0]?.title || 'Anomaly';
      }

      events.push({
        id: event.id,
        title: event.title,
        category: category,
        type: typeLabel,
        icon: icon,
        severity: severity,
        lat: geom.coordinates[1],
        lng: geom.coordinates[0],
        date: geom.date,
        source: event.sources?.[0]?.url || 'NASA EONET',
      });
    }

    return NextResponse.json({
      events,
      total: events.length,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Weather API error:', error);
    return NextResponse.json({ events: [], error: 'Failed to fetch NASA EONET data' }, { status: 500 });
  }
}

