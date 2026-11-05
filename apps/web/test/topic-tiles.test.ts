import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
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
  isYearValued,
  leadMetric,
  openingYear,
  topicListOrder,
} from '../src/features/topic/headline';
import {
  displayTables,
  focusableMetrics,
  hasUndated,
  numericColumn,
  type RankedEntry,
  rankEntries,
  resolveYear,
  seriesYears,
} from '../src/features/topic/model';
import { extremeTiles } from '../src/features/topic/TopicVisuals';

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

const entry = (index: number, value: number, rank: number): RankedEntry => ({
  index,
  value,
  rank,
});

describe('extremeTiles', () => {
  // Listed lowest first, as a low-end title ("Coldest States") lists them.
  const lowFirst = [entry(0, 10, 1), entry(1, 20, 2), entry(2, 30, 3)];

  test('picks the largest and smallest value whatever the list order', () => {
    const [high, low] = extremeTiles(lowFirst, 0);
    expect(high.entry?.index).toBe(2);
    expect(low.entry?.index).toBe(0);
    const [high2, low2] = extremeTiles([...lowFirst].reverse(), 0);
    expect(high2.entry?.index).toBe(2);
    expect(low2.entry?.index).toBe(0);
  });

  test('judges the ends only from polarity', () => {
    expect(extremeTiles(lowFirst, 0).map((t) => t.label)).toEqual([
      'Highest',
      'Lowest',
    ]);
    expect(extremeTiles(lowFirst, 1).map((t) => t.label)).toEqual([
      'Highest (best)',
      'Lowest (worst)',
    ]);
    expect(extremeTiles(lowFirst, -1).map((t) => t.label)).toEqual([
      'Highest (worst)',
      'Lowest (best)',
    ]);
  });

  test('gives ties to the place listed first and handles an empty list', () => {
    const [high, low] = extremeTiles(
      [entry(4, 5, 1), entry(5, 5, 1), entry(6, 1, 3)],
      0
    );
    expect(high.entry?.index).toBe(4);
    expect(low.entry?.index).toBe(6);
    const [none] = extremeTiles([], 1);
    expect(none.entry).toBeUndefined();
  });

  // Low-end and worse-end titles list their ranking from the other end; the tiles must still
  // put the highest value under "Highest", and never call the worst place the best.
  for (const [type, slug] of [
    ['state', 'coldest-states'],
    ['country', 'most-dangerous-countries'],
    ['country', 'poorest-countries-in-the-world'],
    ['city', 'most-dangerous-cities-in-the-us'],
  ] as const) {
    test(`${type}/${slug}: Highest is at least Lowest`, () => {
      const ds = dataset(type);
      const topic = read<TopicFile>(`${type}/topics/${slug}.json`);
      // The page's default focus: the lead metric, or its first focusable one when the lead is
      // a figure the topic does not carry (coldest-states leads with NOAA's normals).
      const lead = leadMetric(topic, ds);
      const tables = displayTables(topic, (id) => ds.metric(id) != null);
      const focusables = focusableMetrics(tables, (id) => ds.metric(id));
      const focus =
        focusables.find((m) => m.id === lead?.id) ?? focusables[0] ?? null;
      if (focus == null) throw new Error('no focus metric');
      const year =
        focus.id === lead?.id
          ? openingYear(topic, focus)
          : resolveYear(
              seriesYears(topic, focus.id),
              undefined,
              focus.year,
              hasUndated(topic, focus.id)
            );
      const values = numericColumn(topic, focus.id, year, ds.entities.length);
      const order = topicListOrder(
        topic,
        focus,
        lead,
        isYearValued(focus, values)
      );
      const ranked = rankEntries(values, order.direction);
      const [high, low] = extremeTiles(ranked, focus.pol);
      if (high.entry == null || low.entry == null) throw new Error('no tiles');
      expect(high.entry.value).toBeGreaterThanOrEqual(low.entry.value);
      let max = -Infinity;
      for (const v of values) if (Number.isFinite(v)) max = Math.max(max, v);
      expect(high.entry.value).toBe(max);
      // The worst place of a worse-end list is never labelled the best.
      if (focus.pol !== 0) {
        const best = focus.pol === 1 ? high : low;
        expect(best.label.endsWith('(best)')).toBe(true);
      }
    });
  }
});
