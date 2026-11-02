import { describe, expect, test } from 'bun:test';

import { toNumber } from '../scripts/lib/clean';

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
