// The handful of metric fields search reads. Shared by the index builder (searchIndex.ts) and the
// catalog worker (catalog.worker.ts), which strips each metrics.json down to these fields before
// handing it to the page.

import type { Metric } from '~/data/types';

/** The fields of a catalog metric that search reads. */
export type SearchMetric = Pick<
  Metric,
  | 'id'
  | 'label'
  | 'kind'
  | 'n'
  | 'topics'
  | 'cats'
  | 'unit'
  | 'year'
  | 'meta'
  | 'base'
>;

/** Metrics worth finding: numeric or categorical, with values, not bookkeeping columns. */
export function isSearchableMetric(m: SearchMetric): boolean {
  return m.meta !== true && m.kind !== 'text' && m.n > 0;
}

/** Copies only the fields search reads (about a third of a catalog entry). */
export function toSearchMetric(m: Metric): SearchMetric {
  const out: SearchMetric = {
    id: m.id,
    label: m.label,
    kind: m.kind,
    n: m.n,
    topics: m.topics,
    cats: m.cats,
    unit: m.unit,
    year: m.year,
  };
  if (m.meta === true) out.meta = true;
  if (m.base === true) out.base = true;
  return out;
}
