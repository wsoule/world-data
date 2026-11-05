// Hand corrections to the metric catalog that build-data.ts applies over what it reads from the
// source pages. Kept apart from the build script so tests can check the committed catalog
// against them (test/catalog-polarity.test.ts).

import type { Polarity } from '../../src/data/types';
import { round } from './clean';

/** A correction to one metric's catalog entry; each field set wins over the build's own. */
export interface MetricFix {
  label?: string;
  unit?: string;
  fmt?: string;
  pol?: Polarity;
  /**
   * Years left out: columns that hold another measure under the metric's header (a Census of
   * Agriculture count in an annual crop series, a growth rate in a production series).
   */
  dropYears?: readonly number[];
  /** Years the source stores in another scale; their values are multiplied by `by`. */
  scaleYears?: readonly { years: readonly number[]; by: number }[];
  /** Years in which this metric's cells and metric `with`'s were stored under each other's header. */
  swapYears?: { with: number; years: readonly number[] };
}

/** A metric's cells by year (or '_'), keyed by place id, as the data build accumulates them. */
export type FixableSeries = Map<number | '_', Map<string, number | string>>;

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
 * The Census of Agriculture years (1997, 2002, 2007, 2012, 2017, 2022) in USDA NASS annual crop
 * series, where the source put a census count of another kind under the survey's header:
 * tobacco reads Kentucky 108.2M lbs (2021), 990,864 (2022) and 85.1M (2023), sorghum Kansas
 * 265.2M bushels (2021), 42.1M (2022) and 169M (2023). Every census year dips 2 to 1,000 times
 * against both neighbours. Hay, maple syrup and dry peas have no census value in 1997.
 */
const CENSUS_YEARS = [1997, 2002, 2007, 2012, 2017, 2022];

