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
import { placeSummary, topicSummary } from '../src/seo/content';
import {
  canonicalTopicSlug,
  isIndexablePlace,
  isIndexableTopic,
  MIN_PLACE_METRICS,
  MIN_TOPIC_PLACES,
  MIN_WIDELY_RANKED_METRICS,
  SEPARATE_DUPLICATES,
  TOPIC_ALIASES,
  topicCoverage,
} from '../src/seo/indexing';

const DATA = join(import.meta.dir, '../public/data');
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(join(DATA, path), 'utf8')) as T;

const manifest = read<Manifest>('manifest.json');
const topicsIndex = read<TopicSummary[]>('topics.json');
const topicFile = (type: string, slug: string): TopicFile =>
  read<TopicFile>(`${type}/topics/${slug}.json`);

const datasets = new Map<EntityType, Dataset>();
function dataset(type: EntityType): Dataset {
  const cached = datasets.get(type);
  if (cached != null) return cached;
  const info = manifest.types.find((t) => t.id === type);
  if (info == null) throw new Error(`no type ${type}`);
  const ds = new Dataset(
    info,
    read<Entity[]>(`${type}/entities.json`),
    read<Metric[]>(`${type}/metrics.json`),
    read<ValuesFile>(`${type}/values.json`),
    topicsIndex
  );
  datasets.set(type, ds);
  return ds;
}

/** "<sorted metric ids>|<sorted entity indexes>": equal for exact duplicates. */
const shapeOf = (t: TopicFile): string =>
  `${[...t.metrics].sort((a, b) => a - b).join(',')}|${[...t.entities].sort((a, b) => a - b).join(',')}`;

describe('topicCoverage', () => {
  const kinds = new Map<number, Pick<Metric, 'kind' | 'meta'>>([
    [1, { kind: 'num' }],
    [2, { kind: 'cat' }],
    [3, { kind: 'text' }],
    [4, { kind: 'num', meta: true }],
  ]);
  const series = (
    n: number,
    v: number | string
  ): [number[], (number | string)[]] => [
    Array.from({ length: n }, (_, i) => i),
    Array.from({ length: n }, () => v),
  ];

  test('takes the best-covered year of each kind and skips text, bookkeeping and unknown metrics', () => {
    const coverage = topicCoverage(
      {
        metrics: [1, 2, 3, 4, 5],
        series: {
          '1': { '2020': series(4, 1.5), '2021': series(12, 2) },
          '2': { _: series(9, 'Yes') },
          '3': { _: series(40, 'a long note') },
          '4': { _: series(40, 2024) },
          '5': { _: series(40, 7) },
        },
      },
      (id) => kinds.get(id)
    );
    expect(coverage).toEqual({ numeric: 12, categorical: 9 });
  });

  test('counts only numbers for numeric metrics and non-empty cells for categorical ones', () => {
    const coverage = topicCoverage(
      {
        metrics: [1, 2],
        series: {
          '1': {
            _: [
              [0, 1, 2],
              [3, 'n/a', 4],
            ],
          },
          '2': {
            _: [
              [0, 1, 2],
              ['Yes', '', 'No'],
            ],
          },
        },
      },
      (id) => kinds.get(id)
    );
    expect(coverage).toEqual({ numeric: 2, categorical: 2 });
  });
});

describe('isIndexableTopic', () => {
  test(`needs a numeric or categorical metric covering ${MIN_TOPIC_PLACES} places`, () => {
    expect(
      isIndexableTopic({ numeric: MIN_TOPIC_PLACES, categorical: 0 })
    ).toBe(true);
    expect(
      isIndexableTopic({ numeric: 0, categorical: MIN_TOPIC_PLACES })
    ).toBe(true);
    expect(
      isIndexableTopic({
        numeric: MIN_TOPIC_PLACES - 1,
        categorical: MIN_TOPIC_PLACES - 1,
      })
    ).toBe(false);
  });
});

describe('isIndexablePlace', () => {
  test('needs enough metrics and enough widely ranked ones', () => {
    expect(isIndexablePlace(MIN_PLACE_METRICS, MIN_WIDELY_RANKED_METRICS)).toBe(
      true
    );
    expect(isIndexablePlace(MIN_PLACE_METRICS - 1, 50)).toBe(false);
    expect(isIndexablePlace(200, MIN_WIDELY_RANKED_METRICS - 1)).toBe(false);
  });
});

