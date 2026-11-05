// Answer-first page summaries, FAQs and structured data for search engines and
// AI answer engines. Computed in route loaders (on the server while
// prerendering), so only these small objects are embedded in the HTML.

import {
  canonicalTopicSlug,
  isIndexablePlace,
  isIndexableTopic,
  newestDate,
  topicCoverage,
} from './indexing';
import { topicAnswers } from './topic-content';
import type { Dataset } from '~/data/dataset';
import { EXTERNAL_ID_BASE } from '~/data/external';
import { isRankColumn } from '~/data/rankOrder';
import type {
  CategoryInfo,
  Entity,
  EntityType,
  EntityTypeInfo,
  Metric,
  TopicFile,
  TopicSource,
} from '~/data/types';
import { datasetFacts } from '~/features/places/datasetFacts';
import { rankText } from '~/features/places/percentile';
import {
  byKeys,
  coverageCut,
  inBottomQuarter,
  inTopQuarter,
  isPolar,
  type PlaceFact,
  placeFacts,
  type PlaceMetric,
  placeStandings,
  qualifyingRows,
  rankableMetrics,
  sizeDrivenMetrics,
} from '~/features/places/profileModel';
import {
  contentWords,
  headlineOverride,
  labelMatch,
  leadMetric,
  openingYear,
} from '~/features/topic/headline';
import { seriesYears } from '~/features/topic/model';
import { formatInt, formatValue, ordinal, typeNoun } from '~/lib/format';
import { breadcrumbs, faqPage, publisherRef } from '~/lib/seo';
import { absoluteUrl, SITE } from '~/site';

export interface QA {
  question: string;
  answer: string;
}

export interface Crumb {
  name: string;
  path: string;
}

/** Everything a route needs for its head tags and visible quick answers. */
export interface PageSummary {
  title: string;
  description: string;
  /** One or two answer-first sentences shown near the top of the page */
  summary: string;
  faq: QA[];
  crumbs: Crumb[];
  jsonLd: Record<string, unknown>[];
  noindex: boolean;
}

/** "US states" / "countries" for mid-sentence use. */
const plural = (type: EntityTypeInfo): string => typeNoun(type.label);
/** "US state" / "country" for mid-sentence use. */
const singular = (type: EntityTypeInfo): string => typeNoun(type.singular);

/** Where a place type's data applies, for Dataset spatialCoverage. */
const SPATIAL: Record<EntityType, string> = {
  country: 'World',
  'world-city': 'World',
  state: 'United States',
  city: 'United States',
  county: 'United States',
};

/**
 * Metrics a topic shows, counted the same way wherever a count is printed (the page header,
 * the meta description, the Dataset): known to the catalog and not bookkeeping columns.
 */
export function shownMetrics(topic: TopicFile, ds: Dataset): Metric[] {
  return topic.metrics
    .map((id) => ds.metric(id))
    .filter((m): m is Metric => m != null && m.meta !== true);
}

/** Room for a page title before " — Rankodex" pushes the <title> past 65 characters. */
const TITLE_ROOM = 65 - ` — ${SITE.name}`.length;

/**
 * Framings a topic name can take in its <title>, longest first. Ranked topics are "Ranked,
 * Mapped & Compared" down to "Map" (a title that already says "rank" starts at "Mapped &
 * Compared"), lists of places a "Full List" or "List", and questions are "Answered with Data" or
 * "Answered" when the page's lead answers them (then "Data" when neither fits), else "Data & Map"
 * or "Data".
 */
function framings(
  title: string,
  ranked: boolean,
  answered: boolean
): readonly string[] {
  if (title.endsWith('?'))
    return answered
      ? [' Answered with Data', ' Answered', ' Data']
      : [' Data & Map', ' Data'];
  if (!ranked) return [': Full List', ': List'];
  return /\brank/i.test(title)
    ? [': Mapped & Compared', ': Mapped', ': Map']
    : [': Ranked, Mapped & Compared', ': Ranked & Mapped', ': Ranked', ': Map'];
}

