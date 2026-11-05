import { describe, expect, test } from 'bun:test';

import { collapseRepeatedWords } from '../scripts/lib/clean';
import {
  copiedCountFields,
  looksLikeRanks,
  parseCoordinate,
  parseYear,
  spelledNumbers,
} from '../scripts/lib/columns';
import { guessPolarity, keyText, splitKey } from '../scripts/lib/reference';

describe('looksLikeRanks', () => {
  const ranks = Array.from({ length: 50 }, (_, i) => i + 1);

  test('accepts rank labels over whole-number positions, ties allowed', () => {
    expect(looksLikeRanks('Rank', null, ranks)).toBe(true);
    expect(
      looksLikeRanks('GII Institutions Rank', 'numberWithCommas', ranks)
    ).toBe(true);
    expect(looksLikeRanks("Men's ODI Ranking", null, [1, 2, 2, 4, 5])).toBe(
      true
    );
  });

  test('rejects changes, percentiles, scores and non-positions', () => {
    expect(looksLikeRanks('Change in DI Rank', null, [-3, 0, 4])).toBe(false);
    expect(looksLikeRanks('Change in Rank 2025-26', null, ranks)).toBe(false);
    expect(looksLikeRanks('Percentile Rank', null, [0.5, 50, 99.5])).toBe(
      false
    );
    expect(looksLikeRanks('Rank Score', null, ranks)).toBe(false);
    expect(looksLikeRanks('Fishing Rank', 'percAlt', ranks)).toBe(false);
    expect(looksLikeRanks('Fishing Rank', null, [1.5, 3, 4])).toBe(false);
    expect(looksLikeRanks('Fishing Rank', null, [1, 1, 1, 1, 2])).toBe(false);
    expect(looksLikeRanks('Population', null, ranks)).toBe(false);
  });
});

describe('spelled-out numbers', () => {
  test('reads degrees and minutes as signed decimal degrees', () => {
    expect(parseCoordinate('20 00 N')).toBe(20);
    expect(parseCoordinate('21 06 S')).toBe(-21.1);
    expect(parseCoordinate('77 02 W')).toBe(-77.03);
    expect(parseCoordinate('North')).toBeNull();
  });

  test('reads the one year a date names', () => {
    expect(parseYear('4 July 1776')).toBe(1776);
    expect(parseYear('2500 BC')).toBe(-2500);
    expect(parseYear('11 February 660 BC')).toBe(-660);
    expect(parseYear('1945-Oct-30')).toBe(1945);
    expect(parseYear('06-27-2024')).toBe(2024);
    expect(parseYear('3 September 301')).toBe(301);
    expect(parseYear('788 AD')).toBe(788);
    expect(parseYear('1 January 1973 - 31 January 2020')).toBeNull();
    expect(parseYear('ongoing')).toBeNull();
  });

  test('reads a column only when nearly all of it reads, by its header', () => {
    expect(spelledNumbers('Latitude by Country', ['20 00 N', '5 00 S'])).toBe(
      'coordinate'
    );
    expect(
      spelledNumbers('Date Sovereignty Acquired', [
        '2500 BC',
        '4 July 1776',
        882,
      ])
    ).toBe('year');
    expect(
      spelledNumbers('Founding Date', [
        '01 September, 1918| 03 August, 1929',
        '18 August, 1903',
      ])
    ).toBeNull();
    expect(spelledNumbers('Date Issued', ['06-27-2024'])).toBeNull();
  });
});

describe('copiedCountFields', () => {
  const columns = [
    { id: 1, field: 'Rate_2024', year: 2024, format: 'floatNumberSmart' },
    { id: 2, field: 'Count_2024', year: 2024, format: 'numberWithCommas' },
    { id: 2, field: 'Count_2020', year: 2020, format: 'numberWithCommas' },
    { id: 1, field: 'Rate_2020', year: 2020, format: 'floatNumberSmart' },
  ];

  test('flags a count field that repeats the rate of the same year', () => {
    const rows = [1542.67524, 1466.59773, 1234.92018, 432.52201, 108.39574].map(
      (rate, i) => ({
        Rate_2024: rate,
        Count_2024: rate,
        Rate_2020: 943.9 + i,
        Count_2020: 6774 + i,
      })
    );
    expect(copiedCountFields(columns, rows)).toEqual(
      new Map([['Count_2024', 'Rate_2024']])
    );
  });

  test('keeps counts that only coincide on whole numbers', () => {
    const rows = [1, 2, 3, 4, 5].map((n) => ({ Rate_2024: n, Count_2024: n }));
    expect(copiedCountFields(columns, rows).size).toBe(0);
  });
});

