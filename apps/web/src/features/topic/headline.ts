// What a topic's title asks and which of its statistics answers it. "Coldest Countries in the
// World" asks for the lowest temperatures, "Safest Countries" for the better end of a safety
// measure (the lowest Global Peace Index, the lowest crime rate), "Poorest Countries" for the
// worse end of an income measure. The topic page lists its ranking from that end and the SEO
// text (src/seo/topic-content.ts) leads with it, so a page and its opposite twin ("Hottest
// States" over the same table) never read the same way. Pure, so
// apps/web/test/topic-headline.test.ts covers it.

import {
  displayTables,
  focusableMetrics,
  hasUndated,
  listDirection,
  type ListOrder,
  resolveYear,
  seriesYears,
} from './model';
import type { Dataset } from '~/data/dataset';
import { isRankColumn } from '~/data/rankOrder';
import type { Metric, TopicFile } from '~/data/types';
import { canonicalTopicSlug } from '~/seo/indexing';

/** One end of a metric's values. */
export type End = 'high' | 'low';

/**
 * The direction a title names. `size` words name an end of the quantity itself (most, least,
 * coldest, cheapest); `judged` words name the better or worse end (best, safest, poorest), which
 * the metric's polarity turns into high or low, with `fallback` for metrics that have no better
 * side ("richest" still means the highest of a neutral wealth figure); `age` words (oldest,
 * newest, youngest) mean the earliest or latest of a year and the highest or lowest of anything
 * else. `word` is the adjective after "most" or "least" ("religious"), so a label that negates
 * it ("Pct Non-Religious") can turn the end round. `orderOnly` marks a cue that speaks only for
 * an order column ("first" means the lowest "Order of New Year Arrival", but says nothing about
 * the Human Development Index of "First World Countries").
 */
export type TitleCue =
  | { kind: 'size'; end: End; word?: string; orderOnly?: boolean }
  | { kind: 'judged'; good: boolean; fallback: End | null; word?: string }
  | { kind: 'age'; old: boolean };

const SIZE_HIGH = new Set([
  'most',
  'highest',
  'largest',
  'biggest',
  'tallest',
  'longest',
  'fastest',
  'busiest',
  'hottest',
  'warmest',
  'wettest',
  'rainiest',
  'snowiest',
  'sunniest',
  'windiest',
  'greatest',
  'heaviest',
  'deepest',
  'densest',
  'loudest',
  'drunkest',
  'darkest',
  'high-income',
]);

const SIZE_LOW = new Set([
  'least',
  'lowest',
  'fewest',
  'smallest',
  'shortest',
  'coldest',
  'coolest',
  'driest',
  'cheapest',
  'slowest',
  'lightest',
  'flattest',
  'thinnest',
  'quietest',
  // "Low-Income Countries" read from the lowest income; "Countries Without Clean Water" from
  // the lowest access to it, "States Without Tornadoes" from the fewest.
  'low-income',
  'without',
]);

/** Better-end words, with the end they mean for a metric without a better side. */
const GOOD: ReadonlyMap<string, End | null> = new Map([
  ['best', null],
  ['safest', null],
  ['richest', 'high'],
  ['wealthiest', 'high'],
  ['healthiest', null],
  ['happiest', 'high'],
  ['cleanest', null],
  ['friendliest', null],
  ['smartest', 'high'],
  ['freest', 'high'],
  ['greenest', null],
  ['easiest', null],
  ['nicest', null],
]);

/** Worse-end words, with the end they mean for a metric without a better side. */
const BAD: ReadonlyMap<string, End | null> = new Map([
  ['worst', null],
  ['poorest', 'low'],
  ['deadliest', 'high'],
  ['dirtiest', null],
  ['unhealthiest', null],
  ['unhappiest', 'low'],
  ['saddest', 'low'],
  ['dumbest', 'low'],
  ['ugliest', null],
  ['scariest', null],
  ['hardest', null],
  // "Developing Countries" are the less developed end of a development measure.
  ['developing', 'low'],
]);

/**
 * Adjectives after "most" or "least" that name the worse end ("most dangerous"; "least
 * corrupt" is the better end) rather than a quantity to count. "Most expensive" is not one: it
 * is simply the highest price, whichever way the catalog judges prices.
 */
