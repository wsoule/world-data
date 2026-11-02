// Global search over every place, metric, topic and category of every entity type.
//
// Pure module (no React): builds search documents from the static dataset files, indexes them
// with MiniSearch (prefix + fuzzy, field boosts) and re-ranks hits so exact and prefix name matches
// come first. Used by the ⌘K palette and the /search page; covered by test/search-index.test.ts.

import MiniSearch, { type Query, type SearchResult } from 'minisearch';

import type {
  Entity,
  EntityType,
  EntityTypeInfo,
  Manifest,
  Metric,
  TopicSummary,
} from '~/data/types';

export type SearchKind = 'place' | 'metric' | 'topic' | 'category';

/** Display order of result groups when no group has an exact match. */
export const SEARCH_KINDS: readonly SearchKind[] = [
  'place',
  'metric',
  'topic',
  'category',
];

export const KIND_LABELS: Record<SearchKind, { one: string; many: string }> = {
  place: { one: 'Place', many: 'Places' },
  metric: { one: 'Metric', many: 'Metrics' },
  topic: { one: 'Topic', many: 'Topics' },
  category: { one: 'Category', many: 'Categories' },
};

/** Where a result leads. Serializable so recent picks can be stored in localStorage. */
export type SearchTarget =
  | { kind: 'place'; type: EntityType; slug: string }
  | { kind: 'metric'; type: EntityType; id: number; topic: string | null }
  | { kind: 'topic'; type: EntityType; slug: string }
  | { kind: 'category'; id: string };

export interface SearchDoc {
  /** Unique across kinds and types, e.g. "metric:state:24419" */
  id: string;
  kind: SearchKind;
  type: EntityType | null;
  title: string;
  /** One line of context shown under the title (topic title, region, state…) */
  subtitle: string;
  target: SearchTarget;
  /** Names that should rank like the title itself (state codes, "USA", "Holland") */
  aliases: string[];
  /** Weaker identifiers (ISO codes) */
  codes: string[];
  /** Secondary text that is searchable but not shown verbatim */
  context: string;
  /** Category labels */
  categories: string[];
  /** Static popularity multiplier (population, coverage, place type) */
  prior: number;
  flag: string | null;
  /** Coverage: places with data (metrics, topics) */
  n?: number;
  /** Places of this type, for "n of total" */
  total?: number;
  metricCount?: number;
  topicCount?: number;
  year?: number | null;
  /** Normalized title, aliases and codes, precomputed for re-ranking */
  normTitle: string;
  normTitleWords: string[];
  normAliases: string[];
  normCodes: string[];
}

// ---------------------------------------------------------------------------
// Text normalization

const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Lower-cases, strips accents and punctuation, and folds "U.S." to "us" so that every field and
 * query is compared in the same alphabet. Keeps % and $ because metric labels use them.
 */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/\bu\.s\.(a\.)?/g, 'us')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9%$]+/g, ' ')
    .trim();
}

export function tokenize(s: string): string[] {
  const n = normalizeText(s);
  return n === '' ? [] : n.split(' ');
}

/** Words dropped from a query when other words remain ("income by state" → income, state). */
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs',
  'with',
  'which',
  'what',
  'where',
  'most',
  'top',
]);

/**
 * Query expansions, one way: from abbreviations and everyday words to the terms the source labels
 * actually use (prefix matching already covers plurals such as crime → crimes). Phrases must match
 * as a whole. Extends the in-page matcher's list in src/lib/textSearch.ts.
 */
