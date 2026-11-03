// What someone is searching for: moving, research, travel or curiosity. A goal picks the starting
// points the search palette offers and adds goal-flavoured follow-ups while typing. The goal is
// chosen with chips or inferred from the words of the query.

import type { SearchTarget } from './searchIndex';
import type { EntityType } from '~/data/types';

export type GoalId = 'move' | 'research' | 'travel' | 'curious';

/** One suggested destination: a topic, a ready-made comparison or a page. */
export interface Idea {
  id: string;
  title: string;
  subtitle: string;
  /** Site path with its search string, e.g. "/compare?type=state&view=ranking&bundle=quality" */
  href: string;
  /** Extra words the idea answers, for matching a typed query */
  keywords?: string;
}

export interface Goal {
  id: GoalId;
  /** Chip text */
  label: string;
  /** Section heading over its ideas */
  heading: string;
  /** Query words that suggest this goal */
  pattern: RegExp;
  ideas: Idea[];
}

/**
 * Builds a site href the way the router writes search params: strings as-is, everything else
 * (numbers, arrays, booleans) as JSON, so `e: ['CA', 'TX']` reads back as an array.
 */
export function siteHref(
  path: string,
  search: Record<string, unknown> = {}
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (v === undefined) continue;
    q.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const s = q.toString();
  return s === '' ? path : `${path}?${s}`;
}

const topic = (type: EntityType, slug: string) => `/topics/${type}/${slug}`;
const ranking = (type: EntityType, bundle: string) =>
  siteHref('/compare', { type, view: 'ranking', bundle });
const matrix = (type: EntityType, bundle: string) =>
  siteHref('/compare', { type, view: 'matrix', bundle });

export const GOALS: Goal[] = [
  {
    id: 'move',
    label: 'Moving somewhere',
    heading: 'For finding a place to live',
    pattern:
      /\b(live|living|move|moving|relocat\w*|retire\w*|family|families|kids|raise|cheap\w*|afford\w*|rent|housing|safe\w*|neighbou?rhood|commute|jobs?)\b/i,
    ideas: [
      {
        id: 'move-state-quality',
        title: 'Rank states on quality of life',
        subtitle: 'Income, schools, safety, health and more in one score',
        href: ranking('state', 'quality'),
        keywords: 'best state live',
      },
      {
        id: 'move-cost',
        title: 'Cost of Living by State',
        subtitle: 'Official price levels: housing, goods, utilities',
        href: topic('state', 'regional-price-parities-by-state'),
        keywords: 'cheap expensive afford prices rent',
      },
      {
        id: 'move-vs',
        title: 'Compare two states, adjusted for cost of living',
        subtitle: 'Head to head on every shared statistic',
        href: siteHref('/vs', { type: 'state', e: [], col: true }),
        keywords: 'wages salary pay income',
      },
      {
        id: 'move-safest',
        title: 'Safest States',
        subtitle: 'US states · Crime & safety',
        href: topic('state', 'safest-states'),
        keywords: 'crime safe',
      },
      {
        id: 'move-city-quality',
        title: 'Rank US cities on quality of life',
        subtitle: 'A combined score across city statistics',
        href: ranking('city', 'quality'),
        keywords: 'best city live',
      },
      {
        id: 'move-weather',
        title: 'Best Weather by State',
        subtitle: 'US states · Environment',
        href: topic('state', 'best-weather-by-state'),
        keywords: 'climate sunny warm',
      },
      {
        id: 'move-retire',
        title: 'Retirement Taxes by State',
        subtitle: 'US states · Economics',
        href: topic('state', 'retirement-taxes-by-state'),
        keywords: 'retire retirement pension',
      },
    ],
  },
  {
    id: 'research',
    label: 'Researching',
    heading: 'For research',
    pattern:
      /\b(correlat\w*|relationship|vs|versus|data|dataset|trend\w*|statistic\w*|study|research|regression|cause\w*|over time|history|historical)\b/i,
    ideas: [
      {
        id: 'research-econ-matrix',
        title: 'Which economic measures move together?',
        subtitle: 'Correlations across US states',
        href: matrix('state', 'economy'),
        keywords: 'correlation economy income',
      },
      {
        id: 'research-health-matrix',
        title: 'Which health measures move together?',
        subtitle: 'Correlations across countries',
        href: matrix('country', 'health'),
        keywords: 'correlation health life expectancy',
      },
      {
        id: 'research-real-income',
        title: 'Real Personal Income by State',
        subtitle: 'Inflation- and price-adjusted, 2008 onward',
        href: topic('state', 'real-personal-income-by-state'),
        keywords: 'income over time history',
      },
      {
        id: 'research-gdp',
        title: 'GDP per Capita by Country',
        subtitle: 'Countries · Economics',
        href: topic('country', 'gdp-per-capita-by-country'),
        keywords: 'gdp economy',
      },
      {
        id: 'research-categories',
        title: 'Browse every category',
        subtitle: 'Economics, health, education, crime and 16 more',
        href: '/categories',
      },
      {
        id: 'research-glossary',
        title: 'What the numbers mean',
        subtitle: 'Percentiles, correlation, p-values and more',
        href: '/glossary',
        keywords: 'definition glossary p-value correlation',
      },
    ],
  },
  {
    id: 'travel',
    label: 'Planning travel',
    heading: 'For travel',
    pattern:
      /\b(travel\w*|visit\w*|vacation\w*|holiday\w*|touris\w*|trip|backpack\w*|abroad)\b/i,
    ideas: [
      {
        id: 'travel-safest',
        title: 'Safest Countries in the World',
        subtitle: 'Countries · Crime & safety',
        href: topic('country', 'safest-countries-in-the-world'),
        keywords: 'safe crime',
      },
      {
        id: 'travel-cheapest',
        title: 'Cheapest Countries to Visit',
        subtitle: 'Countries · Economics',
        href: topic('country', 'cheapest-countries-to-visit'),
        keywords: 'cheap budget afford',
      },
      {
        id: 'travel-most-visited',
        title: 'Most Visited Countries',
        subtitle: 'Countries · Culture',
        href: topic('country', 'most-visited-countries'),
        keywords: 'tourism popular',
      },
      {
        id: 'travel-safest-cities',
        title: 'Safest Cities in the World',
        subtitle: 'World cities · Crime & safety',
        href: topic('world-city', 'safest-cities-in-the-world'),
        keywords: 'city safe',
      },
      {
        id: 'travel-weather',
        title: 'Best Weather by Country',
        subtitle: 'Countries · Environment',
        href: topic('country', 'best-weather-by-country'),
        keywords: 'climate sunny warm',
      },
      {
        id: 'travel-vs',
        title: 'Compare countries head to head',
        subtitle: 'Pick two to four countries',
        href: siteHref('/vs', { type: 'country', e: [] }),
      },
    ],
  },
  {
    id: 'curious',
    label: 'Just curious',
    heading: 'Fun to explore',
    pattern:
      /\b(fun|weird\w*|strange\w*|interesting|trivia|random|facts?|odd\w*)\b/i,
    ideas: [
      {
        id: 'curious-trivia',
        title: 'Facts & trivia',
        subtitle: 'A whole category of oddities',
        href: '/categories/facts-trivia',
        keywords: 'trivia facts fun',
      },
      {
        id: 'curious-happiest',
        title: 'Happiest Countries in the World',
        subtitle: 'Countries · Culture',
        href: topic('country', 'happiest-countries-in-the-world'),
        keywords: 'happy happiness',
      },
      {
        id: 'curious-friendliest',
        title: 'Friendliest States',
        subtitle: 'US states · Culture',
        href: topic('state', 'friendliest-states'),
        keywords: 'friendly nice',
      },
      {
        id: 'curious-animal',
        title: 'Most Dangerous Animal by State',
        subtitle: 'US states · Facts & trivia',
        href: topic('state', 'most-dangerous-animal-by-state'),
        keywords: 'animal dangerous',
      },
      {
        id: 'curious-stan',
        title: '-Stan Countries',
        subtitle: 'Countries · Geography',
        href: topic('country', 'stan-countries'),
      },
    ],
  },
];