const BAD_ADJ = new Set([
  'dangerous',
  'violent',
  'corrupt',
  'racist',
  'hated',
  'obese',
  'stressed',
  'depressed',
  'unhealthy',
  'homophobic',
  'overworked',
  'boring',
  'gerrymandered',
  'polluted',
  'unsafe',
  'miserable',
  'deadly',
  'sexist',
  'segregated',
]);

/** Adjectives after "most" or "least" that name the better end ("most peaceful"). */
const GOOD_ADJ = new Set([
  'peaceful',
  'educated',
  'developed',
  'democratic',
  'free',
  'charitable',
  'innovative',
  'productive',
  'kid-friendly',
  'eco-friendly',
  'livable',
  'liveable',
  'affordable',
  'safe',
  'healthy',
  'happy',
  'generous',
  'honest',
  'tolerant',
  'prosperous',
  'literate',
  'friendly',
  'powerful',
  'valuable',
  'competitive',
]);

/** The cue of one title word (or the first part of a hyphenated one), if it names a direction. */
function wordCue(w: string): TitleCue | null {
  if (w === 'first') return { kind: 'size', end: 'low', orderOnly: true };
  if (SIZE_HIGH.has(w)) return { kind: 'size', end: 'high' };
  if (SIZE_LOW.has(w)) return { kind: 'size', end: 'low' };
  if (w === 'oldest') return { kind: 'age', old: true };
  if (w === 'newest' || w === 'youngest') return { kind: 'age', old: false };
  const good = GOOD.get(w);
  if (good !== undefined) return { kind: 'judged', good: true, fallback: good };
  const bad = BAD.get(w);
  if (bad !== undefined) return { kind: 'judged', good: false, fallback: bad };
  return null;
}

/**
 * The first direction word of a title, or null when it names none ("Median Household Income
 * by State"). "most" and "least" read the adjective after them: "most dangerous" is the worse
 * end, "least corrupt" the better one, "most popular" simply the highest. A hyphenated word
 * counts by its first part ("Highest-Paid Jobs"). "first" ("Which Country Celebrates the New
 * Year First?") is an order-only cue (see `TitleCue`), so a later direction word wins over it.
 */
export function titleCue(title: string): TitleCue | null {
  const words = title.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? [];
  let orderCue: TitleCue | null = null;
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (w === 'most' || w === 'least') {
      const word = words[k + 1] ?? '';
      const high = w === 'most';
      const fallback: End = high ? 'high' : 'low';
      if (BAD_ADJ.has(word))
        return { kind: 'judged', good: !high, fallback, word };
      if (GOOD_ADJ.has(word))
        return { kind: 'judged', good: high, fallback, word };
      return { kind: 'size', end: fallback, word };
    }
    const cue =
      wordCue(w) ?? (w.includes('-') ? wordCue(w.split('-')[0]) : null);
    if (cue == null) continue;
    if (cue.kind === 'size' && cue.orderOnly === true) orderCue ??= cue;
    else return cue;
  }
  return orderCue;
}

/** Labels of an order or sequence ("Order of New Year Arrival"), which an order-only cue reads. */
const ORDER_LABEL = /\b(order|arrival|sequence)\b/i;

/** Labels that name a year or a date ("Independence Year", "Date Joined", "Founded"). */
const YEAR_LABEL =
  /\b(years?|dates?|founded|established|since|independence|adopted|abolished)\b/i;

/**
 * True when a metric's values are calendar years ("Year Joined", "Most Recent Election"): a
 * column formatted as years, or an unformatted one of whole numbers up to 2100 that reach a
 * modern year, all from 1000 on unless the label names a year ("Independence Year" goes back
 * to San Marino's 301). Such values print without a thousands separator and read as earliest
 * and latest.
 */
export function isYearValued(
  metric: Pick<Metric, 'fmt' | 'kind' | 'label'>,
  values: ArrayLike<number>
): boolean {
  if (metric.kind !== 'num') return false;
  if (metric.fmt === 'year') return true;
  if (metric.fmt != null) return false;
  const floor = YEAR_LABEL.test(metric.label) ? 1 : 1000;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (!Number.isInteger(v) || v < floor || v > 2100) return false;
    max = Math.max(max, v);
  }
  return max >= 1000;
}

