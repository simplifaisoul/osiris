import { describe, it, expect, vi, beforeEach } from 'vitest';

// The geocoder is faked, so it can be made to fail on demand.
const httpJson = vi.fn();
vi.mock('@/lib/httpJson', () => ({ httpJson: (...args: unknown[]) => httpJson(...args), OSIRIS_UA: 'test' }));
process.env.OSIRIS_PHOTON_CACHE = 'off';

import { current, stillHolding, itemId, amountOf, placeAt, type WdStatement } from './route';
import { clearPhotonCache } from '@/lib/photon';

/* Wikidata keeps every officeholder a country ever had on the same property,
   so picking the right statement is the whole job. Shapes below are trimmed
   from real /w/rest.php responses. */

const ended = (id: string, rank?: string): WdStatement => ({
  rank,
  qualifiers: [{ property: { id: 'P580' } }, { property: { id: 'P582' } }],
  value: { content: id },
});
const holds = (id: string, rank?: string): WdStatement => ({
  rank,
  qualifiers: [{ property: { id: 'P580' } }],
  value: { content: id },
});

describe('picking the statement that holds now', () => {
  it('skips an office someone has left', () => {
    // Ukraine's P35: Kravchuk, Kuchma, …, Zelenskyy.
    const list = [ended('Q189732'), ended('Q182788'), holds('Q21122854')];
    expect(itemId(current(list))).toBe('Q21122854');
  });

  it('trusts Wikidata’s preferred rank over position in the list', () => {
    const list = [holds('Q1'), holds('Q2', 'preferred')];
    expect(itemId(current(list))).toBe('Q2');
  });

  it('falls back to the only statement there is, even an ended one', () => {
    expect(itemId(current([ended('Q1')]))).toBe('Q1');
  });

  it('answers nothing for a property the item does not carry', () => {
    expect(current(undefined)).toBeUndefined();
    expect(itemId(current([]))).toBe('');
  });

  it('keeps every language a country still has, and drops the ones it dropped', () => {
    // A country can hold several at once — Singapore has four.
    const list = [holds('Q1860'), holds('Q9237'), ended('Q35197')];
    expect(stillHolding(list).map(itemId)).toEqual(['Q1860', 'Q9237']);
  });
});

describe('reading a quantity', () => {
  it('reads a population off a quantity statement', () => {
    expect(amountOf({ value: { content: { amount: '+41167335' } } } as WdStatement)).toBe(41167335);
  });

  it('answers nothing rather than NaN when there is no number', () => {
    expect(amountOf(undefined)).toBeUndefined();
    expect(amountOf({ value: { content: 'Q212' } })).toBeUndefined();
  });
});

describe('naming the clicked place, from the deployment’s geocoder', () => {
  const tokyo = { features: [{ properties: { city: 'Tokyo', country: 'Japan', countrycode: 'jp' } }] };
  beforeEach(() => {
    process.env.PHOTON_URL = 'http://geocoder.test:2322';
    clearPhotonCache();
    httpJson.mockReset();
  });

  it('asks the configured geocoder, never a public one', async () => {
    httpJson.mockResolvedValue(tokyo);
    expect(await placeAt(35.681, 139.691)).toMatchObject({ city: 'Tokyo', country: 'Japan' });
    expect(String(httpJson.mock.calls[0][0])).toMatch(/^http:\/\/geocoder\.test:2322\/reverse\?/);
  });

  it('answers nothing, without asking anyone, when no geocoder is configured', async () => {
    delete process.env.PHOTON_URL;
    expect(await placeAt(35.682, 139.692)).toBeNull();
    expect(httpJson).not.toHaveBeenCalled();
  });

  it('answers nothing when the lookup fails, rather than keep the panel waiting', async () => {
    httpJson.mockRejectedValue(new Error('HTTP 503'));
    expect(await placeAt(35.683, 139.693)).toBeNull();
    expect(httpJson).toHaveBeenCalledTimes(1);
  });

  it('remembers a real answer, so a second click on the same spot costs nothing', async () => {
    httpJson.mockResolvedValue(tokyo);
    await placeAt(35.684, 139.694);
    await placeAt(35.684, 139.694);
    expect(httpJson).toHaveBeenCalledTimes(1);
  });

  it('looks far enough to name a place in open country', async () => {
    // Photon's default radius found nothing on farmland outside Granby, or in
    // the Sahara, Siberia or the Amazon; 50 km found a place for every one.
    httpJson.mockResolvedValue(tokyo);
    await placeAt(45.504, -72.531);
    expect(String(httpJson.mock.calls[0][0])).toContain('radius=50');
  });

  it('answers nothing for open sea, without retrying', async () => {
    httpJson.mockResolvedValue({ features: [] });
    expect(await placeAt(0, -30)).toBeNull();
    expect(httpJson).toHaveBeenCalledTimes(1);
  });
});
