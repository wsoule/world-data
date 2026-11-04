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
export const METRIC_FIXES: Readonly<Record<string, MetricFix>> = {
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
  ...Object.fromEntries(
    STATE_INTEGRITY_SCORES.map((id): [string, MetricFix] => [
      `state:${id}`,
      { pol: 1 },
    ])
  ),
};
