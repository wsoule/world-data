// What a matchup page (/vs/<type>/<a>-vs-<b>) shows, worked out from the whole place type. The
// interactive /vs tool needs the type's full data (country values.json alone is about 1 MB gzip)
// and renders in the browser only, so search engines never see it. A matchup page instead
// renders from a `PairPageData`: the scoreboard, category leaders and the rows it lists, with
// every value and rank already formatted. The server builds it while prerendering, the bundle
// script (scripts/page-data.ts) writes the same object to <type>/pages/vs/<pair>.json for
// client-side navigation, and the dev server builds it in the browser.

import { type QueryClient, queryOptions } from '@tanstack/react-query';

import {
  pairOrder,
  pairPath,
  PAIRS_PATH,
  type PairsFile,
  pairSlug,
  parsePairSlug,
  partnersOf,
} from './pairs';
import {
  bestIndex,
  biggestDifferences,
  categoryLeads,
  type Scoreboard,
  scoreboard,
  type SharedMetric,
  sharedMetrics,
} from './versusModel';
import { getJson, manifestQuery } from '~/data/api';
import { type Dataset, loadDataset } from '~/data/dataset';
import { EXTERNAL_ID_BASE } from '~/data/external';
import { rankOrder } from '~/data/rankOrder';
import type { EntityType, Manifest, Metric } from '~/data/types';
import { datasetFacts, placeNoun } from '~/features/places/datasetFacts';
import { pctText, rankText } from '~/features/places/percentile';
import {
  byKeys,
  isPolar,
  metricDirection,
  placeFacts,
  standingAt,
} from '~/features/places/profileModel';
import { formatInt, formatValue } from '~/lib/format';
import { breadcrumbs, faqPage } from '~/lib/seo';
import type { Crumb, QA } from '~/seo/content';
import { SITE } from '~/site';

/** One compared place: enough for its name, flag and profile link. */
export interface PairPlace {
  id: string;
  name: string;
  slug: string;
  flag: string | null;
}

/** One statistic both places have, formatted for display. */
export interface PairRow {
  /** Metric id */
  id: number;
  label: string;
  /** Title of the topic the metric comes from, when the label alone is ambiguous */
  context: string | null;
  /** Slug of that topic's page */
  topic: string | null;
  /** Each place's value and rank among all places of the type, formatted */
  values: [string, string];
  ranks: [string, string];
  /** Each place's percentile (0–1, 1 = best) */
  pct: [number, number];
  /** Index of the better place; null for neutral statistics and ties */
  winner: 0 | 1 | null;
}

/** Who leads one category on average percentile. */
export interface PairLead {
  category: string;
  label: string;
  means: [number, number];
  count: number;
  leader: 0 | 1 | null;
}

/** A link to another matchup page. */
export interface PairLink {
  pair: string;
  names: [string, string];
}

/** <type>/pages/vs/<pair>.json */
export interface PairPageData {
  type: EntityType;
  /** "US states", for mid-sentence use */
  noun: string;
  pair: string;
  places: [PairPlace, PairPlace];
  score: Scoreboard;
  /** Average percentile over the directional shared statistics */
  averages: [number, number];
  /** Rankings must cover this many places for the leads and differences */
  minN: number;
  leads: PairLead[];
  /** Population and the type's headline statistics */
  glance: PairRow[];
  /** The directional statistics where their percentiles differ most */
  diffs: PairRow[];
  /** Other matchups of either place */
  related: PairLink[];
  seo: {
    title: string;
    description: string;
    summary: string;
    faq: QA[];
    crumbs: Crumb[];
    jsonLd: Record<string, unknown>[];
    noindex: boolean;
  };
}

/** Where the bundle script writes a matchup's file, relative to /data. */
export const pairPagePath = (type: EntityType, pair: string) =>
  `${type}/pages/vs/${pair}.json`;

/** Matchups with fewer directional statistics in common than this are thin and noindex. */
export const MIN_PAIR_METRICS = 20;