/** The years from `from` to `to`, inclusive. */
function yearRange(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
const NASS_SERIES: readonly (readonly [number, readonly number[]])[] = [
  [13550, CENSUS_YEARS], // tobacco
  [13556, CENSUS_YEARS.slice(1)], // hay
  [21582, CENSUS_YEARS], // corn
  [13543, CENSUS_YEARS], // soybeans
  [13564, CENSUS_YEARS], // sorghum
  [13561, CENSUS_YEARS], // sunflower
  [13565, CENSUS_YEARS.slice(1)], // dry edible peas
  [13548, CENSUS_YEARS], // sugarbeets
  [13547, CENSUS_YEARS], // wheat
  [13534, CENSUS_YEARS.slice(1)], // maple syrup
  [13536, CENSUS_YEARS], // peanuts
  [13541, CENSUS_YEARS], // rice
];

/**
 * Years stored in another unit or holding another measure, found by the build's year-scale
 * check (scripts/lib/year-scale.ts) and checked against the source page, whose table carries
 * the same values:
 */
const YEAR_FIXES: Readonly<Record<string, MetricFix>> = {
  // Transparency International scored 0-10 until 2011 (Denmark 9.3 in 2010, 91 in 2015).
  'country:21700': {
    scaleYears: [{ years: [1995, 2000, 2005, 2010], by: 10 }],
  },
  // 2021 in TWh (United States 3,979), later years in kWh (4.13 trillion in 2022).
  'country:15724': { scaleYears: [{ years: [2021], by: 1e9 }] },
  // Pharma employment: 2021-22 a million times too large (Germany 132,660,000,000 in 2022,
  // 132,660 in 2023); market sales: 2022 in billions (US 631.5, then 631,500,000,000).
  'country:14497': { scaleYears: [{ years: [2021, 2022], by: 1e-6 }] },
  'country:14495': { scaleYears: [{ years: [2022], by: 1e9 }] },
  // NATO defence spending: 2019 in millions (US 750,886; 770.65 billion in 2020).
  'country:20065': { scaleYears: [{ years: [2019], by: 1e6 }] },
  // Oil exports and consumption in thousand barrels a day before 2020 and 2023 (US exports
  // 2,982 in 2019, 3,206,000 in 2020; US consumption 20,280 in 2022, 19,013,800 in 2023).
  'country:12315': {
    scaleYears: [{ years: [2003, 2008, 2013, 2018, 2019], by: 1000 }],
  },
  'country:15718': { scaleYears: [{ years: [2022], by: 1000 }] },
  // Chromium ore: 2020-21 in thousand tonnes (South Africa 18,000; 19.7 million t in 2023).
  'country:22095': { scaleYears: [{ years: [2020, 2021], by: 1000 }] },
  // Share of emissions under a carbon tax: 2023 as a fraction (Sweden 0.4, 40 in 2026).
  'country:22834': { scaleYears: [{ years: [2023], by: 100 }] },
  // Natural gas in m³: 2020-23 hold cubic feet (US 30.6 trillion; × 0.0283168 = 866 billion m³,
  // in line with 2024's 902 billion), and 2018-19 are shifted a row (the UK holds the US's
  // 822 billion). The EJ column holds billion m³ for 2018-20 (US 822).
  'country:23417': {
    dropYears: [2018, 2019],
    scaleYears: [{ years: [2020, 2021, 2022, 2023], by: 0.0283168 }],
  },
  'country:18712': { dropYears: [2018, 2019, 2020] },
  // The 2020 Heritage column holds Fraser's 0-10 index (US 8.22; Heritage 72.1 in 2022).
  'country:17804': { dropYears: [2020] },
  // UN gun homicide victims and rate were stored under each other's header in 2020-21 (US
  // "rate" 13,620 and "victims" 4.01 in 2020).
  'country:19700': { swapYears: { with: 19699, years: [2020, 2021] } },
  // Suicide "rate" 2021 holds counts (US 25,319; 8.64 in 2022).
  'country:19988': { dropYears: [2021] },
  // 2024 holds output in TWh (China 10,086.9 "%"), not the share of world output.
  'country:16901': { dropYears: [2024] },
  // Electricity production 2024 holds a growth rate (Germany -3, US 2.7), and the 10-year
  // growth rate's 2024 the share of world output (China 32.3, US 14.8).
  'country:11800': { dropYears: [2024] },
  'country:23938': { dropYears: [2024] },
  // Renewable generation by other sources in TWh: 2021 holds consumption in EJ (US 8.32, as
  // the EJ column's 7.96 in 2020; 71.5 TWh in 2022).
  'country:18367': { dropYears: [2021] },
  // US News "Power Score" 2023 holds the power ranks (US 1, China 2; scores 100 and 95.8 in
  // 2024).
  'country:19633': { dropYears: [2023] },
  // Coal consumption: the column is in exajoules, and 2024-25 are (China 92.16 EJ); 2020-23
  // hold tonnes (China 5,243,651,000).
  'country:18093': { dropYears: [2020, 2021, 2022, 2023] },
  // Coal reserves 2025 lists 14 mining countries with another mineral's figures (Chile 180M).
  'country:18553': { dropYears: [2025] },
  // Renewable consumption in EJ: 2021 holds the renewable share in % (DR Congo 96.3) and 2025
  // another, smaller series (US 0.88 EJ against 9.21 in 2023).
  'country:18368': { dropYears: [2021, 2025] },
  // NATO spending per person 2023 holds another measure (US 14.34, $2,100 in 2022).
  'country:19266': { dropYears: [2023] },
  // Organ transplants per million: deceased kidney 2024 and living liver 2023 hold another
  // donor type's rates (Spain kidney 68.5 in 2023, 27.71 in 2024).
  'country:22534': { dropYears: [2024] },
  'country:22535': { dropYears: [2023] },
  // Gini by state: 2021 on a 0-100 scale (California 48.7; 0.49 in 2024).
  'state:8091': { scaleYears: [{ years: [2021], by: 0.01 }] },
  // Cigarette state sales tax per pack: 2026 in dollars (California $0.90, which with the $2.87
  // excise makes the page's $3.77 total), 2025 the sales tax rate (8.25%).
  'state:20384': { dropYears: [2025], fmt: 'moneyWithCurrencyCents' },
  // FAA air carrier and commuter enplanements were stored under each other's header in
  // 2019-23 (Georgia "commuters" 48.9M in 2019; air carrier 51.2M in 2024).
  'state:15616': {
    swapYears: { with: 15617, years: [2019, 2020, 2021, 2022, 2023] },
  },
  // Road quality rank: 2026 counts from the worst roads (New Mexico 1st, Indiana 50th, the
  // order of the page's 2026 bad-roads score 25495), 2022-23 from the best (California 47th).
  'state:11272': { dropYears: [2026] },
  // Household diversity rank: 2025 matches the household diversity rank on the most diverse
  // states page (Spearman 0.995; Nevada 1st), 2023 matches nothing (-0.16; Nevada 45th).
  'state:9068': { dropYears: [2023] },
  // Sweet corn and tomato acres: the 2012 census column holds a count of another kind
  // (California 142 acres of sweet corn, 22,300 in 2022).
  'state:25414': { dropYears: [2012] },
  'state:25427': { dropYears: [2012] },
  // NASS dairy series hold one month's output from 1990 on (Wisconsin's cheese 315M lbs in
  // 2024), but whole years before it (1.87 billion lbs in 1987), and milk again in 1924-29 and
  // 1982 (twelve to fourteen times the neighbouring years).
  'state:13524': { dropYears: yearRange(1970, 1989) },
  'state:13569': { dropYears: yearRange(1970, 1989) },
  'state:13568': { dropYears: [1990] },
  'state:13535': { dropYears: [1924, 1925, 1926, 1927, 1928, 1929, 1982] },
  ...Object.fromEntries(
    NASS_SERIES.map(([id, years]): [string, MetricFix] => [
      `state:${id}`,
      { dropYears: years },
    ])
  ),
};

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
  ...YEAR_FIXES,
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

/**
 * Applies the year fixes (dropYears, scaleYears, swapYears) of one entity type to every copy of
 * each fixed metric's series. `containers` map metric ids to series: one for each metric as
 * accumulated over all pages, and one per topic. A swap applies only where a container holds
 * both metrics. Returns one line per fix for the build log, so no change is silent.
 */
export function applyYearFixes(
  type: string,
  containers: readonly Map<number, FixableSeries>[],
  fixes: Readonly<Record<string, MetricFix>> = METRIC_FIXES
): string[] {
  const log: string[] = [];
  for (const [key, fix] of Object.entries(fixes)) {
    const [t, idText = ''] = key.split(':');
    if (t !== type) continue;
    if (
      fix.dropYears == null &&
      fix.scaleYears == null &&
      fix.swapYears == null
    )
      continue;
    const id = Number(idText);
    let dropped = 0;
    let scaled = 0;
    let swapped = 0;
    for (const c of containers) {
      const series = c.get(id);
      if (series == null) continue;
      for (const year of fix.dropYears ?? []) {
        dropped += series.get(year)?.size ?? 0;
        series.delete(year);
      }
      for (const { years, by } of fix.scaleYears ?? []) {
        for (const year of years) {
          const store = series.get(year);
          if (store == null) continue;
          for (const [place, v] of store) {
            if (typeof v !== 'number') continue;
            store.set(place, round(v * by));
            scaled++;
          }
        }
      }
      const other =
        fix.swapYears == null ? undefined : c.get(fix.swapYears.with);
      if (fix.swapYears == null || other == null) continue;
      for (const year of fix.swapYears.years) {
        const mine = series.get(year);
        const theirs = other.get(year);
        series.delete(year);
        other.delete(year);
        if (theirs != null) series.set(year, theirs);
        if (mine != null) other.set(year, mine);
        swapped += (mine?.size ?? 0) + (theirs?.size ?? 0);
      }
    }
    const done: string[] = [];
    if (dropped > 0)
      done.push(`dropped ${fix.dropYears?.join(', ')} (${dropped} cells)`);
    if (scaled > 0) {
      const what = (fix.scaleYears ?? [])
        .map((s) => `${s.years.join(', ')} by ${s.by}`)
        .join('; ');
      done.push(`scaled ${what} (${scaled} cells)`);
    }
    if (swapped > 0) {
      const years = fix.swapYears?.years.join(', ') ?? '';
      done.push(
        `swapped ${years} with ${fix.swapYears?.with} (${swapped} cells)`
      );
    }
    log.push(
      `${key}: ${done.length > 0 ? done.join('; ') : 'matched no cells'}`
    );
  }
  return log;
}
