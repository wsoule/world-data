// Which pages search engines are asked to index and which URL each page names
// as canonical. The route loaders and heads use these for the robots and
// canonical tags; scripts/prerender-pages.ts uses the same functions for the
// sitemap, so the sitemap never lists a page that tells crawlers not to index
// it.
//
// Imports types only, through relative paths: vite.config.ts loads this file
// (via prerender-pages.ts) before the `~` alias exists.

import type { EntityType, Metric, TopicFile } from '../data/types';

/** A topic needs one numeric or categorical metric covering this many places to be indexed. */
export const MIN_TOPIC_PLACES = 10;

/** Most places one numeric metric, and one categorical metric, of a topic covers. */
export interface TopicCoverage {
  numeric: number;
  categorical: number;
}

/**
 * How many places the topic's best-covered numeric metric and best-covered categorical metric
 * have values for, each in its best-covered single year. Bookkeeping columns ("Data Year") and
 * free text do not count, and neither do metrics the place type does not publish. This is what
 * decides whether the page can draw a chart, a map or a categorical answer at all.
 */
export function topicCoverage(
  topic: Pick<TopicFile, 'metrics' | 'series'>,
  metricOf: (id: number) => Pick<Metric, 'kind' | 'meta'> | undefined
): TopicCoverage {
  const out: TopicCoverage = { numeric: 0, categorical: 0 };
  for (const id of topic.metrics) {
    const m = metricOf(id);
    if (m == null || m.meta === true || m.kind === 'text') continue;
    for (const [, values] of Object.values(topic.series[String(id)] ?? {})) {
      let n = 0;
      for (const v of values) {
        if (m.kind === 'num' ? typeof v === 'number' : v !== '') n++;
      }
      if (m.kind === 'num') out.numeric = Math.max(out.numeric, n);
      else out.categorical = Math.max(out.categorical, n);
    }
  }
  return out;
}

/**
 * Whether a topic page is worth indexing: it has a numeric metric (a chart, a map, correlations)
 * or a categorical metric (a categorical answer and map) covering at least MIN_TOPIC_PLACES
 * places. Text-only tables and lists of a handful of places stay prerendered and linked, but are
 * marked "noindex, follow" and left out of the sitemap.
 */
export function isIndexableTopic(coverage: TopicCoverage): boolean {
  return (
    coverage.numeric >= MIN_TOPIC_PLACES ||
    coverage.categorical >= MIN_TOPIC_PLACES
  );
}

/** Places with fewer numeric metrics than this are thin. */
export const MIN_PLACE_METRICS = 10;

/**
 * Places need this many widely ranked metrics with a better and a worse end (the rows the
 * profile's "Strengths and weak spots" ranks) to be indexed.
 */
export const MIN_WIDELY_RANKED_METRICS = 5;

/**
 * Whether a place profile is worth indexing: it has at least MIN_PLACE_METRICS numeric metrics,
 * and at least MIN_WIDELY_RANKED_METRICS of them rank enough of its type and have a better and a
 * worse end, so the page can name real strengths and weak spots instead of saying "Not enough
 * widely ranked metrics" (every world city today). Thin profiles stay reachable but are marked
 * noindex and left out of the sitemap.
 */
export function isIndexablePlace(
  metricCount: number,
  widelyRanked: number
): boolean {
  return (
    metricCount >= MIN_PLACE_METRICS &&
    widelyRanked >= MIN_WIDELY_RANKED_METRICS
  );
}

/**
 * Topic pages that only retitle another topic page: same place type, same metrics, same places
 * (the source publishes some tables under several titles). Each maps to the primary page its
 * canonical tag names, and it is left out of the sitemap.
 *
 * The rule, applied to every such group of exact duplicates:
 * - A neutral title, one that names no end of the list and no value of its categorical column
 *   (usually "<subject> by <type>"), covers every question the group asks, so the other pages
 *   point at it: corruption-perceptions-index-by-country takes least-corrupt-countries,
 *   most-corrupt-countries and countries-where-bribery-is-legal.
 * - Without a neutral title, pages that ask about opposite ends (coldest / hottest, most / least,
 *   safest / most dangerous) or different values (high / middle / low income, free / slave
 *   states, 12- / 24-hour time) answer different questions and keep their own canonical; their
 *   leads and default order differ (SEPARATE_DUPLICATES). Pages asking the same question
 *   (cheapest / least expensive) point at one of them.
 * - Among several candidates for primary, the generic "<subject>-by-<type>" slug, then the page
 *   the data build ranks first for most of the group's metrics (`Metric.topics[0]`, which
 *   prefers titles that match the metric labels), then the shorter slug.
 *
 * test/indexing.test.ts checks every pair against the data and fails when a group is missing.
 */
export const TOPIC_ALIASES: Readonly<
  Partial<Record<EntityType, Readonly<Record<string, string>>>>
