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
import {
  displayTables,
  focusableMetrics,
  hasUndated,
  resolveYear,
  seriesYears,
} from '../src/features/topic/model';
import { leadMetric, topicSummary } from '../src/seo/content';
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

  test('falls back to a generic summary without a numeric metric', () => {
    const ds = dataset('country');
    const topic = read<TopicFile>('country/topics/14-eyes-countries.json');
    const { summary, faq } = topicAnswers(topic, ds, null, null);
    expect(summary).toStartWith('14 Eyes Countries: compare');
    expect(faq).toHaveLength(1);
  });
});
