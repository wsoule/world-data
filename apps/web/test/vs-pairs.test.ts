import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Dataset } from '../src/data/dataset';
import type {
  Entity,
  Manifest,
  Metric,
  TopicSummary,
  ValuesFile,
} from '../src/data/types';
import {
  buildPairPageData,
  listedPair,
  MIN_PAIR_METRICS,
} from '../src/features/vs/pairData';
import {
  pairOrder,
  pairPath,
  type PairsFile,
  pairSlug,
  parsePairSlug,
  partnersOf,
} from '../src/features/vs/pairs';

const DATA = path.resolve(import.meta.dir, '../public/data');
const read = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(DATA, file), 'utf8')) as T;

describe('matchup URLs', () => {
  test('either order gives the one canonical slug', () => {
    expect(pairSlug('texas', 'california')).toBe('california-vs-texas');
    expect(pairSlug('california', 'texas')).toBe('california-vs-texas');
    expect(pairOrder('b', 'a')).toEqual(['a', 'b']);
    expect(pairPath('state', 'texas', 'california')).toBe(
      '/vs/state/california-vs-texas'
    );
  });

  test('parses known slugs, including ones containing "-vs-"', () => {
    const known = new Set(['new-york', 'texas', 'a-vs-b', 'c']);
    const has = (s: string) => known.has(s);
    expect(parsePairSlug('new-york-vs-texas', has)).toEqual([
      'new-york',
      'texas',
    ]);
    expect(parsePairSlug('a-vs-b-vs-c', has)).toEqual(['a-vs-b', 'c']);
    expect(parsePairSlug('texas-vs-texas', has)).toBeNull();
    expect(parsePairSlug('texas-vs-ohio', has)).toBeNull();
    expect(parsePairSlug('texas', has)).toBeNull();
  });

  test('only listed pairs in canonical order resolve', () => {
    const pairs: PairsFile = { state: [['california', 'texas']] };
    expect(listedPair(pairs, 'state', 'california-vs-texas')).toEqual([
      'california',
      'texas',
    ]);
    expect(listedPair(pairs, 'state', 'texas-vs-california')).toBeNull();
    expect(listedPair(pairs, 'country', 'california-vs-texas')).toBeNull();
    expect(partnersOf(pairs, 'state', 'texas')).toEqual(['california']);
  });
});

describe('pairs.json', () => {
  const pairs = read<PairsFile>('pairs.json');

  test('every pair names two different known places in canonical order, once', () => {
    for (const [type, list] of Object.entries(pairs)) {
      const slugs = new Set(
        read<Entity[]>(`${type}/entities.json`).map((e) => e.slug)
      );
      const seen = new Set<string>();
      for (const [a, b] of list) {
        expect(a < b).toBe(true);
        expect(slugs.has(a) && slugs.has(b)).toBe(true);
        expect(seen.has(`${a} ${b}`)).toBe(false);
        seen.add(`${a} ${b}`);
      }
    }
  });

  test('covers every state pair and the most searched matchups', () => {
    expect(pairs.state?.length).toBe(51 * 25);
    const has = (type: keyof PairsFile, a: string, b: string) =>
      pairs[type]?.some(
        ([x, y]) => x === pairOrder(a, b)[0] && y === pairOrder(a, b)[1]
      );
    expect(has('country', 'united-states', 'china')).toBe(true);
    expect(has('country', 'united-states', 'canada')).toBe(true);
    expect(has('city', 'new-york-ny', 'los-angeles-ca')).toBe(true);
  });
});

describe('matchup page data', () => {
  const manifest = read<Manifest>('manifest.json');
  const info = manifest.types.find((t) => t.id === 'state');
  if (info == null) throw new Error('no state type');
  const ds = new Dataset(
    info,
    read<Entity[]>('state/entities.json'),
    read<Metric[]>('state/metrics.json'),
    read<ValuesFile>('state/values.json'),
    read<TopicSummary[]>('topics.json')
  );
  const data = buildPairPageData(
    ds,
    manifest,
    read<PairsFile>('pairs.json'),
    'california',
    'texas'
  );

  test('scores the pair and is indexable', () => {
    const { wins, ties, total } = data.score;
    expect(wins[0] + wins[1] + ties).toBe(total);
    expect(total).toBeGreaterThan(MIN_PAIR_METRICS);
    expect(data.seo.noindex).toBe(false);
    expect(data.pair).toBe('california-vs-texas');
  });

  test('leads with population and answers the comparison question', () => {
    expect(data.glance[0]?.label).toBe('Population');
    expect(data.seo.title).toStartWith('California vs Texas');
    expect(data.seo.faq[0]?.question).toBe(
      'Which is better, California or Texas?'
    );
    expect(data.seo.summary).toContain(`${data.score.total}`);
  });

  test('links other matchups of either place, never this one', () => {
    expect(data.related.length).toBeGreaterThan(0);
    expect(data.related.some((r) => r.pair === data.pair)).toBe(false);
  });
});
