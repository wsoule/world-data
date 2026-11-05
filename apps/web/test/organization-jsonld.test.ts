import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { trustHead } from '../src/features/trust/head';
import { REPO_URL } from '../src/features/trust/links';
import {
  breadcrumbs,
  LOGO_PATH,
  LOGO_SIZE,
  organization,
  ORGANIZATION_ID,
  pageHead,
  publisher,
  publisherRef,
  unresolvedIds,
  website,
  WEBSITE_ID,
} from '../src/lib/seo';
import { absoluteUrl, SITE } from '../src/site';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));

describe('organization structured data', () => {
  test('one Organization with an @id, logo and the repository as sameAs', () => {
    expect(ORGANIZATION_ID).toBe(absoluteUrl('/#organization'));
    expect(organization()).toMatchObject({
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: SITE.name,
      url: absoluteUrl('/'),
      logo: { url: absoluteUrl(LOGO_PATH), width: 512, height: 512 },
      sameAs: [REPO_URL],
    });
  });

  test('publisher() carries the same @id, and the WebSite points at it', () => {
    expect(publisher()['@id']).toBe(ORGANIZATION_ID);
    expect(publisherRef()).toEqual({ '@id': ORGANIZATION_ID });
    expect(website()).toMatchObject({
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      url: absoluteUrl('/'),
      publisher: { '@id': ORGANIZATION_ID },
    });
  });

  test('the WebSite has the bare domain as alternate name and no retired SearchAction', () => {
    expect(website().alternateName).toEqual([new URL(absoluteUrl('/')).host]);
    expect(website()).not.toHaveProperty('potentialAction');
  });

  test('the logo is a 512×512 PNG in public/', () => {
    const png = readFileSync(path.join(PUBLIC, LOGO_PATH));
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    // IHDR: width and height are the big-endian words at bytes 16 and 20.
    expect(png.readUInt32BE(16)).toBe(LOGO_SIZE);
    expect(png.readUInt32BE(20)).toBe(LOGO_SIZE);
  });
});

/** The JSON-LD nodes a route head emits, parsed. */
function nodesOf(head: ReturnType<typeof pageHead>): Record<string, unknown>[] {
  return head.scripts.map(
    (sc) => JSON.parse(sc.children) as Record<string, unknown>
  );
}

const typesOf = (nodes: readonly Record<string, unknown>[]) =>
  nodes.map((n) => n['@type']);

describe('site nodes per page', () => {
  test('the home page and /about carry the full Organization and WebSite', () => {
    const home = nodesOf(
      pageHead({ title: 'Home', description: 'Home page.', path: '/' })
    );
    expect(home).toEqual([
      { '@context': 'https://schema.org', ...organization() },
      { '@context': 'https://schema.org', ...website() },
    ]);
    const about = nodesOf(trustHead('about'));
    expect(typesOf(about)).toEqual([
      'BreadcrumbList',
      'AboutPage',
      'Organization',
      'WebSite',
    ]);
    expect(about[2]).toMatchObject({ sameAs: [REPO_URL] });
    expect(unresolvedIds(about).size).toBe(0);
  });

  test('other pages get a short node for each site node they reference, and only those', () => {
    const dataset = nodesOf(
      pageHead({
        title: 'Coldest states',
        description: 'A topic page.',
        path: '/topics/state/coldest-states',
        jsonLd: [
          { '@type': 'Dataset', name: 'x', publisher: publisherRef() },
          breadcrumbs([{ name: 'Home', path: '/' }]),
        ],
      })
    );
    expect(typesOf(dataset)).toEqual([
      'Dataset',
      'BreadcrumbList',
      'Organization',
    ]);
    expect(dataset[2]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: SITE.name,
      url: absoluteUrl('/'),
    });
    expect(unresolvedIds(dataset).size).toBe(0);

    const methodology = nodesOf(trustHead('methodology'));
    expect(typesOf(methodology)).toEqual([
      'BreadcrumbList',
      'WebPage',
      'Organization',
      'WebSite',
    ]);
    expect(methodology[3]).not.toHaveProperty('description');
    expect(unresolvedIds(methodology).size).toBe(0);

    const hub = nodesOf(
      pageHead({
        title: 'Law',
        description: 'A category hub.',
        path: '/categories/law',
        jsonLd: [breadcrumbs([{ name: 'Home', path: '/' }])],
      })
    );
    expect(typesOf(hub)).toEqual(['BreadcrumbList']);
  });

  test('an Article page keeps the publisher logo', () => {
    const article = nodesOf(
      pageHead({
        title: 'A story',
        description: 'An article.',
        path: '/articles/a-story',
        ogType: 'article',
        jsonLd: [
          {
            '@type': 'Article',
            headline: 'A story',
            author: publisherRef(),
            publisher: publisherRef(),
          },
        ],
      })
    );
    expect(article[1]).toMatchObject({
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      logo: { url: absoluteUrl(LOGO_PATH) },
    });
    expect(unresolvedIds(article).size).toBe(0);
  });

  test('unresolvedIds lists references no node on the page defines', () => {
    expect([
      ...unresolvedIds([
        { '@type': 'A', x: { '@id': 'u1' }, y: [{ '@id': 'u2' }] },
        { '@type': 'B', '@id': 'u2' },
      ]),
    ]).toEqual(['u1']);
  });
});
