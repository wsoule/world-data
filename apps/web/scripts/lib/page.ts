// Reads page-level metadata (title, sources, related pages, update date).
// Only titles and citations are kept; page prose is intentionally not copied.

import { decodeEntities } from './astro';

export interface PageLink {
  url: string;
  name: string;
}

const stripTags = (s: string): string =>
  decodeEntities(s.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

/** The page's <h1> text. */
export function pageTitle(html: string): string | null {
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  return m?.[1] == null ? null : stripTags(m[1]);
}

/**
 * Drops the edition year the source appends to titles ("… by State 2026" →
 * "… by State"). Only recent years are edition years; "Population by Country
 * in 1900" keeps its year because it is part of the subject.
 */
export function stripYear(title: string): string {
  const editionFrom = new Date().getUTCFullYear() - 1;
  const m = /\s+((?:19|20)\d{2})(\s*[-–]\s*(?:19|20)\d{2})?$/.exec(title);
  if (m?.[1] == null || Number(m[1]) < editionFrom) return title.trim();
  return title.slice(0, m.index).trim();
}

/** Links inside the first list after the element with the given id. */
export function sectionLinks(html: string, id: string): PageLink[] {
  const i = html.search(new RegExp(`id="${id}"`));
  if (i < 0) return [];
  const chunk = html.slice(i, i + 20000);
  const end = chunk.search(/<\/ol>|<\/ul>/);
  const body = end > 0 ? chunk.slice(0, end) : chunk;
  return [...body.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    (m) => ({ url: decodeEntities(m[1] ?? ''), name: stripTags(m[2] ?? '') })
  );
}

/** "Last Updated: October 28, 2026" as an ISO date. */
export function lastUpdated(html: string): string | null {
  const m = /Last Updated:<\/span>\s*([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(html);
  if (m?.[1] == null) return null;
  const d = new Date(`${m[1]} UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
