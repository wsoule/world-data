// Hand corrections to the metric catalog that build-data.ts applies over what it reads from the
// source pages. Kept apart from the build script so tests can check the committed catalog
// against them (test/catalog-polarity.test.ts).

import type { Polarity } from '../../src/data/types';

/** A correction to one metric's catalog entry; each field set wins over the build's own. */
export interface MetricFix {
  label?: string;
  unit?: string;
  fmt?: string;
  pol?: Polarity;
}

/**
 * The category scores of the State Integrity Investigation (Center for Public Integrity, 2015),
 * which the source labels "SSI … Score" on its most-corrupt-states page: like the investigation's
 * total (Alaska 76, Michigan 51), a higher score is a stronger safeguard against corruption. The
 * page's title ("Most Corrupt States") is all the polarity rules can read for most of them.
 */
const STATE_INTEGRITY_SCORES = [
  22192, 22193, 22194, 22195, 22196, 22197, 22198, 22199, 22200, 22201, 22202,
  22203, 22204,
];

/**
 * Polarity hand fixes for columns whose own words say nothing the rules can read, each checked
 * against its source page (see guessPolarity: the page's name no longer decides for them):
 */
export const POLARITY: readonly (readonly [string, Polarity, string])[] = [
  // Women, Peace and Security Index indicators on most-dangerous-countries-for-women: the
  // share of women employed, with a phone or banked is highest in Denmark, Iceland and Sweden
  // (the page's top) and lowest in Yemen and Afghanistan.
  ['country:24424', 1, "Women's Employment 2020 to 2024"],
  ['country:24425', 1, 'Female Cell Phone Users'],
  ['country:24428', 1, "Women's Employment 2018 to 2022"],
  ['country:24431', 1, "Women's Employment 2011 to 2016"],
  ['country:24432', 1, 'Cell Phone Users 2008 to 2016'],
  // Water stress scores (WRI Aqueduct), higher where water is scarcer, like the page's total.
  ['country:15818', -1, 'Domestic Score'],
  ['country:15819', -1, 'Agricultural Score'],
  // Yale EPI issue scores on greenest-countries (keys EPI…Score), higher for the better place.
  ['country:18288', 1, 'Ecosystem Vitality'],
  ['country:18289', 1, 'Environmental Health'],
  ['country:18290', 1, 'Climate Change'],
  // Shares of people living under a poverty line (poverty-rate-by-country).
  ['country:19255', -1, '% of Pop. Living on Less Than $3.65 USD/Day'],
  ['country:19256', -1, '% of Pop. Living on Less Than $10 USD/Day'],
  // World Rugby points: the more points, the better the rank (113th has 13.5).
  ['country:17260', 1, 'Mens Points'],
  ['country:17262', 1, 'Womens Points'],
  // Scores that a best-first rank on their own page orders (Spearman -0.85 to -1.0 with it):
  // the higher the score, the better the rank.
  ['country:25437', 1, 'Where Next Climate Score'],
  ['country:19628', 1, 'Cultural Influence Score'],
  ['country:23892', 1, 'Energy Trilemma Score'],
  ['country:23895', 1, 'Energy Equity Score'],
  ['country:17562', 1, 'Overall Infrastructure Score'],
  ['country:25453', 1, 'Natural Environment Score (US News)'],
  ['country:11763', 1, "Volleyball Men's Score"],
  ['country:11765', 1, "Volleyball Women's Score"],
  ['country:18954', 1, "Men's Points Earned"],
  ['country:18955', 1, "Men's Total Points"],
  ['country:18960', 1, "Women's Total Points"],
  ['state:7487', 1, 'Fishing Score'],
  ['state:8067', 1, 'Weighted Score'],
  ['state:8068', 1, 'Total Score'],
  // A US trade deficit or balance with a country is neither good nor bad for that country.
  ['country:19314', 0, 'US Trade Deficit'],
  // Mortgage payments as a share of income: a cost (Australia, Canada and the UK are high).
  ['country:17200', -1, 'Mortgage as a % of Income'],
  // Weird-countries' Insider Monkey "score" is a 1-3 weirdness grade, not a rank, and neither
  // better nor worse; so are the countries' order from the north, fast-food consumption and
  // world cities' density order.
  ['country:12635', 0, 'Rank (northernmost point)'],
  ['country:16058', 0, 'Weirdness Rank (Insider Monkey)'],
  ['country:16131', 0, 'Consumption Rank (fast food)'],
  ['world-city:25620', 0, 'Population Density Rank'],
  // The Economist's Safe Cities Index and CEOWorld's security scores, higher for safer cities
  // (US cities about 75, Indian about 54).
  ['world-city:25132', 1, 'Security Score Via CEOWorld'],
  ['world-city:25133', 1, 'Security Score Via Economic Impact'],
  ['world-city:25134', 1, 'Digital Security'],
  ['world-city:25135', 1, 'Health Security'],
  ['world-city:25136', 1, 'Infrastucture Security'],
  ['world-city:25137', 1, 'Personal Security'],
  ['world-city:25138', 1, 'Environmental Security'],
  // Pension-friendly-states: every column is a 0 (lowest) to 100 (highest) favourability score,
  // so New Hampshire's "Crime Rate" 100 is the best score, not the most crime.
  ['state:9958', 1, 'Overall Score'],
  ['state:9959', 1, 'Quality of Life'],
  ['state:9960', 1, 'Housing Cost'],
  ['state:9961', 1, 'Cost of Living'],
  ['state:9962', 1, 'Healthcare Cost and Quality'],
  ['state:9963', 1, 'Weather'],
  ['state:9964', 1, 'Crime Rate'],
  // The used car price's difference over the national average: a cost.
  ['state:9797', -1, 'Difference Over Average'],
  // Best-states-for-hiking's 1-10 ratings (Alaska and Arizona 7-9, Alabama 2-4), like 9335.
  ['state:9333', 1, 'Experience Rating'],
  ['state:9334', 1, 'Trail Diversity'],
  ['state:9336', 1, 'Accessibility'],
  // Most-unhealthy-states' sub-score is higher for unhealthier states (West Virginia 100),
  // like the page's total.
  ['state:21316', -1, 'Lifestyle Habits & Health Outlook Score'],
  // Vaccination coverage rates named only by the vaccine.
  ['state:24049', 1, 'MenACWY'],
  ['state:24052', 1, 'HPV Up-to-Date Male'],
  ['state:24053', 1, 'HPV Up-to-Date Female'],
  ['state:24054', 1, 'Tetanus'],
  ['state:24055', 1, 'Combined 7 Series'],
  ['state:24056', 1, 'MMR'],
  ['state:24057', 1, 'Varicella'],
  // Nurses a state still needs to hire by 2030: a shortage.
  ['state:15679', -1, 'Additional Nurses Needed from 2022 to 2030'],
  // How far a car gets in 15 minutes: farther means less congested streets.
  ['city:24972', 1, 'Average Distance Driven In 15Min'],
  // The road quality page's 2026 score is a bad-roads score: New Mexico 85.54 and Mississippi
  // 85.36 lead it, California's 64.85 comes with 46% of urban roads in poor condition and
  // Alabama's 21.03 with 14.1%. The source calls it "Road Quality Score"; see the label fix.
  ['state:25495', -1, 'Road Quality Score'],
];

