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
