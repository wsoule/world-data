import { describe, expect, test } from 'bun:test';

import {
  csvField,
  rankingCsv,
  toCsv,
} from '../src/features/compare/ranking/csv';

describe('csvField', () => {
  test('quotes only when needed and escapes quotes', () => {
    expect(csvField('Texas')).toBe('Texas');
    expect(csvField('Bonaire, Sint Eustatius')).toBe(
      '"Bonaire, Sint Eustatius"'
    );
    expect(csvField('The "Garden" State')).toBe('"The ""Garden"" State"');
    expect(csvField('a\nb')).toBe('"a\nb"');
  });

  test('writes numbers plainly and blanks for missing values', () => {
    expect(csvField(82.5)).toBe('82.5');
    expect(csvField(NaN)).toBe('');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });
});

describe('rankingCsv', () => {
  test('writes one row per place with value and percentile per metric', () => {
    const csv = rankingCsv({
      placeLabel: 'State',
      scoreLabel: 'Score (0-100)',
      metricColumns: [
        {
          value: 'Income (higher is better, weight 1)',
          percentile: 'Income percentile',
        },
      ],
      rows: [
        {
          rank: 1,
          name: 'Massachusetts',
          id: 'MA',
          group: 'Northeast',
          score: 81.23456,
          coverage: 1,
          metrics: [[96505, 97.96]],
        },
        {
          rank: 2,
          name: 'Utah',
          id: 'UT',
          group: null,
          score: 80,
          coverage: 0,
          metrics: [[NaN, NaN]],
        },
      ],
    });
    expect(csv.split('\r\n')).toEqual([
      'Rank,State,ID,Group,Score (0-100),Metrics with data,"Income (higher is better, weight 1)",Income percentile',
      '1,Massachusetts,MA,Northeast,81.235,1,96505,98',
      '2,Utah,UT,,80,0,,',
    ]);
  });
});

describe('toCsv', () => {
  test('joins header and rows with CRLF', () => {
    expect(
      toCsv(
        ['Rank', 'Place', 'Score'],
        [
          [1, 'Massachusetts', 81.2],
          [2, 'Côte d’Ivoire, West', null],
        ]
      )
    ).toBe(
      'Rank,Place,Score\r\n1,Massachusetts,81.2\r\n2,"Côte d’Ivoire, West",'
    );
  });
});