export const GOAL_BY_ID = new Map(GOALS.map((g) => [g.id, g]));

/** The goal a query's words point to, or null when none or several do. */
export function inferGoal(query: string): GoalId | null {
  const hits = GOALS.filter((g) => g.pattern.test(query));
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * Ideas for a typed query under `goal`: a follow-up on the top metric result, then the goal's
 * curated ideas, those sharing the most words with the query first.
 */
export function ideasFor(
  goal: GoalId,
  query: string,
  topMetric: {
    target: Extract<SearchTarget, { kind: 'metric' }>;
    title: string;
  } | null,
  limit = 3
): Idea[] {
  const g = GOAL_BY_ID.get(goal);
  if (g == null) return [];
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  // Ideas sharing more of the query's words come first; ties keep the curated order, so a query
  // that matches none ("moving") still lists the goal's best starting points.
  const score = (idea: Idea) => {
    const text = `${idea.title} ${idea.keywords ?? ''}`.toLowerCase();
    return words.filter((w) => text.includes(w)).length;
  };
  const curated = g.ideas
    .map((idea, i) => ({ idea, i, s: score(idea) }))
    .sort((a, b) => (b.s !== a.s ? b.s - a.s : a.i - b.i))
    .map((x) => x.idea);
  const derived: Idea[] = [];
  if (topMetric != null) {
    const { type, id } = topMetric.target;
    if (goal === 'research')
      derived.push({
        id: `derived-overlay-${type}-${id}`,
        title: `What goes with ${topMetric.title}?`,
        subtitle: 'Plot it against another metric and see the correlation',
        href: siteHref('/compare', { type, view: 'scatter', m: [id], x: id }),
      });
    else
      derived.push({
        id: `derived-map-${type}-${id}`,
        title: `Map ${topMetric.title}`,
        subtitle: 'See where it is highest and lowest',
        href: siteHref('/compare', { type, view: 'map', m: [id], f: id }),
      });
  }
  return [...derived, ...curated].slice(0, limit);
}

const GOAL_KEY = 'rankodex:search-goal';

/** The goal this viewer last picked, if storage is available. */
export function readGoal(): GoalId | null {
  try {
    const v = localStorage.getItem(GOAL_KEY);
    return v != null && GOAL_BY_ID.has(v as GoalId) ? (v as GoalId) : null;
  } catch {
    return null;
  }
}

/** Remembers the picked goal (or forgets it for null); storage failures are ignored. */
export function saveGoal(goal: GoalId | null): void {
  try {
    if (goal == null) localStorage.removeItem(GOAL_KEY);
    else localStorage.setItem(GOAL_KEY, goal);
  } catch {
    // private mode or blocked storage: the choice just lasts for this visit
  }
}
