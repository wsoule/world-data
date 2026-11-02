// Checks on whole source columns: rank positions stored as plain numbers.

import { NOT_A_POSITION, RANK_LABEL } from './reference';

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
