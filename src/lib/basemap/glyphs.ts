/**
 * OSIRIS — merging label fonts the way map styles expect.
 *
 * A style names a font stack, e.g. "Montserrat SemiBold, Open Sans Bold, Noto
 * Sans Regular": each character comes from the first font in the stack that
 * has it. Our tile server ignores that order when it merges fonts itself, so
 * /api/basemap asks it for each font on its own and merges them here.
 *
 * Glyph files are protobuf: a message with one font stack (field 1) holding a
 * name (1), a range such as "0-255" (2), and one message per glyph (3) whose
 * first field is its character code. Glyphs are copied as they are.
 */

function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let value = 0;
  let shift = 0;
  for (;;) {
    if (pos >= buf.length) throw new Error('glyph file ends inside a number');
    const byte = buf[pos++];
    value += (byte & 0x7f) * 2 ** shift;
    if (byte < 0x80) return [value, pos];
    shift += 7;
    if (shift > 49) throw new Error('glyph file has a number that is too long');
  }
}

function varint(value: number): number[] {
  const out: number[] = [];
  while (value > 0x7f) {
    out.push((value % 0x80) | 0x80);
    value = Math.floor(value / 0x80);
  }
  out.push(value);
  return out;
}

/** Each field of a protobuf message: its number and, for length-delimited fields (wire type 2), its bytes. */
function* fields(buf: Uint8Array): Generator<{ field: number; bytes?: Uint8Array; value?: number }> {
  let pos = 0;
  while (pos < buf.length) {
    const [key, afterKey] = readVarint(buf, pos);
    const field = Math.floor(key / 8);
    const wire = key % 8;
    pos = afterKey;
    if (wire === 0) {
      const [value, next] = readVarint(buf, pos);
      pos = next;
      yield { field, value };
    } else if (wire === 2) {
      const [length, start] = readVarint(buf, pos);
      if (start + length > buf.length) throw new Error('glyph file is cut off');
      pos = start + length;
      yield { field, bytes: buf.subarray(start, pos) };
    } else if (wire === 5) {
      pos += 4;
      yield { field };
    } else if (wire === 1) {
      pos += 8;
      yield { field };
    } else {
      throw new Error(`glyph file has an unknown field type ${wire}`);
    }
  }
}

/** The glyphs in one glyph file, by character code. */
export function readGlyphs(file: Uint8Array): Map<number, Uint8Array> {
  const glyphs = new Map<number, Uint8Array>();
  for (const stack of fields(file)) {
    if (stack.field !== 1 || !stack.bytes) continue;
    for (const part of fields(stack.bytes)) {
      if (part.field !== 3 || !part.bytes) continue;
      const id = [...fields(part.bytes)].find(f => f.field === 1)?.value;
      if (id !== undefined && !glyphs.has(id)) glyphs.set(id, part.bytes);
    }
  }
  return glyphs;
}

function lengthDelimited(field: number, bytes: Uint8Array): Uint8Array {
  const head = [...varint(field * 8 + 2), ...varint(bytes.length)];
  const out = new Uint8Array(head.length + bytes.length);
  out.set(head);
  out.set(bytes, head.length);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** One glyph file for the whole stack: each character from the first file, in stack order, that has it. */
export function mergeGlyphs(files: Uint8Array[], stackName: string, range: string): Uint8Array {
  const merged = new Map<number, Uint8Array>();
  for (const file of files) {
    for (const [id, glyph] of readGlyphs(file)) if (!merged.has(id)) merged.set(id, glyph);
  }
  const text = new TextEncoder();
  const stack = concat([
    lengthDelimited(1, text.encode(stackName)),
    lengthDelimited(2, text.encode(range)),
    ...[...merged.keys()].sort((a, b) => a - b).map(id => lengthDelimited(3, merged.get(id)!)),
  ]);
  return lengthDelimited(1, stack);
}
