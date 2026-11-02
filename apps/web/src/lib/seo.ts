// Builds route `head()` output (title, description, canonical URL, Open Graph,
// Twitter card, robots and JSON-LD) from one description of the page, so
// every route emits the same complete set of tags.

import { absoluteUrl, SITE } from '~/site';

type MetaTag =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

interface LinkTag {
  rel: string;
  href: string;
}

interface ScriptTag {
  type: string;
  children: string;
}

export interface PageSeo {
  /** Page title without the site name ("Median Household Income by State") */
  title: string;
  /** 120–160 characters, answer-first */
  description: string;
  /** Site path of the canonical URL ("/topics/state/…") */
  path: string;
  /** Absolute or site-relative social image; defaults to the site image */
  image?: string;
  /** Keep the page out of search indexes (thin or utility pages) */
  noindex?: boolean;
  /** Open Graph type, default "website" */
  ogType?: 'website' | 'article';
  /** schema.org objects, each emitted as its own JSON-LD script */
  jsonLd?: readonly Record<string, unknown>[];
}

export const DEFAULT_OG_IMAGE = '/og.png';

/** Trims a description to a search-snippet-friendly length on a word boundary. */
export function clampDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20))}…`;
}

/** Route `head()` result for a page. */
export function pageHead(seo: PageSeo): {
  meta: MetaTag[];
  links: LinkTag[];
  scripts: ScriptTag[];
} {
  const title = `${seo.title} — ${SITE.name}`;
  const description = clampDescription(seo.description);
  const url = absoluteUrl(seo.path);
  const image = absoluteUrl(seo.image ?? DEFAULT_OG_IMAGE);
  const meta: MetaTag[] = [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: seo.title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:type', content: seo.ogType ?? 'website' },
    { property: 'og:image', content: image },
    { name: 'twitter:title', content: seo.title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
  ];
  if (seo.noindex === true) {
    meta.push({ name: 'robots', content: 'noindex, follow' });
  }
  return {
    meta,
    links: [{ rel: 'canonical', href: url }],
    scripts: (seo.jsonLd ?? []).map((obj) => ({
      type: 'application/ld+json',
      children: JSON.stringify({ '@context': 'https://schema.org', ...obj }),
    })),
  };
}

/** schema.org BreadcrumbList from (name, path) pairs, home first. */
export function breadcrumbs(
  items: readonly { name: string; path: string }[]
): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** schema.org FAQPage from question/answer pairs (answers are plain text). */
export function faqPage(
  items: readonly { question: string; answer: string }[]
): Record<string, unknown> {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    })),
  };
}

/** The organization credited as publisher in structured data. */
export function publisher(): Record<string, unknown> {
  return { '@type': 'Organization', name: SITE.name, url: absoluteUrl('/') };
}
