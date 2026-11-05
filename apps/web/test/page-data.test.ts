// The per-page data slices (features/topic/pageData.ts, features/places/pageData.ts) must give
// a page exactly what the whole place type gives it, since the server renders from the slice
// and the browser hydrates from the same slice fetched as a file. These tests check that on the
// committed dataset, and the small helpers on hand-made fixtures.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Dataset } from '../src/data/dataset';
import {
  sameRow,
  seriesRow,
  topicDataset,
  topicPageMetricIds,
} from '../src/data/topicPage';
import type {
  Entity,
  EntityType,
  Manifest,
  Metric,
  TopicFile,
  TopicSummary,
  ValuesFile,
} from '../src/data/types';
import { glanceStats } from '../src/features/places/AtAGlance';
import { datasetFacts } from '../src/features/places/datasetFacts';
import {
  buildPlacePageData,
  type PlacePageData,
  placeView,
  populationRow,
} from '../src/features/places/pageData';
import {
  placeStandings,
  standingAt,
} from '../src/features/places/profileModel';
import { relatedPlaces } from '../src/features/places/relatedPlaces';
import { headlineOverride } from '../src/features/topic/headline';
import { buildTopicPageData } from '../src/features/topic/pageData';
import { topicSummary } from '../src/seo/content';

const DATA = join(import.meta.dir, '../public/data');
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(join(DATA, path), 'utf8')) as T;

const manifest = read<Manifest>('manifest.json');
const index = read<TopicSummary[]>('topics.json');
const entityLists = Object.fromEntries(
  manifest.types.map((t) => [t.id, read<Entity[]>(`${t.id}/entities.json`)])
) as Record<EntityType, Entity[]>;

const fulls = new Map<EntityType, Dataset>();
function full(type: EntityType): Dataset {
  let ds = fulls.get(type);
  if (ds == null) {
    const info = manifest.types.find((t) => t.id === type);
    if (info == null) throw new Error(`no type ${type}`);
    ds = new Dataset(
      info,
      entityLists[type],
      read<Metric[]>(`${type}/metrics.json`),
      read<ValuesFile>(`${type}/values.json`),
      index
    );
    fulls.set(type, ds);
  }
  return ds;
}

/** A value through JSON and back, as the browser receives a page file. */
const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const metric = (id: number, extra: Partial<Metric> = {}): Metric => ({
  id,
  key: `m${id}`,
  label: `Metric ${id}`,
  fmt: null,
  unit: null,
  kind: 'num',
  pol: 1,
  year: 2024,
  years: [2023, 2024],
  n: 3,
  topics: ['t'],
  cats: [],
  updated: null,
  ...extra,
});

describe('seriesRow', () => {
  const topic = {
    series: {
      '1': {
        '2024': [
          [0, 2, 3],
          [5, 'n/a', 7],
        ],
        '2023': [[0], [1]],
      },
      '2': {
        _: [
          [1, 4],
          [3, 'High'],
        ],
      },
    },
  } as unknown as Pick<TopicFile, 'series'>;

  test('reads the default year and keeps only numbers for a numeric metric', () => {
    expect(seriesRow(topic, metric(1))).toEqual([
      [0, 3],
      [5, 7],
    ]);
  });

  test('reads the undated series as text for a categorical metric', () => {
    expect(seriesRow(topic, metric(2, { kind: 'cat', year: null }))).toEqual([
      [1, 4],
      ['3', 'High'],
    ]);
  });

  test('is null without a series at the default year', () => {
    expect(seriesRow(topic, metric(1, { year: 2020 }))).toBeNull();
    expect(seriesRow(topic, metric(9))).toBeNull();
  });

  test('sameRow compares places and values in order', () => {
    expect(
      sameRow(
        [
          [1, 2],
          [3, 4],
        ],
        [
          [1, 2],
          [3, 4],
        ]
      )
    ).toBe(true);
    expect(
      sameRow(
        [
          [1, 2],
          [3, 4],
        ],
        [
          [1, 2],
          [3, 5],
        ]
      )
    ).toBe(false);
    expect(
      sameRow(
        [[1], [3]],
        [
          [1, 2],
          [3, 4],
        ]
      )
    ).toBe(false);
  });
});