/** Small words an acronym skips ("Organization of Islamic Cooperation" is OIC). */
const ACRONYM_SKIP = new Set([
  'of',
  'for',
  'and',
  'the',
  'in',
  'on',
  'to',
  '&',
]);

/** The initials of a run of words, small words skipped ("Asia-Pacific Economic" → "APE"). */
function initials(words: readonly string[]): string {
  return words
    .filter((w) => !ACRONYM_SKIP.has(w.toLowerCase()))
    .flatMap((w) => w.split('-'))
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/**
 * Shorter forms of a topic name that say the same thing, mildest first: an acronym next to the
 * words it stands for keeps one of the two ("European Free Trade Association (EFTA)
 * Countries" → "European Free Trade Association Countries", then → "EFTA Countries" when the
 * words spell the acronym; "NAFTA (North American Free Trade Agreement) Countries" → "NAFTA
 * Countries"), "Percentage of" becomes "% of" and a serial comma goes ("Red, White, and Blue" →
 * "Red, White and Blue").
 */
export function shorterTitles(title: string): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    if (t !== title && !out.includes(t)) out.push(t);
  };
  // "Words (ABC)": drop the acronym, or keep it in place of the words when they spell it.
  const acronym = /^(.*?)\s\(([A-Z][A-Z0-9]{1,6})\)(.*)$/.exec(title);
  let spelled = title;
  let short: string | null = null;
  if (acronym != null) {
    const [, before = '', abbr = '', after = ''] = acronym;
    spelled = `${before}${after}`;
    const words = before.replace(/,/g, '').split(' ');
    for (let k = words.length - 1; k >= 0; k--) {
      if (initials(words.slice(k)) !== abbr) continue;
      short = [...words.slice(0, k), abbr].join(' ') + after;
      break;
    }
  }
  // "ABC (Words …)": the acronym alone.
  const expansion =
    /^(.*\b[A-Z][A-Z0-9]{1,6})\s\([A-Z][^()]*\s[^()]*\)(.*)$/.exec(spelled);
  if (expansion != null) spelled = `${expansion[1]}${expansion[2]}`;
  const tidy = (t: string) =>
    t.replace(/\b[Pp]ercentage of\b/g, '% of').replace(/, (and|or) /g, ' $1 ');
  for (const t of [
    spelled,
    tidy(spelled),
    short,
    short == null ? null : tidy(short),
  ])
    if (t != null) add(t);
  return out;
}

/**
 * The <title> and og:title of a topic page: its name plus the first Rankodex framing that fits
 * the room left (see `framings`), so the tag reads differently from the source's own title while
 * the H1 stays the plain topic name. A name too long for any framing tries its shorter forms
 * (`shorterTitles`) before it is left unframed; one longer than the room on its own is shortened
 * when a shorter form fits. A question is framed "Answered" only when `answered` (the lead
 * answers it; see TopicText.answered).
 */
export function topicPageTitle(
  title: string,
  ranked: boolean,
  answered = true
): string {
  const forms = [title, ...shorterTitles(title)];
  for (const form of forms)
    for (const frame of framings(form, ranked, answered))
      if (form.length + frame.length <= TITLE_ROOM) return `${form}${frame}`;
  return forms.find((f) => f.length <= TITLE_ROOM) ?? title;
}

/** Characters of a meta description a search snippet shows (clampDescription's default). */
const META_LENGTH = 158;

/**
 * A topic's meta description: an answer, then the closing sentence that names the topic, so that
 * what a search snippet shows names the topic and two pages over the same table ("Oil
 * Production by Country" and "Oil Producing Countries", or "Single-Party Consent States" and
 * "Two-Party Consent States") never read the same. `answers` are the answer's forms, longest
 * first (the short answer, then its first sentence alone), and `closings` the closing's
 * (`topicClosings`, longest first). Whole sentences come first: the longest answer that fits
 * META_LENGTH with any closing, with the longest closing that fits beside it, so
 * clampDescription has nothing to cut; else an answer that names the topic (its title, in any
 * case) on its own. Only when no whole form fits is the description cut: an answer that leaves
 * the name inside the first META_LENGTH characters, else the closing first.
 */
