// The sources the data pipeline downloads directly (apps/web/scripts/sources/*), listed for the
// Sources and licensing page. Each entry names the topics built from it; test/trust-pages.test.ts
// checks the list against the published topic files, so a new source or topic fails the test
// until it is described here.

import { EXTERNAL_ID_BASE } from '~/data/external';
import type { EntityType, TopicSummary } from '~/data/types';

export interface TopicRef {
  type: EntityType;
  slug: string;
}

export interface DirectSource {
  /** Stable key (the pipeline file it comes from, plus the dataset) */
  id: string;
  /** Publisher, as the topic pages credit it */
  publisher: string;
  /** Dataset name */
  dataset: string;
  /** The publisher's page for the dataset */
  url: string;
  /** What Rankodex takes from it, in plain words */
  provides: string;
  /** Topics built from it (empty when it only supports others, such as place matching) */
  topics: readonly TopicRef[];
  /** Other uses on the site, such as an adjustment it feeds */
  alsoUsedFor?: string;
  /** Set when the publisher is not a government agency, to say what it is */
  note?: string;
}

/** Every directly downloaded source, grouped by publisher. */
export const DIRECT_SOURCES: readonly DirectSource[] = [
  {
    id: 'acs',
    publisher: 'US Census Bureau',
    dataset: 'American Community Survey 5-year estimates',
    url: 'https://www.census.gov/programs-surveys/acs',
    provides:
      'Median rent, home value and household income, commute time, broadband, poverty and college degrees, for 2020–2024, read from the Census Bureau’s Summary File.',
    topics: [
      { type: 'state', slug: 'housing-and-living-by-state' },
      { type: 'city', slug: 'housing-and-living-by-city' },
      { type: 'county', slug: 'housing-and-living-by-county' },
    ],
    alsoUsedFor:
      'Median household income is the divisor of the “share of income” adjustment for states, cities and counties.',
  },
  {
    id: 'census-geocoder',
    publisher: 'US Census Bureau',
    dataset: 'Census Geocoder',
    url: 'https://geocoding.geo.census.gov/',
    provides:
      'The metro area and Census place of each US city, looked up from its coordinates, so figures published for metro areas (BEA price levels, BLS wages) and Census places (ACS) reach the right cities.',
    topics: [{ type: 'city', slug: 'cost-of-living-by-city' }],
  },
  {
    id: 'bea-rpp',
    publisher: 'US Bureau of Economic Analysis',
    dataset: 'Regional Price Parities by State and Metro Area',
    url: 'https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area',
    provides:
      'Price levels for all items, goods, housing, utilities and other services (US average = 100). Cities take the value of their metro area.',
    topics: [
      { type: 'state', slug: 'regional-price-parities-by-state' },
      { type: 'city', slug: 'cost-of-living-by-city' },
    ],
    alsoUsedFor:
      'The cost-of-living adjustment of wages and incomes for states and US cities.',
  },
  {
    id: 'bea-real-income',
    publisher: 'US Bureau of Economic Analysis',
    dataset: 'Real Personal Income for States',
    url: 'https://www.bea.gov/data/income-saving/real-personal-income-states',
    provides:
      'Personal income and consumer spending per person in constant 2017 dollars, adjusted for each state’s price level.',
    topics: [{ type: 'state', slug: 'real-personal-income-by-state' }],
  },
  {
    id: 'bls-laus',
    publisher: 'US Bureau of Labor Statistics',
    dataset: 'Local Area Unemployment Statistics',
    url: 'https://www.bls.gov/lau/',
    provides: 'Annual average unemployment rates for states and counties.',
    topics: [
      { type: 'state', slug: 'unemployment-rate-by-state-bls' },
      { type: 'county', slug: 'unemployment-rate-by-county-bls' },
    ],
  },
  {
    id: 'bls-oews',
    publisher: 'US Bureau of Labor Statistics',
    dataset: 'Occupational Employment and Wage Statistics',
    url: 'https://www.bls.gov/oes/',
    provides:
      'Average and median annual wages across all jobs, for states and for metro areas, which each city takes from the metro it is in.',
    topics: [
      { type: 'state', slug: 'average-wage-by-state' },
      { type: 'city', slug: 'average-wage-by-city' },
    ],
  },
  {
    id: 'cdc-places',
    publisher: 'Centers for Disease Control and Prevention',
    dataset: 'PLACES: Local Data for Better Health',
    url: 'https://www.cdc.gov/places/',
    provides:
      'Model-based, age-adjusted shares of adults by county: obesity, diabetes, depression, smoking, binge drinking, sleep, exercise, checkups, health insurance and more.',
    topics: [{ type: 'county', slug: 'health-of-adults-by-county' }],
  },
  {
    id: 'epa-airdata',
    publisher: 'US Environmental Protection Agency',
    dataset: 'AirData annual air quality by county',
    url: 'https://aqs.epa.gov/aqsweb/airdata/download_files.html',
    provides:
      'Median and 90th-percentile Air Quality Index, the share of days with good air and the days unhealthy for sensitive groups or worse, for counties with monitors.',
    topics: [{ type: 'county', slug: 'air-quality-by-county' }],
  },
  {
    id: 'fbi-cde',
    publisher: 'Federal Bureau of Investigation',
    dataset: 'Crime in the United States (Crime Data Explorer)',
    url: 'https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/downloads',
    provides:
      'Violent crime, property crime, murder, burglary and vehicle theft per 100,000 people, for states and cities.',
    topics: [
      { type: 'state', slug: 'crime-rates-by-state-fbi' },
      { type: 'city', slug: 'crime-rates-by-city-fbi' },
    ],
  },
  {
    id: 'noaa-nclimdiv',
    publisher: 'NOAA National Centers for Environmental Information',
    dataset: 'nClimDiv climate division data',
    url: 'https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/',
    provides:
      '1991–2020 averages of yearly, January and July temperature, yearly precipitation, and heating and cooling degree days.',
    topics: [
      { type: 'state', slug: 'climate-by-state' },
      { type: 'county', slug: 'climate-by-county' },
    ],
  },
  {
    id: 'worldbank-wdi',
    publisher: 'The World Bank',
    dataset: 'World Development Indicators',
    url: 'https://databank.worldbank.org/source/world-development-indicators',
    provides:
      'Yearly country indicators from 2000: GDP per person, growth, inflation, unemployment, inequality, poverty, life expectancy, infant mortality, literacy, internet use, electricity access and more.',
    topics: [
      { type: 'country', slug: 'economic-indicators-by-country' },
      { type: 'country', slug: 'health-indicators-by-country' },
      { type: 'country', slug: 'development-indicators-by-country' },
    ],
    alsoUsedFor:
      'Each country’s price level (GDP per person in dollars over GDP per person at purchasing power parity) drives the cost-of-living adjustment for countries, and GDP per person is the divisor of their “share of income” adjustment.',
  },
  {
    id: 'elections',
    publisher: 'Tony McGovern',
    dataset: 'US County Level Presidential Election Results, 2008–2024',
    url: 'https://github.com/tonmcg/US_County_Level_Election_Results_08-24',
    provides:
      'Republican and Democratic vote shares, the margin and the winner of the 2016, 2020 and 2024 presidential elections by county; state results are the sums of their counties.',
    topics: [
      { type: 'state', slug: 'presidential-election-results-by-state' },
      { type: 'county', slug: 'presidential-election-results-by-county' },
    ],
    note: 'Public CSV files on GitHub, compiled from news-agency returns. It is not a government source.',
  },
];

/** Whether a topic is built only from directly downloaded sources (every metric in the external id range). */
export function isDirectSourceTopic(
  topic: Pick<TopicSummary, 'metrics'>
): boolean {
  return (
    topic.metrics.length > 0 &&
    topic.metrics.every((id) => id >= EXTERNAL_ID_BASE)
  );
}

export interface TopicOrigins {
  /** All published topics */
  total: number;
  /** Topics built directly from agency (and other direct) downloads */
  direct: number;
  /** Topics compiled from World Population Review's ranking pages */
  compiled: number;
}

/** How many topics come from World Population Review and how many from direct downloads. */
export function topicOrigins(index: readonly TopicSummary[]): TopicOrigins {
  let direct = 0;
  for (const t of index) if (isDirectSourceTopic(t)) direct++;
  return { total: index.length, direct, compiled: index.length - direct };
}