export const SYNONYMS: Record<string, readonly string[]> = {
  gdp: ['gross domestic product'],
  salary: ['income', 'wage', 'earnings'],
  salaries: ['income', 'wage', 'earnings'],
  pay: ['salary', 'wage', 'income'],
  earnings: ['income'],
  pop: ['population'],
  people: ['population'],
  edu: ['education'],
  school: ['education'],
  schools: ['education'],
  college: ['education', 'university', 'degree'],
  murder: ['homicide'],
  killings: ['homicide', 'murder'],
  happy: ['happiness', 'happiest'],
  rich: ['richest', 'wealth', 'wealthiest'],
  wealthy: ['richest', 'wealth', 'wealthiest'],
  poor: ['poverty', 'poorest'],
  safe: ['safest', 'safety'],
  dangerous: ['crime', 'violent'],
  cheap: ['cheapest', 'affordable', 'cost of living'],
  expensive: ['cost of living'],
  cost: ['cost of living'],
  temp: ['temperature'],
  weather: ['temperature', 'climate'],
  jobs: ['employment', 'unemployment'],
  unemployed: ['unemployment'],
  guns: ['gun', 'firearm'],
  obese: ['obesity'],
  fat: ['obesity'],
  housing: ['home', 'house'],
  rent: ['rental'],
  doctor: ['physician'],
  doctors: ['physician'],
  smoking: ['tobacco', 'smokers'],
  drinking: ['alcohol'],
  drunk: ['alcohol', 'drunkest'],
  car: ['vehicle', 'auto'],
  cars: ['vehicle', 'auto'],
  death: ['mortality'],
  deaths: ['mortality'],
  births: ['fertility'],
  kids: ['children'],
  elderly: ['oldest', 'age'],
  covid: ['coronavirus'],
  internet: ['broadband'],
  smart: ['iq', 'educated'],
  usa: ['united states'],
  us: ['united states'],
  america: ['united states'],
  american: ['united states'],
  uk: ['united kingdom'],
  britain: ['united kingdom'],
  nyc: ['new york'],
  la: ['los angeles'],
  sf: ['san francisco'],
  uae: ['united arab emirates'],
};

// ---------------------------------------------------------------------------
// Document builders

/** Population-weighted importance of each place type when names collide. */
const TYPE_PRIOR: Record<EntityType, number> = {
  country: 1,
  state: 1,
  city: 0.82,
  'world-city': 0.76,
  county: 0.7,
};

/** Extra words that let "income by state" or "country happiness" match the right type. */
const TYPE_TERMS: Record<EntityType, string> = {
  country: 'country countries nation nations world',
  state: 'state states us',
  city: 'city cities us',
  'world-city': 'city cities world',
  county: 'county counties us',
};

/** Familiar names for countries whose dataset name differs (by ISO3). */
const COUNTRY_ALIASES: Record<string, readonly string[]> = {
  USA: ['usa', 'us', 'america', 'united states of america'],
  GBR: ['uk', 'britain', 'great britain', 'england'],
  NLD: ['holland'],
  CZE: ['czech republic'],
  CIV: ['cote divoire'],
  COD: ['democratic republic of the congo', 'drc', 'congo kinshasa'],
  COG: ['congo brazzaville', 'congo'],
  KOR: ['korea', 'republic of korea'],
  PRK: ['dprk'],
  ARE: ['uae', 'emirates'],
  MMR: ['burma'],
  SWZ: ['swaziland'],
  TUR: ['turkiye'],
  CPV: ['cabo verde'],
  RUS: ['russian federation'],
  VAT: ['holy see', 'vatican'],
  TLS: ['east timor'],
  MKD: ['macedonia'],
  BIH: ['bosnia'],
  TTO: ['trinidad'],
  NZL: ['nz'],
  IRN: ['persia'],
  LKA: ['ceylon'],
};

/** Common nicknames for US cities (by slug). */
const CITY_ALIASES: Record<string, readonly string[]> = {
  'new-york-ny': ['nyc', 'new york city'],
  'los-angeles-ca': ['la'],
  'san-francisco-ca': ['sf'],
  'washington-dc': ['dc', 'washington dc'],
};

/** Raw fields before normalization; `finish` adds the precomputed comparison strings. */
type DocInput = Omit<
  SearchDoc,
  'normTitle' | 'normTitleWords' | 'normAliases' | 'normCodes'
>;

function finish(d: DocInput): SearchDoc {
  const normTitle = normalizeText(d.title);
  return {
    ...d,
    normTitle,
    normTitleWords: normTitle === '' ? [] : normTitle.split(' '),
    normAliases: d.aliases.map(normalizeText).filter((a) => a !== ''),
    normCodes: d.codes.map(normalizeText).filter((a) => a !== ''),
  };
}

export function categoryLabelMap(manifest: Manifest): Map<string, string> {
  return new Map(manifest.categories.map((c) => [c.id, c.label]));
}