export function topicDescription(
  answers: readonly string[],
  closings: string | readonly string[],
  name: string
): string {
  const ends = typeof closings === 'string' ? [closings] : closings;
  const closing = ends[0] ?? '';
  // "14 countries are 14 Eyes countries" names "14 Eyes Countries" too.
  const bare = name.replace(/[?.!]$/, '').toLowerCase();
  for (const answer of answers)
    for (const end of ends) {
      const text = `${answer} ${end}`;
      if (text.length <= META_LENGTH) return text;
    }
  for (const answer of answers)
    if (answer.length <= META_LENGTH && answer.toLowerCase().includes(bare))
      return answer;
  // clampDescription cuts at a word boundary at most 20 characters before the limit.
  for (const answer of answers) {
    const text = `${answer} ${closing}`;
    const at = text.toLowerCase().indexOf(bare);
    if (at >= 0 && at + bare.length <= META_LENGTH - 20) return text;
  }
  return `${ends[ends.length - 1] ?? ''} ${answers[0] ?? ''}`.trim();
}

/**
 * The closing sentence of a topic's description, after the answer: what the page holds, named
 * by its title so pages over the same table still read apart ("Coldest States: 50 US states
 * ranked on 3 metrics, mapped and compared."). A null title leaves the name out, for an answer
 * that already opens with it.
 */
export function topicClosing(
  title: string | null,
  places: number,
  metrics: number,
  ranked: boolean,
  type: EntityTypeInfo
): string {
  return topicClosings(title, places, metrics, ranked, type)[0];
}

/**
 * `topicClosing` and its shorter forms, longest first, for a description that has room for the
 * answer and only part of the closing: "Coldest States: 50 US states ranked on 3 metrics, mapped
 * and compared.", "… ranked on 3 metrics.", "Coldest States: 50 US states, ranked and mapped.",
 * "Coldest States: the full ranking."
 */
export function topicClosings(
  title: string | null,
  places: number,
  metrics: number,
  ranked: boolean,
  type: EntityTypeInfo
): string[] {
  const where = `${formatInt(places)} ${places === 1 ? singular(type) : plural(type)}`;
  const what = `${formatInt(metrics)} ${metrics === 1 ? 'metric' : 'metrics'}`;
  const bare = title == null ? null : title.replace(/[?.!]$/, '');
  const name = bare == null ? '' : `${bare}: `;
  const forms = ranked
    ? [
        `${name}${where} ranked on ${what}, mapped and compared.`,
        `${name}${where} ranked on ${what}.`,
        `${name}${where}, ranked and mapped.`,
      ]
    : [
        `${name}${where} and ${what} in one table.`,
        `${name}${where} in one table.`,
      ];
  // The name alone, when the answer leaves room for little else.
  if (bare != null)
    forms.push(`${bare}: the full ${ranked ? 'ranking' : 'list'}.`);
  return forms;
}

/** A cited source as a schema.org CreativeWork: its name and address. */
function sourceWork(source: {
  name: string;
  url: string;
}): Record<string, unknown> {
  return source.name === ''
    ? { '@type': 'CreativeWork', url: source.url }
    : { '@type': 'CreativeWork', name: source.name, url: source.url };
}

/**
 * Who made a topic's table and what it is based on, as the creator, publisher and isBasedOn of
 * its Dataset markup. Google's Dataset documentation calls creator "the creator or author of this
 * dataset" and names the originals of a derived dataset with isBasedOn. A topic compiled from a
 * World Population Review page is that site's work, so its creator is World Population Review
 * and it is based on that page, which is in turn based on the sources the page cites. A topic
 * Rankodex built from a primary source (it has no source page) is Rankodex's own, based on the
 * agency's data. Rankodex publishes both, named by the @id of the Organization node every page
 * carries.
 */
