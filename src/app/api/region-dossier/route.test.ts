import { describe, it, expect } from 'vitest';
import { current, stillHolding, itemId, amountOf, type WdStatement } from './route';

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