const flip = (end: End): End => (end === 'high' ? 'low' : 'high');

/**
 * The end of a metric's values a title cue asks for, or null when the cue does not say (a
 * "best" title over a metric without a better side). Rank columns hold positions, where rank 1
 * is the most of what the column ranks: "most" or "highest" on one means rank 1 (the low
 * numbers) and "least" or "lowest" the last rank. Judged words use the rank's polarity like any
 * value (on a best-first rank, pol -1, the better end is rank 1).
 */
export function cueEnd(
  cue: TitleCue | null,
  metric: Pick<Metric, 'pol' | 'fmt'>,
  yearValued = false
): End | null {
  if (cue == null) return null;
  const rank = isRankColumn(metric);
  if (cue.kind === 'size') return rank ? flip(cue.end) : cue.end;
  if (cue.kind === 'age') {
    if (rank) return 'low';
    return cue.old === yearValued ? 'low' : 'high';
  }
  if (metric.pol === 0) return rank ? 'low' : cue.fallback;
  const goodEnd: End = metric.pol === 1 ? 'high' : 'low';
  return cue.good ? goodEnd : flip(goodEnd);
}

/** A hand-checked choice of what a topic leads with (see `HEADLINES`). */
export interface HeadlineOverride {
  /**
   * The metric the topic leads with. It may be a statistic of the same place type that the
   * topic does not carry; the summary then quotes the dataset's default-year values.
   */
  metric?: number;
  /** The end of the headline metric the summary and the ranking start from */
  end?: End;
  /** A sentence appended to the summary, saying where an outside figure comes from */
  note?: string;
}

/**
 * Topics whose headline the label match or the title words get wrong, each checked against the
 * data by hand:
 * - median-household-income-by-state only splits income by household size, so it leads with
 *   the Census ACS median household income of all households (900603, from Housing, Income
 *   and Commutes by State). The other "Median Household Income" (24419) puts Mississippi at
 *   $34,203, far below every other source.
 * - poorest-states carries only that 24419 column, so it leads with the same Census figure
 *   (Mississippi is the lowest there too, at the 5-year estimate the dataset holds).
 * - safest-counties lists 1,000 counties but its first column, murders, has values for only
 *   252 of them; its total of violent crimes covers all 1,000.
 * - best-countries-to-hide-money leads with the Financial Secrecy Index, whose catalog
 *   polarity rewards transparency; the best place to hide money is the most secretive, the
 *   highest score.
 * - hardest-bar-exams-by-state: the hardest exam has the lowest pass rate.
 * - most-corrupt-states leads with the rate of public corruption convictions, which reads the
 *   same way as the title (its BestLife score is higher for cleaner states, so "the lowest
 *   corruption score" would read as the least corrupt).
 * - dirtiest-countries-in-the-world leads with fine-particle (PM2.5) concentration: its EPI
 *   columns are scores where higher is cleaner, which "the lowest air pollution" misreads.
 * - best-weather-by-state leads with its first column, average temperature: the label match
 *   picks the count of extreme weather events, whose highest value is the worst weather.
 * - fastest-growing-cities-in-the-world leads with growth rather than the 2000 population.
 * - lowest-point-by-country leads with each country's minimum elevation rather than the span
 *   between its highest and lowest points.
 * - richest-person-by-state, safest-cities-by-state and worst-school-districts-by-state name
 *   one person, city or district per state (a text column); their numbers (age, population,
 *   number of districts) do not answer the title, so the summary lists the names instead. So do
 *   largest-city-by-state (the population is the city's), highest-paying-jobs-by-state (the
 *   salary is the job's), most-dangerous-cities-by-state (the "Place in Total Order" is the
 *   city's place among all cities surveyed), biggest-church-by-state (the attendance is the
 *   church's), richest-families-by-state (the worth is the family's) and small-towns-by-state.
 * - hottest-states, coldest-states and average-temperatures-by-state lead with NOAA's 1991–2020
 *   statewide average temperature (900401, from Climate by State): the source's own Average
 *   Temperature (20530) copies whole rows between states (Georgia carries Florida's 72.6 °F,
 *   NOAA has 64.2 °F).
 * - least-expensive-states (and its alias cheapest-states-to-live-in) leads with the overall
 *   cost of living index, not the grocery sub-index its first table starts with.
 * - gay-marriage-by-state leads with same-sex marriages rather than all married couples, like
 *   its alias same-sex-marriage-states.
 * - highest-paid-government-leaders-in-the-world (and its alias) leads with the head of
 *   government's salary, as the primary page does; the head of state column holds royal fortunes.
 * - worst-cities-in-the-us (and its alias worst-cities-in-america) leads with the USA Today
 *   ranking, which covers more of the cities than the "Least Desirable" one.
 * - what-country-has-the-highest-currency ("Which Currency is the Most Valuable?") lists the
 *   dollar rate of each currency: the most valuable takes the fewest units for a dollar.
 * - which-country-celebrates-new-year-first: the first country has order 1, the lowest.
 * - states-people-are-leaving leads with the share of moves that leave the state; its twin
 *   states-people-are-moving-to (the same table) leads with the moves into it.
 *
 * An alias in TOPIC_ALIASES (src/seo/indexing.ts) reads its primary's entry, so the two lead
 * the same way.
 */
