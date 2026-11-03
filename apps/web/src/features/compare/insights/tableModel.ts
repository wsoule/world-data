import { competitionRank, percentile } from '@world-data/stats';

import { rankOrder } from '~/data/rankOrder';
import type { Polarity } from '~/data/types';

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

/**
 * Mean of the finite percentiles of one place across metrics. The mean is NaN when the place has
 * data for fewer than `minCovered` of them, so a place with one great value out of five cannot
 * top the table (the combined ranking and rank lines apply the same kind of floor).
 */
export function averagePercentile(
  standings: readonly MetricStanding[],
  place: number,
  minCovered = 1
): { mean: number; covered: number } {
  let sum = 0;
  let covered = 0;
  for (const s of standings) {
    const v = s.pct[place];
    if (Number.isNaN(v)) continue;
    sum += v;
    covered++;
  }
  return {
    mean: covered > 0 && covered >= minCovered ? sum / covered : NaN,
    covered,
  };
}

/** Metrics a place needs data for before it gets an average: `share` of them, at least one. */
export function coverageFloor(metricCount: number, share: number): number {
  return Math.max(1, Math.ceil(metricCount * share - 1e-9));
}

/** What the CSV export needs to know about a metric to name and scale its column. */
export interface CsvMetric {
  id: number;
  /** Label with topic context when the label alone is ambiguous ("1950 — Past and Projected…") */
  fullLabel: string;
  fmt: string | null;
  unit: string | null;
  year: number | null;
  /** Better side as the table uses it (after direction overrides): says which end rank 1 is */
  pol: Polarity;
}

/** Unit for a CSV header: the metric's own unit, else one implied by its display format. */
function csvUnit(m: CsvMetric): string | null {
  const unit = m.unit?.trim() ?? '';
  if (unit !== '') {
    if (m.fmt === 'perc' && !unit.includes('%')) return `%, ${unit}`;
    return unit;
  }
  if (m.fmt === 'perc' || m.fmt === 'percAlt') return '%';
  if (m.fmt === 'moneyWithCurrencyEuros') return 'EUR';
  if (m.fmt?.startsWith('money') === true) return 'USD';
  if (m.fmt === 'degC') return '°C';
  if (m.fmt === 'degF') return '°F';
  if (m.fmt === 'cmToFeet') return 'cm';
  const order = rankOrder(m);
  if (order != null) return order === 'best-first' ? '1 = best' : '1 = worst';
  return null;
}

/**
 * One unique, self-describing CSV header per metric: the label with topic context, then the unit
 * and year in one pair of parentheses ("Land Area (km²)", "Population Growth Rate (%)",
 * "1950 — Past and Projected Future Population by Country"). A unit already in the label is not
 * repeated; headers that still collide get the metric id appended.
 */
export function csvMetricHeaders(metrics: readonly CsvMetric[]): string[] {
  const headers = metrics.map((m) => {
    const unit = csvUnit(m);
    const parts: string[] = [];
    if (unit != null && !m.fullLabel.toLowerCase().includes(unit.toLowerCase()))
      parts.push(unit);
    if (m.year != null) parts.push(String(m.year));
    return parts.length > 0
      ? `${m.fullLabel} (${parts.join(', ')})`
      : m.fullLabel;
  });
  const counts = new Map<string, number>();
  for (const h of headers) counts.set(h, (counts.get(h) ?? 0) + 1);
  return headers.map((h, k) =>
    (counts.get(h) ?? 0) > 1 ? `${h} [id ${metrics[k].id}]` : h
  );
}

/**
 * A value on the scale the page shows it: "perc" metrics are stored as fractions (0.08) but read
 * as percentages (8%), so they are exported ×100 to match their "(%)" header. Rounded to 12
 * significant digits to drop floating-point noise (8.038000000000001).
 */
export function csvValue(fmt: string | null, v: number): number | null {
  if (!Number.isFinite(v)) return null;
  return fmt === 'perc' ? Number((v * 100).toPrecision(12)) : v;
}

/** One sorted column of the comparison table. */
export interface TableSort {
  id: string;
  desc: boolean;
}

/** The table's default order: best average percentile first. */
export const DEFAULT_TABLE_SORT: TableSort = { id: 'avg', desc: true };

/** Read the URL `ts` value ("-avg", "m24419", "place") into a sort; unset means the default. */
export function parseTableSort(ts: string | undefined): TableSort {
  if (ts == null || ts === '' || ts === '-') return DEFAULT_TABLE_SORT;
  return ts.startsWith('-')
    ? { id: ts.slice(1), desc: true }
    : { id: ts, desc: false };
}

/** Write a sort back as the URL `ts` value, leaving it out for the default order. */
export function formatTableSort(
  sort: TableSort | undefined
): string | undefined {
  if (sort == null) return undefined;
  if (
    sort.id === DEFAULT_TABLE_SORT.id &&
    sort.desc === DEFAULT_TABLE_SORT.desc
  )
    return undefined;
  return `${sort.desc ? '-' : ''}${sort.id}`;
}