describe('topicPageMetricIds', () => {
  test('adds the borrowed headline and the columns adjustments divide by', () => {
    const ids = topicPageMetricIds({ type: 'state', metrics: [10, 11] }, 99);
    expect(ids.slice(0, 3)).toEqual([10, 11, 99]);
    expect(ids).toContain(-1);
    expect(ids.length).toBe(new Set(ids).size);
  });
});

/** Topics to check: the audit's pages and a spread of each type. */
function sampleTopics(): TopicSummary[] {
  const named = new Set([
    'country/gdp-per-capita-by-country',
    'state/median-household-income-by-state',
    'county/health-of-adults-by-county',
    'county/poorest-counties-in-america',
  ]);
  return index.filter(
    (t, i) => named.has(`${t.type}/${t.slug}`) || i % 97 === 0
  );
}

describe('topic page slices on the committed data', () => {
  for (const t of sampleTopics()) {
    test(`${t.type}/${t.slug} reads the same as the whole type`, () => {
      const ds = full(t.type);
      const topic = read<TopicFile>(`${t.type}/topics/${t.slug}.json`);
      const page = roundTrip(buildTopicPageData(topic, ds, index, new Set()));
      const slice = topicDataset(
        manifest,
        t.type,
        entityLists[t.type],
        topic,
        page
      );
      for (const id of topicPageMetricIds(
        topic,
        headlineOverride(topic)?.metric
      )) {
        expect(slice.metric(id)).toEqual(ds.metric(id));
        expect(slice.hasValues(id)).toBe(ds.hasValues(id));
        if (ds.metric(id)?.kind === 'num')
          expect([...slice.numeric(id)]).toEqual([...ds.numeric(id)]);
        else expect(slice.text(id)).toEqual(ds.text(id));
        expect(slice.metricFullLabel(id)).toBe(ds.metricFullLabel(id));
      }
      // The summary, quick answers and structured data the page shows.
      expect(topicSummary(topic, slice, manifest.categories)).toEqual(
        topicSummary(topic, ds, manifest.categories)
      );
      // Population-tracking statistics decide the per-person adjustment.
      const sized = datasetFacts(ds).sizeDriven;
      const slicedSized = datasetFacts(slice).sizeDriven;
      for (const id of topic.metrics)
        expect(slicedSized.has(id)).toBe(sized.has(id));
    });
  }
});

describe('place pages on the committed data', () => {
  test('every type derives its population column from entities.json', () => {
    for (const t of manifest.types) {
      const row = full(t.id).row(-1);
      expect(row).toBeDefined();
      const [, idx, vals] = populationRow(entityLists[t.id]);
      expect([idx, vals]).toEqual([row?.[0] ?? [], row?.[1] ?? []]);
    }
  });

  const samples: [EntityType, string][] = [
    ['state', 'california'],
    ['county', 'los-angeles-county-ca'],
    ['country', 'japan'],
    ['city', 'milwaukee-wi'],
    ['world-city', 'paris'],
  ];
  for (const [type, slug] of samples) {
    test(`${type}/${slug} profile rows match the whole type`, () => {
      const ds = full(type);
      const i = ds.entityBySlug.get(slug);
      if (i == null) throw new Error(`no place ${slug}`);
      const related = relatedPlaces(type, ds.entities[i], entityLists);
      const data = roundTrip<PlacePageData>(buildPlacePageData(ds, i, related));
      const view = placeView(manifest, type, entityLists[type], data);
      const rows = placeStandings(ds, i, datasetFacts(ds).rankable);
      expect(view.rows).toEqual(rows);
      for (const r of rows) {
        expect(view.highest(r.metric.id)).toEqual(
          standingAt(ds.numeric(r.metric.id), i, 1)
        );
        expect(view.dataset.metricFullLabel(r.metric.id)).toBe(
          ds.metricFullLabel(r.metric.id)
        );
      }
      expect([...view.dataset.numeric(-1)]).toEqual([...ds.numeric(-1)]);
      expect(glanceStats(view)).toEqual(
        glanceStats({
          dataset: ds,
          value: (id) => ds.numeric(id)[i],
          highest: (id) => standingAt(ds.numeric(id), i, 1),
        })
      );
    });
  }
});
