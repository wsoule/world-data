import { describe, expect, test } from 'bun:test';

import { headerYearsFromKey, toNumber } from '../scripts/lib/clean';

describe('toNumber', () => {
  test('parses plain, signed, currency and percent numbers', () => {
    expect(toNumber('0.5')).toBe(0.5);
    expect(toNumber('+3.5%')).toBe(3.5);
    expect(toNumber('12 %')).toBe(12);
    expect(toNumber('-$5')).toBe(-5);
    expect(toNumber('€ 12')).toBe(12);
    expect(toNumber('1e6')).toBe(1_000_000);
  });

  test('removes commas only when they group thousands', () => {
    expect(toNumber('1,234')).toBe(1234);
    expect(toNumber('$1,234.50')).toBe(1234.5);
    expect(toNumber('-1,000')).toBe(-1000);
    expect(toNumber('1,2345')).toBeUndefined();
  });

  test('keeps lists as text instead of gluing them into one number', () => {
    expect(toNumber('50, 60')).toBeUndefined();
    expect(toNumber('127, 220')).toBeUndefined();
    expect(toNumber('1958, 1962')).toBeUndefined();
    expect(toNumber('120/240')).toBeUndefined();
  });

  test('returns null for "no data" placeholders', () => {
    expect(toNumber('—')).toBeNull();
    expect(toNumber('N/A')).toBeNull();
    expect(toNumber('')).toBeNull();
  });
});

describe('headerYearsFromKey', () => {
  test("takes the key's year range when the header copied a neighbour's", () => {
    expect(
      headerYearsFromKey(
        'Education 2016 to 2021',
        'WPSWomensEducation2005To2016'
      )
    ).toBe('Education 2005 to 2016');
    expect(
      headerYearsFromKey(
        '# Change in Prison Pop. 2021 to 2022',
        'PrisonPopByStateChange_2022to2023'
      )
    ).toBe('# Change in Prison Pop. 2022 to 2023');
  });

  test('leaves matching, range-less and multi-range keys alone', () => {
    expect(
      headerYearsFromKey('Growth 2014-2024', 'PctMillionaireGrowth_2014to2024')
    ).toBe('Growth 2014-2024');
    expect(headerYearsFromKey('Education 2016 to 2021', 'WPSEducation')).toBe(
      'Education 2016 to 2021'
    );
    expect(
      headerYearsFromKey('Change 2001 to 2002', 'A_2001to2002_B_2003to2004')
    ).toBe('Change 2001 to 2002');
  });
});
