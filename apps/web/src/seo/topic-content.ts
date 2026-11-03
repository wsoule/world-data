// The answer-first summary and quick answers of a topic page for whichever
// metric and year the visitor is looking at. This is the only place the
// sentences are worded: topicSummary() in ./content.ts calls topicAnswers()
// for the lead metric at build time (head tags and FAQPage JSON-LD), the page
// shows that loader text for its default view and calls topicAnswers() itself
// after the visitor picks another metric or year.

import type { QA } from './content';
import type { Dataset } from '~/data/dataset';
import { rankOrder } from '~/data/rankOrder';
import type { Metric, TopicFile } from '~/data/types';
import { formatInt, formatValue, typeNoun } from '~/lib/format';
import { SITE } from '~/site';

/** Summary sentence and quick answers shown on a topic page. */
export interface TopicAnswers {
  summary: string;
  faq: QA[];
}

/**
 * A metric's numeric values at a year (null = the undated series) as
 * [entity index, value] pairs, in the topic file's order. Falls back to the
 * undated series like the page's charts do.
 */
function valuesAt(
  topic: TopicFile,
  metric: Metric,
  year: number | null
): [number, number][] {
  const series = topic.series[String(metric.id)] ?? {};
  const pick = (year == null ? undefined : series[String(year)]) ?? series._;
  if (pick == null) return [];
  const out: [number, number][] = [];
  pick[0].forEach((i, k) => {
    const v = pick[1][k];
    if (typeof v === 'number' && Number.isFinite(v)) out.push([i, v]);
  });
  return out;
}

/** Median of a non-empty list. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * Summary and quick answers for one metric of a topic at one year (null for
 * the undated series, which reads without a year): highest, lowest and median
 * value, then where the data comes from. Without a metric (or with fewer than
 * two values) the summary is a generic "compare N places" line and only the
 * source answer remains. "Highest" means the largest value, whatever the
 * metric's polarity. A rank column instead names who ranks first and last and
 * which end rank 1 is (the best place, or the worst on a worst-first list).
 */
export function topicAnswers(
  topic: TopicFile,
  ds: Dataset,
  metric: Metric | null,
  year: number | null
): TopicAnswers {
  const type = ds.type;
  const plural = typeNoun(type.label);
  const singular = typeNoun(type.singular);
  const rows = metric == null ? [] : valuesAt(topic, metric, year);
  rows.sort((a, b) => b[1] - a[1]);
  const name = (i: number): string => ds.entities[i]?.name ?? '';
  const fmt = (v: number): string => formatValue(metric ?? undefined, v);
  const yearNote = year == null ? '' : ` in ${year}`;
  const faq: QA[] = [];
  let summary = `${topic.title}: compare ${formatInt(topic.entities.length)} ${plural} on ${formatInt(topic.metrics.length)} ${topic.metrics.length === 1 ? 'metric' : 'metrics'}.`;

  const order = metric == null ? null : rankOrder(metric);
  if (metric != null && rows.length >= 2 && order != null) {
    // A rank column holds list positions: name who holds rank 1 and who comes last, and say
    // which end rank 1 is ("the highest rank" would be ambiguous, and a median position says
    // nothing).
    const asc = [...rows].reverse();
    const [first, second, third] = asc;
    const last = asc[asc.length - 1];
    const label = metric.label;
    const end = order === 'best-first' ? 'best' : 'worst';
    const follow =
      asc.length >= 3 && second != null && third != null
        ? `, followed by ${name(second[0])} (${fmt(second[1])}) and ${name(third[0])} (${fmt(third[1])})`
        : '';
    summary = `${name(first[0])} ranks ${fmt(first[1])} on ${label}${yearNote}${follow}; rank 1 is the ${end}. ${name(last[0])} ranks last (${fmt(last[1])}).`;
    faq.push(
      {
        question: `Which ${singular} ranks first on ${label}?`,
        answer: `${name(first[0])} ranks first on ${label}${yearNote}, at ${fmt(first[1])}${follow}. Rank 1 is the ${end} ${singular}.`,
      },
      {
        question: `Which ${singular} ranks last on ${label}?`,
        answer: `${name(last[0])} ranks last of the ${formatInt(rows.length)} ${plural} with data${yearNote}, at ${fmt(last[1])}.`,
      }
    );
  } else if (metric != null && rows.length >= 2) {
    const [top, second, third] = rows;
    const low = rows[rows.length - 1];
    const label = metric.label;
    const follow =
      rows.length >= 3 && second != null && third != null
        ? `, followed by ${name(second[0])} (${fmt(second[1])}) and ${name(third[0])} (${fmt(third[1])})`
        : '';
    summary = `${name(top[0])} has the highest ${label}${yearNote} (${fmt(top[1])})${follow}. ${name(low[0])} has the lowest (${fmt(low[1])}).`;
    faq.push(
      {
        question: `Which ${singular} has the highest ${label}?`,
        answer: `${name(top[0])} has the highest ${label}${yearNote}, at ${fmt(top[1])}${follow}.`,
      },
      {
        question: `Which ${singular} has the lowest ${label}?`,
        answer: `${name(low[0])} has the lowest ${label}${yearNote}, at ${fmt(low[1])}.`,
      },
      {
        question: `What is the median ${label} across ${plural}?`,
        answer: `The median is ${fmt(median(rows.map((r) => r[1])))} across the ${formatInt(rows.length)} ${plural} with data${yearNote}.`,
      }
    );
  }
  const sourceNames = topic.sources.map((s) => s.name).slice(0, 4);
  faq.push({
    question: `Where does this ${topic.title.toLowerCase()} data come from?`,
    answer: `${SITE.name} compiles it from ${SITE.sourceName}${sourceNames.length > 0 ? ` and the primary sources it cites: ${sourceNames.join('; ')}` : ''}.${topic.updated == null ? '' : ` Last updated ${topic.updated}.`}`,
  });
  return { summary, faq };
}
