import { describe, expect, test } from 'bun:test';

import type { TopicSummary } from '../src/data/types';
import { suggestTopics } from '../src/features/topic/SuggestedTopics';

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
    t('self', 'state', ['economics']),
    t('related', 'state', ['culture']),
    t('tiny', 'state', ['economics'], 10),
    t('econ-health', 'state', ['economics', 'health'], 51),
    t('econ-big', 'state', ['economics'], 51),
    t('econ-small', 'state', ['economics'], 20),
    t('econ-country', 'country', ['economics'], 200),
    t('unrelated', 'state', ['sports']),
  ];
  const topic = {
    slug: 'self',
    type: 'state' as const,
    cats: ['economics', 'health'],
    related: [{ type: 'state' as const, slug: 'related' }],
  };
  const slugs = suggestTopics(topic, index).map((x) => x.slug);

  test('the source’s related topics come first', () => {
    expect(slugs[0]).toBe('related');
  });

  test('then topics sharing the most categories, bigger first, plus another place type', () => {
    expect(slugs.slice(1, 4)).toEqual([
      'econ-health',
      'econ-big',
      'econ-small',
    ]);
    expect(slugs).toContain('econ-country');
  });

  test('never the page itself, tiny lists or unrelated topics', () => {
    expect(slugs).not.toContain('self');
    expect(slugs).not.toContain('tiny');
    expect(slugs).not.toContain('unrelated');
  });
});
