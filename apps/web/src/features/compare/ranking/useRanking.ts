import type { Normalization } from '@world-data/stats';
import { useMemo } from 'react';

import type { CompareViewProps } from '../state';
import {
  biggestSurprise,
  computeRanking,
  type LeaderInsight,
  leaderInsight,
  type MetricStats,
  metricStats,
  type RankingInput,
  type RankingResult,
  type Sensitivity,
  sensitivity,
  type Surprise,
} from './model';
import type { Dataset } from '~/data/dataset';
import type { Metric } from '~/data/types';

export const DEFAULT_COVERAGE = 0.5;

export interface RankingModel {
  method: Normalization;
  minCoverage: number;
  /** Basket metrics, in basket order (aligned with inputs / stats) */
  metrics: Metric[];
  inputs: RankingInput[];
  stats: MetricStats[];
  base: RankingResult;
  sens: Sensitivity;
  insight: LeaderInsight | null;
  surprise: Surprise | null;
  /** Compact index → dataset entity index */
  entityIdx: number[];
  /** Short unique label per metric id (falls back to "label — topic" when labels repeat) */
  labels: Map<number, string>;
}

/** Labels for legends and grids: plain labels, disambiguated with topic context when repeated. */
export function uniqueLabels(
  dataset: Dataset,
  metrics: readonly Metric[]
): Map<number, string> {
  const counts = new Map<string, number>();
  for (const m of metrics) counts.set(m.label, (counts.get(m.label) ?? 0) + 1);
  const out = new Map<number, string>();
  const used = new Set<string>();
  for (const m of metrics) {
    let label =
      (counts.get(m.label) ?? 0) > 1 ? dataset.metricFullLabel(m.id) : m.label;
    if (used.has(label)) label = `${label} (#${m.id})`;
    used.add(label);
    out.set(m.id, label);
  }
  return out;
}

/**
 * All combined-ranking computations for the current URL state, memoised in layers so each control
 * only recomputes what depends on it: values (basket / group filter) → per-metric percentiles
 * (directions) → composite score (weights, normalisation, coverage) → sensitivity and insights.
 */
export function useRanking(props: CompareViewProps): RankingModel {
  const { dataset, metrics, entityIdx, direction, weight, search } = props;
  const method = search.norm ?? 'percentile';
  const minCoverage = search.cov ?? DEFAULT_COVERAGE;

  // Value-keyed so memos survive unrelated URL changes (highlights, other views' params).
  const dirKey = metrics.map((m) => direction(m.id)).join(',');
  const weightKey = metrics.map((m) => weight(m.id)).join(',');
  const dirs = useMemo(
    () =>
      dirKey === ''
        ? []
        : dirKey.split(',').map((s): 1 | -1 => (s === '-1' ? -1 : 1)),
    [dirKey]
  );
  const weights = useMemo(
    () => (weightKey === '' ? [] : weightKey.split(',').map(Number)),
    [weightKey]
  );

  const columns = useMemo(
    () =>
      metrics.map((m) => {
        const col = dataset.numeric(m.id);
        const out = new Float64Array(entityIdx.length);
        for (let k = 0; k < entityIdx.length; k++) out[k] = col[entityIdx[k]];
        return out;
      }),
    [dataset, metrics, entityIdx]
  );

  const unweighted = useMemo(
    () =>
      metrics.map((m, k): RankingInput => ({
        id: m.id,
        values: columns[k],
        direction: dirs[k] ?? 1,
        weight: 1,
      })),
    [metrics, columns, dirs]
  );
  const stats = useMemo(() => metricStats(unweighted), [unweighted]);
  const inputs = useMemo(
    () => unweighted.map((inp, k) => ({ ...inp, weight: weights[k] ?? 1 })),
    [unweighted, weights]
  );
  const base = useMemo(
    () => computeRanking(inputs, entityIdx.length, method, minCoverage),
    [inputs, entityIdx.length, method, minCoverage]
  );
  const sens = useMemo(
    () => sensitivity(base, inputs, minCoverage),
    [base, inputs, minCoverage]
  );
  const insight = useMemo(
    () => leaderInsight(base, stats, inputs),
    [base, stats, inputs]
  );
  const surprise = useMemo(
    () => biggestSurprise(base, stats, inputs, method),
    [base, stats, inputs, method]
  );
  const labels = useMemo(
    () => uniqueLabels(dataset, metrics),
    [dataset, metrics]
  );

  return {
    method,
    minCoverage,
    metrics,
    inputs,
    stats,
    base,
    sens,
    insight,
    surprise,
    entityIdx,
    labels,
  };
}