/** Where the temperature topics' headline figure comes from. */
const NOAA_NOTE =
  'The headline figure is NOAA’s 1991–2020 average temperature for each state (nClimDiv climate normals); the table below is the source’s own figures.';

export const HEADLINES: Readonly<Record<string, HeadlineOverride>> = {
  'state/median-household-income-by-state': {
    metric: 900603,
    note: 'The headline figure is the US Census Bureau’s American Community Survey 5-year estimate (2020–2024) for all households; the tables below split median income by household size.',
  },
  'state/poorest-states': {
    metric: 900603,
    note: 'The headline figure is the US Census Bureau’s American Community Survey 5-year estimate (2020–2024); the table below is the source’s own 2023 figure, whose value for Mississippi is far below the Census Bureau’s.',
  },
  'county/safest-counties': { metric: 25507 },
  'country/best-countries-to-hide-money': { end: 'high' },
  'state/hardest-bar-exams-by-state': { end: 'low' },
  'state/most-corrupt-states': { metric: 24933 },
  'country/dirtiest-countries-in-the-world': { metric: 21790 },
  'state/best-weather-by-state': { metric: 21013 },
  'world-city/fastest-growing-cities-in-the-world': { metric: 24983 },
  'country/lowest-point-by-country': { metric: 12107 },
  'state/richest-person-by-state': { metric: 16502 },
  'state/safest-cities-by-state': { metric: 8712 },
  'state/worst-school-districts-by-state': { metric: 16467 },
  'state/largest-city-by-state': { metric: 24652 },
  'state/highest-paying-jobs-by-state': { metric: 8075 },
  'state/most-dangerous-cities-by-state': { metric: 9907 },
  'state/biggest-church-by-state': { metric: 21199 },
  'state/richest-families-by-state': { metric: 16569 },
  'state/small-towns-by-state': { metric: 15027 },
  'state/hottest-states': { metric: 900401, note: NOAA_NOTE },
  'state/coldest-states': { metric: 900401, note: NOAA_NOTE },
  'state/average-temperatures-by-state': { metric: 900401, note: NOAA_NOTE },
  'state/least-expensive-states': { metric: 20648 },
  'state/gay-marriage-by-state': { metric: 21276 },
  'country/highest-paid-government-leaders-in-the-world': { metric: 19841 },
  'city/worst-cities-in-the-us': { metric: 25139 },
  'country/what-country-has-the-highest-currency': { end: 'low' },
  'country/which-country-celebrates-new-year-first': { end: 'low' },
  'state/states-people-are-leaving': { metric: 22725 },
};

/**
 * The hand-checked headline of a topic, if any: its own entry, else its primary page's when it
 * only retitles one (TOPIC_ALIASES), so an alias and its canonical page lead alike.
 */