export function datasetCredit(
  topic: Pick<TopicFile, 'url' | 'sources'>,
  /** Publishers of outside figures the page leads with (HeadlineOverride.source) */
  extra: readonly TopicSource[] = []
): Record<string, unknown> {
  // The first source listed at each address (a page may cite one twice).
  const byUrl = new Map<string, Record<string, unknown>>();
  for (const s of topic.sources)
    if (!byUrl.has(s.url)) byUrl.set(s.url, sourceWork(s));
  const cited = [...byUrl.values()];
  const outside = extra
    .filter((s) => !byUrl.has(s.url))
    .map((s) => sourceWork(s));
  if (topic.url == null) {
    const all = [...cited, ...outside];
    return {
      creator: publisherRef(),
      publisher: publisherRef(),
      ...(all.length > 0 ? { isBasedOn: all } : {}),
    };
  }
  const source = {
    '@type': 'Organization',
    name: SITE.sourceName,
    url: SITE.sourceUrl,
  };
  const page = {
    '@type': 'CreativeWork',
    url: topic.url,
    creator: source,
    ...(cited.length > 0 ? { isBasedOn: cited } : {}),
  };
  return {
    creator: source,
    publisher: publisherRef(),
    isBasedOn: outside.length > 0 ? [page, ...outside] : page,
  };
}

/**
 * Summary, FAQ and Dataset markup for a topic page. The summary sentence and quick answers are
 * topicAnswers() for the lead metric at the year the page opens on, so the head tags, the FAQPage
 * JSON-LD and the visible text all come from the one wording the page also uses for any other
 * metric or year.
 */
export function topicSummary(
  topic: TopicFile,
  ds: Dataset,
  categories: readonly CategoryInfo[]
): PageSummary {
  const type = ds.type;
  const noindex = !isIndexableTopic(
    topicCoverage(topic, (id) => ds.metric(id))
  );
  // An alias names its primary page, as its canonical tag does (a thin page keeps its own).
  const path = `/topics/${type.id}/${
    noindex ? topic.slug : canonicalTopicSlug(type.id, topic.slug)
  }`;
  const metric = leadMetric(topic, ds);
  const { summary, short, lead, faq, answered } = topicAnswers(
    topic,
    ds,
    metric,
    metric == null ? null : openingYear(topic, metric)
  );

  const category = categories.find((c) => topic.cats.includes(c.id));
  const crumbs: Crumb[] = [
    { name: SITE.name, path: '/' },
    ...(category == null
      ? []
      : [{ name: category.label, path: `/categories/${category.id}` }]),
    { name: topic.title, path },
  ];
  const shown = shownMetrics(topic, ds);
  // The years the topic's own table covers (the CSV download), not a headline borrowed from
  // another topic.
  const thisYear = new Date().getUTCFullYear();
  const years = [...new Set(shown.flatMap((m) => seriesYears(topic, m.id)))]
    .filter((y) => y <= thisYear)
    .sort((a, b) => a - b);
  // A headline figure from another topic (HEADLINES) is measured too, and its publisher credited.
  const override = headlineOverride(topic);
  const outside =
    metric != null && !shown.some((m) => m.id === metric.id) ? metric : null;
  const variables = [...(outside == null ? [] : [outside]), ...shown].slice(
    0,
    25
  );
  // The answer comes first, then one closing sentence naming the topic and what the page
  // holds. The meta description quotes the short answer (see topicDescription), so pages over
  // the same table read apart; the Dataset keeps the full summary.
  const closings = topicClosings(
    short.startsWith(`${topic.title}:`) ? null : topic.title,
    topic.entities.length,
    shown.length,
    metric != null,
    type
  );
  const closing = closings[0];
  const description = topicDescription([short, lead], closings, topic.title);

  const dataset: Record<string, unknown> = {
    '@type': 'Dataset',
    name: topic.title,
    description: `${summary} ${closing}`,
    url: absoluteUrl(path),
    keywords: [
      type.label,
      ...categories
        .filter((c) => topic.cats.includes(c.id))
        .map((c) => c.label),
      ...variables.slice(0, 8).map((m) => m.label),
    ],
    isAccessibleForFree: true,
    ...datasetCredit(
      topic,
      outside != null && override?.source != null ? [override.source] : []
    ),
    spatialCoverage: { '@type': 'Place', name: SPATIAL[type.id] },
    variableMeasured: variables.map((m) =>
      m.unit == null
        ? { '@type': 'PropertyValue', name: m.label }
        : { '@type': 'PropertyValue', name: m.label, unitText: m.unit }
    ),
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'text/csv',
        contentUrl: absoluteUrl(`/data/${type.id}/topics/${topic.slug}.csv`),
      },
    ],
  };
  // The date the page shows as "Updated" (TopicHeader) and the sitemap's lastmod: the topic's
  // own update date, else its newest metric's.
  const modified =
    newestDate([topic.updated]) ??
    newestDate(topic.metrics.map((id) => ds.metric(id)?.updated));
  if (modified != null) dataset.dateModified = modified;
  if (years.length > 0) {
    const first = years[0];
    const last = years[years.length - 1];
    dataset.temporalCoverage =
      first === last ? String(first) : `${first}/${last}`;
  }

  return {
    title: topicPageTitle(topic.title, metric != null, answered),
    description,
    summary,
    faq,
    crumbs,
    jsonLd: [dataset, breadcrumbs(crumbs), faqPage(faq)],
    noindex,
  };
}

