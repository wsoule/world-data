import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STORY_DEFS } from '../src/content/storyDefs';
import type { StorySummary } from '../src/content/storyTypes';
import {
  furtherReading,
  mayHaveStories,
  storiesForPlace,
  storiesForTopic,
  STORY_METRICS,
} from '../src/features/articles/storyPicks';

type Story = Pick<
  StorySummary,
  'slug' | 'type' | 'kind' | 'cats' | 'r' | 'xId' | 'yId'
>;

const s = (
  slug: string,
  xId: number,
  yId: number,
  over: Partial<Story> = {}
): Story => ({
  slug,
  type: 'state',
  kind: 'pair',
  cats: ['economics'],
  r: 0.6,
  xId,
  yId,
  ...over,
});

const slugs = (list: Story[]) => list.map((x) => x.slug);

describe('storiesForTopic', () => {
  const stories = [
    s('pair-strong', 1, 2, { r: -0.9 }),
    s('pair-weak', 1, 3, { r: 0.5 }),
    s('flagship', 3, 4, { kind: 'flagship', r: 0.4 }),
    s('other-type', 1, 2, { type: 'county' }),
    s('unrelated', 8, 9),
  ];

  test('lists stories charting a topic statistic, the focused one first', () => {
    const { stories: list, focusOnly } = storiesForTopic(
      stories,
      'state',
      [1, 3],
      1
    );
    expect(slugs(list)).toEqual(['pair-strong', 'pair-weak', 'flagship']);
    expect(focusOnly).toBe(false);
  });

  test('says "this statistic" only when every story uses the focused one', () => {
    const { stories: list, focusOnly } = storiesForTopic(
      stories,
      'state',
      [1, 3],
      1,
      2
    );
    expect(slugs(list)).toEqual(['pair-strong', 'pair-weak']);
    expect(focusOnly).toBe(true);
  });

  test('without a focus, hand-written stories come first', () => {
    const { stories: list } = storiesForTopic(stories, 'state', [1, 3], null);
    expect(list[0].slug).toBe('flagship');
  });

  test('a topic no story uses gets none', () => {
    const out = storiesForTopic(stories, 'state', [42], 42);
    expect(out.stories).toEqual([]);
    expect(out.focusOnly).toBe(false);
  });
});

describe('storiesForPlace', () => {
  const stories = [
    s('f1', 1, 2, { kind: 'flagship' }),
    s('f2', 1, 3, { kind: 'flagship' }),
    s('f3', 2, 3, { kind: 'flagship' }),
    s('p1', 1, 4),
    s('p2', 2, 4),
    s('p3', 3, 4),
    s('p4', 9, 4),
    s('county', 1, 2, { type: 'county', kind: 'flagship' }),
  ];
  // The place has no value for metric 9, so p4's chart does not include it.
  const charted = (x: Story) => x.xId !== 9;

  test('takes half hand-written stories and half pair articles that chart the place', () => {
    const out = storiesForPlace(stories, 'state', charted, 0);
    expect(slugs(out)).toEqual(['f1', 'f2', 'p1', 'p2']);
    expect(slugs(out)).not.toContain('p4');
    expect(slugs(out)).not.toContain('county');
  });

  test('neighbouring places start at different stories, so every story gets linked', () => {
    const linked = new Set<string>();
    for (let seed = 0; seed < 6; seed++)
      for (const x of storiesForPlace(stories, 'state', charted, seed))
        linked.add(x.slug);
    expect([...linked].sort()).toEqual(['f1', 'f2', 'f3', 'p1', 'p2', 'p3']);
  });

  test('fills from the other kind when one runs short', () => {
    const out = storiesForPlace(
      stories.filter((x) => x.kind === 'pair'),
      'state',
      () => true,
      0
    );
    expect(out).toHaveLength(4);
  });
});

describe('furtherReading', () => {
  const stories = [
    s('a-state', 1, 2),
    s('b-state', 5, 6, { cats: ['health'] }),
    s('c-state', 7, 8, { cats: ['health'] }),
    s('d-county', 1, 2, { type: 'county' }),
    s('e-state', 1, 9, { kind: 'flagship' }),
  ];

  test('suggests three other stories, closest first, never the story itself', () => {
    const out = slugs(furtherReading(stories, 'a-state'));
    expect(out).toHaveLength(3);
    expect(out).not.toContain('a-state');
    // Both statistics on another place type, or one statistic on the same type (a hand-written
    // story): equally close, so both come before the ring neighbour b-state.
    expect(out.slice(0, 2).sort()).toEqual(['d-county', 'e-state']);
    expect(out[2]).toBe('b-state');
  });

  test('always includes the next story of the same type, so each story has a link from another', () => {
    expect(slugs(furtherReading(stories, 'a-state'))).toContain('b-state');
    const inbound = new Map<string, number>();
    for (const x of stories)
      for (const y of furtherReading(stories, x.slug))
        inbound.set(y.slug, (inbound.get(y.slug) ?? 0) + 1);
    for (const x of stories)
      expect(inbound.get(x.slug) ?? 0).toBeGreaterThan(0);
  });

  test('an unknown story gets no list', () => {
    expect(furtherReading(stories, 'missing')).toEqual([]);
  });
});

describe('story metrics', () => {
  const DATA = join(import.meta.dir, '..', 'public', 'data', 'stories');
  const index = JSON.parse(
    readFileSync(join(DATA, 'index.json'), 'utf8')
  ) as StorySummary[];

  test('every published story charts only statistics in STORY_METRICS', () => {
    for (const x of index) {
      expect(STORY_METRICS.has(x.xId)).toBe(true);
      expect(STORY_METRICS.has(x.yId)).toBe(true);
    }
    expect(mayHaveStories([1, 2, 3])).toBe(false);
    expect(mayHaveStories([1, index[0].yId])).toBe(true);
  });

  test('every hand-written story definition has a published story', () => {
    for (const def of STORY_DEFS)
      expect(existsSync(join(DATA, `${def.slug}.json`))).toBe(true);
  });

  test('every published story is in the further reading of another story', () => {
    const linked = new Set(
      index.flatMap((x) => furtherReading(index, x.slug).map((y) => y.slug))
    );
    expect(index.filter((x) => !linked.has(x.slug)).map((x) => x.slug)).toEqual(
      []
    );
  });
});
