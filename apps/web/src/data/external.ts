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

/** CDC PLACES model-based health estimates (age-adjusted % of adults), counties. */
export const CDC_PLACES = {
  obesity: 900_201,
  diabetes: 900_202,
  smoking: 900_203,
  uninsured: 900_204,
  mentalDistress: 900_205,
  inactivity: 900_206,
  poorHealth: 900_207,
  depression: 900_208,
  bingeDrinking: 900_209,
  shortSleep: 900_210,
  checkup: 900_211,
} as const;

/** EPA AirData annual air quality, counties with monitors. */
export const EPA_AIR = {
  medianAqi: 900_301,
  aqi90th: 900_302,
  goodDaysShare: 900_303,
  unhealthyDays: 900_304,
} as const;

/** NOAA nClimDiv 1991–2020 averages, counties and states. */
export const NOAA_CLIMATE = {
  annualTemp: 900_401,
  januaryTemp: 900_402,
  julyTemp: 900_403,
  annualPrecip: 900_404,
  heatingDays: 900_405,
  coolingDays: 900_406,
} as const;

/** BLS unemployment (LAUS) and wages (OEWS). */
export const BLS = {
  unemployment: 900_501,
  meanWage: 900_511,
  medianWage: 900_512,
} as const;

/** Census ACS 5-year estimates, states, counties and US cities. */
export const ACS = {
  medianRent: 900_601,
  medianHomeValue: 900_602,
  medianHouseholdIncome: 900_603,
  commuteMinutes: 900_604,
  broadbandShare: 900_605,
  povertyRate: 900_606,
  bachelorsShare: 900_607,
} as const;

/** FBI Crime in the United States, rates per 100,000 people. */
export const FBI_CRIME = {
  violent: 900_701,
  property: 900_702,
  murder: 900_703,
  burglary: 900_704,
  vehicleTheft: 900_705,
} as const;
