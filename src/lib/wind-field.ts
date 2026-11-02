/**
 * OSIRIS — the wind field, read from NOAA's GFS model.
 *
 * NOMADS hands out the global forecast keyless as GRIB2, cut down to the two
 * fields we want: the eastward (UGRD) and northward (VGRD) wind ten metres up,
 * on a one-degree grid. GFS packs them with GRIB2's "complex packing and
 * spatial differencing" (data representation template 5.3), so this file
 * carries a decoder for exactly that, and for the plain lat/lon grid (3.0)
 * the model is laid out on. Anything else is refused rather than misread.
 */

export interface GribField {
  /** WMO parameter category and number: 2/2 is UGRD, 2/3 is VGRD. */
  category: number;
  parameter: number;
  ni: number;
  nj: number;
  la1: number;
  lo1: number;
  di: number;
  dj: number;
  values: Float32Array;
}

/** The wind grid as the browser gets it: m/s in tenths, rows north to south. */
export interface WindField {
  /** Model run and forecast hour, ISO, for the credit line. */
  refTime: string;
  ni: number;
  nj: number;
  la1: number;
  lo1: number;
  dx: number;
  dy: number;
  u: number[];
  v: number[];
}

/** GRIB2 stores signed integers as sign and magnitude, not two's complement. */
function signMag(value: number, bits: number): number {
  const top = 2 ** (bits - 1);
  return value >= top ? -(value - top) : value;
}

class Bits {
  private bit = 0;
  private buf: Uint8Array;
  private byte: number;
  constructor(buf: Uint8Array, byte: number) {
    this.buf = buf;
    this.byte = byte;
  }
  read(n: number): number {
    let out = 0;
    for (let i = 0; i < n; i++) {
      const b = (this.buf[this.byte] >> (7 - this.bit)) & 1;
      out = out * 2 + b;
      if (++this.bit === 8) { this.bit = 0; this.byte++; }
    }
    return out;
  }
  align(): void {
    if (this.bit) { this.bit = 0; this.byte++; }
  }
}

function readUint(buf: Uint8Array, at: number, n: number): number {
  let out = 0;
  for (let i = 0; i < n; i++) out = out * 256 + buf[at + i];
  return out;
}

/** Template 5.3 / 7.3: grouped values, then the spatial differencing undone. */
function unpackComplex(buf: Uint8Array, s5: number, s7: number, s7len: number): Float32Array {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const count = readUint(buf, s5 + 5, 4);
  const R = view.getFloat32(s5 + 11);
  const E = signMag(readUint(buf, s5 + 15, 2), 16);
  const D = signMag(readUint(buf, s5 + 17, 2), 16);
  const refBits = buf[s5 + 19];
  const missingMgmt = buf[s5 + 22];
  const NG = readUint(buf, s5 + 31, 4);
  const widthRef = buf[s5 + 35];
  const widthBits = buf[s5 + 36];
  const lenRef = readUint(buf, s5 + 37, 4);
  const lenInc = buf[s5 + 41];
  const lastLen = readUint(buf, s5 + 42, 4);
  const lenBits = buf[s5 + 46];
  const order = buf[s5 + 47];
  const extraOctets = buf[s5 + 48];
  if (missingMgmt !== 0) throw new Error('GRIB2: missing-value groups are not supported');
  if (order !== 1 && order !== 2) throw new Error(`GRIB2: spatial differencing order ${order}`);

  let at = s7 + 5;
  const extra = (): number => {
    const v = signMag(readUint(buf, at, extraOctets), extraOctets * 8);
    at += extraOctets;
    return v;
  };
  const ival1 = extra();
  const ival2 = order === 2 ? extra() : 0;
  const minsd = extra();

  const bits = new Bits(buf, at);
  const refs = new Array<number>(NG);
  for (let g = 0; g < NG; g++) refs[g] = bits.read(refBits);
  bits.align();
  const widths = new Array<number>(NG);
  for (let g = 0; g < NG; g++) widths[g] = widthRef + bits.read(widthBits);
  bits.align();
  const lens = new Array<number>(NG);
  for (let g = 0; g < NG; g++) lens[g] = lenRef + lenInc * bits.read(lenBits);
  lens[NG - 1] = lastLen;
  bits.align();

  const ifld = new Float64Array(count);
  let n = 0;
  for (let g = 0; g < NG; g++) {
    const w = widths[g];
    for (let k = 0; k < lens[g] && n < count; k++) ifld[n++] = refs[g] + (w ? bits.read(w) : 0);
  }
  if (n !== count) throw new Error(`GRIB2: unpacked ${n} of ${count} values`);
  if (at > s7 + s7len) throw new Error('GRIB2: data section overrun');

  if (order === 1) {
    ifld[0] = ival1;
    for (let i = 1; i < count; i++) ifld[i] = ifld[i] + minsd + ifld[i - 1];
  } else {
    ifld[0] = ival1;
    ifld[1] = ival2;
    for (let i = 2; i < count; i++) ifld[i] = ifld[i] + minsd + 2 * ifld[i - 1] - ifld[i - 2];
  }

  const out = new Float32Array(count);
  const bin = 2 ** E;
  const dec = 10 ** -D;
  for (let i = 0; i < count; i++) out[i] = (R + ifld[i] * bin) * dec;
  return out;
}