export function categoryDocs(manifest: Manifest): SearchDoc[] {
  return manifest.categories.map((c) =>
    finish({
      id: `category:${c.id}`,
      kind: 'category',
      type: null,
      title: c.label,
      subtitle: 'Category',
      target: { kind: 'category', id: c.id },
      aliases: [c.id.replace(/-/g, ' ')],
      codes: [],
      context: '',
      categories: [],
      prior: 1.25,
      flag: null,
      topicCount: c.topics,
    })
  );
}

export function topicDocs(
  topics: readonly TopicSummary[],
  manifest: Manifest
): SearchDoc[] {
  const cats = categoryLabelMap(manifest);
  const totals = new Map(manifest.types.map((t) => [t.id, t.entities]));
  return topics.map((t) => {
    const total = totals.get(t.type) ?? Math.max(1, t.n);
    const coverage = Math.min(1, t.n / Math.max(1, total));
    return finish({
      id: `topic:${t.type}:${t.slug}`,
      kind: 'topic',
      type: t.type,
      title: t.title,
      subtitle: t.cats.map((c) => cats.get(c) ?? c).join(' · '),
      target: { kind: 'topic', type: t.type, slug: t.slug },
      aliases: [],
      codes: [],
      context: '',
      categories: t.cats.map((c) => cats.get(c) ?? c),
      prior:
        TYPE_PRIOR[t.type] *
        (0.8 + 0.2 * coverage) *
        (1 + 0.02 * Math.min(10, t.metrics.length)),
      flag: null,
      n: t.n,
      total,
      metricCount: t.metrics.length,
    });
  });
}

export function placeDocs(
  info: EntityTypeInfo,
  entities: readonly Entity[]
): SearchDoc[] {
  return entities.map((e) => {
    const aliases: string[] = [];
    const codes: string[] = [];
    if (info.id === 'state') aliases.push(e.id);
    if (info.id === 'country') {
      aliases.push(...(COUNTRY_ALIASES[e.id] ?? []));
      codes.push(e.id);
      if (e.flag != null) codes.push(e.flag);
    }
    if (info.id === 'city') aliases.push(...(CITY_ALIASES[e.slug] ?? []));
    const where = [e.sub, e.group].filter(
      (s): s is string => s != null && s !== ''
    );
    const subtitle =
      info.id === 'country'
        ? [e.group, e.sub].filter((s) => s != null && s !== '').join(' · ')
        : info.id === 'state'
          ? `${e.group ?? 'US'} region`
          : where.join(' · ');
    const pop = e.pop ?? 0;
    return finish({
      id: `place:${info.id}:${e.slug}`,
      kind: 'place',
      type: info.id,
      title: e.name,
      subtitle,
      target: { kind: 'place', type: info.id, slug: e.slug },
      aliases,
      codes,
      context: where.join(' '),
      categories: [],
      prior: TYPE_PRIOR[info.id] * (1 + Math.log10(pop + 10) / 12),
      flag: e.flag,
    });
  });
}

/** Metrics worth finding: numeric or categorical, with values, not bookkeeping columns. */
export function isSearchableMetric(m: Metric): boolean {
  return m.meta !== true && m.kind !== 'text' && m.n > 0;
}

export function metricDocs(
  info: EntityTypeInfo,
  metrics: readonly Metric[],
  topicTitles: ReadonlyMap<string, string>,
  categoryLabels: ReadonlyMap<string, string>
): SearchDoc[] {
  const out: SearchDoc[] = [];
  const total = Math.max(1, info.entities);
  for (const m of metrics) {
    if (!isSearchableMetric(m)) continue;
    const primary = m.topics[0];
    const primaryTitle =
      primary != null ? (topicTitles.get(`${info.id}:${primary}`) ?? '') : '';
    // Other topics help "happiest states" find the score column of that page.
    const otherTitles = m.topics
      .slice(1, 4)
      .map((s) => topicTitles.get(`${info.id}:${s}`) ?? '')
      .join(' ');
    const coverage = Math.min(1, m.n / total);
    out.push(
      finish({
        id: `metric:${info.id}:${m.id}`,
        kind: 'metric',
        type: info.id,
        title: m.label,
        subtitle:
          primaryTitle !== ''
            ? primaryTitle
            : m.base === true
              ? 'Core statistic'
              : m.cats.map((c) => categoryLabels.get(c) ?? c).join(' · '),
        target: {
          kind: 'metric',
          type: info.id,
          id: m.id,
          topic: primary ?? null,
        },
        aliases: [],
        codes: [],
        context: `${primaryTitle} ${otherTitles} ${m.unit ?? ''}`,
        categories: m.cats.map((c) => categoryLabels.get(c) ?? c),
        prior:
          TYPE_PRIOR[info.id] *
          (0.55 + 0.45 * coverage) *
          (m.kind === 'num' ? 1 : 0.8) *
          (m.base === true ? 1.15 : 1) *
          // Columns shared by several topics are the canonical ones.
          (1 + 0.06 * Math.min(5, Math.max(0, m.topics.length - 1))),
        flag: null,
        n: m.n,
        total,
        year: m.year,
      })
    );
  }
  return out;
}

