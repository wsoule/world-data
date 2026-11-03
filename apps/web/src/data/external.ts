// Metric ids of data the pipeline adds from sources other than worldpopulationreview.com.
// The source site numbers its columns below 100,000; external metrics start at 900,000 so the
// two can never collide, and their ids stay stable across rebuilds so URLs keep working.

/** First id of the external range. */
export const EXTERNAL_ID_BASE = 900_000;

/** BEA Regional Price Parities by state (US average = 100). */
export const RPP = {
  allItems: 900_001,
  goods: 900_002,
  housing: 900_003,
  utilities: 900_004,
  otherServices: 900_005,
} as const;

/** BEA real personal income and spending per person, in constant dollars. */
export const REAL_INCOME = {
  perCapitaIncome: 900_011,
  perCapitaSpending: 900_012,
} as const;

/**
 * World Bank World Development Indicators for countries (yearly from 2000). Countries also use
 * `RPP.allItems` for their price level relative to the US, from the PPP price level ratio.
 */
export const WORLD_BANK = {
  gdpPerCapita: 900_101,
  gdpPerCapitaPpp: 900_102,
  gdpGrowth: 900_103,
  inflation: 900_104,
  unemployment: 900_105,
  gini: 900_106,
  extremePoverty: 900_107,
  lifeExpectancy: 900_111,
  infantMortality: 900_112,
  healthSpending: 900_113,
  fertility: 900_114,
  literacy: 900_121,
  internetUsers: 900_122,
  electricityAccess: 900_123,
  urbanPopulation: 900_124,
  co2PerCapita: 900_125,
} as const;
