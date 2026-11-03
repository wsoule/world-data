// Shape of a topic built from a source other than worldpopulationreview.com. Each external
// source (scripts/sources/*) turns its downloads into these; build-data.ts feeds them through
// the same ingest path as scraped pages, so their metrics get the same polarity, years,
// topic pages and search entries.

import type { EntityType } from '../../src/data/types';
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
