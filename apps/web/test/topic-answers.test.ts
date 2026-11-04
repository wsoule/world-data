import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Dataset } from '../src/data/dataset';
import type {
  Entity,
  EntityType,
  Manifest,
  Metric,
  TopicFile,
  TopicSummary,
  ValuesFile,
} from '../src/data/types';
import { leadMetric } from '../src/features/topic/headline';
import {
  displayTables,
  focusableMetrics,
  hasUndated,
  resolveYear,
  seriesYears,
} from '../src/features/topic/model';
import { ORGANIZATION_ID } from '../src/lib/seo';
import { datasetCredit, topicSummary } from '../src/seo/content';
import { topicAnswers } from '../src/seo/topic-content';

const DATA = join(import.meta.dir, '../public/data');
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(join(DATA, path), 'utf8')) as T;

const manifest = read<Manifest>('manifest.json');
const topicsIndex = read<TopicSummary[]>('topics.json');

function dataset(type: EntityType): Dataset {
  const info = manifest.types.find((t) => t.id === type);
  if (info == null) throw new Error(`no type ${type}`);
  return new Dataset(
    info,
    read<Entity[]>(`${type}/entities.json`),
    read<Metric[]>(`${type}/metrics.json`),
    read<ValuesFile>(`${type}/values.json`),
    topicsIndex
  );
}

/** The page's default focus metric and year, resolved the way TopicPage does. */
function pageDefault(topic: TopicFile, ds: Dataset) {
  const tables = displayTables(topic, (id) => ds.metric(id) != null);
  const focusables = focusableMetrics(tables, (id) => ds.metric(id));
  const id = leadMetric(topic, ds)?.id;
  const focus = focusables.find((m) => m.id === id) ?? focusables[0] ?? null;
  if (focus == null) return null;
  const year = resolveYear(
    seriesYears(topic, focus.id),
    undefined,
    focus.year,
    hasUndated(topic, focus.id)
  );
  return { focus, year };
}

