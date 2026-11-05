// The correlations card's numbers for a topic page's opening view, worked out with the page's
// data slice. The card tests the focus statistic against every other statistic of the place
// type, which takes the type's whole data (country values.json alone is about 1.25 MB gzip).
// For the view a page opens on (its lead statistic, at its default year, unadjusted) the server
// and the page-data script compute the card once and store its rows in the page's slice
// (TopicPageData.correlations), so the browser renders the same card the HTML has without that
// download. Another metric, year or adjustment still computes it live from the whole type.

import { type CorrelationResult, findCorrelations } from './correlations';
import { leadMetric } from './headline';
import {
  displayTables,
  focusableMetrics,
  hasUndated,
  numericColumn,
  resolveYear,
  seriesYears,
} from './model';
import { Dataset, type TopicTitle } from '~/data/dataset';
import { readsBackwards } from '~/data/rankOrder';
import type { Metric, TopicFile } from '~/data/types';

/** The card's rows for the opening view, as a topic page's slice stores them. */
export interface StoredCorrelations {
  /** The focus statistic and year they were computed for */
  focus: number;
  year: number | null;
  /** What `topicCorrelations` returned, without its timing */
  result: Omit<CorrelationResult, 'ms'>;
  /** Catalog entries of the statistics the rows name */
  metrics: Metric[];
}

/** True when the metric's raw number runs against its standing: a best-first rank. */
function backwards(metric: Metric | undefined): boolean {
  return metric != null && readsBackwards(metric);
}

/**
 * The correlations card's result: `values` (the focus column, aligned to entities) against
 * every numeric statistic of `dataset` outside `exclude` (the topic's own), six strongest each
 * way. A best-first rank paired with a statistic read the other way has its r negated, so the
 * card reads ranks by standing (see CorrelationsCard).
 */
export function topicCorrelations(
  dataset: Dataset,
  focus: Metric,
  values: Float64Array,
  exclude: readonly number[]
): CorrelationResult {
  const skip = new Set(exclude);
  const candidates = dataset.metrics.filter(
    (m) =>
      m.kind === 'num' &&
      m.meta !== true &&
      !skip.has(m.id) &&
      dataset.hasValues(m.id)
  );
  const focusBackwards = backwards(focus);
  return findCorrelations(
    values,
    candidates,
    (id) => dataset.numeric(id),
    6,
    (id) => dataset.metricFullLabel(id).toLowerCase(),
    (id) => backwards(dataset.metric(id)) !== focusBackwards
  );
}

/**
 * The card for the view the topic page opens on, computed on the whole place type (`full`):
 * the same focus statistic (the lead, else the first focusable one), year and column the page
 * picks with no search params, as TopicPage works them out. Null when the page shows no card.
 */
export function defaultCorrelations(
  topic: TopicFile,
  full: Dataset
): StoredCorrelations | null {
  const tables = displayTables(topic, (id) => full.metric(id) != null);
  if (tables.length === 0) return null;
  const focusables = focusableMetrics(tables, (id) => full.metric(id));
  const leadId = leadMetric(topic, full)?.id;
  const focus = focusables.find((m) => m.id === leadId) ?? focusables[0];
  if (focus == null) return null;
  const years = seriesYears(topic, focus.id);
  const year = resolveYear(
    years,
    undefined,
    focus.year,
    hasUndated(topic, focus.id)
  );
  const values = numericColumn(topic, focus.id, year, full.entities.length);
  const { ms: _ms, ...result } = topicCorrelations(
    full,
    focus,
    values,
    topic.metrics
  );
  const named = new Set(
    [...result.positive, ...result.negative].map((h) => h.id)
  );
  return {
    focus: focus.id,
    year,
    result,
    metrics: full.metrics.filter((m) => named.has(m.id)),
  };
}

const cardDatasets = new WeakMap<StoredCorrelations, Dataset>();

/**
 * A Dataset holding just the statistics the stored rows name, for the card's labels and links
 * (`metric`, `metricContext`, `metricFullLabel`): the page's place type and entities from
 * `base`, the topic titles from the page's slice. Cached per stored object.
 */
export function storedCorrelationsDataset(
  base: Pick<Dataset, 'type' | 'entities'>,
  stored: StoredCorrelations,
  topics: readonly TopicTitle[]
): Dataset {
  let ds = cardDatasets.get(stored);
  if (ds == null) {
    ds = new Dataset(
      base.type,
      base.entities,
      stored.metrics,
      { entityCount: base.entities.length, metrics: [] },
      topics
    );
    cardDatasets.set(stored, ds);
  }
  return ds;
}