const DIFF_ROWS = 30;
const GLANCE_HEADLINE_ROWS = 6;
const RELATED_PER_PLACE = 8;
const POPULATION = -1;

/** A statistic both places have, formatted; null when either lacks a value or a rank. */
function pairRow(
  ds: Dataset,
  metric: Metric,
  idx: readonly [number, number]
): PairRow | null {
  const col = ds.numeric(metric.id);
  const v = [col[idx[0]], col[idx[1]]] as const;
  if (Number.isNaN(v[0]) || Number.isNaN(v[1])) return null;
  const direction = metricDirection(metric);
  const a = standingAt(col, idx[0], direction);
  const b = standingAt(col, idx[1], direction);
  if (a == null || b == null) return null;
  const order = rankOrder(metric);
  const context = ds.metricContext(metric.id);
  return {
    id: metric.id,
    label: metric.label,
    context:
      context != null && context.toLowerCase() !== metric.label.toLowerCase()
        ? context
        : null,
    topic: metric.topics[0] ?? null,
    values: [formatValue(metric, v[0]), formatValue(metric, v[1])],
    ranks: [rankText(a, order), rankText(b, order)],
    pct: [a.pct, b.pct],
    winner: isPolar(metric)
      ? (bestIndex([v[0], v[1]], direction) as 0 | 1 | null)
      : null,
  };
}

/** "Health, Education and Economics" */
function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Population, the type's headline statistics (`placeFacts`) and a few more widely ranked
 * statistics from government sources (their labels read on their own), for the "at a glance"
 * table and the FAQ.
 */
function glanceRows(
  ds: Dataset,
  idx: readonly [number, number],
  shared: readonly SharedMetric[]
): PairRow[] {
  const ids = [POPULATION];
  for (const f of placeFacts(ds, ds.type.id, idx[0], formatValue))
    ids.push(f.id);
  // One per source topic: a single table's columns ("Price Level (Goods)", "(Rents)", …) would
  // otherwise fill the list.
  const seenTopics = new Set<string>();
  const headline = shared
    .filter((s) => s.polar && s.metric.id >= EXTERNAL_ID_BASE)
    .filter((s) => !ids.includes(s.metric.id))
    .sort((a, b) => byKeys(b.metric.n - a.metric.n, a.metric.id - b.metric.id))
    .filter((s) => {
      const topic = s.metric.topics[0] ?? `#${s.metric.id}`;
      if (seenTopics.has(topic)) return false;
      seenTopics.add(topic);
      return true;
    })
    .slice(0, GLANCE_HEADLINE_ROWS);
  ids.push(...headline.map((s) => s.metric.id));
  const out: PairRow[] = [];
  for (const id of ids) {
    const m = ds.metric(id);
    const row = m == null ? null : pairRow(ds, m, idx);
    if (row != null) out.push(row);
  }
  return out;
}

/**
 * Everything a matchup page shows about places `a` and `b` (slugs, in canonical order), computed
 * from the whole type with the interactive tool's defaults (statistics that mostly track
 * population left out), so both say who wins the same number of statistics.
 */
