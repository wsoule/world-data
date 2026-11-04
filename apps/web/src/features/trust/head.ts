// Route head() for the trust pages: title, description and canonical URL from pages.ts, plus a
// BreadcrumbList and a WebPage-type node that names the site and its publisher by @id.

import { TRUST_PAGE, type TrustPageId } from './pages';
import { breadcrumbs, pageHead, publisherRef, WEBSITE_ID } from '~/lib/seo';
import { absoluteUrl, SITE } from '~/site';

/** The schema.org page node (AboutPage, ContactPage or WebPage) for a trust page. */
export function trustPageNode(id: TrustPageId): Record<string, unknown> {
  const page = TRUST_PAGE[id];
  return {
    '@type': page.schemaType,
    '@id': `${absoluteUrl(page.path)}#webpage`,
    url: absoluteUrl(page.path),
    name: page.title,
    description: page.description,
    inLanguage: 'en',
    isPartOf: { '@id': WEBSITE_ID },
    publisher: publisherRef(),
    ...(id === 'about' ? { about: publisherRef() } : {}),
  };
}

/** Complete route head() for a trust page. */
export function trustHead(id: TrustPageId): ReturnType<typeof pageHead> {
  const page = TRUST_PAGE[id];
  return pageHead({
    title: page.title,
    description: page.description,
    path: page.path,
    jsonLd: [
      breadcrumbs([
        { name: SITE.name, path: '/' },
        { name: page.label, path: page.path },
      ]),
      trustPageNode(id),
    ],
  });
}
