// Checks on whole source columns: rank positions stored as plain numbers,
// and count columns that copy another column.

import type { Row } from './entities';
import { NOT_A_POSITION, RANK_LABEL } from './reference';

/** The parts of a source column definition these checks read. */
export interface ColumnShape {
  id: number;
  field: string;
  year: number | null;
  format: string | null;
}

/** Plain number formats a rank column may arrive in (no money, percent or unit). */
const PLAIN_NUMBER = /^(numberWithCommas|floatNumber|abbreviateNumber)/;

/**
 * True when a numeric column stored as plain numbers holds rank positions,
 * so it should be published with the 'ranking' format: the label says rank
 * or ranking (but not a change in rank, a percentile rank or a score), and
 * the values are whole numbers from 1 up, mostly distinct (ties allowed).
 * "GII Institutions Rank" (1–133) and the Well-Being Index "Rank" (1–50)
 * qualify; "Change in DI Rank" (−25…17) and "Percentile Rank" do not.
 */
export function looksLikeRanks(
  label: string,
  fmt: string | null,
  values: readonly number[]
): boolean {
  if (fmt != null && fmt !== '' && !PLAIN_NUMBER.test(fmt)) return false;
  if (!RANK_LABEL.test(label)) return false;
  if (NOT_A_POSITION.test(label) || /\b(score|points)\b/i.test(label))
    return false;
  if (values.length < 3) return false;
  if (!values.every((v) => Number.isInteger(v) && v >= 1)) return false;
  return new Set(values).size >= values.length * 0.8;
}

/**
 * Count columns ("numberWithCommas") whose cells copy another column of the
 * same year on nearly every row, fractions included, as field → copied
 * field. The county vehicle-theft page repeats each county's 2024 theft rate
 * (432.52 per 100K for Los Angeles) in its 2024 "Motor Vehicle Thefts"
 * field, while the 2020 field holds real counts (6,774 for Jackson County).
 * A count is a whole number, so such a field is a copy to drop.
 */
export function copiedCountFields(
  columns: readonly ColumnShape[],
  rows: readonly Row[]
): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of columns) {
    if (c.format !== 'numberWithCommas') continue;
    for (const o of columns) {
      if (o.id === c.id || o.year !== c.year || o.format === c.format) continue;
      let both = 0;
      let same = 0;
      let fractional = 0;
      for (const r of rows) {
        const x = r[c.field];
        const y = r[o.field];
        if (typeof x !== 'number' || typeof y !== 'number') continue;
        both++;
        if (x !== y) continue;
        same++;
        if (!Number.isInteger(x)) fractional++;
      }
      if (both >= 5 && same >= both * 0.9 && fractional >= same * 0.5) {
        out.set(c.field, o.field);
        break;
      }
    }
  }
  return out;
}

/** Which kind of number a text column spells out, by its header (see textNumberKind). */
export type TextNumberKind = 'coordinate' | 'year';

/**
 * Text columns that hold numbers the source writes out, by their header: latitudes and
 * longitudes as degrees and minutes ("20 00 N"), and the year a country was founded or became
 * sovereign as a date ("4 July 1776", "2500 BC").
 */
export function textNumberKind(header: string): TextNumberKind | null {
  if (/\b(latitude|longitude)\b/i.test(header)) return 'coordinate';
  if (
    /\b(founded|founding|sovereignty acquired|birth date|date of independence|independence date)\b/i.test(
      header
    )
  )
    return 'year';
  return null;
}

/**
 * Degrees and minutes with a hemisphere ("20 00 N", "21 06 S") as signed decimal degrees, south
 * and west negative; null for anything else.
 */
export function parseCoordinate(text: string): number | null {
  const m = /^(\d{1,3})\s+(\d{1,2})\s*([NSEW])$/i.exec(text.trim());
  if (m == null) return null;
  const deg = Number(m[1]) + Number(m[2]) / 60;
  const sign = /[SW]/i.test(m[3] ?? '') ? -1 : 1;
  return (sign * Math.round(deg * 100)) / 100;
}

/**
 * The one year a date names ("4 July 1776", "1945-Oct-30", "788 AD", "3 September 301"),
 * negative before the common era ("2500 BC", "11 February 660 BC"); null when the text names no
 * year or several ("1 January 1973 - 31 January 2020"). Days and months have one or two digits,
 * so the year is the one number of three or four.
 */
export function parseYear(text: string): number | null {
  const t = text.trim();
  const bc = [...t.matchAll(/\b(\d{1,4})\s*(?:BCE?|B\.C\.)(?![A-Za-z])/gi)];
  if (bc.length === 1) return -Number(bc[0]?.[1]);
  if (bc.length > 1) return null;
  if (/^\d{1,4}$/.test(t)) return Number(t);
  const years = [...t.matchAll(/(?<!\d)(\d{3,4})(?!\d)/g)].map((m) =>
    Number(m[1])
  );
  const year = years.length === 1 ? years[0] : undefined;
  return year != null && year <= 2100 ? year : null;
}

/**
 * The kind of number a column spells out (see textNumberKind), when nearly all of its cells
 * (90%) are numbers or read as one; null otherwise, so a column of date lists ("01 September,
 * 1918| 03 August, 1929") stays text rather than mixing years into it.
 */
export function spelledNumbers(
  header: string,
  cells: readonly unknown[]
): TextNumberKind | null {
  const kind = textNumberKind(header);
  if (kind == null) return null;
  const read = kind === 'coordinate' ? parseCoordinate : parseYear;
  let filled = 0;
  let numbers = 0;
  for (const c of cells) {
    if (c == null || c === '') continue;
    filled++;
    if (typeof c === 'number' || (typeof c === 'string' && read(c) != null))
      numbers++;
  }
  return filled > 0 && numbers >= filled * 0.9 ? kind : null;
}
