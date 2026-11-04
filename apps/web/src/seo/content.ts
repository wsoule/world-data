// Answer-first page summaries, FAQs and structured data for search engines and
// AI answer engines. Computed in route loaders (on the server while
// prerendering), so only these small objects are embedded in the HTML.

import { isIndexablePlace, isIndexableTopic, topicCoverage } from './indexing';
import { topicAnswers } from './topic-content';
import type { Dataset } from '~/data/dataset';
import { isRankColumn } from '~/data/rankOrder';
import type {
  CategoryInfo,
  EntityType,
  EntityTypeInfo,
  Metric,
  TopicFile,
} from '~/data/types';
import { datasetFacts } from '~/features/places/datasetFacts';
import { rankText } from '~/features/places/percentile';
import {
  byKeys,
  coverageCut,
  isPolar,
  type PlaceMetric,
  placeStandings,
  qualifyingRows,
  rankableMetrics,
  sizeDrivenMetrics,
} from '~/features/places/profileModel';
import { leadMetric, openingYear } from '~/features/topic/headline';
import { seriesYears } from '~/features/topic/model';
import { formatInt, ordinal, typeNoun } from '~/lib/format';
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
 * The <title> and og:title of a topic page: its name plus the first Rankodex framing that fits
 * the room left, so the tag reads differently from the source's own title while the H1 stays
 * the plain topic name. Ranked topics are "Ranked, Mapped & Compared", then "Ranked & Mapped",
 * then "Ranked" (a title that already says "rank" is "Mapped & Compared" or "Mapped"), lists of
 * places a "Full List", and questions are "Answered with Data". A name too long for any
 * framing stays as it is.
 */
export function topicPageTitle(title: string, ranked: boolean): string {
  const variants = title.endsWith('?')
    ? [' Answered with Data']
    : !ranked
      ? [': Full List']
      : /\brank/i.test(title)
        ? [': Mapped & Compared', ': Mapped']
        : [': Ranked, Mapped & Compared', ': Ranked & Mapped', ': Ranked'];
  for (const v of variants) {
    const framed = `${title}${v}`;
    if (framed.length <= TITLE_ROOM) return framed;
  }
  return title;
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
  const where = `${formatInt(places)} ${places === 1 ? singular(type) : plural(type)}`;
  const what = `${formatInt(metrics)} ${metrics === 1 ? 'metric' : 'metrics'}`;
  const name = title == null ? '' : `${title.replace(/[?.!]$/, '')}: `;
  return ranked
    ? `${name}${where} ranked on ${what}, mapped and compared.`
    : `${name}${where} and ${what} in one table.`;
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
  topic: Pick<TopicFile, 'url' | 'sources'>
): Record<string, unknown> {
  // The first source listed at each address (a page may cite one twice).
  const byUrl = new Map<string, Record<string, unknown>>();
  for (const s of topic.sources)
    if (!byUrl.has(s.url)) byUrl.set(s.url, sourceWork(s));
  const cited = [...byUrl.values()];
  if (topic.url == null) {
    return {
      creator: publisherRef(),
      publisher: publisherRef(),
      ...(cited.length > 0 ? { isBasedOn: cited } : {}),
    };
  }
  const source = {
    '@type': 'Organization',
    name: SITE.sourceName,
    url: SITE.sourceUrl,
  };
  return {
    creator: source,
    publisher: publisherRef(),
    isBasedOn: {
      '@type': 'CreativeWork',
      url: topic.url,
      creator: source,
      ...(cited.length > 0 ? { isBasedOn: cited } : {}),
    },
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
  const path = `/topics/${type.id}/${topic.slug}`;
  const metric = leadMetric(topic, ds);
  const { summary, short, faq } = topicAnswers(
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
  const variables = shown.slice(0, 25);
  // The answer comes first, then one closing sentence naming the topic and what the page
  // holds. The meta description quotes the short answer, so the closing still fits in a search
  // snippet and pages over the same table read apart; the Dataset keeps the full summary.
  const closing = topicClosing(
    short.startsWith(`${topic.title}:`) ? null : topic.title,
    topic.entities.length,
    shown.length,
    metric != null,
    type
  );
  const description = `${short} ${closing}`;

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
    ...datasetCredit(topic),
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
  if (topic.updated != null) dataset.dateModified = topic.updated;
  if (years.length > 0) {
    const first = years[0];
    const last = years[years.length - 1];
    dataset.temporalCoverage =
      first === last ? String(first) : `${first}/${last}`;
  }

  return {
    title: topicPageTitle(topic.title, metric != null),
    description,
    summary,
    faq,
    crumbs,
    jsonLd: [dataset, breadcrumbs(crumbs), faqPage(faq)],
    noindex: !isIndexableTopic(topicCoverage(topic, (id) => ds.metric(id))),
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

/** Summary, FAQ and Place markup for a place report card. */
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
      HEADLINE.test(p.metric.label)
  );
  // Raw totals that mostly track population ("# with safe water") say little.
  const sized = sizeDrivenMetrics(
    ds,
    candidates.map((p) => p.metric)
  );
  const polar = candidates.filter((p) => !sized.has(p.metric.id));
  const { best, worst } = summaryExtremes(polar);
  const describe = (p: PlaceMetric): string =>
    `${p.metric.label} (${rankText(p.standing)})`;

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
  const where = region != null && region !== '' ? ` in ${region}` : '';
  const popText =
    e.pop == null
      ? ''
      : ` with a population of ${formatInt(e.pop)}${popRank == null ? '' : ` (${ordinal(popRank)} of ${formatInt(ds.entities.length)})`}`;
  const lead = `${e.name} is a ${singular(type)}${where}${popText}.`;
  const strengths =
    best.length > 0
      ? ` It ranks best for ${best.map(describe).join(', ')}.`
      : '';
  const weaknesses =
    worst.length > 0
      ? ` It ranks lowest for ${worst.map(describe).join(', ')}.`
      : '';
  const summary = `${lead}${strengths}${weaknesses}`;

  const faq: QA[] = [];
  if (e.pop != null) {
    faq.push({
      question: `What is the population of ${e.name}?`,
      answer: `${e.name} has a population of ${formatInt(e.pop)}${popRank == null ? '' : `, ${ordinal(popRank)} among ${formatInt(ds.entities.length)} ${plural(type)}`}.`,
    });
  }
  if (best.length > 0) {
    faq.push({
      question: `What does ${e.name} rank best at?`,
      answer: `Among ${plural(type)}, ${e.name} ranks best for ${best.map(describe).join('; ')}.`,
    });
  }
  if (worst.length > 0) {
    faq.push({
      question: `Where does ${e.name} rank worst?`,
      answer: `${e.name} ranks lowest for ${worst.map(describe).join('; ')}.`,
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
  if (e.lat != null && e.lng != null) {
    place.geo = {
      '@type': 'GeoCoordinates',
      latitude: e.lat,
      longitude: e.lng,
    };
  }
  if (type.id === 'state' || type.id === 'city' || type.id === 'county') {
    place.containedInPlace = { '@type': 'Country', name: 'United States' };
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
  const facts = datasetFacts(ds);
  const widelyRanked = qualifyingRows(
    all,
    facts.cut,
    new Set([...facts.selectedLists, ...facts.sizeDriven])
  ).length;
  return {
    // The place type keeps same-named places apart (Georgia the state and the country).
    title: `${e.name}: ${singular(ds.type)} rankings and statistics`,
    description: summary,
    summary,
    faq,
    crumbs,
    jsonLd: [place, breadcrumbs(crumbs), faqPage(faq)],
    noindex: !isIndexablePlace(all.length, widelyRanked),
  };
}