export function headlineOverride(
  topic: Pick<TopicFile, 'type' | 'slug'>
): HeadlineOverride | undefined {
  return (
    HEADLINES[`${topic.type}/${topic.slug}`] ??
    HEADLINES[`${topic.type}/${canonicalTopicSlug(topic.type, topic.slug)}`]
  );
}

/** Words that say nothing about which statistic a title is about. */
const STOP = new Set([
  'a',
  'an',
  'and',
  'are',
  'around',
  'by',
  'for',
  'from',
  'in',
  'is',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'vs',
  'with',
  'us',
  'world',
  'country',
  'countries',
  'state',
  'states',
  'city',
  'cities',
  'county',
  'counties',
  'place',
  'places',
  'rank',
  'ranks',
  'ranking',
  'rankings',
  'ranked',
  'list',
  'top',
  'data',
  'index',
  'rate',
  'rates',
  'total',
  'number',
  'population',
  ...SIZE_HIGH,
  ...SIZE_LOW,
  ...GOOD.keys(),
  ...BAD.keys(),
  'oldest',
  'newest',
  'youngest',
  // Price words after "most" name the end, not the statistic ("Most Expensive States to Live
  // In" is about the cost of living index, like "Cheapest States to Live In").
  'expensive',
  'affordable',
]);

/**
 * Content words of a title or label, lower-cased, with plurals dropped ("taxes" → "tax",
 * "cities" → "city"). A negated word stays one word ("Non-Polio" is "nonpolio"), so it never
 * matches the word it negates.
 */
export function contentWords(text: string): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase().replace(/\bnon[- ]/g, 'non');
  for (const raw of lower.match(/[a-z0-9]+/g) ?? []) {
    if (STOP.has(raw) || /^(19|20)\d\d$/.test(raw)) continue;
    const w =
      raw.length > 4 && raw.endsWith('ies')
        ? `${raw.slice(0, -3)}y`
        : /(x|ch|sh|ss)es$/.test(raw)
          ? raw.slice(0, -2)
          : raw.length > 3 && raw.endsWith('s') && !raw.endsWith('ss')
            ? raw.slice(0, -1)
            : raw;
    out.push(w);
  }
  return out;
}

/** Endings that turn a word into a related one ("own" → "ownership", "free" → "freedom"). */
const SUFFIXES =
  /^(e?s|e?d|e?r|e?rs|ing|ings|(e?r)?ship|ness|ity|al|ful|ly|ion|dom)$/;

/** Words that share five letters without being related. */
const FALSE_FRIENDS = new Set(['popular|population']);

/**
 * A word without a common ending, kept to at least four letters ("driver", "driving" → "driv",
 * "growth", "growing" → "grow").
 */
function root(word: string): string {
  const m = /^(.{4,}?)(ing|er|ed|ion|al|ity|ness|ship|th)$/.exec(word);
  return m == null ? word : m[1];
}

/**
 * True when two content words are the same word or share a stem: a word plus a common ending
 * ("own" / "ownership", "live" / "living", "free" / "freedom"), or a common start of five
 * letters ("religious" / "religion", "corrupt" / "corruption").
 */
function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3 || FALSE_FRIENDS.has(`${short}|${long}`)) return false;
  if (long.startsWith(short) && SUFFIXES.test(long.slice(short.length)))
    return true;
  if (
    short.endsWith('e') &&
    long.startsWith(short.slice(0, -1)) &&
    SUFFIXES.test(long.slice(short.length - 1))
  )
    return true;
  if (root(short) === root(long)) return true;
  let k = 0;
  while (k < short.length && short[k] === long[k]) k++;
  return k >= 5;
}

/** How many of the title's content words a metric label repeats. */
export function labelMatch(title: string, label: string): number {
  const words = contentWords(label);
  let score = 0;
  for (const w of new Set(contentWords(title)))
    if (words.some((l) => sameStem(w, l))) score++;
  return score;
}

/**
 * Content words of a label without its parenthesised notes, units and " - Source" suffix:
 * "GDP per Capita - IMF" and "GDP per Capita - World Bank" both read "gdp", "capita".
 */
function coreWords(label: string): string[] {
  return [
    ...new Set(
      contentWords(label.replace(/\([^)]*\)/g, ' ').replace(/\s[-–—]\s.*$/, ''))
    ),
  ];
}