/**
 * Well-understood quality-of-life measures with a clear better direction.
 * Summaries quote only these so a place's "best at" reads as meaningful
 * (income, life expectancy, crime) rather than as an obscure column.
 */
const HEADLINE =
  /\b(income|gdp|wages?|salar(y|ies)|poverty|unemployment|life expectancy|infant mortality|mortality|homicide|murder|crime|violent|literacy|education|graduation|bachelor|happiness|happiest|obesity|smoking|cost of living|home value|safety|peace|democracy|corruption|human development|hdi|internet|broadband|uninsured|health ?care|suicide|overdose|air quality|pollution|renewable|commute|tax burden|freedom)\b/i;

/**
 * Up to `limit` metrics a place summary calls its best and its lowest. A metric counts as a
 * strength only when the place is above the median place on it (percentile above 0.5) and as a
 * weak spot only below it, so the two lists never name the same metric: a place with a single
 * headline metric gets one list, not that metric on both. Higher percentiles go first among
 * strengths and lower among weak spots; equal percentiles go to the better (or worse) rank.
 */
export function summaryExtremes(
  rows: readonly PlaceMetric[],
  limit = 3
): { best: PlaceMetric[]; worst: PlaceMetric[] } {
  const best = rows
    .filter((p) => p.standing.pct > 0.5)
    .sort((a, b) =>
      byKeys(b.standing.pct - a.standing.pct, a.standing.rank - b.standing.rank)
    )
    .slice(0, limit);
  const worst = rows
    .filter((p) => p.standing.pct < 0.5)
    .sort((a, b) =>
      byKeys(a.standing.pct - b.standing.pct, b.standing.rank - a.standing.rank)
    )
    .slice(0, limit);
  return { best, worst };
}

/** schema.org type for a place. */
const PLACE_TYPE: Record<EntityType, string> = {
  country: 'Country',
  state: 'State',
  city: 'City',
  'world-city': 'City',
  county: 'AdministrativeArea',
};

/**
 * True when a metric is what its primary topic is about, so a place summary can quote it as a
 * place's best or worst: an agency statistic (World Bank, Census, BLS…), or a column whose label
 * repeats the title of its primary topic when that topic is canonical (not an alias). This keeps
 * sub-columns out ("Life Expectancy" from the Happy Planet Index's 2021 table is not the life
 * expectancy answer; the World Bank's is).
 */
export function isHeadlineMetric(
  ds: Pick<Dataset, 'topicTitleOf' | 'type'>,
  metric: Pick<Metric, 'id' | 'label' | 'topics'>
): boolean {
  if (metric.id >= EXTERNAL_ID_BASE) return true;
  const slug = metric.topics[0];
  const title = slug == null ? null : ds.topicTitleOf(slug);
  if (slug == null || title == null) return false;
  if (canonicalTopicSlug(ds.type.id, slug) !== slug) return false;
  // At least half of the title's words: "Avg Salary" repeats one of "Correctional Officer
  // Salary by State", which is about one job's pay, not the state.
  const need = new Set(contentWords(title)).size;
  const match = labelMatch(title, metric.label);
  return match > 0 && match * 2 >= need;
}

