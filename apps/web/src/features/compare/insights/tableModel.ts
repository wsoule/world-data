import { competitionRank, percentile } from '@world-data/stats';

export type CsvCell = string | number | null | undefined;

/**
 * Quote one CSV field (RFC 4180): wrap in quotes when it contains a comma, quote or newline, and
 * double embedded quotes. Text that a spreadsheet would run as a formula (=, +, @, tab, CR) is
 * prefixed with an apostrophe. Numbers are written raw, missing values as empty fields.
 */
export function csvField(v: CsvCell): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = v;
  if (/^[=+@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Join rows into CSV text with CRLF line endings (what spreadsheet apps expect). */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Per-metric ranks and percentiles for the table, aligned to the compared places. */
export interface MetricStanding {
  /** Competition rank (1 = best given direction), NaN when missing */
  rank: Float64Array;
  /** Direction-aware percentile 0–1 (1 = best), NaN when missing */
  pct: Float64Array;
  /** Places with a value */
  count: number;
}

/** Rank and percentile one metric over the compared places, honouring its direction. */
export function standing(
  values: ArrayLike<number>,
  direction: 1 | -1
): MetricStanding {
  const rank = competitionRank(values, direction);
  let count = 0;
  for (let i = 0; i < rank.length; i++) if (!Number.isNaN(rank[i])) count++;
  return { rank, pct: percentile(values, direction), count };
}

/** Mean of the finite percentiles of one place across metrics (NaN when it has none). */
export function averagePercentile(
  standings: readonly MetricStanding[],
  place: number
): { mean: number; covered: number } {
  let sum = 0;
  let covered = 0;
  for (const s of standings) {
    const v = s.pct[place];
    if (Number.isNaN(v)) continue;
    sum += v;
    covered++;
  }
  return { mean: covered > 0 ? sum / covered : NaN, covered };
}
