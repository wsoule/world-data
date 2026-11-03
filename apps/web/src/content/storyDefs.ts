// Definitions of the data stories (articles): which two metrics each compares, for which places,
// and how it is presented. scripts/build-stories.ts computes the numbers for each into
// public/data/stories; the app writes the prose around them (features/articles/prose.ts), so
// every figure in an article comes from the data and updates with it.
//
// This file holds ids and words only, no app imports, so the build script can read it too.

import {
  ACS,
  CDC_PLACES,
  ELECTIONS,
  EPA_AIR,
  FBI_CRIME,
  NOAA_CLIMATE,
  RPP,
  WORLD_BANK,
} from '../data/external';
import type { EntityType } from '../data/types';

export interface StoryDef {
  slug: string;
  type: EntityType;
  /** Horizontal metric (the one the question starts from) */
  x: number;
  /** Vertical metric (the one it asks about) */
  y: number;
  /** Category metric to colour points by, such as the election winner */
  color?: number;
  logX?: boolean;
  title: string;
  /** One-sentence teaser for cards and the meta description */
  dek: string;
  cats: string[];
  /** Shown on the home page */
  featured?: boolean;
}

export const STORY_DEFS: StoryDef[] = [
  {
    slug: 'education-and-how-states-vote',
    type: 'state',
    x: ACS.bachelorsShare,
    y: ELECTIONS.republicanShare,
    color: ELECTIONS.winner,
    title: 'Do more educated states vote differently?',
    dek: 'The share of adults with a college degree predicts a state’s 2024 presidential vote better than almost anything else.',
    cats: ['politics-government', 'education'],
    featured: true,
  },
  {
    slug: 'education-and-how-counties-vote',
    type: 'county',
    x: ACS.bachelorsShare,
    y: ELECTIONS.republicanShare,
    color: ELECTIONS.winner,
    title: 'College degrees and the county vote',
    dek: 'The education divide holds across 3,000 counties, though less tightly than across states.',
    cats: ['politics-government', 'education'],
  },
  {
    slug: 'higher-pay-higher-prices',
    type: 'state',
    x: RPP.allItems,
    y: ACS.medianHouseholdIncome,
    title: 'Higher pay, higher prices',
    dek: 'States where incomes are highest are also where everyday prices are highest. How much of the gap does the cost of living eat?',
    cats: ['economics'],
    featured: true,
  },
  {
    slug: 'cost-of-living-and-the-vote',
    type: 'state',
    x: RPP.allItems,
    y: ELECTIONS.republicanShare,
    color: ELECTIONS.winner,
    title: 'Expensive states vote blue',
    dek: 'How a state’s price level lines up with its 2024 presidential vote.',
    cats: ['politics-government', 'economics'],
  },
  {
    slug: 'education-and-income-by-state',
    type: 'state',
    x: ACS.bachelorsShare,
    y: ACS.medianHouseholdIncome,
    title: 'Where degrees and paychecks go together',
    dek: 'States with more college graduates have higher household incomes, with a few telling exceptions.',
    cats: ['education', 'economics'],
  },
  {
    slug: 'smoking-and-education-by-county',
    type: 'county',
    x: ACS.bachelorsShare,
    y: CDC_PLACES.smoking,
    title: 'Smoking follows education, not geography',
    dek: 'Across US counties, the share of adults who smoke falls steeply as the share with a college degree rises.',
    cats: ['health', 'education'],
    featured: true,
  },
  {
    slug: 'poverty-and-health-by-county',
    type: 'county',
    x: ACS.povertyRate,
    y: CDC_PLACES.poorHealth,
    title: 'Poverty and poor health go hand in hand',
    dek: 'Counties with more people in poverty have far more adults who say their health is fair or poor.',
    cats: ['health', 'economics'],
    featured: true,
  },
  {
    slug: 'income-and-obesity-by-county',
    type: 'county',
    x: ACS.medianHouseholdIncome,
    y: CDC_PLACES.obesity,
    title: 'Richer counties, lower obesity',
    dek: 'Median household income and adult obesity across more than 2,900 counties.',
    cats: ['health', 'economics'],
  },
  {
    slug: 'exercise-and-obesity-by-county',
    type: 'county',
    x: CDC_PLACES.inactivity,
    y: CDC_PLACES.obesity,
    title: 'Where people don’t exercise, obesity is higher',
    dek: 'Physical inactivity and obesity rise and fall together county by county.',
    cats: ['health'],
  },
  {
    slug: 'inactivity-and-diabetes-by-county',
    type: 'county',
    x: CDC_PLACES.inactivity,
    y: CDC_PLACES.diabetes,
    title: 'Inactivity and diabetes, county by county',
    dek: 'One of the tightest links in the health data: counties where adults don’t exercise have far more diabetes.',
    cats: ['health'],
  },
  {
    slug: 'broadband-and-income-by-county',
    type: 'county',
    x: ACS.medianHouseholdIncome,
    y: ACS.broadbandShare,
    title: 'The broadband gap is an income gap',
    dek: 'Home internet subscriptions track household income across US counties.',
    cats: ['infrastructure-energy', 'economics'],
    featured: true,
  },
  {
    slug: 'poverty-and-mental-distress-by-county',
    type: 'county',
    x: ACS.povertyRate,
    y: CDC_PLACES.mentalDistress,
    title: 'Poverty and mental distress',
    dek: 'Counties with higher poverty rates report more adults with frequent mental distress.',
    cats: ['health', 'economics'],
  },
  {
    slug: 'education-and-sleep-by-county',
    type: 'county',
    x: ACS.bachelorsShare,
    y: CDC_PLACES.shortSleep,
    title: 'Do college towns sleep more?',
    dek: 'Short sleep is less common where more adults have a degree.',
    cats: ['health', 'education'],
  },
  {
    slug: 'poverty-and-murder-by-state',
    type: 'state',
    x: ACS.povertyRate,
    y: FBI_CRIME.murder,
    title: 'Murder rates and poverty',
    dek: 'States with higher poverty rates tend to have higher murder rates, with some large exceptions.',
    cats: ['crime-safety', 'economics'],
  },
  {
    slug: 'climate-and-the-vote',
    type: 'state',
    x: NOAA_CLIMATE.annualTemp,
    y: ELECTIONS.republicanShare,
    color: ELECTIONS.winner,
    title: 'Does climate predict politics?',
    dek: 'Warm states and cold states split almost evenly. A useful reminder that not every pair of numbers is linked.',
    cats: ['politics-government', 'environment'],
  },
  {
    slug: 'wealth-and-life-expectancy',
    type: 'country',
    x: WORLD_BANK.gdpPerCapitaPpp,
    y: WORLD_BANK.lifeExpectancy,
    logX: true,
    title: 'Richer countries live longer, up to a point',
    dek: 'Each doubling of income buys fewer extra years of life. The curve economists call the Preston curve.',
    cats: ['health', 'economics'],
    featured: true,
  },
  {
    slug: 'birth-rates-and-life-expectancy',
    type: 'country',
    x: WORLD_BANK.fertility,
    y: WORLD_BANK.lifeExpectancy,
    title: 'Fewer children, longer lives',
    dek: 'Countries where women have fewer children are, almost without exception, countries where people live longer.',
    cats: ['health', 'population'],
  },
  {
    slug: 'electricity-and-infant-deaths',
    type: 'country',
    x: WORLD_BANK.electricityAccess,
    y: WORLD_BANK.infantMortality,
    title: 'The lights and infant survival',
    dek: 'Access to electricity is one of the clearest dividing lines in infant mortality around the world.',
    cats: ['health', 'infrastructure-energy'],
  },
  {
    slug: 'health-spending-and-life-expectancy',
    type: 'country',
    x: WORLD_BANK.healthSpending,
    y: WORLD_BANK.lifeExpectancy,
    logX: true,
    title: 'What does health spending buy?',
    dek: 'Health spending per person against life expectancy, and where the United States lands.',
    cats: ['health', 'economics'],
  },
  {
    slug: 'wealth-and-carbon-emissions',
    type: 'country',
    x: WORLD_BANK.gdpPerCapitaPpp,
    y: WORLD_BANK.co2PerCapita,
    logX: true,
    title: 'Wealth and carbon emissions',
    dek: 'Richer countries emit more CO2 per person, but at the same income some emit several times more than others.',
    cats: ['environment', 'economics'],
  },
  {
    slug: 'income-and-home-values-by-city',
    type: 'city',
    x: ACS.medianHouseholdIncome,
    y: ACS.medianHomeValue,
    title: 'Where homes cost the most relative to income',
    dek: 'Home values track incomes across US cities, and the cities furthest above the line are where housing is least affordable.',
    cats: ['economics'],
  },
  {
    slug: 'education-and-violent-crime-by-city',
    type: 'city',
    x: ACS.bachelorsShare,
    y: FBI_CRIME.violent,
    title: 'Education and violent crime in US cities',
    dek: 'Cities with more college graduates report less violent crime on average, but the link is only moderate.',
    cats: ['crime-safety', 'education'],
  },
];