/**
 * Hand corrections for source columns whose header, format or direction is wrong, keyed
 * "<type>:<metric id>":
 * - 20363 is keyed "…PctOfMammalSpeciesAtRisk" but titled as the fish column, 23920 is keyed
 *   "…_5to6Years" but titled "Ages 4-5", 23931 holds dollars under a cents header, 15277 holds
 *   percentages under a dollar format and 19747 holds euros with no format.
 * - 23862 holds World Energy Trilemma scores (Denmark 83.2 is the best) under a "Rank" header
 *   and rank format, and 9335 ("Scenic Beauty", keyed "…ScenicBeauty(1-10)") a 1-10 rating
 *   under a rank format (Alaska and Colorado 9, Delaware 3), like the hiking page's other
 *   ratings.
 * - Composite scores whose words read the wrong way, checked against the sub-ranks on their own
 *   page: BestLife's corruption score 22180 is higher for cleaner states (Vermont 100, Kentucky
 *   0.02; it tracks FiveThirtyEight's convictions-per-capita rank, which puts the most convictions
 *   first), the homelessness help score 21045 is higher for more help (Connecticut 68.2 ranks 1st
 *   on shelters and housing support), and the racial integration score 21159 is higher for more
 *   integrated states (Wisconsin 36.8 and DC 30.9, the lowest, rank last on employment and
 *   wealth integration).
 */
export const METRIC_FIXES: Readonly<Record<string, MetricFix>> = withPolarity({
  'country:19747': { fmt: 'moneyWithCurrencyEuros' },
  'country:23862': {
    label: 'Energy Sustainability Score',
    fmt: 'floatNumberTenths',
    pol: 1,
  },
  'state:9335': { fmt: 'numberWithCommas', pol: 1 },
  'state:15277': {
    label: 'Avg Median Down Payment for House (%)',
    fmt: 'percAlt',
  },
  'state:15864': { label: 'Gas Tax (¢/gallon)' },
  'state:20363': { label: '% of Mammal Species at Risk' },
  'state:21045': { pol: 1 },
  'state:21159': { pol: 1 },
  'state:22180': { pol: 1 },
  'state:23920': { label: 'CSR: Ages 5-6' },
  'state:23931': { label: 'Gas Tax ($/gallon)', unit: '$/gallon' },
  'state:25495': { label: 'Poor Roads Score' },
  // A 1-3 grade under a rank format (Australia, the US and China 3).
  'country:16059': { fmt: 'numberWithCommas', pol: 0 },
  ...Object.fromEntries(
    STATE_INTEGRITY_SCORES.map((id): [string, MetricFix] => [
      `state:${id}`,
      { pol: 1 },
    ])
  ),
});

/** The fixes with each POLARITY entry's direction merged in. */
function withPolarity(
  fixes: Record<string, MetricFix>
): Record<string, MetricFix> {
  const out = { ...fixes };
  for (const [key, pol] of POLARITY) out[key] = { ...out[key], pol };
  return out;
}