/**
 * True when two metrics measure the same thing: the same metric, or labels with the same core
 * words ("Average Temperature (°C)" and "Average Temperature (°F)", "Total Violent Crimes" and
 * "Violent Crime Rate"). A title's size word ("coldest") speaks for the headline and for the
 * metrics akin to it, not for every column of the page.
 */
export function akin(
  a: Pick<Metric, 'id' | 'label'>,
  b: Pick<Metric, 'id' | 'label'>
): boolean {
  if (a.id === b.id) return true;
  const x = coreWords(a.label);
  const y = coreWords(b.label);
  if (x.length === 0 || x.length !== y.length) return false;
  return x.every((w) => y.some((v) => sameStem(w, v)));
}

/**
 * The end of `metric` a topic page reads from first, or null when the title says nothing about
 * it. A hand-checked `HEADLINES` end wins for the headline. Otherwise the title's cue (see
 * `titleCue` and `cueEnd`) applies to the headline and the metrics akin to it, and a better- or
 * worse-end word ("safest", "poorest") also to any other metric with a better side, since its
 * polarity says which end that is. A label that negates the title's adjective turns the end
 * round ("Least Religious Countries" over "Pct Non-Religious" reads from the highest share).
 */
export function topicEnd(
  topic: Pick<TopicFile, 'type' | 'slug' | 'title'>,
  metric: Pick<Metric, 'id' | 'pol' | 'fmt' | 'label'>,
  lead: Pick<Metric, 'id' | 'label'> | null,
  yearValued = false
): End | null {
  const cue = titleCue(topic.title);
  const isLead = lead != null && lead.id === metric.id;
  const fixed = headlineOverride(topic)?.end;
  if (isLead && fixed != null) return fixed;
  if (cue == null) return null;
  if (
    cue.kind === 'size' &&
    cue.orderOnly === true &&
    !ORDER_LABEL.test(metric.label)
  )
    return null;
  const applies =
    isLead ||
    (lead != null && akin(lead, metric)) ||
    (cue.kind === 'judged' && metric.pol !== 0);
  if (!applies) return null;
  const end = cueEnd(cue, metric, yearValued);
  if (end == null || cue.kind === 'age' || cue.word == null) return end;
  const negated = new RegExp(`\\b(non-?|not |ir|un)${cue.word}`, 'i');
  return negated.test(metric.label) ? flip(end) : end;
}

/**
 * The order a topic page lists a metric in (the ranking, the table's default sort and its #
 * column). Without a title cue for it, `listDirection`: rank 1 first for a rank column, best
 * first by polarity for values. With one, values list from the end the title asks for
 * ("Coldest Countries" lowest first), and a rank column keeps its true ranks but starts from
 * the last one when the title asks for that end ("Least Educated States" over a best-first
 * rank).
 */
export function topicListOrder(
  topic: Pick<TopicFile, 'type' | 'slug' | 'title'>,
  metric: Pick<Metric, 'id' | 'pol' | 'fmt' | 'label'>,
  lead: Pick<Metric, 'id' | 'label'> | null,
  yearValued = false
): ListOrder {
  const base = listDirection(metric);
  const end = topicEnd(topic, metric, lead, yearValued);
  if (end == null) return { direction: base, fromLast: false, byTitle: false };
  if (isRankColumn(metric))
    return {
      direction: base,
      fromLast: end === 'high',
      byTitle: end === 'high',
    };
  const direction = end === 'high' ? 1 : -1;
  return { direction, fromLast: false, byTitle: direction !== base };
}

/** Labels of a change between years ("Change in Freedom Rank Since 2016"), not a level. */
const CHANGE = /\b(change|growth)\b/i;
/** Titles about a change, where a change column is the answer. */
const CHANGE_TITLE = /\b(change|growth|growing|declin\w*|rising|shrinking)\b/i;
/**
 * Ratio labels ("Liberal-to-Conservative Ratio"), which repeat a title word while reading the
 * other way round for half the titles that name it.
 */
const RATIO = /\w-to-\w|\bratio\b/i;

