import { describe, expect, test } from 'bun:test';

import {
  belongsInSitemap,
  canonicalSitemap,
  filterSitemap,
  pageIndexing,
  sitemapLocs,
} from '../scripts/lib/sitemap';

/** A sitemap as TanStack Start writes it, with the given <url> bodies. */
const sitemap = (...entries: string[]): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((e) => `  <url>\n    ${e}\n  </url>`),
    '</urlset>',
  ].join('\n');

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

describe('sitemapLocs and filterSitemap', () => {
  const xml = sitemap(
    '<loc>https://rankodex.com/</loc>',
    '<loc>https://rankodex.com/places/world-city/adana</loc>\n    <priority>0.4</priority>',
    '<loc>https://rankodex.com/places/country/japan</loc>'
  );

  test('lists every <loc> in order', () => {
    expect(sitemapLocs(xml)).toEqual([
      'https://rankodex.com/',
      'https://rankodex.com/places/world-city/adana',
      'https://rankodex.com/places/country/japan',
    ]);
  });

  test('removes whole entries whose <loc> fails the test', () => {
    expect(filterSitemap(xml, (loc) => !loc.includes('world-city'))).toBe(
      sitemap(
        '<loc>https://rankodex.com/</loc>',
        '<loc>https://rankodex.com/places/country/japan</loc>'
      )
    );
  });
});

describe('pageIndexing', () => {
  test('reads robots and canonical tags in any attribute order', () => {
    expect(
      pageIndexing(
        '<html><head><meta name="robots" content="noindex, follow"/><link rel="canonical" href="https://rankodex.com/a"/></head><body></body></html>'
      )
    ).toEqual({ noindex: true, canonical: 'https://rankodex.com/a' });
    expect(
      pageIndexing(
        '<head><meta content="index, follow" name="robots"><link href="https://rankodex.com/b?x=1&amp;y=2" rel="canonical"></head>'
      )
    ).toEqual({ noindex: false, canonical: 'https://rankodex.com/b?x=1&y=2' });
  });

  test('ignores tags in the body and pages without the tags', () => {
    expect(
      pageIndexing(
        '<head><title>x</title></head><body><meta name="robots" content="noindex"></body>'
      )
    ).toEqual({ noindex: false, canonical: null });
  });
});

describe('belongsInSitemap', () => {
  const url = 'https://rankodex.com/topics/country/gypsy-population-by-country';
  test('needs an indexable page that names itself as canonical', () => {
    expect(belongsInSitemap(url, { noindex: false, canonical: url })).toBe(
      true
    );
    expect(belongsInSitemap(url, { noindex: true, canonical: url })).toBe(
      false
    );
    expect(
      belongsInSitemap(url, {
        noindex: false,
        canonical:
          'https://rankodex.com/topics/country/roma-population-by-country',
      })
    ).toBe(false);
    expect(belongsInSitemap(url, { noindex: false, canonical: null })).toBe(
      false
    );
  });
});
