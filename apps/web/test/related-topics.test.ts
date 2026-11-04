import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Metric, TopicSummary } from '../src/data/types';
import {
  buildTopicGraph,
  isRankedTopic,
  MIN_RANKED_PLACES,
  pairHash,
  relatedTopics,
  titleWords,
} from '../src/features/topic/related/relatedModel';

const t = (
  slug: string,
  title: string,
  cats: string[],
  metrics: number[],
  n = 50
): TopicSummary => ({
  slug,
  type: 'state',
  title,
  cats,
  metrics,
  n,
  updated: null,
});

// Metric 99 is a categorical column; every other id is a numeric one covering 50 places.
const metricOf = (id: number): Pick<Metric, 'kind' | 'meta' | 'n'> =>
  id === 99 ? { kind: 'cat', n: 50 } : { kind: 'num', n: 50 };
const ranked = (topic: TopicSummary) => isRankedTopic(topic, metricOf);
const slugs = (list: TopicSummary[]) => list.map((x) => x.slug);

describe('titleWords', () => {
  test('lowercases, splits on punctuation and drops plural s', () => {
    expect(titleWords('Gun Laws by State')).toEqual([
      'gun',
      'law',
      'by',
      'state',
    ]);
    expect(titleWords('Women’s Rights, 2024')).toEqual(['women', 'right']);
    expect(titleWords('Business Taxes')).toEqual(['business', 'taxe']);
  });
});

describe('isRankedTopic', () => {
  test('needs ten places and a numeric statistic with ten values', () => {
    expect(ranked(t('a', 'A', ['law'], [1]))).toBe(true);
    expect(ranked(t('b', 'B', ['law'], [99]))).toBe(false);
    expect(ranked(t('c', 'C', ['law'], [1], MIN_RANKED_PLACES - 1))).toBe(
      false
    );
    expect(
      isRankedTopic(t('d', 'D', ['law'], [1]), () => ({
        kind: 'num',
        n: 5,
      }))
    ).toBe(false);
    expect(
      isRankedTopic(t('e', 'E', ['law'], [1]), () => ({
        kind: 'num',
        meta: true,
        n: 50,
      }))
    ).toBe(false);
  });
});

describe('relatedTopics', () => {
  const index: TopicSummary[] = [
    t('gun-laws', 'Gun Laws by State', ['law'], [1, 2]),
    t('gun-deaths', 'Gun Deaths by State', ['crime-safety'], [3]),
    t('gun-ownership', 'Gun Ownership by State', ['law'], [2, 4]),
    t('strictest-gun-laws', 'Strictest Gun Laws', ['law'], [1, 2]),
    t('abortion-laws', 'Abortion Laws by State', ['law'], [5]),
    t('legal-weed', 'Legal Weed States', ['law'], [99]),
    t('tiny-law', 'Tiny Law List', ['law'], [6], 4),
    t('income', 'Median Income by State', ['economics'], [7]),
    t('rent', 'Median Rent by State', ['economics'], [8]),
    {
      ...t('country-guns', 'Gun Laws by Country', ['law'], [1]),
      type: 'country',
    },
  ];
  const graph = buildTopicGraph(index, 'state', ranked);
  const page = { type: 'state' as const, slug: 'gun-laws' };
  const related = slugs(relatedTopics(page, graph));

  test('puts topics sharing statistics first', () => {
    expect(related[0]).toBe('gun-ownership');
  });

  test('never links the page itself, an exact duplicate, a thin page or another type', () => {
    expect(related).not.toContain('gun-laws');
    // Same statistics (1 and 2): a duplicate list of this page.
    expect(related).not.toContain('strictest-gun-laws');
    // Categorical only, and under ten places.
    expect(related).not.toContain('legal-weed');
    expect(related).not.toContain('tiny-law');
    expect(related).not.toContain('country-guns');
  });

  test('ranks the same category and shared title words above unrelated topics', () => {
    expect(related.indexOf('abortion-laws')).toBeLessThan(
      related.indexOf('income')
    );
    expect(related.indexOf('gun-deaths')).toBeLessThan(
      related.indexOf('income')
    );
  });

  test('leaves out links already shown elsewhere on the page and respects the limit', () => {
    const out = slugs(
      relatedTopics(page, graph, new Set(['state/gun-ownership']), 2)
    );
    expect(out).toHaveLength(2);
    expect(out).not.toContain('gun-ownership');
  });

  test('links both ring neighbours in the category even when others score higher', () => {
    // Law's ranked topics in subject order: abortion, gun laws, gun ownership, strictest gun
    // laws. With room for two links, gun ownership's neighbours are gun laws and strictest.
    const ring = graph.rings.get('law');
    expect(ring).toEqual([
      'state/abortion-laws',
      'state/gun-laws',
      'state/gun-ownership',
      'state/strictest-gun-laws',
    ]);
    const out = slugs(
      relatedTopics(
        { type: 'state', slug: 'gun-ownership' },
        graph,
        new Set(),
        2
      )
    );
    expect(out.sort()).toEqual(['gun-laws', 'strictest-gun-laws']);
  });

  test('is deterministic', () => {
    expect(slugs(relatedTopics(page, graph))).toEqual(related);
    expect(pairHash('a', 'b')).toBe(pairHash('a', 'b'));
    expect(pairHash('a', 'b')).not.toBe(pairHash('b', 'a'));
  });
});

describe('relatedTopics on the real topic index', () => {
  const DATA = join(import.meta.dir, '..', 'public', 'data');
  const read = <T>(path: string): T =>
    JSON.parse(readFileSync(join(DATA, path), 'utf8')) as T;
  const index = read<TopicSummary[]>('topics.json');

  test('every ranked state topic is linked from at least two other topic pages', () => {
    const metrics = new Map(
      read<Metric[]>('state/metrics.json').map((m) => [m.id, m])
    );
    const graph = buildTopicGraph(index, 'state', (x) =>
      isRankedTopic(x, (id) => metrics.get(id))
    );
    const inbound = new Map<string, number>();
    for (const node of graph.nodes.values())
      for (const r of relatedTopics(node.topic, graph)) {
        const key = `${r.type}/${r.slug}`;
        inbound.set(key, (inbound.get(key) ?? 0) + 1);
      }
    const rankedKeys = [...graph.nodes.values()]
      .filter((n) => n.ranked)
      .map((n) => n.key);
    expect(rankedKeys.length).toBeGreaterThan(500);
    const under2 = rankedKeys.filter((k) => (inbound.get(k) ?? 0) < 2);
    expect(under2).toEqual([]);
  });
});