/**
 * A population in a sentence: "122.4M", "2.96M", "349M", "18,053" — three significant figures
 * from a million on, spelled out by hand so the server and every browser agree.
 */
export function populationText(pop: number): string {
  if (pop < 1e6) return formatInt(pop);
  const [value, unit] = pop >= 1e9 ? [pop / 1e9, 'B'] : [pop / 1e6, 'M'];
  const digits = value < 10 ? 2 : 1;
  return `${value.toFixed(digits).replace(/\.?0+$/, '')}${unit}`;
}

/**
 * The first sentence of a place summary with its first `facts` dated, sourced figures: "Japan
 * (country in Asia): population 122.4M, 12th of 235; life expectancy 84.0 years (World Bank
 * 2024); GDP per person (PPP) $51,685 (World Bank 2025)." `where` places it ("country in Asia",
 * "US city in California"), so same-named places read apart.
 */
export function placeLead(
  name: string,
  where: string,
  population: string | null,
  facts: readonly PlaceFact[]
): string {
  const items = [
    ...(population == null ? [] : [`population ${population}`]),
    ...facts.map((f) => `${f.label} ${f.value} (${f.source})`),
  ];
  return items.length === 0
    ? `${name} is a ${where}.`
    : `${name} (${where}): ${items.join('; ')}.`;
}

/**
 * A meta description made of whole sentences within META_LENGTH, so clampDescription has nothing
 * to cut: the first of `leads` (longest first) that fits, then each later sentence's longest form
 * that still fits. Falls back to the shortest lead, which the clamp then cuts.
 */
export function wholeSentences(
  leads: readonly string[],
  rest: readonly (readonly string[])[]
): string {
  const lead = leads.find((l) => l.length <= META_LENGTH);
  if (lead == null) return leads[leads.length - 1] ?? '';
  let text = lead;
  for (const forms of rest) {
    const next = forms.find((f) => text.length + 1 + f.length <= META_LENGTH);
    if (next != null) text = `${text} ${next}`;
  }
  return text;
}

/** "Highest of 215", "10th highest of 215": a place's position by value, no judgement. */
function highestText(col: ArrayLike<number>, v: number): string {
  let above = 0;
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    if (!Number.isFinite(col[i])) continue;
    n++;
    if (col[i] > v) above++;
  }
  return `${above === 0 ? 'highest' : `${ordinal(above + 1)} highest`} of ${formatInt(n)}`;
}

/**
 * Codes that identify a place in other datasets, as schema.org PropertyValues: ISO 3166-1
 * alpha-3 for countries, the USPS code and FIPS code for states, the FIPS code for counties (the
 * ids entities.json uses). Cities and world cities carry no such code.
 */
export function placeIdentifiers(
  type: EntityType,
  e: Pick<Entity, 'id' | 'fips'>
): Record<string, unknown>[] {
  const code = (propertyID: string, value: string) => ({
    '@type': 'PropertyValue',
    propertyID,
    value,
  });
  if (type === 'country') return [code('ISO 3166-1 alpha-3', e.id)];
  if (type === 'state')
    return [
      code('USPS', e.id),
      ...(e.fips == null ? [] : [code('FIPS', e.fips)]),
    ];
  if (type === 'county' && /^\d{5}$/.test(e.id)) return [code('FIPS', e.id)];
  return [];
}

/**
 * Summary, FAQ and Place markup for a place report card. The summary opens with dated, sourced
 * figures (`placeLead`), then names what the place ranks best and lowest for: only headline
 * metrics (`isHeadlineMetric`) with a better side and broad coverage, and only standings in the
 * best or worst quarter, so a mid-table rank is never called its best.
 */
