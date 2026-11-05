import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { copiedRows, twinOutliers, TWINS } from '../scripts/lib/cross-check';
import { applySeriesFixes, METRIC_FIXES } from '../scripts/lib/metric-fixes';
import type { TopicFile, ValuesFile } from '../src/data/types';

const twin = (
  pairs: Record<string, [number, number]>
): [Map<string, number>, Map<string, number>] => [
  new Map(Object.entries(pairs).map(([k, [a]]) => [k, a])),
  new Map(Object.entries(pairs).map(([k, [, b]]) => [k, b])),
];

describe('twinOutliers', () => {
  const agreeing = Object.fromEntries(
    Array.from({ length: 20 }, (_, i): [string, [number, number]] => [
      `P${i}`,
      [50_000 + i * 1000, 50_500 + i * 1000],
    ])
  );

  test('reports the one cell far from a twin that otherwise agrees', () => {
    const [a, b] = twin({ ...agreeing, MS: [34_203, 56_447] });
    const report = twinOutliers(a, b);
    expect(report?.cells).toEqual([['MS', 34_203, 56_447]]);
    expect(report?.shared).toBe(21);
  });

  test('does not judge twins that disagree in general', () => {
    const [a, b] = twin(
      Object.fromEntries(
        Object.entries(agreeing).map(([k, [x]], i) => [
          k,
          [x, x * (i % 2 === 0 ? 2 : 1)],
        ])
      )
    );
    expect(twinOutliers(a, b)).toBeNull();
  });

  test('needs enough shared places', () => {
    const [a, b] = twin({ A: [1, 1], B: [2, 5] });
    expect(twinOutliers(a, b)).toBeNull();
  });
});

describe('copiedRows', () => {
  const series = (rows: Record<string, number[]>) => {
    const out = new Map<number, Map<string, number>>();
    for (const [place, vals] of Object.entries(rows))
      vals.forEach((v, i) => {
        const store = out.get(2000 + i) ?? new Map<string, number>();
        store.set(place, v);
        out.set(2000 + i, store);
      });
    return out;
  };

  test('finds a row copied onto another place in every year', () => {
    expect(
      copiedRows(
        series({
          FL: [72.1, 72.6, 71.9, 73.0, 72.4],
          GA: [72.1, 72.6, 71.9, 73.0, 72.4],
          AL: [64.1, 64.6, 63.9, 65.0, 64.4],
        })
      )
    ).toEqual([['FL', 'GA']]);
  });

  test('ignores short or constant series', () => {
    expect(copiedRows(series({ A: [1, 2, 3, 4], B: [1, 2, 3, 4] }))).toEqual(
      []
    );
    expect(
      copiedRows(
        series({
          A: [7.25, 7.25, 7.25, 7.25, 7.25],
          B: [7.25, 7.25, 7.25, 7.25, 7.25],
        })
      )
    ).toEqual([]);
  });
});

describe('dropCells', () => {
  test('drops a place in every year, or only in the years given', () => {
    const merged = new Map([
      [
        1,
        new Map<number | '_', Map<string, number | string>>([
          [
            2024,
            new Map([
              ['PAN', 41_369],
              ['USA', 85_000],
            ]),
          ],
          [
            2025,
            new Map([
              ['PAN', 23_052],
              ['USA', 86_000],
            ]),
          ],
        ]),
      ],
    ]);
    const log = applySeriesFixes('t', [merged], {
      't:1': { dropCells: [{ id: 'PAN', years: [2025] }, 'USA'] },
    });
    expect(merged.get(1)?.get(2024)?.has('PAN')).toBe(true);
    expect(merged.get(1)?.get(2025)?.has('PAN')).toBe(false);
    expect(merged.get(1)?.get(2024)?.has('USA')).toBe(false);
    expect(log).toEqual(['t:1: dropped cells of PAN 2025, USA (3 cells)']);
  });
});

describe('committed data', () => {
  const DATA = join(import.meta.dir, '../public/data');
  const read = <T>(file: string): T =>
    JSON.parse(readFileSync(join(DATA, file), 'utf8')) as T;
  const ids = (type: string) =>
    read<{ id: string }[]>(`${type}/entities.json`).map((e) => e.id);

  test('carries no dropped cell in any year of any topic', () => {
    const topics =
      read<{ type: string; slug: string; metrics: number[] }[]>('topics.json');
    const found: string[] = [];
    for (const [key, fix] of Object.entries(METRIC_FIXES)) {
      if (fix.dropCells == null) continue;
      const [type = '', idText = ''] = key.split(':');
      const places = ids(type);
      for (const t of topics) {
        if (t.type !== type || !t.metrics.includes(Number(idText))) continue;
        const file = read<TopicFile>(`${type}/topics/${t.slug}.json`);
        for (const [year, [idx]] of Object.entries(file.series[idText] ?? {}))
          for (const drop of fix.dropCells) {
            const place = typeof drop === 'string' ? drop : drop.id;
            if (typeof drop !== 'string' && !drop.years.includes(Number(year)))
              continue;
            if (idx.includes(places.indexOf(place)))
              found.push(`${key} ${t.slug} ${year} ${place}`);
          }
      }
    }
    expect(found).toEqual([]);
  });

  test('leaves no cell that disagrees with its twin, except as noted', () => {
    // Kenya's maternal mortality: 379 per 100,000 (2023) on the women's safety page and 149 on
    // the maternal mortality page; which one the source got wrong is not settled.
    const known = new Set(['country:24435~18564 KEN']);
    const left: string[] = [];
    for (const [type, a, b] of TWINS) {
      const values = read<ValuesFile>(`${type}/values.json`).metrics;
      const places = ids(type);
      const byPlace = (id: number) => {
        const row = values.find((v) => v[0] === id);
        return new Map(
          (row?.[1] ?? []).map((e, i): [string, number] => [
            places[e] ?? '',
            Number(row?.[2][i]),
          ])
        );
      };
      for (const [place] of twinOutliers(byPlace(a), byPlace(b))?.cells ?? [])
        if (!known.has(`${type}:${a}~${b} ${place}`))
          left.push(`${type}:${a}~${b} ${place}`);
    }
    expect(left).toEqual([]);
  });
});
