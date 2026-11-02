import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Manifest, Metric, TopicSummary } from '../src/data/types';
import {
  dominantType,
  latestUpdate,
  overlayPartner,
  pickExamples,
  summarizeCategories,
  topCategoryMetrics,
  topicInfoMap,
  topicsByType,
} from '../src/features/categories/categoryStats';

const DATA = join(import.meta.dir, '..', 'public', 'data');
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(join(DATA, path), 'utf8')) as T;

const topic = (
  over: Partial<TopicSummary> & { slug: string }
): TopicSummary => ({
  type: 'state',
  title: over.slug,
  cats: ['economics'],
  metrics: [1],
  n: 51,
  updated: null,
  ...over,
});

const metric = (over: Partial<Metric> & { id: number }): Metric => ({
  key: `m${over.id}`,
  label: `Metric ${over.id}`,
  fmt: null,
  unit: null,
  kind: 'num',
  pol: 1,
  year: null,
  years: [],
  n: 51,
  topics: ['t'],
  cats: ['economics'],
  updated: null,
  ...over,
});

describe('pickExamples', () => {
  test('takes the best topic of each type before repeating a type', () => {
    const entities = new Map([
      ['state', 51],
      ['country', 235],
    ] as const);
    const examples = pickExamples(
      [
        topic({ slug: 's1', metrics: [1, 2, 3, 4] }),
        topic({ slug: 's2', metrics: [1, 2, 3] }),
        topic({ slug: 'c1', type: 'country', n: 200, metrics: [1] }),
      ],
      entities,
      2
    );
    expect(examples.map((t) => t.slug).sort()).toEqual(['c1', 's1']);
  });
});

describe('summarizeCategories (real dataset)', () => {
  const manifest = read<Manifest>('manifest.json');
  const topics = read<TopicSummary[]>('topics.json');
  const summaries = summarizeCategories(manifest, topics);

  test('covers every category with counts that add up', () => {
    expect(summaries).toHaveLength(manifest.categories.length);
    for (const s of summaries) {
      expect(s.byType.reduce((a, t) => a + t.count, 0)).toBe(s.total);
      expect(s.examples.length).toBeGreaterThan(0);
      expect(s.examples.length).toBeLessThanOrEqual(3);
      for (const e of s.examples) expect(e.cats).toContain(s.id);
    }
  });

  test('finds the dominant place type', () => {
    const law = summaries.find((s) => s.id === 'law');
    expect(law != null && dominantType(law)).toBe('state');
    expect(dominantType({ byType: [] })).toBe('country');
  });
});

describe('topicsByType', () => {
  test('groups a category’s topics by place type, A–Z within each group', () => {
    const groups = topicsByType(
      [
        topic({ slug: 'b', title: 'beta by State' }),
        topic({ slug: 'z', title: 'Zeta by Country', type: 'country' }),
        topic({ slug: 'a', title: 'Alpha by State' }),
        topic({ slug: 'x', title: 'Other', cats: ['health'] }),
        topic({ slug: 'c', title: 'Alpha by County', type: 'county' }),
      ],
      'economics'
    );
    expect(groups.map((g) => g.type)).toEqual(['country', 'state', 'county']);
    expect(groups[1].topics.map((t) => t.slug)).toEqual(['a', 'b']);
  });

  test('lists every topic of a real category exactly once', () => {
    const topics = read<TopicSummary[]>('topics.json');
    const health = topics.filter((t) => t.cats.includes('health'));
    const listed = topicsByType(topics, 'health').flatMap((g) => g.topics);
    expect(listed).toHaveLength(health.length);
    expect(new Set(listed.map((t) => `${t.type}:${t.slug}`)).size).toBe(
      health.length
    );
  });
});

describe('topCategoryMetrics', () => {
  test('keeps covered numeric metrics of the category, one per label and topic', () => {
    const info = new Map([
      ['state:t', { cats: ['economics'], metrics: [7, 1] }],
      ['state:u', { cats: ['economics'], metrics: [] }],
      ['state:h', { cats: ['health', 'economics'], metrics: [8] }],
      ['state:x', { cats: ['culture'], metrics: [] }],
    ]);
    const top = topCategoryMetrics(
      [
        metric({ id: 1, label: 'Income', n: 51 }),
        metric({ id: 2, label: 'income', n: 40, topics: ['u'] }),
        metric({ id: 3, label: 'Sparse', n: 10, topics: ['u'] }),
        metric({ id: 4, label: 'Other category', cats: ['health'] }),
        metric({ id: 5, label: 'Text', kind: 'text', topics: ['u'] }),
        metric({ id: 6, label: 'Neutral', pol: 0, n: 51, topics: ['u'] }),
        metric({ id: 7, label: 'Same topic as 1', n: 51 }),
        metric({ id: 8, label: 'Health topic', topics: ['h'] }),
        metric({ id: 9, label: 'Off-topic primary', topics: ['x'] }),
        metric({ id: 10, label: 'Data Year', topics: ['u'] }),
      ],
      'state',
      'economics',
      51,
      info
    );
    // 7 is topic t's headline column, so it beats 1 for that topic; 8 is a headline too.
    expect(top.map((m) => m.id)).toEqual([7, 8, 6]);
  });

  test('returns well-covered state economics metrics from the real catalog', () => {
    const top = topCategoryMetrics(
      read<Metric[]>('state/metrics.json'),
      'state',
      'economics',
      51,
      topicInfoMap(read<TopicSummary[]>('topics.json'))
    );
    expect(top).toHaveLength(8);
    for (const m of top) expect(m.n).toBeGreaterThanOrEqual(31);
    expect(new Set(top.map((m) => m.topics[0])).size).toBe(top.length);
  });
});

describe('overlayPartner', () => {
  test('uses income for states, GDP per capita for countries, population otherwise', () => {
    expect(overlayPartner('state', 1).id).toBe(24419);
    expect(overlayPartner('state', 24419).id).toBe(-1);
    expect(overlayPartner('country', 1).id).toBe(19182);
    expect(overlayPartner('county', 1).id).toBe(-1);
  });
});

describe('latestUpdate', () => {
  test('prefers the topic date, else the newest metric date', () => {
    const metrics = new Map([
      [1, { updated: '2025-01-01' }],
      [2, { updated: '2026-02-01' }],
      [3, { updated: null }],
    ]);
    expect(latestUpdate({ updated: '2024-05-05', metrics: [1] }, metrics)).toBe(
      '2024-05-05'
    );
    expect(latestUpdate({ updated: null, metrics: [1, 2, 3] }, metrics)).toBe(
      '2026-02-01'
    );
    expect(latestUpdate({ updated: null, metrics: [1] }, null)).toBeNull();
  });
});