export function placeSummary(ds: Dataset, index: number): PageSummary {
  const type = ds.type;
  const e = ds.entities[index];
  const path = `/places/${type.id}/${e.slug}`;
  const all = placeStandings(ds, index);
  const cut = coverageCut(rankableMetrics(ds), ds.entities.length);
  // Rank-style columns ("Food Wasted Rank") often put the most of something,
  // not the best, at #1, so summaries only use measured values with a clear
  // better direction and broad coverage.
  const minN = Math.max(cut.minN, Math.ceil(ds.entities.length * 0.5));
  const candidates = all.filter(
    (p) =>
      p.polar &&
      isPolar(p.metric) &&
      p.metric.n >= minN &&
      !isRankColumn(p.metric) &&
      !/\brank(ing)?\b/i.test(p.metric.label) &&
      HEADLINE.test(p.metric.label) &&
      isHeadlineMetric(ds, p.metric)
  );
  // Raw totals that mostly track population ("# with safe water") say little.
  const sized = sizeDrivenMetrics(
    ds,
    candidates.map((p) => p.metric)
  );
  const polar = candidates.filter((p) => !sized.has(p.metric.id));
  const best = summaryExtremes(
    polar.filter((p) => inTopQuarter(p.standing))
  ).best;
  const worst = summaryExtremes(
    polar.filter((p) => inBottomQuarter(p.standing))
  ).worst;
  // "Avg Salary (Correctional Officer Salary by State, 1st of 51)": a label that needs its
  // topic to make sense carries it.
  const describe = (p: PlaceMetric): string => {
    const label = p.metric.label;
    const context = ds.metricContext(p.metric.id);
    // metricFullLabel's rule, and no context the label already says ("Corruption Perception
    // Index" on Corruption Perceptions Index by Country).
    const needed =
      context != null &&
      ds.metricFullLabel(p.metric.id) !== label &&
      labelMatch(label, context) < new Set(contentWords(label)).size;
    return needed
      ? `${label} (${context}, ${rankText(p.standing)})`
      : `${label} (${rankText(p.standing)})`;
  };

  const popRank =
    e.pop == null
      ? null
      : ds.entities.filter((x) => (x.pop ?? -1) > (e.pop ?? -1)).length + 1;
  // "in the West" for census regions, "in California" for cities and counties,
  // "in Asia" for countries, "in Japan" for world cities.
  const region =
    type.id === 'city' || type.id === 'county'
      ? (e.sub ?? null)
      : type.id === 'state' && e.group != null
        ? `the ${e.group}`
        : (e.group ?? null);
  const where = `${singular(type)}${region != null && region !== '' ? ` in ${region}` : ''}`;
  const population =
    e.pop == null
      ? null
      : `${populationText(e.pop)}${popRank == null ? '' : `, ${ordinal(popRank)} of ${formatInt(ds.entities.length)}`}`;
  const facts = placeFacts(ds, type.id, index, (m, v) => formatValue(m, v));
  const leadWith = (k: number) =>
    placeLead(e.name, where, population, facts.slice(0, k));
  const lead = leadWith(facts.length);
  const listed = (rows: readonly PlaceMetric[], sep: string) =>
    rows.map(describe).join(sep);
  const strengthsWith = (rows: readonly PlaceMetric[]) =>
    rows.length === 0 ? '' : `It ranks best for ${listed(rows, ', ')}.`;
  const weakWith = (rows: readonly PlaceMetric[]) =>
    rows.length === 0 ? '' : `It ranks lowest for ${listed(rows, ', ')}.`;
  const summary = [lead, strengthsWith(best), weakWith(worst)]
    .filter((t) => t !== '')
    .join(' ');
  const shorter = <T>(rows: readonly T[]): T[][] =>
    rows.map((_, k) => rows.slice(0, rows.length - k));
  const description = wholeSentences(
    facts.map((_, k) => leadWith(facts.length - k)).concat(leadWith(0)),
    [shorter(best).map(strengthsWith), shorter(worst).map(weakWith)]
  );

  const faq: QA[] = [];
  if (e.pop != null) {
    faq.push({
      question: `What is the population of ${e.name}?`,
      answer: `${e.name} has a population of ${formatInt(e.pop)}${popRank == null ? '' : `, ${ordinal(popRank)} among ${formatInt(ds.entities.length)} ${plural(type)}`}.`,
    });
  }
  if (facts.length > 0) {
    faq.push({
      question: `What are the key statistics for ${e.name}?`,
      answer: `${facts
        .map((f) => {
          const label = `${f.label.charAt(0).toUpperCase()}${f.label.slice(1)}`;
          const at = highestText(ds.numeric(f.id), ds.numeric(f.id)[index]);
          return `${label}: ${f.value} (${f.source}), ${at} ${plural(type)}`;
        })
        .join('; ')}.`,
    });
  }
  if (best.length > 0) {
    faq.push({
      question: `What does ${e.name} rank best at?`,
      answer: `Among ${plural(type)}, ${e.name} ranks best for ${listed(best, '; ')}.`,
    });
  }
  if (worst.length > 0) {
    faq.push({
      question: `Where does ${e.name} rank worst?`,
      answer: `${e.name} ranks lowest for ${listed(worst, '; ')}.`,
    });
  }
  faq.push({
    question: `How many statistics does ${SITE.name} have for ${e.name}?`,
    answer: `${SITE.name} ranks ${e.name} on ${formatInt(all.length)} statistics compared with other ${plural(type)}, compiled from ${SITE.sourceName} and the sources it cites.`,
  });

  const crumbs: Crumb[] = [
    { name: SITE.name, path: '/' },
    { name: type.label, path: `/places/${type.id}` },
    { name: e.name, path },
  ];
  const place: Record<string, unknown> = {
    '@type': PLACE_TYPE[type.id],
    name: e.name,
    url: absoluteUrl(path),
    description: summary,
  };
  const identifier = placeIdentifiers(type.id, e);
  if (identifier.length > 0) place.identifier = identifier;
  if (e.lat != null && e.lng != null) {
    place.geo = {
      '@type': 'GeoCoordinates',
      latitude: e.lat,
      longitude: e.lng,
    };
  }
  const usa = { '@type': 'Country', name: 'United States' };
  if ((type.id === 'city' || type.id === 'county') && e.sub != null) {
    // A US city or county sits in its state, which sits in the country.
    place.containedInPlace = {
      '@type': 'State',
      name: e.sub,
      containedInPlace: usa,
    };
  } else if (
    type.id === 'state' ||
    type.id === 'city' ||
    type.id === 'county'
  ) {
    place.containedInPlace = usa;
  } else if (type.id === 'world-city' && e.group != null) {
    place.containedInPlace = { '@type': 'Country', name: e.group };
  }
  if (e.pop != null) {
    place.additionalProperty = [
      { '@type': 'PropertyValue', name: 'Population', value: e.pop },
    ];
  }
  // The rows the profile's "Strengths and weak spots" ranks, population totals left out as
  // the page does by default; too few and the profile is thin (isIndexablePlace).
  const facts2 = datasetFacts(ds);
  const widelyRanked = qualifyingRows(
    all,
    facts2.cut,
    new Set([...facts2.selectedLists, ...facts2.sizeDriven])
  ).length;
  return {
    title: placeTitle(e.name, singular(ds.type)),
    description,
    summary,
    faq,
    crumbs,
    jsonLd: [place, breadcrumbs(crumbs), faqPage(faq)],
    noindex: !isIndexablePlace(all.length, widelyRanked),
  };
}

/**
 * A place page's <title>: its name and type, so same-named places read apart (Georgia the state
 * and the country), without repeating a type the name already ends with ("Cook County, IL:
 * county rankings…" would say county twice; a parish, borough, census area or planning region
 * is a county too). A long name keeps to the 65-character <title> with a shorter framing
 * ("Saint Vincent and the Grenadines: country rankings").
 */
export function placeTitle(name: string, singularType: string): string {
  const base = name.replace(/,\s*[A-Z]{2}$/, '');
  const kind = singularType.toLowerCase().replace(/^us /, '');
  const named = new RegExp(
    `\\b(${kind}|parish|borough|census area|planning region|municipality)$`,
    'i'
  );
  const forms = named.test(base)
    ? [`${name}: rankings and statistics`, `${name}: rankings`]
    : [
        `${name}: ${singularType} rankings and statistics`,
        `${name}: ${singularType} rankings`,
      ];
  return forms.find((f) => f.length <= TITLE_ROOM) ?? forms[forms.length - 1];
}