/** "type:slug" → topic title, the lookup metricDocs needs for context. */
export function topicTitleMap(
  topics: readonly TopicSummary[]
): Map<string, string> {
  return new Map(topics.map((t) => [`${t.type}:${t.slug}`, t.title]));
}

// ---------------------------------------------------------------------------
// Ranking

/**
 * How closely the title (or an alias) matches the whole query, from strongest to weakest:
 * exact name, exact alias/code, name starts with the query, every word is a prefix of a title
 * word, anything else MiniSearch found (fuzzy, context, synonyms).
 */
export type MatchQuality = 'exact' | 'code' | 'prefix' | 'words' | 'other';

/**
 * Score multipliers per match quality. Names (places, categories) reward "starts with" strongly
 * because people type them left to right; metric and topic labels are descriptive, so a label that
 * merely starts with the word is barely better than one that contains it.
 */
const NAME_BOOST: Record<MatchQuality, number> = {
  exact: 8,
  code: 3,
  prefix: 3.2,
  words: 1.8,
  other: 1,
};
const LABEL_BOOST: Record<MatchQuality, number> = {
  exact: 8,
  code: 3,
  prefix: 2.1,
  words: 1.9,
  other: 1,
};
const QUALITY_BOOST: Record<SearchKind, Record<MatchQuality, number>> = {
  place: NAME_BOOST,
  category: NAME_BOOST,
  metric: LABEL_BOOST,
  topic: LABEL_BOOST,
};

/** How much each kind's best hit counts when ordering result groups. */
const GROUP_WEIGHT: Record<SearchKind, number> = {
  place: 1,
  metric: 1.3,
  topic: 1,
  category: 0.6,
};

export function matchQuality(
  doc: Pick<
    SearchDoc,
    'normTitle' | 'normTitleWords' | 'normAliases' | 'normCodes'
  >,
  query: string,
  tokens: readonly string[]
): MatchQuality {
  if (query === '') return 'other';
  if (doc.normTitle === query || doc.normAliases.includes(query))
    return 'exact';
  if (doc.normCodes.includes(query)) return 'code';
  if (
    doc.normTitle.startsWith(query) ||
    doc.normAliases.some((a) => a.startsWith(query) && query.length >= 3)
  )
    return 'prefix';
  if (
    tokens.length > 0 &&
    tokens.every((t) => doc.normTitleWords.some((w) => w.startsWith(t)))
  )
    return 'words';
  return 'other';
}

export interface RankedResult {
  doc: SearchDoc;
  score: number;
  quality: MatchQuality;
  /** Document terms that matched, for highlighting */
  terms: string[];
}

export interface SearchOptions {
  kinds?: ReadonlySet<SearchKind>;
  types?: ReadonlySet<EntityType>;
  limit?: number;
}

export interface ParsedQuery {
  /** Normalized full query (stopwords kept) used for exact/prefix comparisons */
  text: string;
  /** Tokens sent to MiniSearch (stopwords dropped unless nothing else remains) */
  tokens: string[];
}

export function parseQuery(raw: string): ParsedQuery {
  const all = tokenize(raw);
  const meaningful = all.filter((t) => !STOPWORDS.has(t));
  return {
    text: all.join(' '),
    tokens: meaningful.length > 0 ? meaningful : all,
  };
}