describe('collapseRepeatedWords', () => {
  test('collapses a capitalised word typed twice', () => {
    expect(collapseRepeatedWords('Annual Annual Income')).toBe('Annual Income');
  });

  test('keeps lower-case and mixed-case repeats', () => {
    expect(
      collapseRepeatedWords('Western Lowland Gorilla (Gorilla gorilla gorilla)')
    ).toBe('Western Lowland Gorilla (Gorilla gorilla gorilla)');
    expect(collapseRepeatedWords('Gorilla beringei beringei')).toBe(
      'Gorilla beringei beringei'
    );
  });
});

describe('keyText', () => {
  test('drops source bookkeeping that reads like a quality word', () => {
    expect(
      keyText('StatesWithAll4Seasons_FavoriteSeasonIsSpring_pct_YearFree')
    ).toBe('States With All4Seasons Favorite Season Is Spring pct');
    expect(keyText('CountriesAtWarUCDPCasualtiesBestEstimate')).toBe(
      'Countries At War UCDPCasualties'
    );
  });
});

describe('guessPolarity', () => {
  const pol = (
    label: string,
    key = '',
    fmt: string | null = null,
    topics: string[] = []
  ) => guessPolarity(label, key, fmt, topics);

  test('reads ranks as positions, worst-first lists counting from the worst', () => {
    expect(pol('Fishing Rank', 'FishingRank')).toBe(-1);
    expect(pol('Economy Rank', 'WorstStates_USNewsEconomy', 'ranking')).toBe(1);
    expect(
      pol('Healthcare Rank', 'WorstStates_USNewsHealthCare', 'ranking')
    ).toBe(1);
    expect(pol('Worst City Ranking (USA Today)', 'WorstCitiesInUSARank')).toBe(
      1
    );
    expect(pol('Work-Related', 'MostStressedWorkRank', 'ranking')).toBe(1);
    expect(pol('FTE Reporter Rank', 'FTEReporterRatings', 'ranking')).toBe(1);
    // A worst-first page whose columns name the good end keeps rank 1 = best.
    expect(
      pol(
        'Low Incarceration Rate Rank',
        'WorstPrisonsLowIncarcerationRate',
        'ranking'
      )
    ).toBe(-1);
    expect(
      pol(
        'Work Environment Rank',
        'SaddestStatesWorkEnvironmentRank',
        'ranking'
      )
    ).toBe(-1);
    expect(pol('Percentile Rank')).toBe(1);
    expect(pol('Change in DI Rank')).toBe(0);
    expect(pol('WH Climate Change Rank', '', 'ranking')).toBe(-1);
  });

  test('treats preferences and source bookkeeping as neutral', () => {
    expect(
      pol(
        'Favorite Season is Summer',
        'StatesWithAll4Seasons_FavoriteSeasonIsSummer_pctOfResidents_YearFree'
      )
    ).toBe(0);
    expect(pol('O+ Blood Type', 'BloodType_OPosPctOfPop_pct_YearFree')).toBe(0);
    expect(
      pol(
        'Estimated Casualties UCDP',
        'CountriesAtWarUCDPCasualtiesBestEstimate'
      )
    ).toBe(0);
  });

  test('reads taxes paid as costs and tax collections as neutral', () => {
    expect(
      pol(
        'Avg. Annual Property Tax',
        'NoPropertyTaxAvgAnnualPropertyTax',
        'moneyWithCurrency',
        ['property-tax-free-states']
      )
    ).toBe(-1);
    expect(pol('Personal Income Tax', 'PersonalIncomeTaxByCountry')).toBe(-1);
    expect(pol('Tax Rate at 100% of Avg Wage')).toBe(-1);
    expect(pol('Min Rate', 'TaxRatesMinRate2023')).toBe(-1);
    expect(pol('Tax to GDP Ratio (Tax Revenue as % of GDP)')).toBe(0);
    expect(pol('One Percent Income Tax Share')).toBe(0);
    expect(pol('Lowest Bracket', 'IncomeTaxByStateLowestBracket')).toBe(0);
    expect(pol('Beer Tax', 'BeerTaxByState')).toBe(0);
    expect(
      pol('% Change In Pop. 2021-2022', 'LeastTaxed_ChangeInPop2021to2022')
    ).toBe(0);
  });

  test('spells out abbreviations before matching', () => {
    expect(pol('Agrv Assault Rate')).toBe(-1);
    expect(pol('Total STD Rate')).toBe(-1);
    expect(pol('% of Population Given at Least 1 Dose COVID Vacc.')).toBe(1);
  });

  test('prefers the label over the key, and a share of GDP is not GDP', () => {
    expect(
      pol(
        'Avg Income of Bottom 90% Families',
        'IncomeInequalityAvgIncomeOfBottom90Pct'
      )
    ).toBe(1);
    expect(pol('Infrastructure Spending (% of GDP)')).toBe(0);
    expect(pol('GDP per Capita')).toBe(1);
  });

  test('flips a negated label or topic match but not a key match', () => {
    expect(pol('Never Smoked', 'SmokingRatesNeverSmoked')).toBe(1);
    expect(
      pol(
        '% of Pop. with Less Than High School Diploma',
        'AttainedLessThanHighSchoolGraduate',
        null,
        ['most-educated-states']
      )
    ).toBe(-1);
    expect(
      pol(
        '% of Pop. Living on Less Than $10 USD/Day',
        'PovertyRatePctOnLessThan10USDPerDay'
      )
    ).toBe(-1);
    expect(
      pol(
        'Lack of Coping Capacities',
        'NaturalDisasterRiskLackOfCopingCapacities'
      )
    ).toBe(-1);
    expect(
      pol(
        'WJP RoLI Absence of Corruption Score',
        'WorldJusticeProjectRuleOfLawIndexAbsenceOfCorruption'
      )
    ).toBe(1);
  });

  test('reads named indexes the way their publishers define them', () => {
    expect(
      pol('Global Peace Index', 'GlobalPeaceIndex', 'floatNumber3', [
        'most-peaceful-countries',
      ])
    ).toBe(-1);
    expect(
      pol('Corruption Perception Index', 'CorruptionPerceptionsIndex', null, [
        'most-corrupt-countries',
      ])
    ).toBe(1);
    expect(
      pol(
        'EPI Air Pollution',
        'EnvironmentalPerformanceIndexAirPollutionScore',
        'floatNumber',
        ['dirtiest-countries-in-the-world']
      )
    ).toBe(1);
    expect(pol('EPI Recycling Score', 'EPIRecyclingScore')).toBe(1);
    expect(
      pol('Civil Liberties Freedom Rating', 'CivilLibertiesFreedomRating')
    ).toBe(-1);
    expect(
      pol('Political Rights Freedom Rating', 'PoliticalRightsFreedomRating')
    ).toBe(-1);
    // Other freedom and civil liberties scores are higher for freer places.
    expect(
      pol(
        'EIU Civil Liberties Score',
        'EIUDemocracyIndexCivilLiberties',
        null,
        ['democracy-index-by-country']
      )
    ).toBe(1);
    expect(pol('Air Quality Index', 'AirQualityIndexByState')).toBe(-1);
    expect(
      pol('AQI', 'worldCityAQI', null, ['air-quality-index-by-world-city'])
    ).toBe(-1);
    expect(
      pol('SWAMP Index Score', 'SWAMPIndexScore', null, ['most-corrupt-states'])
    ).toBe(1);
    expect(
      pol(
        'State Integrity Investigation (SII) Total Score',
        'SIIStateIntegrityInvestigation',
        null,
        ['most-corrupt-states']
      )
    ).toBe(1);
    // A rank of an index is still a position, and a change in one is not the index.
    expect(pol('Global Peace Index Rank', 'GPIRank', 'ranking')).toBe(-1);
    expect(
      pol('EPI 10-Year Change', 'EnvironmentalPerformanceIndex10YearChange')
    ).toBe(0);
  });

  test('reads unhealthy days and scores as worse', () => {
    expect(
      pol(
        'Days with Unhealthy Air Quality (US News)',
        'DaysWithUnhealthyAirQuality'
      )
    ).toBe(-1);
    expect(
      pol(
        'Lifestyle Habits & Health Outlook Score',
        'MostUnhealthyStatesLifestyleHabitsAndHealthOutlook'
      )
    ).toBe(-1);
  });

  test('reads the gun death rank as worst first', () => {
    expect(pol('Gun Death Rank', 'GunDeathRankByState', 'ranking')).toBe(1);
  });

  test('does not read a column by the name of its page', () => {
    // The key's leading words repeat the page's slug; the column is what follows.
    expect(
      pol('Physically Inactive', 'HealthiestStatesPhysicallyInactive', null, [
        'healthiest-states',
      ])
    ).toBe(-1);
    expect(
      pol(
        'Parliamentary Representation of Women',
        'WPSWomensParliamentaryRepresentation',
        null,
        ['most-dangerous-countries-for-women']
      )
    ).toBe(1);
    expect(
      pol('Houses w/ Rodents', 'CleanestCitiesinUS_PctWithRodents', null, [
        'cleanest-cities-in-the-us',
      ])
    ).toBe(-1);
    expect(
      pol('% Sheltered', 'HomelessPopulationShelteredPctOfTotal', null, [
        'homeless-population-by-state',
      ])
    ).toBe(1);
    // With no words of its own, a column is neither better nor worse...
    expect(
      pol(
        'Maximum Weekly Benefits',
        'UnemploymentBenefitsMaximumWeeklyBenefits',
        null,
        ['unemployment-benefits-by-state']
      )
    ).toBe(0);
    expect(
      pol(
        'Total Air Passengers Carried',
        'PassengerAirTrafficTotalPassengers',
        null,
        ['passenger-air-traffic-by-country']
      )
    ).toBe(0);
    // ...unless it is only the page's own score or a period of its measure.
    expect(
      pol('Total Score', 'BestStatesforHikingTotalScore', null, [
        'best-states-for-hiking',
      ])
    ).toBe(1);
    expect(
      pol('WH 2023 Total Score', 'GreenestWH2023TotalScore', null, [
        'greenest-states',
      ])
    ).toBe(1);
    expect(
      pol('Total Score', 'WaterStressBaselineTotalScore', null, [
        'water-stress-by-country',
      ])
    ).toBe(-1);
    expect(
      pol('Hourly', 'BCBASalaryHourly', null, ['bcba-salary-by-state'])
    ).toBe(1);
  });

  test('lets a label state its own direction', () => {
    expect(pol('Vulnerability Score (lower is better)')).toBe(-1);
    expect(pol('Government Response (higher is better)')).toBe(1);
    expect(pol('Overall Score (Higher is Better)')).toBe(1);
  });

  test('reads cost only in labels that are not a score of it', () => {
    expect(pol('Healthcare Cost and Quality')).toBe(1);
    expect(pol('Cost of Living Index (Numbeo)')).toBe(-1);
    expect(pol('Livable Hourly Wage w/ 1 Child')).toBe(-1);
    expect(pol('Livable Wage w/ No Children (Annual)')).toBe(-1);
    expect(pol('COLI Overall Index')).toBe(-1);
  });

  test('reads score families as their publishers define them', () => {
    expect(pol('WDI Street Safety')).toBe(-1);
    expect(pol("Women's Danger Index (WDI) Total Score")).toBe(-1);
    expect(pol('WJP RoLI Criminal Justice Score')).toBe(1);
    expect(pol('WJP Rule of Law Index Overall Score')).toBe(1);
    expect(pol('V-Dem LCI Score')).toBe(1);
    expect(pol('EIU Electoral Process Score')).toBe(1);
    expect(pol('Cost of Living Score (IL)')).toBe(1);
  });

  test('reads vaccination, production and negated words', () => {
    expect(pol('Varicella 2 Doses (Disease History)')).toBe(1);
    expect(pol('Varicella 2 Doses (No Disease History)')).toBe(1);
    expect(pol('Tobacco Production')).toBe(0);
    expect(pol('Tobacco Acres Harvested')).toBe(0);
    expect(pol('Houses w/out Litter')).toBe(1);
    expect(pol('GTI Anti-Discrimination Legislation')).toBe(1);
    expect(pol('Absence of Legal Discrimination (0 to 100)')).toBe(1);
    expect(pol('DUI Limit')).toBe(0);
  });

  test('reads the water scarcity and food waste ranks as worst first', () => {
    expect(
      pol('Water Scarcity Ranking', 'WaterScarcityRanking', 'ranking')
    ).toBe(1);
    expect(pol('Food Wasted Rank', 'FoodWasteFoodWastedRank', 'ranking')).toBe(
      1
    );
  });
});

describe('splitKey', () => {
  test("separates the page's name from the column", () => {
    expect(
      splitKey('HealthiestStatesPhysicallyInactive', ['healthiest-states'])
    ).toEqual({ page: 'Healthiest States', column: 'Physically Inactive' });
    expect(
      splitKey('WPSWomensEmployment', ['most-dangerous-countries-for-women'])
    ).toEqual({
      page: '',
      column: 'WPSWomens Employment',
    });
    expect(splitKey('RoadQualityScore', [])).toEqual({
      page: '',
      column: 'Road Quality Score',
    });
  });
});