/** Every field in a GRIB2 file, one per message. */
export function decodeGrib2(input: Uint8Array): GribField[] {
  const buf = input;
  const fields: GribField[] = [];
  let offset = 0;
  while (offset + 16 <= buf.length) {
    if (String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]) !== 'GRIB') {
      throw new Error(`GRIB2: no message at byte ${offset}`);
    }
    if (buf[offset + 7] !== 2) throw new Error('GRIB2: not edition 2');
    const total = readUint(buf, offset + 8, 8);
    const end = offset + total;
    let p = offset + 16;
    let grid: Omit<GribField, 'category' | 'parameter' | 'values'> | null = null;
    let category = -1;
    let parameter = -1;
    let s5 = -1;
    while (p + 5 <= end - 4) {
      const len = readUint(buf, p, 4);
      const num = buf[p + 4];
      if (num === 3) {
        const template = readUint(buf, p + 12, 2);
        if (template !== 0) throw new Error(`GRIB2: grid template ${template}`);
        if (buf[p + 71] !== 0) throw new Error('GRIB2: unexpected scanning mode');
        grid = {
          ni: readUint(buf, p + 30, 4),
          nj: readUint(buf, p + 34, 4),
          la1: signMag(readUint(buf, p + 46, 4), 32) / 1e6,
          lo1: signMag(readUint(buf, p + 50, 4), 32) / 1e6,
          di: readUint(buf, p + 63, 4) / 1e6,
          dj: readUint(buf, p + 67, 4) / 1e6,
        };
      } else if (num === 4) {
        category = buf[p + 9];
        parameter = buf[p + 10];
      } else if (num === 5) {
        const template = readUint(buf, p + 9, 2);
        if (template !== 3) throw new Error(`GRIB2: data template ${template}`);
        s5 = p;
      } else if (num === 6) {
        if (buf[p + 5] !== 255) throw new Error('GRIB2: bitmaps are not supported');
      } else if (num === 7) {
        if (!grid || s5 < 0) throw new Error('GRIB2: data before its grid');
        fields.push({ ...grid, category, parameter, values: unpackComplex(buf, s5, p, len) });
      }
      p += len;
    }
    offset = end;
  }
  return fields;
}

/** Tenths of a metre a second: plenty for drawing, and short in JSON. */
const tenths = (values: Float32Array) => Array.from(values, v => Math.round(v * 10));

export function toWindField(fields: GribField[], refTime: string): WindField {
  const u = fields.find(f => f.category === 2 && f.parameter === 2);
  const v = fields.find(f => f.category === 2 && f.parameter === 3);
  if (!u || !v) throw new Error('GRIB2: UGRD/VGRD not both present');
  if (u.values.length !== u.ni * u.nj || v.values.length !== u.values.length) throw new Error('GRIB2: grid size mismatch');
  return { refTime, ni: u.ni, nj: u.nj, la1: u.la1, lo1: u.lo1, dx: u.di, dy: u.dj, u: tenths(u.values), v: tenths(v.values) };
}

const HOUR = 3600_000;

/** The time slider: a frame every three hours, three days back to five ahead of the newest run. */
export const WIND_STEP_H = 3;
export const WIND_PAST_H = 72;
export const WIND_AHEAD_H = 120;

/** NOMADS' filter for one GFS file, cut down to the 10 m wind. */
export function gfsUrl(cycle: number, fh: number): string {
  const t = new Date(cycle);
  const ymd = t.toISOString().slice(0, 10).replace(/-/g, '');
  const hh = String(t.getUTCHours()).padStart(2, '0');
  const fff = String(fh).padStart(3, '0');
  return 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl'
    + `?dir=%2Fgfs.${ymd}%2F${hh}%2Fatmos&file=gfs.t${hh}z.pgrb2.1p00.f${fff}`
    + '&var_UGRD=on&var_VGRD=on&lev_10_m_above_ground=on';
}

/**
 * The newest GFS runs worth asking for, newest first. A run lands on NOMADS
 * about four hours after its nominal time, so start five hours back.
 */
export function gfsRuns(now: number, count = 3): number[] {
  const start = Math.floor((now - 5 * HOUR) / (6 * HOUR)) * 6 * HOUR;
  return Array.from({ length: count }, (_, i) => start - i * 6 * HOUR);
}

/** Every time the slider offers around a run, oldest first. */
export function windTimes(run: number): number[] {
  const out: number[] = [];
  for (let h = -WIND_PAST_H; h <= WIND_AHEAD_H; h += WIND_STEP_H) out.push(run + h * HOUR);
  return out;
}

/**
 * The GFS file that holds the wind at `t`. Before the newest run, the past is
 * what the model saw at the time: the analysis of the run at or before `t`,
 * or that run's three-hour step. From the newest run on, it is its forecast.
 */
export function frameSource(t: number, run: number): { cycle: number; fh: number } {
  const cycle = t >= run ? run : Math.floor(t / (6 * HOUR)) * 6 * HOUR;
  return { cycle, fh: Math.round((t - cycle) / HOUR) };
}