export function buildPairPageData(
  full: Dataset,
  manifest: Manifest,
  pairs: PairsFile,
  a: string,
  b: string
): PairPageData {
  const type = full.type.id;
  const ia = full.entityBySlug.get(a);
  const ib = full.entityBySlug.get(b);
  if (ia == null || ib == null) throw new Error(`Unknown matchup ${a} vs ${b}`);
  const idx = [ia, ib] as const;
  const ents = [full.entities[ia], full.entities[ib]] as const;
  const places = ents.map((e) => ({
    id: e.id,
    name: e.name,
    slug: e.slug,
    flag: e.flag,
  })) as [PairPlace, PairPlace];
  const [A, B] = [places[0].name, places[1].name];
  const noun = placeNoun(full);
  const facts = datasetFacts(full);
  const labels = new Map(manifest.categories.map((c) => [c.id, c.label]));
  const label = (id: string) => labels.get(id) ?? id;

  const shared = sharedMetrics(full, [...idx], facts.sizeDriven);
  const score = scoreboard(shared, 2);
  const averages = [0, 1].map((k) => {
    const polar = shared.filter((s) => s.polar);
    return polar.length === 0
      ? Number.NaN
      : polar.reduce((sum, s) => sum + s.standings[k].pct, 0) / polar.length;
  }) as [number, number];
  const leads: PairLead[] = categoryLeads(shared, 2, {
    minN: facts.cut.minN,
  }).map((l) => ({
    category: l.category,
    label: label(l.category),
    means: [l.means[0], l.means[1]],
    count: l.count,
    leader: l.leader as 0 | 1 | null,
  }));
  const diffs = biggestDifferences(shared, {
    limit: DIFF_ROWS,
    minN: facts.cut.minN,
  })
    .map((s) => pairRow(full, s.metric, idx))
    .filter((r): r is PairRow => r != null);
  const glance = glanceRows(full, idx, shared);

  const related: PairLink[] = [];
  for (const [k, slug] of [a, b].entries()) {
    const other = k === 0 ? b : a;
    const partners = partnersOf(pairs, type, slug).filter((p) => p !== other);
    for (const p of partners.slice(0, RELATED_PER_PLACE)) {
      const i = full.entityBySlug.get(p);
      if (i == null) continue;
      const [x, y] = pairOrder(slug, p);
      const name = (s: string) =>
        s === slug ? ents[k].name : full.entities[i].name;
      related.push({ pair: pairSlug(x, y), names: [name(x), name(y)] });
    }
  }

  // Head tags, summary and quick answers.
  const ahead =
    score.wins[0] === score.wins[1]
      ? null
      : score.wins[0] > score.wins[1]
        ? 0
        : 1;
  const ledBy = (k: 0 | 1) =>
    leads.filter((l) => l.leader === k).map((l) => l.label);
  const verdict =
    score.total === 0
      ? `${A} and ${B} share no statistics with a better end.`
      : ahead == null
        ? `${A} and ${B} are even: each comes out ahead on ${formatInt(score.wins[0])} of ${formatInt(score.total)} statistics where one end is better.`
        : `${places[ahead].name} comes out ahead of ${places[1 - ahead].name} on ${formatInt(score.wins[ahead])} of ${formatInt(score.total)} statistics where one end is better, to ${formatInt(score.wins[1 - ahead])}${score.ties > 0 ? ` with ${formatInt(score.ties)} ties` : ''}.`;
  const categoryText = ([0, 1] as const)
    .map((k) => {
      const led = ledBy(k);
      return led.length === 0
        ? ''
        : `${places[k].name} leads on ${listText(led.slice(0, 3))}${led.length > 3 ? ` and ${led.length - 3} more ${led.length - 3 === 1 ? 'category' : 'categories'}` : ''}.`;
    })
    .filter((t) => t !== '')
    .join(' ');
  const pop = glance.find((r) => r.id === POPULATION);
  const summary = [verdict, categoryText].filter((t) => t !== '').join(' ');
  const path = pairPath(type, a, b);
  const title =
    [
      `${A} vs ${B}: ${formatInt(shared.length)} statistics compared`,
      `${A} vs ${B}: statistics compared`,
      `${A} vs ${B}`,
    ].find((t) => t.length <= 60) ?? `${A} vs ${B}`;
  const description = `${A} vs ${B}, side by side: ${verdict}${pop != null ? ` Population ${pop.values[0]} vs ${pop.values[1]}.` : ''} All ${formatInt(shared.length)} statistics they share, ranked among ${noun}.`;

  const faq: QA[] = [];
  if (score.total > 0)
    faq.push({
      question: `Which is better, ${A} or ${B}?`,
      answer: `${verdict}${categoryText === '' ? '' : ` ${categoryText}`} Statistics where neither end is better, and totals that mostly track population, are not counted.`,
    });
  if (pop != null)
    faq.push({
      question: `Which has more people, ${A} or ${B}?`,
      answer: `${A} has a population of ${pop.values[0]} (${pop.ranks[0]} ${noun}) and ${B} has ${pop.values[1]} (${pop.ranks[1]}).`,
    });
  for (const r of glance
    .filter((g) => g.id !== POPULATION && g.winner != null)
    .slice(0, 2)) {
    faq.push({
      question: `How do ${A} and ${B} compare on ${r.label}?`,
      answer: `${r.label}: ${A} ${r.values[0]} (${r.ranks[0]}), ${B} ${r.values[1]} (${r.ranks[1]}) among ${noun}. ${places[r.winner as number].name} ranks better.`,
    });
  }
  for (const k of [0, 1] as const) {
    const wins = diffs.filter((r) => r.winner === k).slice(0, 3);
    if (wins.length === 0) continue;
    faq.push({
      question: `Where does ${places[k].name} beat ${places[1 - k].name} most clearly?`,
      answer: `${places[k].name} ranks far ahead on ${wins.map((r) => `${r.label}${r.context != null ? ` (${r.context})` : ''}: ${r.values[k]} vs ${r.values[1 - k]}`).join('; ')}.`,
    });
  }

  const crumbs: Crumb[] = [
    { name: SITE.name, path: '/' },
    { name: 'Head to head', path: '/vs' },
    { name: full.type.label, path: `/vs/${type}` },
    { name: `${A} vs ${B}`, path },
  ];
  return {
    type,
    noun,
    pair: pairSlug(a, b),
    places,
    score,
    averages,
    minN: facts.cut.minN,
    leads,
    glance,
    diffs,
    related,
    seo: {
      title,
      description,
      summary,
      faq,
      crumbs,
      jsonLd: [breadcrumbs(crumbs), ...(faq.length > 0 ? [faqPage(faq)] : [])],
      noindex: score.total < MIN_PAIR_METRICS,
    },
  };
}

