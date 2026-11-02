// Ready-made comparisons on the home page. Metric ids are checked against the dataset by
// test/home-presets.test.ts so a data rebuild that renumbers them fails loudly.

import type { CompareSearch } from '~/features/compare/state';

export interface HomePreset {
  id: string;
  title: string;
  /** The question the comparison answers */
  question: string;
  /** Short metric names shown as chips, in basket order */
  metrics: string[];
  search: CompareSearch;
  /** Call to action on the card */
  cta: string;
}

export const HOME_PRESETS: readonly HomePreset[] = [
  {
    id: 'state-quality-of-life',
    title: 'Best states to live in, your way',
    question:
      'Layer income, schools, safety, cost of living, health and happiness into one score.',
    metrics: [
      'Median household income',
      'Education rank',
      'Violent crime',
      'Cost of living',
      'Life expectancy',
      'Happiness',
    ],
    search: {
      type: 'state',
      view: 'ranking',
      m: [24419, 20594, 20784, 20425, 20608, 20482],
    },
    cta: 'Build the ranking',
  },
  {
    id: 'state-education-income',
    title: 'Education rank vs household income',
    question: 'Do richer states have better schools?',
    metrics: ['Education rank (US News)', 'Median household income'],
    search: {
      type: 'state',
      view: 'scatter',
      m: [20594, 24419],
      x: 20594,
      y: 24419,
    },
    cta: 'Overlay them',
  },
  {
    id: 'state-crime-poverty',
    title: 'Violent crime vs poverty',
    question: 'Is violent crime higher where more people are poor?',
    metrics: ['Poverty rate', 'Violent crime rate'],
    search: {
      type: 'state',
      view: 'scatter',
      m: [11725, 20784],
      x: 11725,
      y: 20784,
    },
    cta: 'Overlay them',
  },
  {
    id: 'country-gdp-happiness',
    title: 'GDP per capita vs happiness',
    question: 'Does money buy happiness, country by country?',
    metrics: ['GDP per capita', 'World happiness score'],
    search: {
      type: 'country',
      view: 'scatter',
      m: [19182, 14450],
      x: 19182,
      y: 14450,
      log: ['x'],
    },
    cta: 'Overlay them',
  },
  {
    id: 'country-life-gdp',
    title: 'Life expectancy vs GDP per capita',
    question: 'How much longer do people live in richer countries?',
    metrics: ['GDP per capita', 'Life expectancy'],
    search: {
      type: 'country',
      view: 'scatter',
      m: [19182, 18683],
      x: 19182,
      y: 18683,
      log: ['x'],
    },
    cta: 'Overlay them',
  },
];

/**
 * Ids of the metrics the home presets compare for one place type. These are the site's flagship
 * statistics (median household income, GDP per capita…), which search ranks a little higher.
 */
export function featuredMetricIds(type: CompareSearch['type']): Set<number> {
  const ids = new Set<number>();
  for (const p of HOME_PRESETS)
    if (p.search.type === type) for (const id of p.search.m) ids.add(id);
  return ids;
}

/** Curated well-known topics for the "Popular topics" list (type + slug). */
export const POPULAR_TOPICS: readonly {
  type: CompareSearch['type'];
  slug: string;
}[] = [
  { type: 'state', slug: 'best-states-to-live-in' },
  { type: 'country', slug: 'happiest-countries-in-the-world' },
  { type: 'state', slug: 'median-household-income-by-state' },
  { type: 'country', slug: 'gdp-per-capita-by-country' },
  { type: 'state', slug: 'crime-rate-by-state' },
  { type: 'country', slug: 'life-expectancy-by-country' },
  { type: 'state', slug: 'cost-of-living-index-by-state' },
  { type: 'country', slug: 'safest-countries-in-the-world' },
  { type: 'state', slug: 'most-educated-states' },
  { type: 'country', slug: 'average-iq-by-country' },
];

/** "type:slug" keys of the popular topics, which search also ranks a little higher. */
export function featuredTopicKeys(): Set<string> {
  return new Set(POPULAR_TOPICS.map((t) => `${t.type}:${t.slug}`));
}
