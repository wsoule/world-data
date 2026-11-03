import { describe, expect, test } from 'bun:test';

import { resolveSiteUrl } from '../src/site-url';

describe('resolveSiteUrl', () => {
  test('falls back to the default when unset or blank', () => {
    expect(resolveSiteUrl(undefined)).toBe('https://rankodex.com');
    expect(resolveSiteUrl('  ')).toBe('https://rankodex.com');
  });

  test('returns a bare origin and adds https:// to a bare host', () => {
    expect(resolveSiteUrl('https://example.up.railway.app/')).toBe(
      'https://example.up.railway.app'
    );
    expect(resolveSiteUrl('example.up.railway.app')).toBe(
      'https://example.up.railway.app'
    );
    expect(resolveSiteUrl('http://localhost:4173/x/')).toBe(
      'http://localhost:4173'
    );
  });

  test('throws on values that are not URLs', () => {
    expect(() => resolveSiteUrl('https://')).toThrow();
    expect(() => resolveSiteUrl('not a url')).toThrow();
  });
});