describe('topicAnswers', () => {
  // The page shows the loader's topicSummary() text for its default view and
  // topicAnswers() for any other metric or year, so the two must agree
  // wherever the default view's year is the metric's own default.
  for (const type of manifest.types.map((t) => t.id)) {
    test(`matches topicSummary for the default view of every ${type} topic`, () => {
      const ds = dataset(type);
      let compared = 0;
      for (const file of readdirSync(join(DATA, type, 'topics'))) {
        if (!file.endsWith('.json')) continue;
        const topic = read<TopicFile>(`${type}/topics/${file}`);
        const def = pageDefault(topic, ds);
        if (def == null || def.year !== def.focus.year) continue;
        // A hand-picked headline the page cannot focus (a statistic from another topic, or a
        // text column) is described by the loader text alone.
        if (leadMetric(topic, ds)?.id !== def.focus.id) continue;
        const seo = topicSummary(topic, ds, manifest.categories);
        const answers = topicAnswers(topic, ds, def.focus, def.year);
        expect(answers.summary).toBe(seo.summary);
        expect(answers.faq).toEqual(seo.faq);
        compared++;
      }
      expect(compared).toBeGreaterThan(10);
    });
  }

  test('describes the focused metric and year', () => {
    const ds = dataset('country');
    const topic = read<TopicFile>(
      'country/topics/gdp-per-capita-by-country.json'
    );
    const un = ds.metric(19182);
    if (un == null) throw new Error('missing metric 19182');
    const { summary, faq } = topicAnswers(topic, ds, un, 2022);
    expect(summary).toStartWith(
      'Monaco has the highest GDP per Capita - UN in 2022'
    );
    expect(faq[0].question).toBe(
      'Which country has the highest GDP per Capita - UN?'
    );
    expect(faq[2].answer).toContain('in 2022');
  });

  test('names who ranks first on a rank column and which end that is', () => {
    const ds = dataset('state');
    const worst = read<TopicFile>('state/topics/worst-states-to-live-in.json');
    const overall = ds.metric(23998);
    if (overall == null) throw new Error('missing metric 23998');
    const w = topicAnswers(worst, ds, overall, 2025);
    expect(w.summary).toStartWith(
      'Louisiana ranks 1st on Overall Worst States Rank (US News) in 2025'
    );
    expect(w.summary).toContain('rank 1 is the worst');
    expect(w.summary).toEndWith('Utah ranks last (50th).');
    expect(w.faq[0].question).toBe(
      'Which state ranks first on Overall Worst States Rank (US News)?'
    );
    // No median of positions.
    expect(w.faq.some((q) => q.question.includes('median'))).toBe(false);

    const education = read<TopicFile>(
      'state/topics/best-states-for-education.json'
    );
    const rank = ds.metric(20594);
    if (rank == null) throw new Error('missing metric 20594');
    const e = topicAnswers(education, ds, rank, rank.year);
    expect(e.summary).toContain('ranks 1st on Best Education Rank (USNews)');
    expect(e.summary).toContain('rank 1 is the best');
  });

  test('reads the undated series without a year', () => {
    const ds = dataset('country');
    const topic = read<TopicFile>(
      'country/topics/labor-force-participation-rate-by-country.json'
    );
    const lfp = ds.metric(12610);
    if (lfp == null) throw new Error('missing metric 12610');
    const { faq } = topicAnswers(topic, ds, lfp, null);
    expect(faq[2].answer).toMatch(/across the 186 countries with data\.$/);
  });

  test('answers a list topic with its places and a breakdown by value', () => {
    const ds = dataset('country');
    const topic = read<TopicFile>('country/topics/14-eyes-countries.json');
    const { summary, faq } = topicAnswers(topic, ds, null, null);
    expect(summary).toStartWith(
      '14 countries are on the 14 Eyes Countries list: United States, Germany,'
    );
    expect(summary).toContain(
      'Member of 5 Eyes: “No” in 9 of 14 countries and “Yes” in 5 (United States, United Kingdom, Canada, Australia and New Zealand).'
    );
    expect(faq.length).toBeGreaterThan(1);
  });

  test('reads opposite titles over one table from opposite ends', () => {
    const ds = dataset('state');
    const cold = topicSummary(
      read<TopicFile>('state/topics/coldest-states.json'),
      ds,
      manifest.categories
    );
    const hot = topicSummary(
      read<TopicFile>('state/topics/hottest-states.json'),
      ds,
      manifest.categories
    );
    expect(cold.summary).toStartWith(
      'Alaska has the lowest Average Temperature'
    );
    expect(hot.summary).toStartWith(
      'Florida and Georgia tie for the highest Average Temperature'
    );
    expect(cold.description).not.toBe(hot.description);
  });

  test('answers better- and worse-end titles by what the index means', () => {
    const ds = dataset('country');
    const lead = (slug: string) =>
      topicSummary(
        read<TopicFile>(`country/topics/${slug}.json`),
        ds,
        manifest.categories
      ).summary;
    expect(lead('safest-countries-in-the-world')).toStartWith(
      'Iceland has the lowest Global Peace Index'
    );
    expect(lead('poorest-countries-in-the-world')).toStartWith(
      'Burundi has the lowest GDP per Capita'
    );
    expect(lead('least-corrupt-countries')).toStartWith(
      'Denmark has the highest Corruption Perception Index'
    );
    expect(lead('most-corrupt-countries')).toStartWith(
      'Somalia and South Sudan tie for the lowest Corruption Perception Index'
    );
  });

  test('leads median household income with the all-households Census figure', () => {
    const ds = dataset('state');
    const topic = read<TopicFile>(
      'state/topics/median-household-income-by-state.json'
    );
    expect(leadMetric(topic, ds)?.id).toBe(900603);
    const { summary } = topicSummary(topic, ds, manifest.categories);
    expect(summary).toStartWith(
      'District of Columbia has the highest Median Household Income in 2024'
    );
    expect(summary).toContain(
      'American Community Survey 5-year estimate (2020–2024)'
    );
  });

  test('never quotes the source’s wrong Mississippi income as an answer', () => {
    const ds = dataset('state');
    const poorest = read<TopicFile>('state/topics/poorest-states.json');
    expect(leadMetric(poorest, ds)?.id).toBe(900603);
    expect(topicSummary(poorest, ds, manifest.categories).summary).toStartWith(
      'Mississippi has the lowest Median Household Income in 2024'
    );
    // Every topic carrying metric 24419, whose Mississippi value ($34,203) is far below the
    // Census Bureau's.
    const carrying = readdirSync(join(DATA, 'state/topics'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => read<TopicFile>(`state/topics/${f}`))
      .filter((t) => t.metrics.includes(24419));
    expect(carrying.length).toBeGreaterThan(1);
    for (const topic of carrying) {
      const seo = topicSummary(topic, ds, manifest.categories);
      const text = [
        seo.summary,
        seo.description,
        ...seo.faq.map((q) => q.answer),
      ].join(' ');
      expect(`${topic.slug}: ${text}`).not.toContain('$34,203');
    }
  });

  test('credits Rankodex and the agency on a topic built from a primary source', () => {
    const ds = dataset('state');
    const topic = read<TopicFile>('state/topics/crime-rates-by-state-fbi.json');
    expect(topic.url).toBeNull();
    const seo = topicSummary(topic, ds, manifest.categories);
    expect(seo.faq.at(-1)?.answer).toBe(
      'Rankodex built this from Crime in the United States (FBI Crime Data Explorer), fetched Nov 3, 2026.'
    );
    const dataset_ = seo.jsonLd[0];
    expect(dataset_.dateModified).toBe(topic.updated);
    expect(dataset_.creator).toEqual({ '@id': ORGANIZATION_ID });
    expect(dataset_.publisher).toEqual({ '@id': ORGANIZATION_ID });
    expect(dataset_.isBasedOn).toEqual([
      {
        '@type': 'CreativeWork',
        name: 'Crime in the United States - FBI Crime Data Explorer',
        url: topic.sources[0]?.url,
      },
    ]);
  });

  test('credits World Population Review as creator of a topic compiled from its page', () => {
    const ds = dataset('country');
    const topic = read<TopicFile>(
      'country/topics/most-peaceful-countries.json'
    );
    const dataset_ = topicSummary(topic, ds, manifest.categories).jsonLd[0];
    const wpr = {
      '@type': 'Organization',
      name: 'World Population Review',
      url: 'https://worldpopulationreview.com',
    };
    expect(dataset_.creator).toEqual(wpr);
    expect(dataset_.publisher).toEqual({ '@id': ORGANIZATION_ID });
    expect(dataset_.isBasedOn).toEqual({
      '@type': 'CreativeWork',
      url: 'https://worldpopulationreview.com/country-rankings/most-peaceful-countries',
      creator: wpr,
      isBasedOn: topic.sources.map((s) => ({
        '@type': 'CreativeWork',
        name: s.name,
        url: s.url,
      })),
    });
  });

  test('names each cited source once, and leaves out a missing name', () => {
    const credit = datasetCredit({
      url: null,
      sources: [
        { name: 'A - Agency', url: 'https://a.example/' },
        { name: 'A again', url: 'https://a.example/' },
        { name: '', url: 'https://b.example/' },
      ],
    });
    expect(credit.isBasedOn).toEqual([
      {
        '@type': 'CreativeWork',
        name: 'A - Agency',
        url: 'https://a.example/',
      },
      { '@type': 'CreativeWork', url: 'https://b.example/' },
    ]);
    expect(datasetCredit({ url: null, sources: [] }).isBasedOn).toBeUndefined();
  });

  for (const type of manifest.types.map((t) => t.id)) {
    test(`writes no boilerplate and one metric count for every ${type} topic`, () => {
      const ds = dataset(type);
      for (const file of readdirSync(join(DATA, type, 'topics'))) {
        if (!file.endsWith('.json')) continue;
        const topic = read<TopicFile>(`${type}/topics/${file}`);
        const seo = topicSummary(topic, ds, manifest.categories);
        expect(seo.description).not.toMatch(
          /: compare [\d,]+ .* on [\d,]+ metrics?\./
        );
        const counts = new Set(
          [...seo.description.matchAll(/([\d,]+) metrics?\b/g)].map((m) => m[1])
        );
        expect(counts.size).toBeLessThanOrEqual(1);
        // Years print without a thousands separator ("latest Year Joined (2024)").
        expect(seo.summary).not.toMatch(
          /\b(?:latest|earliest)\b[^.]*\([12],\d{3}\)/
        );
      }
    });
  }
});
