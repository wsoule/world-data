// Per-dataset values that every profile and head-to-head of the same place type reuses. Each is
// computed on first use and cached against the Dataset object (which is itself cached per type),
// so moving between places never repeats the work.

import {
  type CoverageCut,
  coverageCut,
  metricsWithData,
  rankableMetrics,
  type SimilarityBasis,
  similarityBasis,
  sizeDrivenMetrics,
} from './profileModel';
import type { Dataset } from '~/data/dataset';
import type { Metric } from '~/data/types';

export interface DatasetFacts {
  /** Numeric, non-bookkeeping metrics with values */
  rankable: Metric[];
  /** Minimum coverage for strengths, weak spots, categories and notable facts */
  cut: CoverageCut;
  /** Directional metrics that mostly track population (see `sizeDrivenMetrics`) */
  sizeDriven: Set<number>;
}

const factsCache = new WeakMap<Dataset, DatasetFacts>();
const basisCache = new WeakMap<Dataset, SimilarityBasis>();
const countsCache = new WeakMap<Dataset, Int32Array>();

export function datasetFacts(dataset: Dataset): DatasetFacts {
  let facts = factsCache.get(dataset);
  if (facts == null) {
    const rankable = rankableMetrics(dataset);
    facts = {
      rankable,
      cut: coverageCut(rankable, dataset.entities.length),
      sizeDriven: sizeDrivenMetrics(dataset, rankable),
    };
    factsCache.set(dataset, facts);
  }
  return facts;
}

export function similarityBasisFor(dataset: Dataset): SimilarityBasis {
  let basis = basisCache.get(dataset);
  if (basis == null) {
    basis = similarityBasis(dataset);
    basisCache.set(dataset, basis);
  }
  return basis;
}

/** Per-place count of real (non-synthetic) metrics with data. */
export function metricCountsFor(dataset: Dataset): Int32Array {
  let counts = countsCache.get(dataset);
  if (counts == null) {
    counts = metricsWithData(dataset);
    countsCache.set(dataset, counts);
  }
  return counts;
}

/** Lower-case plural for running text: "countries", "US states", "world cities". */
export function placeNoun(dataset: Dataset): string {
  return dataset.type.label.toLowerCase().replace(/^us /, 'US ');
}

/** The synthetic growth metric for a type: growth rate when present, else growth since 2020. */
export function growthMetricId(dataset: Dataset): number | null {
  if (dataset.hasValues(-3)) return -3;
  if (dataset.hasValues(-4)) return -4;
  return null;
}
