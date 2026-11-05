import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  applyYearFixes,
  type FixableSeries,
  METRIC_FIXES,
} from '../scripts/lib/metric-fixes';
import {
  isBreak,
  outlierYears,
  rankFlips,
  spearman,
  yearSteps,
} from '../scripts/lib/year-scale';
import type { Metric, TopicFile } from '../src/data/types';

/** A series from {year: {place: value}}. */
const series = (years: Record<number, Record<string, number>>): FixableSeries =>
  new Map(
    Object.entries(years).map(([y, cells]) => [
      Number(y),
      new Map(Object.entries(cells)),
    ])
  );

const places = ['A', 'B', 'C', 'D', 'E', 'F'];
const row = (scale: number, offset = 0) =>
  Object.fromEntries(places.map((p, i) => [p, (i + 1 + offset) * scale]));

describe('yearSteps', () => {
  test('finds a change of unit between two years', () => {
    // CPI on a 0-10 scale in 2010 and 0-100 in 2015.
    const steps = yearSteps(series({ 2010: row(1), 2015: row(10) }));
    expect(steps).toEqual([{ from: 2010, to: 2015, ratio: 10, pairs: 6 }]);
    expect(isBreak(steps[0])).toBe(true);
  });

  test('lets ordinary change through', () => {
    const steps = yearSteps(series({ 2020: row(100), 2021: row(130) }));
    expect(steps.map(isBreak)).toEqual([false]);
  });

  test('compares medians when few places are in both years', () => {
    const steps = yearSteps(
      series({
        2020: { A: 1, B: 2, C: 3, D: 4, E: 5 },
        2021: { F: 1000, G: 2000, H: 3000, I: 4000, J: 5000 },
      })
    );
    expect(steps).toEqual([{ from: 2020, to: 2021, ratio: 1000, pairs: 0 }]);
  });
});

describe('outlierYears', () => {
  test('marks a one-year bounce, like a census count in a crop series', () => {
    const steps = yearSteps(
      series({ 2021: row(1e8), 2022: row(1e6), 2023: row(1e8) })
    );
    expect([...outlierYears(steps)]).toEqual([2022]);
  });

  test('does not mark a lasting change of unit', () => {
    const steps = yearSteps(
      series({ 2021: row(1), 2022: row(1000), 2023: row(1000) })
    );
    expect(outlierYears(steps).size).toBe(0);
  });
});

describe('rankFlips', () => {
  const ranks = (order: string[]) =>
    Object.fromEntries(order.map((p, i) => [p, i + 1]));
  const ten = 'ABCDEFGHIJ'.split('');

  test('reports a rank column counting from the other end', () => {
    const flips = rankFlips(
      series({ 2023: ranks(ten), 2026: ranks([...ten].reverse()) })
    );
    expect(flips).toHaveLength(1);
    expect(flips[0]?.rho).toBeCloseTo(-1);
    expect(flips[0]?.firstToLast.sort()).toEqual(['A', 'J']);
  });

  test('accepts a reshuffle', () => {
    const next = ['B', 'A', 'C', 'E', 'D', 'F', 'G', 'I', 'H', 'J'];
    expect(rankFlips(series({ 2023: ranks(ten), 2024: ranks(next) }))).toEqual(
      []
    );
  });

  test('spearman handles ties and constant lists', () => {
    expect(spearman([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(spearman([1, 1, 1], [1, 2, 3])).toBe(0);
  });
});

describe('applyYearFixes', () => {
  test('drops, rescales and swaps years in every copy of a metric', () => {
    const merged = new Map([
      [1, series({ 2010: { A: 9.3 }, 2015: { A: 91 } })],
      [2, series({ 2020: { A: 13620 }, 2022: { A: 5 } })],
      [3, series({ 2020: { A: 4.01 }, 2022: { A: 17106 } })],
    ]);
    const topic = new Map([[1, series({ 2010: { A: 9.3 } })]]);
    const log = applyYearFixes('t', [merged, topic], {
      't:1': { scaleYears: [{ years: [2010], by: 10 }] },
      't:2': { swapYears: { with: 3, years: [2020] }, dropYears: [2022] },
    });
    expect(merged.get(1)?.get(2010)?.get('A')).toBe(93);
    expect(topic.get(1)?.get(2010)?.get('A')).toBe(93);
    expect(merged.get(2)?.get(2020)?.get('A')).toBe(4.01);
    expect(merged.get(3)?.get(2020)?.get('A')).toBe(13620);
    expect(merged.get(2)?.has(2022)).toBe(false);
    expect(log).toEqual([
      't:1: scaled 2010 by 10 (2 cells)',
      't:2: dropped 2022 (1 cells); swapped 2020 with 3 (2 cells)',
    ]);
  });
});

describe('committed data', () => {
  const DATA = join(import.meta.dir, '../public/data');
  const read = <T>(file: string): T =>
    JSON.parse(readFileSync(join(DATA, file), 'utf8')) as T;
  const cell = (
    type: string,
    slug: string,
    id: number,
    year: number,
    place: string
  ): number | string | undefined => {
    const entities = read<{ id: string }[]>(`${type}/entities.json`);
    const topic = read<TopicFile>(`${type}/topics/${slug}.json`);
    const [idx, vals] = topic.series[String(id)]?.[String(year)] ?? [[], []];
    const i = entities.findIndex((e) => e.id === place);
    return vals[idx.indexOf(i)];
  };
  const metric = (type: string, id: number) =>
    read<Metric[]>(`${type}/metrics.json`).find((m) => m.id === id);

  test('puts the CPI on one 0-100 scale', () => {
    const slug = 'corruption-perceptions-index-by-country';
    expect(cell('country', slug, 21700, 2005, 'DNK')).toBe(95);
    expect(cell('country', slug, 21700, 2015, 'DNK')).toBe(91);
  });

  test('leaves census counts out of the annual crop series', () => {
    const tobacco = metric('state', 13550);
    expect(tobacco?.years).not.toContain(2022);
    expect(tobacco?.year).toBe(2023);
    expect(
      cell('state', 'tobacco-production-by-state', 13550, 2023, 'NC')
    ).toBe(260098000);
  });

  test('keeps only the best-first years of the road quality rank', () => {
    expect(metric('state', 11272)?.years).toEqual([2022, 2023]);
  });

  test('applies every year fix to a metric that exists', () => {
    for (const [key, fix] of Object.entries(METRIC_FIXES)) {
      if (fix.dropYears == null && fix.scaleYears == null) continue;
      const [type = '', id = ''] = key.split(':');
      const m = metric(type, Number(id));
      expect(m == null ? `${key} missing` : key).toBe(key);
      for (const y of fix.dropYears ?? [])
        expect(`${key} ${m?.years.includes(y)}`).toBe(`${key} false`);
    }
  });
});
