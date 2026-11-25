import { describe, expect, it } from 'vitest';
import { mergeGlyphs, readGlyphs } from './glyphs';

// A minimal protobuf writer for test glyph files: stack (1) → name (1), range (2), glyphs (3) → id (1), advance (7).
const varint = (n: number): number[] => (n > 0x7f ? [(n & 0x7f) | 0x80, ...varint(n >>> 7)] : [n]);
const field = (num: number, bytes: number[]) => [...varint(num * 8 + 2), ...varint(bytes.length), ...bytes];
const text = (s: string) => [...new TextEncoder().encode(s)];
const glyph = (id: number, advance: number) => [...varint(1 * 8), ...varint(id), ...varint(7 * 8), ...varint(advance)];
const file = (name: string, glyphs: [number, number][]) =>
  new Uint8Array(field(1, [...field(1, text(name)), ...field(2, text('0-255')), ...glyphs.flatMap(([id, adv]) => field(3, glyph(id, adv)))]));

/** Each glyph's advance (field 7), by character code. */
const advances = (buf: Uint8Array) => {
  const out: Record<number, number> = {};
  for (const [id, bytes] of readGlyphs(buf)) {
    const i = bytes.lastIndexOf(7 * 8);
    out[id] = bytes[i + 1];
  }
  return out;
};

describe('merging a font stack', () => {
  const montserrat = file('Montserrat SemiBold', [[65, 17], [75, 17]]);
  const openSans = file('Open Sans Bold', [[65, 15], [75, 15], [233, 14]]);
  const noto = file('Noto Sans Regular', [[65, 14], [233, 13], [1488, 12]]);

  it('takes each character from the first font in the stack that has it', () => {
    const merged = mergeGlyphs([montserrat, openSans, noto], 'Montserrat SemiBold,Open Sans Bold,Noto Sans Regular', '0-255');
    expect(advances(merged)).toEqual({ 65: 17, 75: 17, 233: 14, 1488: 12 });
  });

  it('follows the order it is given, whatever the fonts', () => {
    expect(advances(mergeGlyphs([noto, montserrat], 'x', '0-255'))[65]).toBe(14);
  });

  it('names the stack and range, and writes glyphs in character order', () => {
    const merged = mergeGlyphs([noto, montserrat], 'Stack Name', '0-255');
    expect(new TextDecoder().decode(merged)).toContain('Stack Name');
    expect(new TextDecoder().decode(merged)).toContain('0-255');
    expect([...readGlyphs(merged).keys()]).toEqual([65, 75, 233, 1488]);
  });

  it('keeps a glyph’s bytes exactly as the font had them', () => {
    const merged = mergeGlyphs([openSans], 'x', '0-255');
    expect([...readGlyphs(merged).get(233)!]).toEqual(glyph(233, 14));
  });

  it('gives an empty stack for no fonts, and rejects a cut-off file', () => {
    expect(readGlyphs(mergeGlyphs([], 'x', '0-255')).size).toBe(0);
    expect(() => readGlyphs(montserrat.subarray(0, montserrat.length - 3))).toThrow();
  });
});
