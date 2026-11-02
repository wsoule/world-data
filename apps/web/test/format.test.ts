import { describe, expect, test } from 'bun:test';

import { formatValue, ordinal } from '../src/lib/format';

const metric = (fmt: string | null, unit: string | null = null) => ({
  fmt,
  unit,
  kind: 'num' as const,
});

describe('ordinal', () => {
  test('uses st/nd/rd/th including the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st',
      '111th',
    ]);
  });
});

describe('formatValue', () => {
  test('missing values render as a dash', () => {
    expect(formatValue(metric('numberWithCommas'), null)).toBe('—');
    expect(formatValue(metric('numberWithCommas'), NaN)).toBe('—');
  });

  test('percent formats: percAlt is already a percentage, perc is a fraction', () => {
    expect(formatValue(metric('percAlt'), 81.7)).toBe('81.7%');
    expect(formatValue(metric('perc'), 0.96)).toBe('96.0%');
    expect(formatValue(metric('perc'), 0.0087)).toBe('0.87%');
  });

  test('money and rankings', () => {
    expect(formatValue(metric('moneyWithCurrencyDollars'), 98498)).toBe(
      '$98,498'
    );
    expect(formatValue(metric('moneyWithCurrency'), 172359214000)).toBe(
      '$172.36B'
    );
    expect(formatValue(metric('ranking'), 42)).toBe('42nd');
  });

  test('appends word units but not scale ranges', () => {
    expect(formatValue(metric('numberWithCommas', 'acres'), 1200)).toBe(
      '1,200 acres'
    );
    expect(formatValue(metric('floatNumber', '0-10'), 7.74)).toBe('7.74');
    expect(
      formatValue(metric('numberWithCommas', 'acres'), 1200, { unit: false })
    ).toBe('1,200');
  });

  test('text values pass through with pipe lists joined', () => {
    expect(formatValue(metric(null), 'Rio | Tokyo | Paris')).toBe(
      'Rio, Tokyo, Paris'
    );
  });
});