/**
 * The metric a topic leads with, among `candidates` (numeric, non-bookkeeping metrics with
 * values, the first table's first): a hand-checked override, else the first candidate, unless
 * its label misses words of the title and another label repeats them all ("Cost of Living Index
 * by State" leads with "Cost of Living Index" rather than a housing sub-index). An "Overall"
 * label counts as one more word, so a title naming nothing a label repeats ("Cheapest States to
 * Live In", "Least Expensive States") leads with the overall index. Among full matches, changes between years give way
 * to levels (unless the title is about change), ratios never displace the first, and a value
 * column beats a rank column.
 */
export function pickHeadline<M extends Pick<Metric, 'id' | 'label' | 'fmt'>>(
  topic: Pick<TopicFile, 'type' | 'slug' | 'title'>,
  candidates: readonly M[],
  metricOf: (id: number) => M | undefined
): M | null {
  const override = headlineOverride(topic)?.metric;
  if (override != null) {
    const m = metricOf(override);
    if (m != null) return m;
  }
  const first = candidates[0];
  if (first == null) return null;
  const need = new Set(contentWords(topic.title)).size;
  const overall = (m: M) => /\boverall\b/i.test(m.label);
  const full = (m: M) =>
    labelMatch(topic.title, m.label) + (overall(m) ? 1 : 0) >= need;
  // A title naming nothing a label repeats ("Least Expensive States") leads with an overall
  // index (not an overall rank) when there is one, like its twin "Cheapest States to Live In".
  if (need === 0)
    return candidates.find((m) => overall(m) && !isRankColumn(m)) ?? first;
  if (full(first)) return first;
  let pool = candidates.filter((m) => full(m) && !RATIO.test(m.label));
  const narrow = (keep: (m: M) => boolean) => {
    if (pool.some(keep)) pool = pool.filter(keep);
  };
  if (!CHANGE_TITLE.test(topic.title)) narrow((m) => !CHANGE.test(m.label));
  narrow((m) => !isRankColumn(m));
  return pool[0] ?? first;
}

/**
 * The year a topic page opens a metric on (null for its undated series): the metric's default
 * year when the topic has it, else the undated series, else the latest year. Same rule as the
 * page's own year picker (resolveYear), so the build-time text describes the view it opens on.
 * A headline metric the topic does not carry reads at its own default year.
 */
export function openingYear(
  topic: TopicFile,
  metric: Pick<Metric, 'id' | 'year'>
): number | null {
  if (topic.series[String(metric.id)] == null) return metric.year;
  return resolveYear(
    seriesYears(topic, metric.id),
    undefined,
    metric.year,
    hasUndated(topic, metric.id)
  );
}

/** Numeric values a topic holds for a metric in the year the page opens it on. */
function valuesOnOpen(topic: TopicFile, metric: Metric): number {
  const year = openingYear(topic, metric);
  const series = topic.series[String(metric.id)] ?? {};
  const pick = (year == null ? undefined : series[String(year)]) ?? series._;
  return pick == null ? 0 : pick[1].filter((v) => typeof v === 'number').length;
}

/**
 * The metric a topic leads with: the numeric metric whose label best matches the title (see
 * `pickHeadline`), among the page's focusable metrics with at least two values, the first
 * table's first and then in the topic's own order; a hand-checked `HEADLINES` entry may name
 * one the topic does not carry. Null for a topic with nothing to rank, which gets a categorical
 * summary instead.
 */
export function leadMetric(
  topic: TopicFile,
  ds: Pick<Dataset, 'metric'>
): Metric | null {
  const tables = displayTables(topic, (id) => ds.metric(id) != null);
  const focusable = new Set(focusableMetrics(tables, (id) => ds.metric(id)));
  const candidates = [
    ...new Set([...(topic.tables[0]?.metrics ?? []), ...topic.metrics]),
  ]
    .map((id) => ds.metric(id))
    .filter(
      (m): m is Metric =>
        m != null && focusable.has(m) && valuesOnOpen(topic, m) >= 2
    );
  const picked = pickHeadline(topic, candidates, (id) => ds.metric(id));
  // An override naming a text column (one name per place) means there is nothing to rank.
  return picked?.kind === 'num' ? picked : null;
}
