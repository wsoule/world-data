// The answer-first summary and quick answers of a topic page for whichever
// metric and year the visitor is looking at. This is the only place the
// sentences are worded: topicSummary() in ./content.ts calls topicAnswers()
// for the lead metric at build time (head tags, Dataset and FAQPage JSON-LD),
// the page shows that loader text for its default view and calls
// topicAnswers() itself after the visitor picks another metric or year, and
// scripts/seo-files.ts quotes the summary in llms-full.txt.

import type { QA } from './content';
import type { Dataset } from '~/data/dataset';
import { isRankColumn, rankOrder } from '~/data/rankOrder';
import type { Metric, TopicFile } from '~/data/types';
import {
  byKeys,
  FULL_COVERAGE_SHARE,
  largestPlacesShare,
  SIZE_SAMPLE_SHARE,
} from '~/features/places/profileModel';
import {
  contentWords,
  type End,
  headlineOverride,
  isYearValued,
  labelMatch,
  leadMetric,
  openingYear,
  titleCue,
  topicEnd,
} from '~/features/topic/headline';
import {
  isChartableCategory,
  rawColumn,
  tableYear,
  type ValueCount,
  valueCounts,
} from '~/features/topic/model';
import { formatInt, formatValue, typeNoun } from '~/lib/format';
import { SITE } from '~/site';

export interface TopicAnswers {
  summary: string;
  faq: QA[];
}

/**
 * The answers plus `short`, the summary without runners-up or notes ("A has the highest X (v).
 * B has the lowest (w)."), which leaves the meta description room to name the topic, and `lead`,
 * its first sentence alone ("A has the highest X (v).") for a meta description where even the
 * short answer leaves no room.
 */
export interface TopicText extends TopicAnswers {
  short: string;
  lead: string;
  /**
   * Whether the lead answers what the title asks: it names the places at the end the title asks
   * for, or a statistic the title names, or lists the places a list title (or a column matching
   * it) covers. A question title is framed "Answered" only then (see topicPageTitle).
   */
  answered: boolean;
}

/** Places named in a sentence before the rest are counted ("A, B, C and 4 more"). */
const NAMED = 3;
/** Places sharing an end value that are still named one by one ("A, B, C and D tie"). */
const TIE_NAMES = 4;
/** Share of places with one value from which that value is called shared by many. */
const COMMON_SHARE = 1 / 3;
/** Places listed in a quick answer before "and N more". */
const LIST_NAMES = 20;
/** Lists with at most this many places name them all in the summary. */
const SHORT_LIST = 15;
/** Distinct values up to which a column is described value by value ("24 in 23 states, 12 in 25"). */
const FEW_VALUES = 3;
/** Categorical columns the summary of a list describes. */
const CATEGORY_SENTENCES = 2;

/**
 * A metric's numeric values at a year (null = the undated series) as [entity index, value]
 * pairs. Falls back to the undated series like the page's charts do. A headline metric the
 * topic does not carry (see `HEADLINES`) reads the dataset's default-year values.
 */
