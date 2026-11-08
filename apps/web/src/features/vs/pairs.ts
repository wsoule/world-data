// Which head-to-head matchups get their own prerendered page (/vs/<type>/<a>-vs-<b>), and how
// those URLs are spelled. People search for "California vs Texas", and the interactive /vs tool
// is a client-rendered shell search engines cannot read, so the matchups worth a page are picked
// once by scripts/build-pairs.ts into public/data/pairs.json; the prerender list, the sitemap,
// the pair pages and the place profiles all read that file.
//
// Imports types only, through relative paths: vite.config.ts loads this file (via
// scripts/prerender-pages.ts) before the `~` alias exists.

import type { EntityType } from '../../data/types';

/** public/data/pairs.json: per place type, the paired place slugs, each pair in `pairOrder`. */
export type PairsFile = Partial<Record<EntityType, [string, string][]>>;

/** Where the pair list lives, relative to /data. */
export const PAIRS_PATH = 'pairs.json';

/**
 * The two slugs of a matchup in their one canonical order (plain string order, so every runtime
 * agrees), so "texas vs california" and "california vs texas" share a single URL.
 */
export function pairOrder(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** The `$pair` URL segment of a matchup: "california-vs-texas". */
export function pairSlug(a: string, b: string): string {
  const [x, y] = pairOrder(a, b);
  return `${x}-vs-${y}`;
}

/** Site path of a matchup's page. */
export function pairPath(type: EntityType, a: string, b: string): string {
  return `/vs/${type}/${pairSlug(a, b)}`;
}

/**
 * The two place slugs in a `$pair` segment, as written (not reordered), or null when it is not
 * "<slug>-vs-<slug>" for two different known places. Every split point is tried, so a slug that
 * itself contains "-vs-" would still parse.
 */
export function parsePairSlug(
  pair: string,
  known: (slug: string) => boolean
): [string, string] | null {
  const sep = '-vs-';
  for (let at = pair.indexOf(sep); at > 0; at = pair.indexOf(sep, at + 1)) {
    const a = pair.slice(0, at);
    const b = pair.slice(at + sep.length);
    if (a !== b && known(a) && known(b)) return [a, b];
  }
  return null;
}

/** The places `slug` has a matchup page with, in the order pairs.json lists them. */
export function partnersOf(
  pairs: PairsFile,
  type: EntityType,
  slug: string
): string[] {
  const out: string[] = [];
  for (const [a, b] of pairs[type] ?? []) {
    if (a === slug) out.push(b);
    else if (b === slug) out.push(a);
  }
  return out;
}

/** How build-pairs.ts picks a place type's matchups. */
export interface PairRule {
  /** Every pair among this many most populous places */
  allPairsTop: number;
  /** Each of this many most populous places is paired with its `similar` most similar places */
  similarTop: number;
  similar: number;
}

/**
 * Matchup rules per place type. Every state against every state (the most searched kind), the
 * largest countries and US cities against each other, and larger places against the places most
 * like them (similarPlaces), which are the comparisons people weigh when choosing where to live.
 * World cities have no page: their profiles are too thin to index (isIndexablePlace).
 */
export const PAIR_RULES: Partial<Record<EntityType, PairRule>> = {
  state: { allPairsTop: 60, similarTop: 0, similar: 0 },
  country: { allPairsTop: 30, similarTop: 120, similar: 4 },
  city: { allPairsTop: 25, similarTop: 100, similar: 4 },
  county: { allPairsTop: 10, similarTop: 80, similar: 3 },
};
