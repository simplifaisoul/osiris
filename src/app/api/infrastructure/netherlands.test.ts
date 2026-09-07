import { describe, it, expect } from 'vitest';
import { NUCLEAR_FACILITIES } from './route';

/* The Dutch entries were added by #320 and lost again when that PR was
   reverted, which left the layer with no Netherlands coverage while the issue
   sat closed. These tests pin the seven ANVS-licensed installations so a
   revert cannot quietly drop them a second time. */

const dutch = NUCLEAR_FACILITIES.filter(f => f.country === 'Netherlands');

describe('Dutch nuclear facilities', () => {
  it('carries all seven ANVS-licensed installations', () => {
    expect(dutch).toHaveLength(7);
    expect(dutch.map(f => f.id).sort()).toEqual([
      'nuc-nl-borssele',
      'nuc-nl-covra',
      'nuc-nl-dodewaard',
      'nuc-nl-hfr',
      'nuc-nl-hor-delft',
      'nuc-nl-pallas',
      'nuc-nl-urenco',
    ]);
  });

  it('places every facility inside the Netherlands', () => {
    // Bounding box of the European Netherlands.
    for (const f of dutch) {
      expect(f.lat, f.name).toBeGreaterThan(50.75);
      expect(f.lat, f.name).toBeLessThan(53.55);
      expect(f.lng, f.name).toBeGreaterThan(3.36);
      expect(f.lng, f.name).toBeLessThan(7.23);
    }
  });

  it('gives every facility a reference link', () => {
    for (const f of dutch) {
      expect(f.sourceUrl, f.name).toMatch(/^https:\/\//);
    }
  });

  it('reports only Borssele as electrical capacity', () => {
    // COVRA and Urenco hold no reactor; the research reactors are rated in
    // thermal MW, which is not the figure this column carries. All stay 0 so
    // the popup renders them as "—" rather than as a real 0 MWe.
    const withCapacity = dutch.filter(f => f.capacityMW > 0);
    expect(withCapacity.map(f => f.name)).toEqual(['Borssele NPP']);
    expect(withCapacity[0].capacityMW).toBe(485);
  });

  it('marks the reactor-free sites as holding no reactor', () => {
    const noReactor = dutch.filter(f => f.reactors === 0).map(f => f.id).sort();
    expect(noReactor).toEqual(['nuc-nl-covra', 'nuc-nl-urenco']);
  });
});
