import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  Entity,
  Manifest,
  Metric,
  SearchCatalog,
  TopicSummary,
} from '../src/data/types';
import {
  featuredMetricIds,
  featuredTopicKeys,
} from '../src/features/home/presets';
import {
  fromSearchCatalog,
  toSearchCatalog,
} from '../src/features/search/searchCatalog';
import {
  categoryDocs,
  categoryLabelMap,
  metricDocs,
  placeDocs,
  type RankedResult,
  SearchIndex,
  topicDocs,
  topicTitleMap,
} from '../src/features/search/searchIndex';
import type { SearchMetric } from '../src/features/search/searchMetric';
import { isSearchableMetric } from '../src/features/search/searchMetric';

const DATA = join(import.meta.dir, '..', 'public', 'data');

function read<T>(path: string): T {
  return JSON.parse(readFileSync(join(DATA, path), 'utf8')) as T;
}

const manifest = read<Manifest>('manifest.json');

/**
 * Builds the whole search index the way the app does, taking each place type's metrics from
 * `metricsOf`: the full metrics.json (what search used to download) or the compact search.json.
 */
function buildIndex(
  metricsOf: (type: string) => readonly SearchMetric[]
): SearchIndex {
  const topics = read<TopicSummary[]>('topics.json');
  const titles = topicTitleMap(topics);
  const cats = categoryLabelMap(manifest);
  const index = new SearchIndex();
  index.add('categories', categoryDocs(manifest));
  index.add(
    'topics',
    topicDocs(topics, manifest, { featured: featuredTopicKeys() })
  );
  for (const info of manifest.types) {
    index.add(
      `places:${info.id}`,
      placeDocs(info, read<Entity[]>(`${info.id}/entities.json`))
    );
    index.add(
      `metrics:${info.id}`,
      metricDocs(info, metricsOf(info.id), titles, cats, {
        featured: featuredMetricIds(info.id),
      })
    );
  }
  return index;
}

/** What a result list shows: ids in order, scores, match quality and folded variants. */
const summary = (results: readonly RankedResult[]) =>
  results.map((r) => ({
    id: r.doc.id,
    score: r.score,
    quality: r.quality,
    variants: r.variants.map((v) => v.id),
  }));

describe('search catalog', () => {
  test('round-trips the searchable fields of a catalog', () => {
    const metrics: Metric[] = [
      {
        id: 7,
        key: 'Income',
        label: 'Median Income',
        fmt: 'moneyWithCurrency',
        unit: null,
        kind: 'num',
        pol: 1,
        year: 2024,
        years: [2023, 2024],
        n: 50,
        topics: ['median-income-by-state', 'richest-states'],
        cats: ['economics'],
        updated: null,
      },
      {
        id: 8,
        key: 'Bird',
        label: 'State Bird',
        fmt: null,
        unit: null,
        kind: 'cat',
        pol: 0,
        year: null,
        years: [],
        n: 50,
        topics: ['state-birds', 'richest-states'],
        cats: ['environment', 'economics'],
        updated: null,
      },
      {
        id: 9,
        key: 'DataYear',
        label: 'Data Year',
        fmt: 'year',
        unit: null,
        kind: 'num',
        pol: 0,
        year: null,
        years: [],
        n: 50,
        topics: ['state-birds'],
        cats: [],
        updated: null,
        meta: true,
      },
      {
        id: -1,
        key: 'population',
        label: 'Population',
        fmt: 'numberWithCommas',
        unit: 'people',
        kind: 'num',
        pol: 0,
        year: null,
        years: [],
        n: 51,
        topics: [],
        cats: ['population'],
        updated: null,
        base: true,
      },
    ];
    const catalog = toSearchCatalog(metrics);
    expect(catalog.topics).toEqual([
      'median-income-by-state',
      'richest-states',
      'state-birds',
    ]);
    expect(catalog.metrics.map((r) => r[0])).toEqual([7, 8, -1]);
    const back = fromSearchCatalog(
      JSON.parse(JSON.stringify(catalog)) as SearchCatalog
    );
    expect(back).toEqual([
      {
        id: 7,
        label: 'Median Income',
        kind: 'num',
        n: 50,
        topics: ['median-income-by-state', 'richest-states'],
        cats: ['economics'],
        unit: null,
        year: 2024,
      },
      {
        id: 8,
        label: 'State Bird',
        kind: 'cat',
        n: 50,
        topics: ['state-birds', 'richest-states'],
        cats: ['environment', 'economics'],
        unit: null,
        year: null,
      },
      {
        id: -1,
        label: 'Population',
        kind: 'num',
        n: 51,
        topics: [],
        cats: ['population'],
        unit: 'people',
        year: null,
        base: true,
      },
    ]);
  });

  test('every committed search.json matches its metrics.json', () => {
    for (const info of manifest.types) {
      const metrics = read<Metric[]>(`${info.id}/metrics.json`);
      const catalog = read<SearchCatalog>(`${info.id}/search.json`);
      expect(catalog).toEqual(toSearchCatalog(metrics));
      expect(catalog.metrics.length).toBe(
        metrics.filter(isSearchableMetric).length
      );
    }
  });

  test('finds the same results as the full metric catalogs', () => {
    const full = buildIndex((type) => read<Metric[]>(`${type}/metrics.json`));
    const compact = buildIndex((type) =>
      fromSearchCatalog(read<SearchCatalog>(`${type}/search.json`))
    );
    expect(compact.docs.size).toBe(full.docs.size);
    for (const q of [
      'income',
      'median household income',
      'gdp per capita',
      'crime rate',
      'happiest states',
      'life expectancy',
      'unemployment',
      'property tax',
      'population',
      'healthcare rank',
      'california',
      'nba',
    ]) {
      const want = summary(full.search(q));
      expect(want.length).toBeGreaterThan(0);
      expect(summary(compact.search(q))).toEqual(want);
    }
  });
});
