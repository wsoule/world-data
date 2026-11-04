import { useState } from 'react';

import type { CompareViewProps } from '../state';
import { pickRows } from './correlation';
import { isNeutral } from './shared';
import type { Metric } from '~/data/types';

/**
 * Keep returning the same value while `key` is unchanged. URL state is re-parsed into fresh (but
 * equal) arrays on every navigation, e.g. when a highlight is toggled; keying derived data by
 * content keeps charts and statistics from recomputing for changes that do not affect them.
 * Uses React's "store information from previous renders" pattern: when the key changes, the new
 * value is computed once and stored before children render.
 */
export function useKeyed<T>(key: string, compute: () => T): T {
  const [cache, setCache] = useState(() => ({ key, value: compute() }));
  if (cache.key === key) return cache.value;
  const next = { key, value: compute() };
  setCache(next);
  return next.value;
}

/** Basket metrics as dense columns over the compared places (group filter applied). */
export interface BasketColumns {
  /** Changes whenever any of the fields below would */
  key: string;
  metrics: Metric[];
  ids: number[];
  /** One column per basket metric, aligned to `rows` */
  columns: Float64Array[];
  directions: (1 | -1)[];
  /**
   * True for metrics with no better or worse side that the user has not given one. Their
   * `directions` entry is 1 (rank high to low), but they must not count as good or bad.
   */
  neutral: boolean[];
  /** Entity index of each compared place */
  rows: number[];
  /** Entity index -> position in `rows` */
  position: Map<number, number>;
}

/** Extract the basket's values for the compared places once per (basket, filter, directions). */
export function useBasket(props: CompareViewProps): BasketColumns {
  const { dataset, metrics, entityIdx, direction, search } = props;
  const directions = metrics.map((m) => direction(m.id));
  const neutral = metrics.map((m) => isNeutral(search, m));
  const key = [
    dataset.type.id,
    metrics.map((m) => m.id).join(','),
    directions.join(','),
    neutral.map((n) => (n ? 1 : 0)).join(''),
    entityIdx.length,
    (search.g ?? []).join('|'),
    // Cost-of-living adjustment changes the income columns' values.
    search.adj ?? '',
  ].join(';');
  return useKeyed(key, () => {
    const position = new Map<number, number>();
    entityIdx.forEach((e, k) => position.set(e, k));
    return {
      key,
      metrics,
      ids: metrics.map((m) => m.id),
      columns: metrics.map((m) => pickRows(dataset.numeric(m.id), entityIdx)),
      directions,
      neutral,
      rows: entityIdx,
      position,
    };
  });
}

/** Entity ids in search.hl resolved to positions among the compared places. */
export function useHighlightPositions(
  props: CompareViewProps,
  basket: BasketColumns
): number[] {
  const hl = props.search.hl ?? [];
  return useKeyed(`${hl.join('|')};${basket.key}`, () => {
    const out: number[] = [];
    for (const id of hl) {
      const e = props.dataset.entityIndex.get(id);
      const p = e == null ? undefined : basket.position.get(e);
      if (p != null) out.push(p);
    }
    return out;
  });
}