describe('canonicalTopicSlug', () => {
  test('maps an alias to its primary and leaves other pages alone', () => {
    expect(canonicalTopicSlug('country', 'gypsy-population-by-country')).toBe(
      'roma-population-by-country'
    );
    expect(canonicalTopicSlug('country', 'roma-population-by-country')).toBe(
      'roma-population-by-country'
    );
    // Aliases are per type: a state slug never matches a country alias.
    expect(canonicalTopicSlug('state', 'gypsy-population-by-country')).toBe(
      'gypsy-population-by-country'
    );
  });

  test('is safe for any URL segment', () => {
    expect(canonicalTopicSlug('__proto__', 'toString')).toBe('toString');
    expect(canonicalTopicSlug('constructor', 'name')).toBe('name');
  });
});

describe('TOPIC_ALIASES against the data', () => {
  const bySlug = new Map(topicsIndex.map((t) => [`${t.type}/${t.slug}`, t]));
  const aliases = Object.entries(TOPIC_ALIASES).flatMap(([type, map]) =>
    Object.entries(map ?? {}).map(([alias, primary]) => ({
      type,
      alias,
      primary,
    }))
  );

  test('every alias retitles an existing primary that is not itself an alias', () => {
    for (const { type, alias, primary } of aliases) {
      expect(bySlug.has(`${type}/${alias}`)).toBe(true);
      expect(bySlug.has(`${type}/${primary}`)).toBe(true);
      expect(canonicalTopicSlug(type, primary)).toBe(primary);
      expect(`${type}/${alias}: ${shapeOf(topicFile(type, alias))}`).toBe(
        `${type}/${alias}: ${shapeOf(topicFile(type, primary))}`
      );
    }
  });

  test('every group of exact-duplicate topics is decided', () => {
    const groups = new Map<string, string[]>();
    for (const t of topicsIndex) {
      const key = `${t.type}|${shapeOf(topicFile(t.type, t.slug))}`;
      groups.set(key, [...(groups.get(key) ?? []), `${t.type}/${t.slug}`]);
    }
    const separate = new Set(
      SEPARATE_DUPLICATES.map((g) => [...g].sort().join(' '))
    );
    const undecided: string[] = [];
    let duplicates = 0;
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      duplicates++;
      // Pages that keep their own canonical: one primary, or one per end / value.
      const own = members
        .filter((p) => {
          const [type = '', slug = ''] = p.split('/');
          return canonicalTopicSlug(type, slug) === slug;
        })
        .sort();
      if (own.length > 1 && !separate.has(own.join(' ')))
        undecided.push(members.join(' '));
    }
    expect(undecided).toEqual([]);
    // Every SEPARATE_DUPLICATES entry still names one real duplicate group.
    expect(duplicates).toBeGreaterThanOrEqual(SEPARATE_DUPLICATES.length);
    for (const group of SEPARATE_DUPLICATES) {
      const keys = new Set(
        group.map((p) => {
          const [type = '', slug = ''] = p.split('/');
          return `${type}|${shapeOf(topicFile(type, slug))}`;
        })
      );
      expect(`${group.join(' ')}: ${keys.size}`).toBe(`${group.join(' ')}: 1`);
    }
  });
});

describe('topicSummary noindex', () => {
  const noindex = (type: EntityType, slug: string): boolean =>
    topicSummary(topicFile(type, slug), dataset(type), manifest.categories)
      .noindex;

  test('indexes topics with a numeric or categorical metric covering 10 places', () => {
    expect(noindex('state', 'median-household-income-by-state')).toBe(false);
    // Categorical only: abortion legal status for every state.
    expect(noindex('state', 'abortion-laws-by-state')).toBe(false);
  });

  test('marks topics about a handful of places noindex', () => {
    expect(
      topicFile('state', 'almond-production-by-state').entities.length
    ).toBeLessThan(10);
    expect(noindex('state', 'almond-production-by-state')).toBe(true);
    expect(noindex('country', 'is-turkey-a-muslim-country')).toBe(true);
  });
});

describe('placeSummary noindex', () => {
  const noindex = (type: EntityType, slug: string): boolean => {
    const ds = dataset(type);
    const i = ds.entityBySlug.get(slug);
    if (i == null) throw new Error(`no ${type} ${slug}`);
    return placeSummary(ds, i).noindex;
  };

  test('indexes places with widely ranked metrics', () => {
    expect(noindex('country', 'japan')).toBe(false);
    expect(noindex('state', 'texas')).toBe(false);
    expect(noindex('county', 'autauga-county-al')).toBe(false);
  });

  test('marks world cities, which have no widely ranked metric, noindex', () => {
    expect(noindex('world-city', 'adana')).toBe(true);
    expect(noindex('world-city', 'tokyo')).toBe(true);
  });
});
