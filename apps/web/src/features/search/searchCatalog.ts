// The compact search catalog (<type>/search.json). The data build writes it with toSearchCatalog;
// the catalog worker reads it back with fromSearchCatalog, so the palette downloads a fraction of
// metrics.json. Both directions live here so the format is defined in one place.

import { isSearchableMetric, type SearchMetric } from './searchMetric';
import type { Metric, SearchCatalog, SearchCatalogRow } from '~/data/types';

const CATEGORICAL = 1;
const BASE = 2;

/**
 * Packs the searchable metrics of one place type, in catalog order, into rows that reference
 * each topic slug and category id by its position in a shared list (first-seen order).
 */
export function toSearchCatalog(metrics: readonly Metric[]): SearchCatalog {
  const topics: string[] = [];
  const cats: string[] = [];
  const topicIndex = new Map<string, number>();
  const catIndex = new Map<string, number>();
  const ref = (list: string[], index: Map<string, number>, value: string) => {
    let i = index.get(value);
    if (i === undefined) {
      i = list.length;
      list.push(value);
      index.set(value, i);
    }
    return i;
  };
  const rows: SearchCatalogRow[] = [];
  for (const m of metrics) {
    if (!isSearchableMetric(m)) continue;
    rows.push([
      m.id,
      m.label,
      m.n,
      m.topics.map((s) => ref(topics, topicIndex, s)),
      m.cats.map((c) => ref(cats, catIndex, c)),
      m.unit,
      m.year,
      (m.kind === 'cat' ? CATEGORICAL : 0) | (m.base === true ? BASE : 0),
    ]);
  }
  return { topics, cats, metrics: rows };
}

/** Expands a search catalog into the metric fields the search index reads. */
export function fromSearchCatalog(catalog: SearchCatalog): SearchMetric[] {
  const { topics, cats } = catalog;
  return catalog.metrics.map(([id, label, n, ts, cs, unit, year, flags]) => {
    const m: SearchMetric = {
      id,
      label,
      kind: (flags & CATEGORICAL) === 0 ? 'num' : 'cat',
      n,
      topics: ts.map((i) => topics[i] ?? ''),
      cats: cs.map((i) => cats[i] ?? ''),
      unit,
      year,
    };
    if ((flags & BASE) !== 0) m.base = true;
    return m;
  });
}