function valuesAt(
  topic: TopicFile,
  ds: Dataset,
  metric: Metric,
  year: number | null
): [number, number][] {
  const out: [number, number][] = [];
  const series = topic.series[String(metric.id)];
  if (series == null) {
    const col = ds.numeric(metric.id);
    for (let i = 0; i < col.length; i++)
      if (Number.isFinite(col[i])) out.push([i, col[i]]);
    return out;
  }
  const pick = (year == null ? undefined : series[String(year)]) ?? series._;
  if (pick == null) return out;
  pick[0].forEach((i, k) => {
    const v = pick[1][k];
    if (typeof v === 'number' && Number.isFinite(v)) out.push([i, v]);
  });
  return out;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** List separator: semicolons once a name has a comma of its own ("Kings County, NY"). */
const separator = (names: readonly string[]): string =>
  names.some((n) => n.includes(',')) ? '; ' : ', ';

/** "A", "A and B", "A, B and C" ("A, NY; B, CA and C, TX" for names with commas). */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(separator(names))} and ${names[names.length - 1]}`;
}

/** Up to `limit` names, then "and N more". */
export function someNames(names: readonly string[], limit: number): string {
  if (names.length <= limit) return joinNames(names);
  return `${names.slice(0, limit).join(separator(names))} and ${formatInt(names.length - limit)} more`;
}

/** Places that print the same value, consecutive in a sorted ranking. */
interface ValueGroup {
  /** The value as printed, which is what a tie means to a reader */
  text: string;
  value: number;
  /** Entity indexes, in ranking order */
  places: number[];
}

/**
 * Splits a sorted ranking into runs of places whose values print the same ("115.6" and
 * "115.63" rounded to one decimal tie), so a sentence never names one winner of a tie.
 */
export function valueGroups(
  sorted: readonly (readonly [number, number])[],
  format: (v: number) => string
): ValueGroup[] {
  const out: ValueGroup[] = [];
  for (const [i, v] of sorted) {
    const text = format(v);
    const prev = out[out.length - 1];
    if (prev != null && prev.text === text) prev.places.push(i);
    else out.push({ text, value: v, places: [i] });
  }
  return out;
}

/**
 * Whether a ranking covers only part of its place type, and whether that part was picked by
 * the metric itself (a top-N list such as "the richest cities") rather than by size, using the
 * test behind `selectedListMetrics`. A partial list's ends are the ends "of the N listed"; a
 * picked one also has no meaningful median.
 */
export function coverage(
  total: number,
  rows: readonly (readonly [number, number])[]
): { partial: boolean; picked: boolean } {
  const partial = rows.length < total * FULL_COVERAGE_SHARE;
  if (!partial) return { partial, picked: false };
  const col = new Float64Array(total).fill(NaN);
  for (const [i, v] of rows) if (i < total) col[i] = v;
  return { partial, picked: largestPlacesShare(col) < SIZE_SAMPLE_SHARE };
}

/** A summary before the source note: the answer text without the `answered` judgement. */
type Body = Omit<TopicText, 'answered'>;

/** Shared wording inputs of one topic, place type and metric. */
interface Ctx {
  topic: TopicFile;
  ds: Dataset;
  lead: Metric | null;
  plural: string;
  singular: string;
  name: (i: number) => string;
  yearNote: string;
}

/** The names of a group's places, in ranking order. */
const namesOf = (ctx: Ctx, g: ValueGroup): string[] => g.places.map(ctx.name);

/** True when a group is too large to name its places one by one. */
const isMany = (g: ValueGroup, n: number): boolean =>
  g.places.length > TIE_NAMES || g.places.length > n * COMMON_SHARE;

/**
 * ", followed by B (v) and C (v)": the groups after the first, whole, while the sentence names
 * at most `NAMED` places, never reaching into the other end's group (`stop`).
 */
function followers(
  ctx: Ctx,
  groups: readonly ValueGroup[],
  stop: number,
  word: string
): string {
  let named = groups[0].places.length;
  const parts: string[] = [];
  for (let k = 1; k < stop; k++) {
    const g = groups[k];
    if (named + g.places.length > NAMED) break;
    named += g.places.length;
    parts.push(`${joinNames(namesOf(ctx, g))} (${g.text})`);
  }
  return parts.length === 0 ? '' : `, ${word} ${joinNames(parts)}`;
}

/**
 * Summary and quick answers for a numeric value column, read from the end the title asks for
 * (`topicEnd`; the highest when the title names none). Ties are written as ties, many-way
 * ties as a count and the range of the rest, a column of a few values value by value, and a
 * partial list only speaks for the places it lists.
 */
function valueAnswers(
  ctx: Ctx,
  metric: Metric,
  rows: [number, number][]
): Body {
  const { topic, ds, plural, singular, yearNote } = ctx;
  const values = rows.map((r) => r[1]);
  const yearValued = isYearValued(metric, values);
  const shown = yearValued ? { ...metric, fmt: 'year' } : metric;
  const fmt = (v: number): string => formatValue(shown, v);
  const end: End = topicEnd(topic, metric, ctx.lead, yearValued) ?? 'high';
  const word = (e: End): string =>
    yearValued
      ? e === 'high'
        ? 'latest'
        : 'earliest'
      : e === 'high'
        ? 'highest'
        : 'lowest';
  const leadWord = word(end);
  const otherWord = word(end === 'high' ? 'low' : 'high');
  const sorted = [...rows].sort((a, b) =>
    end === 'high' ? b[1] - a[1] : a[1] - b[1]
  );
  const groups = valueGroups(sorted, fmt);
  const n = sorted.length;
  const total = ds.entities.length;
  const { partial, picked } = coverage(total, sorted);
  const ofAll = `of the ${formatInt(n)} ${plural} ${partial ? 'listed' : 'with data'}`;
  const scope = partial ? ` of the ${formatInt(n)} ${plural} listed` : '';
  const label = metric.label;
  const first = groups[0];
  const last = groups[groups.length - 1];

  if (groups.length === 1) {
    const text = `All ${formatInt(n)} ${plural} ${partial ? 'listed' : 'with data'} have the same ${label}${yearNote}: ${first.text}.`;
    return {
      summary: text,
      short: text,
      lead: text,
      faq: [
        { question: `What is the ${label} across ${plural}?`, answer: text },
      ],
    };
  }

  // One end's places as the answer to "which has the highest …": a name, a tie or a count.
  const endAnswer = (g: ValueGroup, w: string): string => {
    const names = namesOf(ctx, g);
    const k = names.length;
    if (k === 1)
      return `${names[0]} has the ${w} ${label}${scope}${yearNote}, at ${g.text}`;
    if (!isMany(g, n))
      return `${joinNames(names)} tie for the ${w} ${label}${scope}${yearNote}, at ${g.text}`;
    return `${formatInt(k)} ${ofAll} share the ${w} ${label}${yearNote}, at ${g.text}: ${someNames(names, LIST_NAMES)}`;
  };
  const endQuestion = (g: ValueGroup, w: string): string =>
    `Which ${g.places.length === 1 ? `${singular} has` : `${plural} have`} the ${w} ${label}?`;
  // The far end of a partial list is only last of those listed.
  const lastQA = (): QA => {
    const names = namesOf(ctx, last);
    const k = names.length;
    if (!partial)
      return {
        question: endQuestion(last, otherWord),
        answer: `${endAnswer(last, otherWord)}.`,
      };
    return {
      question: `Which ${k === 1 ? `${singular} ranks` : `${plural} rank`} last on ${label} of those listed?`,
      answer: `${k === 1 ? `${names[0]} ranks` : `${someNames(names, LIST_NAMES)} tie for`} last of the ${formatInt(n)} ${plural} listed${yearNote}, at ${last.text}. The list covers ${formatInt(n)} of ${formatInt(total)} ${plural}.`,
    };
  };

  // A column of a few values reads value by value: "… is 24 in 23 of the 48 US states with
  // data and 12 in the other 25."
  if (groups.length <= FEW_VALUES && n >= 6) {
    const nameLimit = n <= SHORT_LIST ? 5 : NAMED;
    const parts = groups.map((g, k) => {
      const count = formatInt(g.places.length);
      const names =
        g.places.length <= nameLimit ? ` (${joinNames(namesOf(ctx, g))})` : '';
      if (k === 0) return `${g.text} in ${count} ${ofAll}${names}`;
      const other = groups.length === 2 ? 'the other ' : '';
      return `${g.text} in ${other}${count}${names}`;
    });
    const text = `${label}${yearNote} is ${joinNames(parts)}.`;
    return {
      summary: text,
      short: text,
      lead: text,
      faq: [
        {
          question: endQuestion(first, leadWord),
          answer: `${endAnswer(first, leadWord)}.`,
        },
        lastQA(),
      ],
    };
  }

  const many = isMany(first, n);
  const follow = many
    ? ''
    : followers(ctx, groups, groups.length - 1, 'followed by');
  // The lead sentence, and the same without its runners-up for the short answer.
  let leadText: string;
  let leadShort: string;
  if (!many) {
    const clause =
      first.places.length === 1
        ? `${namesOf(ctx, first)[0]} has the ${leadWord} ${label}${scope}${yearNote} (${first.text})`
        : `${joinNames(namesOf(ctx, first))} tie for the ${leadWord} ${label}${scope}${yearNote} (${first.text})`;
    leadText = `${clause}${follow}.`;
    leadShort = `${clause}.`;
  } else {
    // A shared end value is the story: say how many share it and how far the rest reach.
    const lastNames =
      last.places.length <= NAMED
        ? joinNames(namesOf(ctx, last))
        : `${formatInt(last.places.length)} ${plural}`;
    leadText = `${formatInt(first.places.length)} ${ofAll} share the ${leadWord} ${label}${yearNote} (${first.text}); the rest range ${end === 'high' ? 'down' : 'up'} to ${last.text} (${lastNames}).`;
    leadShort = leadText;
  }

  let otherText = '';
  if (!many) {
    const k = last.places.length;
    const names = namesOf(ctx, last);
    if (partial)
      otherText =
        k === 1
          ? `${names[0]} ranks last of the ${formatInt(n)} listed (${last.text}).`
          : !isMany(last, n)
            ? `${joinNames(names)} tie for last of the ${formatInt(n)} listed (${last.text}).`
            : `${formatInt(k)} tie for last of the ${formatInt(n)} listed (${last.text}).`;
    else
      otherText =
        k === 1
          ? `${names[0]} has the ${otherWord} (${last.text}).`
          : !isMany(last, n)
            ? `${joinNames(names)} tie for the ${otherWord} (${last.text}).`
            : `${formatInt(k)} ${plural} share the ${otherWord} (${last.text}).`;
  }

  // A value many places share that is neither end is worth a sentence of its own.
  let common: ValueGroup | null = null;
  for (const g of groups.slice(1, -1))
    if (
      g.places.length > n * COMMON_SHARE &&
      (common == null || g.places.length > common.places.length)
    )
      common = g;
  const commonText =
    common == null
      ? ''
      : ` ${formatInt(common.places.length)} of the ${formatInt(n)} share ${common.text}, the most common value.`;

  const faq: QA[] = [
    {
      question: endQuestion(first, leadWord),
      answer: `${endAnswer(first, leadWord)}${follow}.`,
    },
    lastQA(),
  ];
  if (!picked && n >= 3)
    faq.push({
      // "the median Median Household Income" would stutter.
      question: /^median\b/i.test(label)
        ? `What is ${label} for the median ${singular}?`
        : `What is the median ${label} across ${plural}?`,
      answer: `The median is ${fmt(median(values))} across the ${formatInt(n)} ${plural} ${partial ? 'listed' : 'with data'}${yearNote}.`,
    });
  const other = otherText === '' ? '' : ` ${otherText}`;
  return {
    summary: `${leadText}${other}${commonText}`,
    short: `${leadShort}${other}`,
    lead: leadShort,
    faq,
  };
}

/**
 * Which end rank 1 of a rank column is, as a clause ("rank 1 is the best") and as a quick-answer
 * sentence ("Rank 1 is the best US state."). Polarity says best or worst; a rank without a
 * better side (pol 0, such as a population density or a northernmost-point rank) holds the most
 * of what it ranks ("rank 1 has the highest Population Density"), and says nothing when its
 * label names nothing but the rank. It never falls back to "best".
 */
export function rankEndNote(
  metric: Pick<Metric, 'fmt' | 'pol' | 'label'>,
  singular: string
): { clause: string; sentence: string } | null {
  if (metric.pol !== 0) {
    const end = rankOrder(metric) === 'worst-first' ? 'worst' : 'best';
    return {
      clause: `rank 1 is the ${end}`,
      sentence: `Rank 1 is the ${end} ${singular}.`,
    };
  }
  const core = metric.label
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(rank|ranks|ranking|rankings|ranked|position)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[a-z]/i.test(core)) return null;
  return {
    clause: `rank 1 has the highest ${core}`,
    sentence: `Rank 1 has the highest ${core}.`,
  };
}

/**
 * Summary and quick answers for a rank column: who holds rank 1 and who comes last, and which
 * end rank 1 is (`rankEndNote`: the best place, the worst on a worst-first list, or the most of
 * what a neutral rank ranks). A title asking for the other end ("Least Educated States" over a
 * best-first education rank) leads with the last places instead. Positions have no meaningful
 * median, and a partial list's last place is only last of those listed.
 */
function rankAnswers(ctx: Ctx, metric: Metric, rows: [number, number][]): Body {
  const { topic, ds, plural, singular, yearNote } = ctx;
  const fmt = (v: number): string => formatValue(metric, v);
  const note = rankEndNote(metric, singular);
  const clause = note == null ? '' : `; ${note.clause}`;
  const sentence = note == null ? '' : ` ${note.sentence}`;
  const fromLast = topicEnd(topic, metric, ctx.lead) === 'high';
  const asc = [...rows].sort((a, b) => a[1] - b[1]);
  const groups = valueGroups(asc, fmt);
  const first = groups[0];
  const last = groups[groups.length - 1];
  const label = metric.label;
  const n = asc.length;
  const { partial } = coverage(ds.entities.length, asc);
  const listed = partial ? 'listed' : 'with data';
  const lastOf = partial ? ` of the ${formatInt(n)} listed` : '';
  // "A ranks", "A and B share", or "6 US states share" when too many share a position.
  const holds = (g: ValueGroup, one: string, several: string): string => {
    const names = namesOf(ctx, g);
    return names.length === 1
      ? `${names[0]} ${one}`
      : names.length <= TIE_NAMES
        ? `${joinNames(names)} ${several}`
        : `${formatInt(names.length)} ${plural} ${several}`;
  };
  // Rank 1 may be missing from the places listed ("ranks 3rd …, the first of those listed").
  const topNote =
    first.value === 1
      ? ''
      : `, the first of the ${formatInt(n)} ${plural} listed`;

  if (fromLast && groups.length > 1) {
    const desc = [...groups].reverse();
    const behind = followers(ctx, desc, desc.length - 1, 'behind');
    const lastClause = `${holds(last, 'ranks', 'share')} last on ${label}${lastOf}${yearNote} (${last.text})`;
    const lastText = `${lastClause}${behind}`;
    const firstText = `${holds(first, 'ranks', 'share')} ${first.text}${topNote}.`;
    return {
      summary: `${lastText}${clause}. ${firstText}`,
      short: `${lastClause}${clause}. ${firstText}`,
      lead: `${lastClause}${clause}.`,
      faq: [
        {
          question: `Which ${singular} ranks last on ${label}?`,
          answer: `${lastText}, of the ${formatInt(n)} ${plural} ${listed}.${sentence}`,
        },
        {
          question: `Which ${singular} ranks first on ${label}?`,
          answer: `${holds(first, 'ranks', 'share')} ${first.value === 1 ? 'first' : first.text} on ${label}${yearNote}${topNote}, at ${first.text}.`,
        },
      ],
    };
  }

  const follow = followers(ctx, groups, groups.length - 1, 'followed by');
  const firstClause = `${holds(first, 'ranks', 'share')} ${first.text} on ${label}${yearNote}${topNote}`;
  const firstText = `${firstClause}${follow}`;
  const lastText =
    groups.length === 1
      ? ''
      : ` ${holds(last, 'ranks', 'share')} last${lastOf} (${last.text}).`;
  const faq: QA[] = [
    {
      question: `Which ${singular} ranks first on ${label}?`,
      answer: `${firstText}.${sentence}`,
    },
  ];
  if (groups.length > 1)
    faq.push({
      question: `Which ${singular} ranks last on ${label}?`,
      answer: `${holds(last, 'ranks', 'share')} last of the ${formatInt(n)} ${plural} ${listed}${yearNote}, at ${last.text}.`,
    });
  return {
    summary: `${firstText}${clause}.${lastText}`,
    short: `${firstClause}${clause}.${lastText}`,
    lead: `${firstClause}${clause}.`,
    faq,
  };
}

/** A categorical or text column of a topic with its value counts. */
interface CategoryColumn {
  metric: Metric;
  counts: ValueCount[];
  /** Each place's value, aligned to the dataset's entities (null = missing) */
  raw: (number | string | null)[];
  /** Places with a value */
  n: number;
}

/** Text values longer than this are notes, not names a sentence can quote. */
const SHORT_TEXT = 60;

/**
 * The topic's categorical and text columns with at least one value, in the order the summary
 * prefers them: a hand-checked headline column first (see `HEADLINES`), then labels that repeat
 * more of the title's words, then wider coverage, then table order.
 */
function categoryColumns(topic: TopicFile, ds: Dataset): CategoryColumn[] {
  const out: (CategoryColumn & { score: number; k: number })[] = [];
  const headline = headlineOverride(topic)?.metric;
  topic.metrics.forEach((id, k) => {
    const metric = ds.metric(id);
    if (metric == null || metric.kind === 'num' || metric.meta === true) return;
    const raw = rawColumn(
      topic,
      id,
      tableYear(topic, metric, undefined),
      ds.entities.length
    );
    const counts = valueCounts(raw);
    if (counts.length === 0) return;
    out.push({
      metric,
      counts,
      raw,
      n: raw.filter((v) => v != null).length,
      // A hand-picked headline column outranks any label match.
      score:
        id === headline
          ? Number.MAX_SAFE_INTEGER
          : labelMatch(topic.title, metric.label),
      k,
    });
  });
  return out.sort((a, b) => byKeys(b.score - a.score, b.n - a.n, a.k - b.k));
}

/**
 * "Nickname: The Golden State (California), The Lone Star State (Texas) …": a column that gives
 * each place its own short value (a nickname, a city, a person), quoted for the first places
 * in population order. Null when most values are shared or too long to quote.
 */
function perPlaceSentence(
  ctx: Ctx,
  col: CategoryColumn,
  places: readonly number[]
): { summary: string; faq: QA } | null {
  const pairs: [string, string][] = [];
  for (const i of places) {
    const v = col.raw[i];
    if (v == null) continue;
    const text = formatValue(col.metric, v);
    if (text.length > SHORT_TEXT) return null;
    pairs.push([ctx.name(i), text]);
  }
  // A hand-picked headline column ("City Name" on Safest Cities by State) reads by the title,
  // and may repeat values (the same job tops the pay list of eight states).
  const picked = headlineOverride(ctx.topic)?.metric === col.metric.id;
  if (pairs.length < 2 || (!picked && col.counts.length < pairs.length / 2))
    return null;
  const quote = (list: readonly [string, string][]) =>
    list.map(([place, v]) => `${v} (${place})`);
  const head = quote(pairs.slice(0, NAMED));
  const rest = pairs.length - head.length;
  const lead = picked ? ctx.topic.title : col.metric.label;
  const summary = `${lead}: ${rest > 0 ? `${head.join('; ')} and ${formatInt(rest)} more` : joinNames(head)}.`;
  const shown = pairs.slice(0, LIST_NAMES);
  return {
    summary,
    faq: {
      question: `What is each ${ctx.singular}’s ${col.metric.label}?`,
      answer: `${shown.map(([place, v]) => `${place}: ${v}`).join('; ')}${pairs.length > shown.length ? `; and ${formatInt(pairs.length - shown.length)} more` : ''}.`,
    },
  };
}

/**
 * "Abortion Legal Status: “Legal” in 30 of 51 US states, “Illegal” in 14 …": the `limit` most
 * common values of a categorical column, naming the places of each small group (up to
 * `nameLimit`).
 */
function categorySentence(
  col: CategoryColumn,
  plural: string,
  name: (i: number) => string,
  nameLimit: number,
  limit: number,
  /** Values to put first and name the places of, however many ("“Lower” in 26 (A, B, C and 23 more)") */
  first: readonly ValueCount[] = []
): string {
  const lead = new Set(first);
  const shown = [
    ...first,
    ...col.counts
      .filter((c) => !lead.has(c))
      .slice(0, Math.max(0, limit - first.length)),
  ];
  const parts = shown.map((c, k) => {
    const places = lead.has(c)
      ? ` (${someNames(c.indexes.map(name), NAMED)})`
      : c.count <= nameLimit
        ? ` (${joinNames(c.indexes.map(name))})`
        : '';
    return `“${c.value}” in ${formatInt(c.count)}${k === 0 ? ` of ${formatInt(col.n)} ${plural}` : ''}${places}`;
  });
  const rest = col.counts.length - shown.length;
  if (rest === 0) return `${col.metric.label}: ${joinNames(parts)}.`;
  const sep = parts.some((p) => p.includes(',')) ? '; ' : ', ';
  return `${col.metric.label}: ${parts.join(sep)}${sep}and ${formatInt(rest)} other ${rest === 1 ? 'value' : 'values'}.`;
}

/** Values that only mark a place as on a list. */
const YES = /^(yes|true)$/i;
/** Values that mark a place as off a list. */
const NO = /^(no|false)$/i;
/** Titles that ask for the places a list leaves out ("Countries Without KFC"). */
const NEGATED_TITLE =
  /\b(without|not|no|non|cannot|can'?t|don'?t|doesn'?t|never|lack)\b/i;
/** Plural place words a list title can end with ("G20 Countries", "Cotton Belt States"). */
const PLACE_WORD = /^(.+?)\s+(countries|states|cities|counties)$/i;

/**
 * How a sentence says that places belong to a list title: "are G20 countries" or "are Cotton
 * Belt states" when the title is a kind of place, so "19 countries are G20 countries". Null for
 * any other title, and for one that names an end ("Most Visited Countries" are not each the most
 * visited) or asks a question.
 */
export function listPhrase(title: string): string | null {
  const m = PLACE_WORD.exec(title.trim());
  if (m == null || title.endsWith('?')) return null;
  const [, kind = '', word = ''] = m;
  if (titleCue(kind) != null || NEGATED_TITLE.test(kind)) return null;
  // Not a question, a name ending "United States" or a phrase ending in a preposition.
  if (/\b(which|what|how|where|who)\b|^(the|are|is|do|does)\b/i.test(kind))
    return null;
  if (/\b(united|in|of|for|by|with|to|from|on|at|and)$/i.test(kind))
    return null;
  return `are ${kind} ${word.toLowerCase()}`;
}

/**
 * "17 US states are Cotton Belt states: Texas, Georgia, …" or, for a title that names no kind
 * of place, "58 countries are on the Countries Without KFC list: …": a sentence listing `places`
 * as the members of the topic's list, naming up to `limit` of them.
 */
function memberSentence(
  ctx: Ctx,
  places: readonly number[],
  limit: number
): string {
  const { topic, plural, name } = ctx;
  const phrase = listPhrase(topic.title) ?? `are on the ${topic.title} list`;
  const names = places.map(name);
  return `${formatInt(places.length)} ${plural} ${phrase}: ${someNames(names, limit)}.`;
}

/**
 * What a topic's opening view leads with instead of its numeric lead (see `membership`): some
 * values of a categorical column, the "Yes" places of a membership column, or the topic's own
 * list of places.
 */
type Membership =
  | { kind: 'values'; col: CategoryColumn; values: ValueCount[] }
  | { kind: 'yes'; col: CategoryColumn; places: number[] }
  | { kind: 'list'; places: number[] };

/** Neutral "<subject> by <type>" titles, which ask about a statistic rather than members. */
const BY_TYPE = /\bby (country|state|city|county)\b/i;

/**
 * The values of a categorical column that a title names through a word its label does not
 * already repeat (“Trump” for "How Many States Did Trump Win in 2016?" over "2016 Winner",
 * “Lower” for "Low-Income Countries", “24 Hour Time” for "Which Countries Use 24 Hour Time?"),
 * the closest fits only ("Lower" over "Lower Middle" for "Low"). Bare Yes/No and "Member" values
 * name nothing, a negated value ("No legal protocol") counts only for a negated title and the
 * other way round ("Countries That Don't Allow Felons" is not answered by “Allows”), and a
 * "<subject> by <type>" title names a statistic rather than values ("Economic Freedom Index by
 * Country" is about the index, not the “Free” countries). Empty when no value, or every value,
 * matches.
 */
function namedValues(
  title: string,
  col: CategoryColumn,
  /** Also take a value the label repeats, if the title names all of it ("Slave" of "Slave/Free") */
  exact = false
): ValueCount[] {
  if (BY_TYPE.test(title)) return [];
  const labelScore = labelMatch(title, col.metric.label);
  let fit = -Infinity;
  let hits: ValueCount[] = [];
  for (const c of col.counts) {
    if (YES.test(c.value) || NO.test(c.value) || /^members?$/i.test(c.value))
      continue;
    if (NEGATED_TITLE.test(c.value) !== NEGATED_TITLE.test(title)) continue;
    const named = labelMatch(title, c.value);
    const extra = new Set(contentWords(c.value)).size - named;
    const adds =
      labelMatch(title, `${col.metric.label} ${c.value}`) > labelScore;
    if (named === 0 || !(adds || (exact && extra === 0))) continue;
    const f = named - extra;
    if (f > fit) {
      fit = f;
      hits = [c];
    } else if (f === fit) hits.push(c);
  }
  return hits.length < col.counts.length ? hits : [];
}

/**
 * What answers a topic's title when its numeric lead does not, or null to lead with the number:
 * - A categorical column with values the title names, through a word its label does not already
 *   repeat: "How Many States Did Trump Win in 2016?" over "2016 Winner" (“Trump”), "Low-Income
 *   Countries" over the World Bank's income group (“Lower”, a closer fit than “Lower Middle”),
 *   "Which Countries Have Authoritarian Governments?" over "Type of Government". Not for a
 *   "<subject> by <type>" title, whose subject words name the statistic ("Economic Freedom Index
 *   by Country" is about the index, not the “Free” countries).
 * - A Yes/No column whose label repeats every word of the title, on a topic listing most places
 *   of its type: "G20 Member" on G20 Countries, "Global North Nations" on Global North
 *   Countries. A topic that lists only its members ("British Commonwealth Countries") is
 *   answered by that list instead, and a title asking for the places off a list ("Countries
 *   Where Women Cannot Vote") never reads a Yes column as its answer.
 * - The topic's own places, for a list title naming a kind of place (`listPhrase`) over a
 *   partial list ("Chinese Speaking Countries", 25 countries ranked by "Distribution").
 * A column must repeat more of the title's words (a named value counting as one) than the
 * numeric lead's label does, so "GDP Growth" never outranks a G20 membership column, and the
 * list leads only when the lead's label repeats none of them.
 */
function membership(ctx: Ctx): Membership | null {
  const { topic, ds, lead } = ctx;
  const title = topic.title;
  const leadScore = lead == null ? 0 : labelMatch(title, lead.label);
  const need = new Set(contentWords(title)).size;
  const places = topic.entities.filter((i) => ds.entities[i] != null);
  const curated = places.length < ds.entities.length * FULL_COVERAGE_SHARE;
  let best: (Membership & { score: number }) | null = null;
  for (const col of categoryColumns(topic, ds)) {
    if (col.metric.kind !== 'cat' || col.n < 2) continue;
    const labelScore = labelMatch(title, col.metric.label);
    let found: (Membership & { score: number }) | null = null;
    const hits = namedValues(title, col);
    if (hits.length > 0)
      found = { kind: 'values', col, values: hits, score: labelScore + 1 };
    if (found == null) {
      const yes = col.counts.filter((c) => YES.test(c.value));
      const yesNo = col.counts.every(
        (c) => YES.test(c.value) || NO.test(c.value)
      );
      if (
        yes.length === 1 &&
        yesNo &&
        labelScore > 0 &&
        labelScore >= need &&
        !curated &&
        !NEGATED_TITLE.test(title)
      )
        found = { kind: 'yes', col, places: yes[0].indexes, score: labelScore };
    }
    if (found == null || found.score <= leadScore) continue;
    if (best == null || found.score > best.score) best = found;
  }
  if (best != null) return best;
  if (
    curated &&
    leadScore === 0 &&
    places.length > 1 &&
    listPhrase(title) != null
  )
    return { kind: 'list', places };
  return null;
}

/** The summary and quick answers of a topic led by its membership (see `membership`). */
function membershipAnswers(ctx: Ctx, m: Membership): Body {
  const { plural, name, topic } = ctx;
  if (m.kind !== 'values') {
    const phrase = listPhrase(topic.title);
    const lead = memberSentence(ctx, m.places, NAMED);
    return {
      summary: memberSentence(ctx, m.places, LIST_NAMES),
      short: lead,
      lead,
      faq: [
        {
          question:
            phrase == null
              ? `Which ${plural} are on the ${topic.title} list?`
              : `Which ${plural} ${phrase}?`,
          answer: `${someNames(m.places.map(name), LIST_NAMES)} (${formatInt(m.places.length)} in all${m.kind === 'yes' ? `, by ${m.col.metric.label}` : ''}).`,
        },
      ],
    };
  }
  const label = m.col.metric.label;
  const text = categorySentence(m.col, plural, name, NAMED, 4, m.values);
  // The named values alone, for a meta description with little room.
  const parts = m.values.map(
    (v, k) =>
      `“${v.value}” in ${formatInt(v.count)}${k === 0 ? ` of ${formatInt(m.col.n)} ${plural}` : ''} (${someNames(v.indexes.map(name), NAMED)})`
  );
  return {
    summary: text,
    short: text,
    lead: `${label}: ${joinNames(parts)}.`,
    faq: m.values.map((v) => ({
      question: `In which ${plural} is ${label} “${v.value}”?`,
      answer: `${formatInt(v.count)} of the ${formatInt(m.col.n)} ${plural}: ${someNames(v.indexes.map(name), LIST_NAMES)}.`,
    })),
  };
}

/**
 * What a one-place topic ("Is Turkey a Muslim Country?") says about its place: each
 * categorical and numeric value with its label, skipping long notes.
 */
function singlePlaceSentence(ctx: Ctx, index: number): string | null {
  const { topic, ds } = ctx;
  const parts: string[] = [];
  for (const id of topic.metrics) {
    const metric = ds.metric(id);
    if (metric == null || metric.meta === true || metric.kind === 'text')
      continue;
    const raw = rawColumn(
      topic,
      id,
      tableYear(topic, metric, undefined),
      ds.entities.length
    )[index];
    if (raw == null) continue;
    const shown = isYearValued(metric, [Number(raw)])
      ? { ...metric, fmt: 'year' }
      : metric;
    parts.push(
      typeof raw === 'number'
        ? `${metric.label} ${formatValue(shown, raw)}`
        : `${metric.label} “${formatValue(metric, raw)}”`
    );
    if (parts.length === 6) break;
  }
  return parts.length === 0 ? null : `${ctx.name(index)}: ${parts.join('; ')}.`;
}

/**
 * Summary and quick answers for a topic without a numeric metric to rank (a list such as "14
 * Eyes Countries", or a law by state): a one-place topic states that place's values, a short
 * list names its places, and the categorical columns whose labels best match the title are
 * broken down by value, with quick answers listing the places of each common value.
 */
function categoricalAnswers(ctx: Ctx): TopicText {
  const { topic, ds, plural, name } = ctx;
  const places = topic.entities.filter((i) => ds.entities[i] != null);
  const n = places.length;
  const question = topic.title.endsWith('?');
  const sentences: string[] = [];
  const faq: QA[] = [];
  // A shorter first sentence for a meta description with little room, when there is one.
  let brief: string | null = null;
  if (n === 1) {
    const text =
      singlePlaceSentence(ctx, places[0]) ??
      `${name(places[0])} is the only ${ctx.singular} listed.`;
    sentences.push(text);
    faq.push({
      question: question
        ? topic.title
        : `Which ${ctx.singular} is on the ${topic.title} list?`,
      answer: text,
    });
  } else if (n > 1 && n <= SHORT_LIST) {
    const all = joinNames(places.map(name));
    sentences.push(
      question
        ? `This list covers ${formatInt(n)} ${plural}: ${all}.`
        : memberSentence(ctx, places, SHORT_LIST)
    );
    brief = question
      ? `This list covers ${formatInt(n)} ${plural}: ${someNames(places.map(name), NAMED)}.`
      : memberSentence(ctx, places, NAMED);
    faq.push({
      question: question
        ? topic.title
        : `Which ${plural} are on the ${topic.title} list?`,
      answer: `${all} (${formatInt(n)} in all).`,
    });
  }
  const cols = n === 1 ? [] : categoryColumns(topic, ds);
  const headline = headlineOverride(topic)?.metric;
  // Columns worth a breakdown by value: a few values, some shared ("Legal" in 30 states).
  const varied = cols.filter(
    (c) =>
      c.metric.kind === 'cat' &&
      c.metric.id !== headline &&
      c.counts.length >= 2 &&
      isChartableCategory(c.counts)
  );
  const nameLimit = n <= SHORT_LIST ? 5 : NAMED;
  // The best-matching column in full, a second one more briefly; values the title names come
  // first, with their places ("Timescale: “24 Hour Time” in 222 of 234 countries (…)").
  const named =
    varied.length > 0 ? namedValues(topic.title, varied[0], true) : [];
  varied
    .slice(0, CATEGORY_SENTENCES)
    .forEach((c, k) =>
      sentences.push(
        categorySentence(
          c,
          plural,
          name,
          nameLimit,
          k === 0 ? 5 : 3,
          k === 0 ? named : []
        )
      )
    );
  if (varied.length > 0 && n > SHORT_LIST)
    brief = categorySentence(
      varied[0],
      plural,
      name,
      NAMED,
      Math.max(2, named.length),
      named
    );
  if (varied.length > 0) {
    const c = varied[0];
    for (const v of c.counts.slice(0, 3))
      faq.push({
        question: `In which ${plural} is ${c.metric.label} “${v.value}”?`,
        answer: `${formatInt(v.count)} of the ${formatInt(c.n)} ${plural}: ${someNames(v.indexes.map(name), LIST_NAMES)}.`,
      });
  }
  // A one-place topic and a short list name every place; otherwise the lead answers only when
  // it lists the members, a value they all share or a hand-picked per-place column. A breakdown
  // of a column ("“See Yugoslavia” in 5 of 19") names no answer to "Which Countries …?".
  let answered = (n >= 1 && n <= SHORT_LIST) || named.length > 0;
  if (varied.length === 0 && n > SHORT_LIST) {
    // No breakdown: quote each place's own value (a nickname, a city), or say that all share one.
    let quoted = false;
    for (const c of cols) {
      const text = perPlaceSentence(ctx, c, places);
      if (text == null) continue;
      sentences.push(text.summary);
      faq.push(text.faq);
      quoted = true;
      answered = c.metric.id === headline;
      break;
    }
    // A column every listed place shares ("Modern: Yes" on Cotton Belt States) says only that
    // they are on the list: name them as its members, with the shared value unless it is "Yes".
    const single = cols.find(
      (c) => c.metric.kind === 'cat' && c.counts.length === 1
    );
    if (!quoted && single != null) {
      const shared = single.counts[0];
      if (shared.count === n && YES.test(shared.value) && !question)
        sentences.push(memberSentence(ctx, places, NAMED));
      else if (shared.count === n)
        // The shared value is the answer ("LSD Legality: “Illegal” in all 51 US states").
        sentences.push(
          `${single.metric.label}: “${shared.value}” in all ${formatInt(n)} ${plural} listed (${someNames(places.map(name), NAMED)}).`
        );
      if (shared.count === n) answered = true;
      else
        sentences.push(
          `${formatInt(shared.count)} of the ${formatInt(n)} ${plural} listed have ${single.metric.label} “${shared.value}”: ${someNames(shared.indexes.map(name), NAMED)}.`
        );
    }
  }
  if (n > SHORT_LIST) {
    if (sentences.length === 0)
      sentences.push(
        `This list covers ${formatInt(n)} ${plural}, including ${someNames(places.map(name), NAMED)}.`
      );
    faq.push({
      question: question
        ? topic.title
        : `Which ${plural} are on the ${topic.title} list?`,
      answer: `${someNames(places.map(name), LIST_NAMES)} (${formatInt(n)} in all).`,
    });
  }
  const first = sentences[0] ?? '';
  return {
    summary: sentences.join(' '),
    short: first,
    lead: brief != null && brief.length < first.length ? brief : first,
    faq,
    answered,
  };
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "2026-11-03" → "Nov 3, 2026", spelled out by hand so the server and every browser agree. */
export function formatDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m == null) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month == null ? iso : `${month} ${Number(m[3])}, ${m[1]}`;
}

/** "Name - Agency" → "Name (Agency)", the form a sentence reads best. */
export function sourceTitle(name: string): string {
  const k = name.lastIndexOf(' - ');
  return k < 0 ? name : `${name.slice(0, k)} (${name.slice(k + 3)})`;
}

/**
 * Who made a topic's table, in one sentence: for a topic Rankodex built from a primary source
 * (it has no original page), "Rankodex built this from <dataset> (<agency>), fetched <date>";
 * otherwise the ranking site it mirrors and the sources that page cites.
 */
export function sourceAnswer(
  topic: Pick<TopicFile, 'url' | 'sources' | 'updated'>
): string {
  const names = topic.sources.map((s) => s.name).filter((s) => s !== '');
  if (topic.url == null) {
    const from =
      names.length > 0 ? joinNames(names.map(sourceTitle)) : 'primary sources';
    return `${SITE.name} built this from ${from}${topic.updated == null ? '' : `, fetched ${formatDay(topic.updated)}`}.`;
  }
  const cited = names.slice(0, 4);
  return `${SITE.name} compiles it from ${SITE.sourceName}${cited.length > 0 ? ` and the primary sources it cites: ${cited.join('; ')}` : ''}.${topic.updated == null ? '' : ` Last updated ${formatDay(topic.updated)}.`}`;
}

/**
 * Summary and quick answers for one metric of a topic at one year (null for the undated
 * series, which reads without a year), then where the data comes from. A value column names
 * the places at the end the title asks for (lowest first on "Coldest Countries"), the other
 * end and the median (see `valueAnswers`); a rank column names who ranks first and last and
 * which end rank 1 is (`rankAnswers`). Without a numeric metric with two values, the summary
 * describes the list and its categorical columns (`categoricalAnswers`).
 */
export function topicAnswers(
  topic: TopicFile,
  ds: Dataset,
  metric: Metric | null,
  year: number | null
): TopicText {
  const ctx: Ctx = {
    topic,
    ds,
    lead: leadMetric(topic, ds),
    plural: typeNoun(ds.type.label),
    singular: typeNoun(ds.type.singular),
    name: (i) => ds.entities[i]?.name ?? '',
    yearNote: year == null ? '' : ` in ${year}`,
  };
  const rows = metric == null ? [] : valuesAt(topic, ds, metric, year);
  let body: TopicText;
  if (metric != null && rows.length >= 2) {
    const ranked = isRankColumn(metric)
      ? rankAnswers(ctx, metric, rows)
      : valueAnswers(ctx, metric, rows);
    // The page's opening view leads with a categorical column that answers the title better
    // than its numeric lead (see `membership`), and keeps the number's answer after it.
    const opening =
      metric.id === ctx.lead?.id && year === openingYear(topic, metric);
    const member = opening ? membership(ctx) : null;
    if (member != null) {
      const m = membershipAnswers(ctx, member);
      body = {
        summary: `${m.summary} ${ranked.lead}`,
        short: m.short,
        lead: m.lead,
        faq: [...m.faq, ...ranked.faq],
        answered: true,
      };
    } else {
      // A number answers the title when the title names its end or the statistic itself, and
      // does not ask for a count ("How Many States Did …?").
      const answered =
        !/^how many\b/i.test(topic.title) &&
        (topicEnd(topic, metric, ctx.lead) != null ||
          labelMatch(topic.title, metric.label) > 0);
      body = { ...ranked, answered };
    }
  } else body = categoricalAnswers({ ...ctx, yearNote: '' });
  const override = headlineOverride(topic);
  const note =
    override?.note != null && metric?.id === override.metric
      ? ` ${override.note}`
      : '';
  return {
    summary: `${body.summary}${note}`,
    short: body.short,
    lead: body.lead,
    answered: body.answered,
    faq: [
      ...body.faq,
      {
        question: topic.title.endsWith('?')
          ? 'Where does the data on this page come from?'
          : `Where does the ${topic.title} data come from?`,
        answer: `${sourceAnswer(topic)}${note}`,
      },
    ],
  };
}
