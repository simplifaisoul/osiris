/**
 * OSIRIS — Geopolitical & Conflict Event Normalization Engine
 */

export interface GeopoliticalEvent {
  id: string;
  title: string;
  category: 'battle' | 'strike' | 'protest' | 'strategic' | 'humanitarian';
  lat: number;
  lng: number;
  country: string;
  region?: string;
  fatalities: number;
  actor1?: string;
  actor2?: string;
  severity: 'high' | 'medium' | 'low';
  source: string;
  timestamp: string;
  url?: string;
  notes?: string;
}

export function classifyEventCategory(text: string, typeName?: string): GeopoliticalEvent['category'] {
  const t = (text + ' ' + (typeName || '')).toLowerCase();
  if (t.includes('strike') || t.includes('explosion') || t.includes('shelling') || t.includes('air') || t.includes('drone') || t.includes('artillery')) {
    return 'strike';
  }
  if (t.includes('battle') || t.includes('clash') || t.includes('armed') || t.includes('attack') || t.includes('skirmish')) {
    return 'battle';
  }
  if (t.includes('protest') || t.includes('riot') || t.includes('demonstration') || t.includes('unrest')) {
    return 'protest';
  }
  if (t.includes('refugee') || t.includes('displacement') || t.includes('aid') || t.includes('evacuation')) {
    return 'humanitarian';
  }
  return 'strategic';
}

export function calculateSeverity(fatalities: number, category: GeopoliticalEvent['category']): GeopoliticalEvent['severity'] {
  if (fatalities >= 10 || category === 'strike' || category === 'battle') {
    return 'high';
  }
  if (fatalities > 0 || category === 'strategic') {
    return 'medium';
  }
  return 'low';
}
