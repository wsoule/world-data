// Shape of a topic built from a source other than worldpopulationreview.com. Each external
// source (scripts/sources/*) turns its downloads into these; build-data.ts feeds them through
// the same ingest path as scraped pages, so their metrics get the same polarity, years,
// topic pages and search entries.

import type { EntityType, Polarity } from '../../src/data/types';
import type { PageLink } from './page';

/** One metric column for one year, as build-data's SourceColumn expects it. */
export interface ExternalColumn {
  /** Stable metric id from src/data/external.ts (900,000 and up) */
  id: number;
  /** Row field holding this column's values */
  field: string;
  /** Metric key, shared by every year of the metric */
  dbField: string;
  year: number | null;
  header: string;
  /** Source display format, such as 'floatNumberTenths' or 'moneyWithCurrency' */
  format: string;
  unit: string | null;
  /** Which end is better, when the source's meaning is known; otherwise guessed from the label */
  pol?: Polarity;
}

export interface ExternalPage {
  type: EntityType;
  slug: string;
  title: string;
  /** Category ids from CATEGORY_LABELS */
  cats: string[];
  sources: PageLink[];
  /** ISO date the source last published this data */
  updated: string | null;
  /** One row per place, carrying the identity fields entityOf() reads plus every column's field */
  rows: Record<string, unknown>[];
  columns: ExternalColumn[];
  /** Named tables of metric keys (dbField), shown as tabs on the topic page */
  tables: { name: string; columns: string[] }[];
}

/** One published metric of an external topic. */
export interface ExternalMetric {
  id: number;
  /** Metric key (dbField), unique within the topic */
  key: string;
  header: string;
  format: string;
  pol: Polarity;
  unit?: string | null;
}

/** One value: a place (identity fields entityOf() reads), a metric key, a year and the value. */
export interface Observation {
  /** Stable key of the place, e.g. its FIPS code, to merge its observations into one row */
  place: string;
  identity: Record<string, unknown>;
  key: string;
  year: number | null;
  value: number;
}

/**
 * Builds a topic page from observations: one row per place, one column per metric and year, a
 * single table listing `metrics` in order. Metrics with no observation are left out.
 */
export function pageFromObservations(
  meta: Omit<ExternalPage, 'rows' | 'columns' | 'tables'>,
  metrics: readonly ExternalMetric[],
  observations: Iterable<Observation>
): ExternalPage {
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const rows = new Map<string, Record<string, unknown>>();
  const columns = new Map<string, ExternalColumn>();
  for (const o of observations) {
    const m = byKey.get(o.key);
    if (m == null || !Number.isFinite(o.value)) continue;
    const row = rows.get(o.place) ?? { ...o.identity };
    rows.set(o.place, row);
    const field = o.year == null ? m.key : `${m.key}_${o.year}`;
    row[field] = o.value;
    columns.set(field, {
      id: m.id,
      field,
      dbField: m.key,
      year: o.year,
      header: m.header,
      format: m.format,
      unit: m.unit ?? null,
      pol: m.pol,
    });
  }
  const used = new Set([...columns.values()].map((c) => c.dbField));
  return {
    ...meta,
    rows: [...rows.values()],
    columns: [...columns.values()],
    tables: [
      {
        name: '',
        columns: metrics.map((m) => m.key).filter((k) => used.has(k)),
      },
    ],
  };
}

/** Places of one type the build already knows, for sources that identify places by name. */
export interface KnownPlace {
  id: string;
  name: string;
  /** Lower-case two-letter state code for US places */
  flag: string | null;
  /** State name for US counties and cities */
  sub: string | null;
}

/** What a source can ask the build about places it identifies by name. */
export interface SourceContext {
  known(type: EntityType): readonly KnownPlace[];
}

/**
 * A county name reduced for matching across sources: "Los Angeles County", "Los Angeles" and
 * "los angeles county, CA" all become "los angeles", while Virginia's independent cities keep
 * their "city" ("Richmond city" stays apart from Richmond County).
 */
export function countyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/,\s*[a-z]{2}$/, '')
    .replace(
      /\b(county|parish|borough|census area|municipality|city and borough)\b/g,
      ''
    )
    .replace(/^st\.?\s/, 'saint ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
