// Starting points for an empty search: popular destinations and example queries.

import type { RecentItem } from './recent';

/** Hand-picked starting points shown when the palette or search page is empty. */
export const SUGGESTIONS: RecentItem[] = [
  {
    id: 'topic:state:median-household-income-by-state',
    kind: 'topic',
    type: 'state',
    title: 'Median Household Income by State',
    subtitle: 'Economics',
    flag: null,
    target: {
      kind: 'topic',
      type: 'state',
      slug: 'median-household-income-by-state',
    },
  },
  {
    id: 'topic:country:happiest-countries-in-the-world',
    kind: 'topic',
    type: 'country',
    title: 'Happiest Countries in the World',
    subtitle: 'Culture',
    flag: null,
    target: {
      kind: 'topic',
      type: 'country',
      slug: 'happiest-countries-in-the-world',
    },
  },
  {
    id: 'topic:state:crime-rate-by-state',
    kind: 'topic',
    type: 'state',
    title: 'Crime Rate by State',
    subtitle: 'Crime & Safety',
    flag: null,
    target: { kind: 'topic', type: 'state', slug: 'crime-rate-by-state' },
  },
  {
    id: 'topic:country:gdp-per-capita-by-country',
    kind: 'topic',
    type: 'country',
    title: 'GDP per Capita by Country',
    subtitle: 'Economics',
    flag: null,
    target: {
      kind: 'topic',
      type: 'country',
      slug: 'gdp-per-capita-by-country',
    },
  },
  {
    id: 'place:country:japan',
    kind: 'place',
    type: 'country',
    title: 'Japan',
    subtitle: 'Asia · Eastern Asia',
    flag: 'jp',
    target: { kind: 'place', type: 'country', slug: 'japan' },
  },
  {
    id: 'place:state:california',
    kind: 'place',
    type: 'state',
    title: 'California',
    subtitle: 'West region',
    flag: 'ca',
    target: { kind: 'place', type: 'state', slug: 'california' },
  },
];

/** Example queries offered as one-click chips in the empty palette and search page. */
export const TRY_QUERIES = [
  'income',
  'crime',
  'life expectancy',
  'happiest',
  'ca',
  'education',
];