/** The pair list (public/data/pairs.json), fetched once. */
export const pairsQuery = queryOptions({
  queryKey: ['pairs'],
  queryFn: () => getJson<PairsFile>(PAIRS_PATH),
  staleTime: Infinity,
  gcTime: Infinity,
});

/**
 * The two slugs of a listed matchup in a `$pair` segment, or null when the segment is not a
 * listed matchup written in canonical order.
 */
export function listedPair(
  pairs: PairsFile,
  type: EntityType,
  pair: string
): [string, string] | null {
  const list = pairs[type] ?? [];
  const known = new Set(list.flat());
  const parsed = parsePairSlug(pair, (s) => known.has(s));
  if (parsed == null) return null;
  const [a, b] = parsed;
  return list.some(([x, y]) => x === a && y === b) ? parsed : null;
}

/** Builds a matchup's data from the whole place type (server rendering and development). */
async function buildFromFull(
  qc: QueryClient,
  type: EntityType,
  pair: string
): Promise<PairPageData> {
  const pairs = await qc.ensureQueryData(pairsQuery);
  const listed = listedPair(pairs, type, pair);
  if (listed == null) throw new Error(`Unknown matchup ${type}/${pair}`);
  const [full, manifest] = await Promise.all([
    loadDataset(qc, type),
    qc.ensureQueryData(manifestQuery),
  ]);
  return buildPairPageData(full, manifest, pairs, ...listed);
}

/**
 * A matchup's data: built from the whole type while server rendering and on the dev server,
 * fetched from the file the bundle script wrote everywhere else.
 */
export const pairPageQuery = (
  qc: QueryClient,
  type: EntityType,
  pair: string
) =>
  queryOptions({
    queryKey: ['pair-page', type, pair],
    queryFn: () =>
      import.meta.env.SSR || import.meta.env.DEV
        ? buildFromFull(qc, type, pair)
        : getJson<PairPageData>(pairPagePath(type, pair)),
    staleTime: Infinity,
    gcTime: Infinity,
  });

/** "54th" style percentile text, or a dash without one. */
export const averageText = (v: number) => (Number.isNaN(v) ? '—' : pctText(v));
