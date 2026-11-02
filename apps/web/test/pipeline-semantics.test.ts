import { describe, expect, test } from 'bun:test';

import { looksLikeRanks } from '../scripts/lib/columns';
import { guessPolarity, keyText } from '../scripts/lib/reference';

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
  });
});
