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

describe('formatValue edge cases from data review', () => {
  test('negative money puts the sign before the currency', () => {
    expect(formatValue(metric('moneyWithCurrency'), -93e9)).toBe('-$93B');
  });

  test('negative years read as BC', () => {
    expect(formatValue(metric('year'), -9000)).toBe('9000 BC');
    expect(formatValue(metric('year'), 1947)).toBe('1947');
  });

  test('heights never show 12 inches', () => {
    expect(formatValue(metric('cmToFeet'), 182.79)).toBe('6′ 0″');
  });

  test('rank columns holding scores are not ordinals', () => {
    expect(formatValue(metric('ranking'), 52.2)).toBe('52.2');
  });

  test('scale units are never abbreviated twice', () => {
    expect(formatValue(metric('abbreviateNumber', 'Mt'), 13125)).toBe(
      '13,125 Mt'
    );
    expect(
      formatValue(metric('numberWithCommas', 'millions'), 569, {
        compact: true,
      })
    ).toBe('569 millions');
  });

  test('units that duplicate the format are dropped, others kept', () => {
    expect(formatValue(metric('degC', 'C'), -40)).toBe('-40.0°C');
    expect(formatValue(metric('floatNumberTenths', '°F'), 26.6)).toBe(
      '26.6 °F'
    );
    expect(formatValue(metric('floatNumber3', '$ per gallon'), 1.183)).toBe(
      '$1.183 per gallon'
    );
    expect(formatValue(metric('ranking', 'acres'), 41)).toBe('41st');
    expect(
      formatValue(metric('moneyWithCurrencyCents', 'per dozen'), 6.12)
    ).toBe('$6.12 per dozen');
  });

  test('whole counts have no stray decimals', () => {
    expect(formatValue(metric(null), 590)).toBe('590');
  });

  test('prices quoted per unit read as "$x/unit"', () => {
    expect(formatValue(metric('moneyWithCurrency3', '$/gallon'), 0.7092)).toBe(
      '$0.709/gallon'
    );
    expect(formatValue(metric('moneyWithCurrency', 'usd/ct'), 343.88)).toBe(
      '$344/ct'
    );
    expect(formatValue(metric('moneyWithCurrencyDollars', 'm²'), 5723.1)).toBe(
      '$5,723/m²'
    );
  });

  test('a capital M is a scale and is not abbreviated twice', () => {
    expect(formatValue(metric('abbreviateNumber', 'M'), 26.6)).toBe('26.6 M');
    expect(
      formatValue(metric('abbreviateNumber', 'M'), 12000, { compact: true })
    ).toBe('12,000 M');
  });
});
