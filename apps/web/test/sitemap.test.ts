import { describe, expect, test } from 'bun:test';

import { canonicalSitemap } from '../scripts/lib/sitemap';

describe('canonicalSitemap', () => {
  test('drops the trailing slash of index routes but keeps the root', () => {
    const xml = [
      '<loc>https://rankodex.com/</loc>',
      '<loc>https://rankodex.com/categories/</loc>',
      '<loc>https://rankodex.com/topics/state/x</loc>',
    ].join('\n');
    expect(canonicalSitemap(xml)).toBe(
      [
        '<loc>https://rankodex.com/</loc>',
        '<loc>https://rankodex.com/categories</loc>',
        '<loc>https://rankodex.com/topics/state/x</loc>',
      ].join('\n')
    );
  });
});
