import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { TopicSummary } from '../src/data/types';
import {
  planSuggestions,
  suggestTopics,
} from '../src/features/topic/SuggestedTopics';
import { canonicalTopicSlug } from '../src/seo/indexing';

const t = (
  slug: string,
  type: TopicSummary['type'],
  cats: string[],
  n = 50
): TopicSummary => ({
  slug,
  type,
  title: slug,
  cats,
  metrics: [1],
  n,
  updated: null,
});

describe('suggestTopics', () => {
  const index = [
    t('self', 'state', ['economics', 'health']),
    t('tiny', 'state', ['economics'], 9),
    t('thin', 'state', ['economics']),
    t('econ-health', 'state', ['economics', 'health'], 51),
    t('econ-big', 'state', ['economics'], 51),
    t('econ-small', 'state', ['economics'], 20),
    t('econ-country', 'country', ['economics'], 200),
    t('unrelated', 'state', ['sports']),
    // An alias of another topic (indexing.ts TOPIC_ALIASES): its canonical page is suggested instead.
    t('cheapest-states-to-live-in', 'state', ['economics']),
  ];
  const noindex = new Set(['state/thin']);
  const slugs = suggestTopics(
    { slug: 'self', type: 'state' },
    index,
    noindex
  ).map((x) => x.slug);

  test('suggests topics sharing a category, own place type first', () => {
    expect(new Set(slugs)).toEqual(
      new Set(['econ-health', 'econ-big', 'econ-small', 'econ-country'])
    );
    expect(slugs.at(-1)).toBe('econ-country');
  });

  test('never the page itself, noindex pages, aliases, tiny lists or unrelated topics', () => {
    for (const slug of [
      'self',
      'thin',
      'tiny',
      'unrelated',
      'cheapest-states-to-live-in',
    ])
      expect(slugs).not.toContain(slug);
  });

  test('is the same for the same index and noindex set', () => {
    const again = planSuggestions([...index], new Set(noindex));
    expect(again.get('state/self')?.map((x) => x.slug)).toEqual(slugs);
  });
});

describe('planSuggestions', () => {
  // One category with 60 topics of one type, the bigger the earlier: picking the largest
  // rankings would link the same eight from every page.
  const many = Array.from({ length: 60 }, (_, i) =>
    t(`topic-${i}`, 'state', ['culture'], 1000 - i)
  );
  const plan = planSuggestions(many, new Set());
  const inbound = new Map<string, number>();
  for (const list of plan.values())
    for (const s of list) inbound.set(s.slug, (inbound.get(s.slug) ?? 0) + 1);

  test('gives every page eight suggestions, at most six of its own type when others exist', () => {
    for (const list of plan.values()) expect(list).toHaveLength(8);
    const mixed = planSuggestions(
      [
        ...many,
        t('c1', 'country', ['culture']),
        t('c2', 'country', ['culture']),
      ],
      new Set()
    );
    const own = mixed.get('state/topic-0') ?? [];
    expect(own.filter((x) => x.type === 'state')).toHaveLength(6);
    expect(own.slice(6).map((x) => x.type)).toEqual(['country', 'country']);
  });

  test('spreads the links: every topic is suggested, none far more than the rest', () => {
    expect(inbound.size).toBe(60);
    const counts = [...inbound.values()];
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...counts)).toBeLessThanOrEqual(12);
  });

  test('links from noindex pages do not count toward a topic’s links', () => {
    const noindex = new Set(many.slice(0, 50).map((x) => `state/${x.slug}`));
    const p = planSuggestions(many, noindex);
    // Only the ten indexable pages count, and they are the only topics that may be suggested.
    for (const list of p.values())
      for (const s of list) expect(noindex.has(`state/${s.slug}`)).toBe(false);
  });
});

describe('planSuggestions on the committed data', () => {
  const index = JSON.parse(
    readFileSync(join(import.meta.dir, '../public/data/topics.json'), 'utf8')
  ) as TopicSummary[];
  const plan = planSuggestions(index, new Set());

  test('never suggests an alias, and every page gets suggestions', () => {
    for (const [key, list] of plan) {
      for (const s of list) {
        expect(canonicalTopicSlug(s.type, s.slug)).toBe(s.slug);
        expect(`${s.type}/${s.slug}`).not.toBe(key);
      }
    }
    const empty = [...plan.values()].filter((l) => l.length === 0).length;
    expect(empty / plan.size).toBeLessThan(0.02);
  });
});