/** Field boosts for direct matches; synonym matches use the same fields at a lower weight. */
const BOOST = {
  title: 6,
  aliases: 5,
  codes: 2,
  context: 1.6,
  categories: 1,
  typeTerms: 0.35,
};
const SYNONYM_BOOST = Object.fromEntries(
  Object.entries(BOOST).map(([k, v]) => [k, v * 0.45])
);

/**
 * Builds the MiniSearch query: every word must match (AND), either itself or one of its synonyms.
 * Synonyms are matched without fuzziness and at a lower weight so "income" prefers labels that say
 * income over ones that only say "wage".
 */
function buildQuery(
  tokens: readonly string[],
  combineWith: 'AND' | 'OR'
): Query {
  return {
    combineWith,
    queries: tokens.map((t): Query => {
      const syns = SYNONYMS[t];
      if (syns == null) return t;
      return {
        combineWith: 'OR',
        queries: [
          t,
          {
            combineWith: 'OR',
            fuzzy: false,
            boost: SYNONYM_BOOST,
            queries: syns.map((s): Query =>
              s.includes(' ') ? { combineWith: 'AND', queries: [s] } : s
            ),
          },
        ],
      };
    }),
  };
}

const FIELDS = [
  'title',
  'aliases',
  'codes',
  'context',
  'categories',
  'typeTerms',
] as const;

/**
 * Incrementally built index. Sources (one per file pair, e.g. "metrics:state") are added as they
 * load, so the palette can answer place and topic queries before the larger metric catalogs
 * arrive. `version` changes after every addition.
 */
export class SearchIndex {
  readonly docs = new Map<string, SearchDoc>();
  private readonly sources = new Set<string>();
  private readonly mini: MiniSearch<SearchDoc>;
  version = 0;

  constructor() {
    this.mini = new MiniSearch<SearchDoc>({
      idField: 'id',
      fields: [...FIELDS],
      tokenize: (text) => tokenize(text),
      processTerm: (term) => (term === '' ? null : term),
      extractField: (doc, field) => {
        switch (field) {
          case 'id':
            return doc.id;
          case 'title':
            return doc.title;
          case 'aliases':
            return doc.aliases.join(' ');
          case 'codes':
            return doc.codes.join(' ');
          case 'context':
            return doc.context;
          case 'categories':
            return doc.categories.join(' ');
          case 'typeTerms':
            return doc.type != null ? TYPE_TERMS[doc.type] : '';
          default:
            return '';
        }
      },
      searchOptions: {
        boost: BOOST,
        prefix: true,
        fuzzy: (term) => (term.length >= 5 ? 0.2 : false),
        maxFuzzy: 2,
        weights: { prefix: 0.55, fuzzy: 0.3 },
      },
    });
  }

  has(source: string): boolean {
    return this.sources.has(source);
  }

  get size(): number {
    return this.docs.size;
  }

  /** Adds a source's documents once; later calls with the same source are ignored. */
  add(source: string, docs: readonly SearchDoc[]): void {
    if (this.sources.has(source)) return;
    this.sources.add(source);
    const fresh = docs.filter((d) => !this.docs.has(d.id));
    for (const d of fresh) this.docs.set(d.id, d);
    this.mini.addAll(fresh);
    this.version++;
  }

  /**
   * Ranked results across all kinds. MiniSearch finds candidates (all words must match; falls back
   * to any word when that finds nothing); the final score multiplies its relevance by match
   * quality against the title and by the document's popularity prior.
   */
  search(raw: string, opts: SearchOptions = {}): RankedResult[] {
    const q = parseQuery(raw);
    if (q.tokens.length === 0) return [];
    const filter = (r: SearchResult) => {
      const doc = this.docs.get(String(r.id));
      if (doc == null) return false;
      if (opts.kinds != null && !opts.kinds.has(doc.kind)) return false;
      if (opts.types != null && (doc.type == null || !opts.types.has(doc.type)))
        return false;
      return true;
    };
    let hits = this.mini.search(buildQuery(q.tokens, 'AND'), { filter });
    let penalty = 1;
    if (hits.length === 0 && q.tokens.length > 1) {
      hits = this.mini.search(buildQuery(q.tokens, 'OR'), { filter });
      penalty = 0.5;
    }
    const out: RankedResult[] = [];
    for (const h of hits) {
      const doc = this.docs.get(String(h.id));
      if (doc == null) continue;
      const quality = matchQuality(doc, q.text, q.tokens);
      out.push({
        doc,
        quality,
        score: h.score * QUALITY_BOOST[doc.kind][quality] * doc.prior * penalty,
        terms: h.terms,
      });
    }
    // Exact name matches always lead; everything else is ordered by the blended score.
    out.sort((a, b) => {
      const exact =
        Number(b.quality === 'exact') - Number(a.quality === 'exact');
      if (exact !== 0) return exact;
      if (b.score !== a.score) return b.score - a.score;
      return a.doc.title.localeCompare(b.doc.title);
    });
    return opts.limit != null ? out.slice(0, opts.limit) : out;
  }

