// The handful of metric fields search reads. Shared by the index builder (searchIndex.ts) and the
// compact search catalog (searchCatalog.ts), which the data build writes with only these fields
// and the catalog worker expands back into SearchMetric objects.

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
