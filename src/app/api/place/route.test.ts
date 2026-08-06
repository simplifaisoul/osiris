import { describe, it, expect } from 'vitest';
import {
  distanceMeters,
  scoreCandidate,
  pickBest,
  readCategory,
  readDetails,
  normalizeReviews,
} from './route';

describe('distanceMeters', () => {
  it('measures a known short distance', () => {
    // Brandenburg Gate -> Reichstag, ~570 m apart
    expect(distanceMeters(52.5163, 13.3777, 52.5186, 13.3762)).toBeGreaterThan(200);
    expect(distanceMeters(52.5163, 13.3777, 52.5186, 13.3762)).toBeLessThan(400);
  });

  it('is zero for the same point', () => {
    expect(distanceMeters(52.5163, 13.3777, 52.5163, 13.3777)).toBe(0);
  });
});

describe('scoreCandidate / pickBest', () => {
  const probe = { lat: 52.5163, lng: 13.3777 };

  // The real failure case: the Quadriga statue sits directly on the gate and is
  // marginally closer to the probe, but the gate is what a user means.
  const quadriga = {
    type: 'node', id: 1, lat: 52.51631, lon: 13.37771,
    tags: { name: 'Quadriga with Victoria', historic: 'memorial' },
  };
  const gate = {
    type: 'way', id: 2, center: { lat: 52.51637, lon: 13.37770 },
    tags: { name: 'Brandenburger Tor', tourism: 'attraction', historic: 'monument', wikidata: 'Q82425' },
  };

  it('prefers the notable landmark over a marginally closer minor node', () => {
    expect(pickBest([quadriga, gate], probe.lat, probe.lng)?.tags?.name).toBe('Brandenburger Tor');
  });

  it('rewards a Wikidata entry', () => {
    const plain = { type: 'node', id: 3, lat: 52.5163, lon: 13.3777, tags: { name: 'X' } };
    const notable = { type: 'node', id: 4, lat: 52.5163, lon: 13.3777, tags: { name: 'Y', wikidata: 'Q1' } };
    expect(scoreCandidate(notable, probe.lat, probe.lng))
      .toBeLessThan(scoreCandidate(plain, probe.lat, probe.lng));
  });

  it('still respects distance when prominence is equal', () => {
    const near = { type: 'node', id: 5, lat: 52.5163, lon: 13.3777, tags: { name: 'Near' } };
    const far = { type: 'node', id: 6, lat: 52.5180, lon: 13.3800, tags: { name: 'Far' } };
    expect(pickBest([far, near], probe.lat, probe.lng)?.tags?.name).toBe('Near');
  });

  it('ignores unnamed elements and elements without coordinates', () => {
    expect(pickBest([{ type: 'node', id: 7, lat: 52.5163, lon: 13.3777, tags: {} }], probe.lat, probe.lng)).toBeNull();
    expect(pickBest([{ type: 'node', id: 8, tags: { name: 'No coords' } }], probe.lat, probe.lng)).toBeNull();
    expect(pickBest([], probe.lat, probe.lng)).toBeNull();
  });
});

describe('readCategory', () => {
  it('humanises the first meaningful category tag', () => {
    expect(readCategory({ amenity: 'fast_food' })).toBe('Fast Food');
    expect(readCategory({ tourism: 'attraction' })).toBe('Attraction');
  });

  it('skips bare yes values and unknown tags', () => {
    expect(readCategory({ amenity: 'yes', shop: 'bakery' })).toBe('Bakery');
    expect(readCategory({ building: 'gate' })).toBeNull();
    expect(readCategory({})).toBeNull();
  });
});

describe('readDetails', () => {
  it('maps OSM tags to display labels', () => {
    expect(readDetails({ opening_hours: '24/7', phone: '+49 30 1234', wheelchair: 'yes' }))
      .toEqual({ Hours: '24/7', Phone: '+49 30 1234', Wheelchair: 'yes' });
  });

  it('prefers the plain key over the contact: variant', () => {
    expect(readDetails({ phone: '111', 'contact:phone': '222' }).Phone).toBe('111');
    expect(readDetails({ 'contact:website': 'https://x.test' }).Website).toBe('https://x.test');
  });

  it('tidies multi-value cuisine and drops empty tags', () => {
    expect(readDetails({ cuisine: 'pizza;italian' }).Cuisine).toBe('pizza italian');
    expect(readDetails({ phone: '' })).toEqual({});
  });
});

describe('normalizeReviews', () => {
  const at = (lat: number, lng: number, rating: number, iat: number, nickname = 'someone') => ({
    payload: {
      sub: `geo:${lat},${lng}?q=Test&u=30`,
      rating,
      opinion: 'A review',
      iat,
      metadata: { nickname },
    },
  });

  it('keeps reviews within the radius and averages their ratings', () => {
    const r = normalizeReviews(
      { reviews: [at(52.5163, 13.3777, 100, 1780000000), at(52.51635, 13.37775, 80, 1770000000)] },
      52.5163, 13.3777,
    );
    expect(r.count).toBe(2);
    expect(r.average).toBe(90);
  });

  it('drops reviews for a different place', () => {
    // ~1.5 km away, well outside the 120 m default
    const r = normalizeReviews({ reviews: [at(52.53, 13.39, 100, 1780000000)] }, 52.5163, 13.3777);
    expect(r.count).toBe(0);
    expect(r.average).toBeNull();
  });

  it('ignores non-geo subjects and malformed payloads', () => {
    const r = normalizeReviews(
      { reviews: [{ payload: { sub: 'https://example.test', rating: 90 } }, { payload: undefined }] },
      52.5163, 13.3777,
    );
    expect(r.count).toBe(0);
  });

  it('sorts newest first and exposes author and date', () => {
    const r = normalizeReviews(
      { reviews: [at(52.5163, 13.3777, 60, 1700000000, 'older'), at(52.5163, 13.3777, 100, 1780000000, 'newer')] },
      52.5163, 13.3777,
    );
    expect(r.items[0].author).toBe('newer');
    expect(r.items[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles an empty payload', () => {
    expect(normalizeReviews({}, 52.5163, 13.3777)).toEqual({ count: 0, average: null, items: [] });
  });
});
