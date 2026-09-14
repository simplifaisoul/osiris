import { NextResponse } from 'next/server';

// Country Intelligence Index — composite risk from earthquakes, conflicts, instability
// Inspired by WorldMonitor's 12-signal risk scoring
const RISK_FACTORS: Record<string, { base: number; tags: string[] }> = {
  UA: { base: 85, tags: ['active_conflict', 'infrastructure_damage'] },
  RU: { base: 72, tags: ['sanctions', 'military_mobilization'] },
  IL: { base: 78, tags: ['active_conflict', 'regional_instability'] },
  PS: { base: 90, tags: ['active_conflict', 'humanitarian_crisis'] },
  SY: { base: 82, tags: ['post_conflict', 'infrastructure_damage'] },
  YE: { base: 88, tags: ['active_conflict', 'humanitarian_crisis'] },
  MM: { base: 76, tags: ['civil_unrest', 'military_junta'] },
  SD: { base: 84, tags: ['active_conflict', 'humanitarian_crisis'] },
  AF: { base: 80, tags: ['post_conflict', 'governance_collapse'] },
  KP: { base: 70, tags: ['nuclear_risk', 'isolation'] },
  IR: { base: 68, tags: ['sanctions', 'nuclear_program', 'regional_proxy'] },
  CN: { base: 35, tags: ['strategic_competition', 'taiwan_tensions'] },
  TW: { base: 45, tags: ['invasion_risk', 'semiconductor_dependency'] },
  VE: { base: 60, tags: ['economic_collapse', 'political_instability'] },
  HT: { base: 85, tags: ['gang_violence', 'governance_collapse'] },
  LB: { base: 65, tags: ['economic_crisis', 'political_deadlock'] },
  PK: { base: 55, tags: ['terrorism', 'political_instability'] },
  SO: { base: 82, tags: ['terrorism', 'state_fragility'] },
  LY: { base: 72, tags: ['divided_government', 'militia_control'] },
  ET: { base: 62, tags: ['ethnic_tensions', 'regional_conflicts'] },
};

// Major stock exchange status
const EXCHANGES = [
  { name: 'NYSE', tz: 'America/New_York', open: 9.5, close: 16, country: 'US' },
  { name: 'NASDAQ', tz: 'America/New_York', open: 9.5, close: 16, country: 'US' },
  { name: 'LSE', tz: 'Europe/London', open: 8, close: 16.5, country: 'GB' },
  { name: 'TSE', tz: 'Asia/Tokyo', open: 9, close: 15, country: 'JP' },
  { name: 'SSE', tz: 'Asia/Shanghai', open: 9.5, close: 15, country: 'CN' },
  { name: 'HKEX', tz: 'Asia/Hong_Kong', open: 9.5, close: 16, country: 'HK' },
  { name: 'BSE', tz: 'Asia/Kolkata', open: 9.25, close: 15.5, country: 'IN' },
  { name: 'FRA', tz: 'Europe/Berlin', open: 8, close: 20, country: 'DE' },
  { name: 'TSX', tz: 'America/Toronto', open: 9.5, close: 16, country: 'CA' },
  { name: 'ASX', tz: 'Australia/Sydney', open: 10, close: 16, country: 'AU' },
  { name: 'KRX', tz: 'Asia/Seoul', open: 9, close: 15.5, country: 'KR' },
  { name: 'MOEX', tz: 'Europe/Moscow', open: 10, close: 18.5, country: 'RU' },
];

function isExchangeOpen(ex: typeof EXCHANGES[0]): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: ex.tz, hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short',
    });
    const parts = formatter.formatToParts(now);
    const weekday = parts.find(p => p.type === 'weekday')?.value || '';
    if (['Sat', 'Sun'].includes(weekday)) return false;
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const decimal = hour + minute / 60;
    return decimal >= ex.open && decimal < ex.close;
  } catch { return false; }
}

export async function GET() {
  try {
    const exchangeStatus = EXCHANGES.map(ex => ({
      name: ex.name, country: ex.country, open: isExchangeOpen(ex),
    }));

    // Enrich risk with live earthquake proximity
    const quakeRisks: Record<string, number> = {};
    try {
      const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson', {  });
      if (res.ok) {
        const data = await res.json();
        // Count significant quakes per rough region
        for (const f of data.features || []) {
          const place = f.properties?.place || '';
          const mag = f.properties?.mag || 0;
          // Extract country-ish context from place name
          for (const [code, _] of Object.entries(RISK_FACTORS)) {
            if (place.toLowerCase().includes(code.toLowerCase())) {
              quakeRisks[code] = (quakeRisks[code] || 0) + mag;
            }
          }
        }
      }
    } catch (e) { console.warn('[OSIRIS] Suppressed error:', e instanceof Error ? e.message : e); }

    const countries = Object.entries(RISK_FACTORS).map(([code, data]) => ({
      code,
      risk_score: Math.min(100, data.base + (quakeRisks[code] || 0)),
      risk_level: data.base >= 80 ? 'CRITICAL' : data.base >= 60 ? 'HIGH' : data.base >= 40 ? 'ELEVATED' : 'LOW',
      tags: data.tags,
    })).sort((a, b) => b.risk_score - a.risk_score);

    return NextResponse.json({
      countries,
      exchanges: exchangeStatus,
      open_exchanges: exchangeStatus.filter(e => e.open).length,
      total_exchanges: exchangeStatus.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ countries: [], exchanges: [], error: 'Failed' }, { status: 500 });
  }
}
