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
