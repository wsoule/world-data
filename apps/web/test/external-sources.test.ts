import { describe, expect, test } from 'bun:test';

import { csvRecords, num, parseCsv } from '../scripts/lib/csv';
import { countyKey, pageFromObservations } from '../scripts/lib/external';

describe('parseCsv', () => {
  test('handles quotes, doubled quotes and line breaks inside fields', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,"two\nlines",3\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', 'two\nlines', '3'],
    ]);
  });

  test('records are keyed by the trimmed header', () => {
    expect(csvRecords('"State","County "\nOhio,Franklin')).toEqual([
      { State: 'Ohio', County: 'Franklin' },
    ]);
  });
});

describe('num', () => {
  test('reads formatted numbers and rejects source codes', () => {
    expect(num('1,234.5')).toBe(1234.5);
    expect(num(' 12 ')).toBe(12);
    expect(num('-3')).toBe(-3);
    expect(num('(NA)')).toBeNull();
    expect(num('-')).toBeNull();
    expect(num('')).toBeNull();
  });
});

describe('countyKey', () => {
  test('matches county names across sources', () => {
    expect(countyKey('Los Angeles County, CA')).toBe(countyKey('Los Angeles'));
    expect(countyKey('Orleans Parish')).toBe(countyKey('Orleans'));
    expect(countyKey('St. Louis County')).toBe(countyKey('Saint Louis'));
  });

  test("keeps Virginia's independent cities apart from same-named counties", () => {
    expect(countyKey('Richmond city')).not.toBe(countyKey('Richmond County'));
  });
});

describe('pageFromObservations', () => {
  const metrics = [
    { id: 1, key: 'a', header: 'A', format: 'floatNumber', pol: 1 as const },
    { id: 2, key: 'b', header: 'B', format: 'floatNumber', pol: -1 as const },
    {
      id: 3,
      key: 'unused',
      header: 'U',
      format: 'floatNumber',
      pol: 0 as const,
    },
  ];
  const page = pageFromObservations(
    {
      type: 'state',
      slug: 's',
      title: 'T',
      cats: [],
      sources: [],
      updated: null,
    },
    metrics,
    [
      { place: 'CA', identity: { code: 'CA' }, key: 'a', year: 2024, value: 5 },
      { place: 'CA', identity: { code: 'CA' }, key: 'a', year: 2023, value: 4 },
      { place: 'TX', identity: { code: 'TX' }, key: 'b', year: null, value: 7 },
      {
        place: 'TX',
        identity: { code: 'TX' },
        key: 'b',
        year: null,
        value: NaN,
      },
    ]
  );

  test('one row per place, one field per metric and year', () => {
    expect(page.rows).toEqual([
      { code: 'CA', a_2024: 5, a_2023: 4 },
      { code: 'TX', b: 7 },
    ]);
  });

  test('columns carry the declared polarity, and unused metrics are left out', () => {
    expect(page.columns.map((c) => [c.field, c.year, c.pol])).toEqual([
      ['a_2024', 2024, 1],
      ['a_2023', 2023, 1],
      ['b', null, -1],
    ]);
    expect(page.tables[0].columns).toEqual(['a', 'b']);
  });
});