  /** "Did you mean" for queries with no results: the best fuzzy completion, if any. */
  suggest(raw: string): string | null {
    const q = parseQuery(raw);
    if (q.tokens.length === 0) return null;
    const s = this.mini.autoSuggest(q.tokens.join(' '), {
      fuzzy: 0.34,
      prefix: true,
      combineWith: 'AND',
    });
    const best = s[0]?.suggestion;
    return best != null && best !== q.tokens.join(' ') ? best : null;
  }
}

export interface ResultGroup {
  kind: SearchKind;
  /** Total matches of this kind (before the per-group cap) */
  total: number;
  results: RankedResult[];
}

/**
 * Splits ranked results into kind groups (each capped at `perGroup`). A group whose best hit is an
 * exact name match comes first; the others are ordered by their best score, with metrics weighted
 * up and categories down — so "japan" opens on Japan, "income" on income metrics and "happiest" on
 * the happiest-places topics.
 */
export function groupResults(
  results: readonly RankedResult[],
  perGroup: number | Partial<Record<SearchKind, number>>
): ResultGroup[] {
  const byKind = new Map<SearchKind, RankedResult[]>();
  for (const r of results) {
    const list = byKind.get(r.doc.kind);
    if (list == null) byKind.set(r.doc.kind, [r]);
    else list.push(r);
  }
  const groups: (ResultGroup & { exact: boolean; weight: number })[] = [];
  for (const kind of SEARCH_KINDS) {
    const list = byKind.get(kind);
    if (list == null || list.length === 0) continue;
    const cap = typeof perGroup === 'number' ? perGroup : (perGroup[kind] ?? 5);
    groups.push({
      kind,
      total: list.length,
      results: list.slice(0, cap),
      exact: list[0].quality === 'exact',
      weight: list[0].score * GROUP_WEIGHT[kind],
    });
  }
  groups.sort((a, b) =>
    a.exact !== b.exact
      ? Number(b.exact) - Number(a.exact)
      : b.weight - a.weight
  );
  return groups.map(({ kind, total, results: r }) => ({
    kind,
    total,
    results: r,
  }));
}

// ---------------------------------------------------------------------------
// Highlighting

export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * Splits `text` into plain and highlighted parts. A word is highlighted up to the length of the
 * query word it starts with (so typing "inc" marks "Inc" in "Income"), or entirely when it is one
 * of the matched index terms (fuzzy or synonym hits).
 */
export function highlightParts(
  text: string,
  query: string,
  matchedTerms: readonly string[] = []
): HighlightPart[] {
  const tokens = parseQuery(query).tokens;
  const terms = new Set(matchedTerms);
  if (tokens.length === 0 && terms.size === 0) return [{ text, match: false }];
  const parts: HighlightPart[] = [];
  const push = (t: string, match: boolean) => {
    if (t === '') return;
    const last = parts[parts.length - 1];
    if (last != null && last.match === match) last.text += t;
    else parts.push({ text: t, match });
  };
  const wordRe = /[\p{L}\p{N}%$]+/gu;
  let cursor = 0;
  for (const m of text.matchAll(wordRe)) {
    const word = m[0];
    const start = m.index;
    push(text.slice(cursor, start), false);
    const norm = normalizeText(word);
    let len = 0;
    for (const t of tokens) {
      if (norm.startsWith(t))
        len = Math.max(len, Math.min(word.length, t.length));
    }
    if (len === 0 && terms.has(norm)) len = word.length;
    push(word.slice(0, len), true);
    push(word.slice(len), false);
    cursor = start + word.length;
  }
  push(text.slice(cursor), false);
  return parts;
}