/**
 * Metrics the automatic pair articles may use: one representative per near-duplicate family
 * (the overall price level, not its five parts; yearly temperature, not January, July and
 * degree days; the Republican share, not also the Democratic share and margin), so the scan
 * never publishes several near-identical pages.
 */
export const PAIR_METRICS = new Set<number>([
  RPP.allItems,
  ACS.medianRent,
  ACS.medianHomeValue,
  ACS.medianHouseholdIncome,
  ACS.commuteMinutes,
  ACS.broadbandShare,
  ACS.povertyRate,
  ACS.bachelorsShare,
  CDC_PLACES.obesity,
  CDC_PLACES.diabetes,
  CDC_PLACES.smoking,
  CDC_PLACES.uninsured,
  CDC_PLACES.mentalDistress,
  CDC_PLACES.inactivity,
  CDC_PLACES.poorHealth,
  CDC_PLACES.depression,
  CDC_PLACES.bingeDrinking,
  CDC_PLACES.shortSleep,
  CDC_PLACES.checkup,
  EPA_AIR.medianAqi,
  NOAA_CLIMATE.annualTemp,
  NOAA_CLIMATE.annualPrecip,
  FBI_CRIME.violent,
  FBI_CRIME.property,
  FBI_CRIME.murder,
  ELECTIONS.republicanShare,
  WORLD_BANK.gdpPerCapitaPpp,
  WORLD_BANK.unemployment,
  WORLD_BANK.lifeExpectancy,
  WORLD_BANK.infantMortality,
  WORLD_BANK.healthSpending,
  WORLD_BANK.fertility,
  WORLD_BANK.internetUsers,
  WORLD_BANK.electricityAccess,
  WORLD_BANK.urbanPopulation,
  WORLD_BANK.co2PerCapita,
]);

/** Metrics measured in money or totals that span orders of magnitude, plotted on a log axis. */
export const LOG_METRICS = new Set<number>([
  WORLD_BANK.gdpPerCapitaPpp,
  WORLD_BANK.healthSpending,
]);

/** Source family of a metric id (900_2xx is CDC, 900_6xx is Census, …). */
export const family = (id: number): number => Math.floor(id / 100);