> = {
  country: {
    'amazon-revenue-by-country': 'amazon-sales-by-country',
    'average-girth-size-by-country': 'penis-size-by-country',
    'smartest-countries': 'average-iq-by-country',
    'hardest-working-countries': 'average-work-week-by-country',
    'baldness-by-country': 'percentage-of-bald-males-by-country',
    'carbon-footprint-by-country': 'co2-emissions-by-country',
    'countries-where-bribery-is-legal':
      'corruption-perceptions-index-by-country',
    'least-corrupt-countries': 'corruption-perceptions-index-by-country',
    'most-corrupt-countries': 'corruption-perceptions-index-by-country',
    'suicide-legal-countries': 'where-is-euthanasia-legal',
    'countries-with-red-white-and-green-flags':
      'countries-with-green-white-and-red-flags',
    'countries-with-no-homeless': 'homelessness-by-country',
    'countries-with-rainforests': 'rainforest-countries',
    'countries-with-most-miss-universe':
      'which-country-has-the-most-miss-universe-winners',
    'country-with-the-most-islands': 'number-of-islands-by-country',
    'democracy-dictatorship-index-by-country': 'democracy-index-by-country',
    'first-world-countries': 'developed-countries',
    'ef-english-proficiency-index-by-country': 'english-proficiency-by-country',
    'income-inequality-by-country': 'gini-coefficient-by-country',
    'international-innovation-index-by-country':
      'global-innovation-index-by-country',
    'gypsy-population-by-country': 'roma-population-by-country',
    'what-country-has-the-highest-paid-government-leader':
      'highest-paid-government-leaders-in-the-world',
    'number-of-jews-in-the-world': 'jewish-population-by-country',
    'muslim-majority-countries': 'muslim-population-by-country',
    'oil-producing-countries': 'oil-production-by-country',
    'rare-earth-production-by-country': 'rare-earth-reserves-by-country',
    'vegetarianism-by-country': 'veganism-by-country',
  },
  state: {
    'abortion-bans-by-state': 'abortion-laws-by-state',
    'appalachian-mountains-states': 'appalachian-states',
    'thc-gummies-legal-states': 'cbd-legal-states',
    'cheapest-states-to-live-in': 'least-expensive-states',
    'same-sex-marriage-states': 'gay-marriage-by-state',
    'highest-point-in-each-state': 'tallest-mountain-by-state',
    'most-mountainous-states': 'tallest-mountain-by-state',
    'noahide-laws-by-state': 'jewish-population-by-state',
    'speed-limit-map-by-state': 'speed-limits-by-state',
    'states-without-front-license-plates': 'state-license-plate-laws',
  },
  city: {
    'worst-cities-in-america': 'worst-cities-in-the-us',
  },
};

/**
 * Exact-duplicate topic pages that keep their own canonical because they ask about opposite ends
 * or different values of the same data (see TOPIC_ALIASES), as "<type>/<slug>" per group.
 */
export const SEPARATE_DUPLICATES: readonly (readonly string[])[] = [
  ['state/coldest-states', 'state/hottest-states'],
  ['state/dumbest-states', 'state/smartest-states'],
  ['state/least-expensive-states', 'state/most-expensive-states-to-live-in'],
  ['state/free-states', 'state/slave-states', 'state/union-states'],
  ['state/least-free-states', 'state/most-free-states'],
  ['state/least-obese-states', 'state/most-obese-states'],
  ['state/least-religious-states', 'state/most-religious-states'],
  ['state/most-dangerous-states', 'state/safest-states'],
  ['state/single-party-consent-states', 'state/two-party-consent-states'],
  ['state/states-people-are-leaving', 'state/states-people-are-moving-to'],
  [
    'country/countries-that-use-12-hour-time',
    'country/what-countries-use-24-hour-time',
  ],
  ['country/healthiest-countries', 'country/unhealthiest-country-in-the-world'],
  [
    'country/high-income-countries',
    'country/low-income-countries',
    'country/middle-income-countries',
  ],
  ['country/least-racist-countries', 'country/most-racist-countries'],
  ['country/least-visited-countries', 'country/most-visited-countries'],
  [
    'country/most-dangerous-countries-in-asia',
    'country/safest-countries-in-asia',
  ],
  [
    'country/most-dangerous-countries-in-north-america',
    'country/safest-countries-in-north-america',
  ],
  ['country/most-peaceful-countries', 'country/most-violent-countries'],
];

/** TOPIC_ALIASES keyed "<type>/<slug>", so a lookup with any URL segment is safe. */
const aliasByPath = new Map(
  Object.entries(TOPIC_ALIASES).flatMap(([type, aliases]) =>
    Object.entries(aliases ?? {}).map(([slug, primary]) => [
      `${type}/${slug}`,
      primary,
    ])
  )
);

/** The slug a topic page's canonical tag names: its primary page's when it is an alias, else its own. */
export function canonicalTopicSlug(type: string, slug: string): string {
  return aliasByPath.get(`${type}/${slug}`) ?? slug;
}
