// What a place profile reads, worked out once from the whole place type. A profile ranks one
// place on every statistic it has, which takes every place's value of every statistic (country
// values.json alone is about 1 MB gzip), but what it shows depends on far less: this place's
// standing on each statistic, a few facts about the type and its most similar places. The server
// and the bundle script (scripts/page-data.ts) compute those into a `PlacePageData`; the browser
// fetches that file, so a profile downloads tens of kilobytes instead of its type's full data.
// The server renders from the same object the browser receives, so both render the same page.
// The dev server has no such files, so in development the browser builds them itself.

import { type QueryClient, queryOptions } from '@tanstack/react-query';

import {
  datasetFacts,
  growthMetricId,
  similarityBasisFor,
} from './datasetFacts';
import {
  basisCoverage,
  type CoverageCut,
  isPolar,
  metricDirection,
  type PlaceMetric,
  placeStandings,
  type SimilarPlace,
  similarPlaces,
  type Standing,
  standingFrom,
} from './profileModel';
import type { RelatedPlaces } from './relatedPlaces';
import { getJson } from '~/data/api';
import { Dataset, loadDataset, type TopicTitle } from '~/data/dataset';
import type {
  Entity,
  EntityType,
  Manifest,
  Metric,
  ValuesFile,
} from '~/data/types';
import { type PageSummary, placeSummary } from '~/seo/content';
import { loadRelatedPlaces } from '~/seo/place-content';

/** One standing as stored: [metric id, value, places with a value, better, tied, ahead, behind]. */
export type StoredStanding = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** <type>/pages/places/<slug>.json */
export interface PlacePageData {
  /** The place's index in entities.json */
  index: number;
  /** Head tags, summary and quick answers (the route's loader data) */
  seo: PageSummary;
  related: RelatedPlaces;
  /** Catalog entries of every statistic the place has a value for, plus population */
  metrics: Metric[];
  /** The place's standing on each of those statistics, in catalog order (see `standingAt`) */
  standings: StoredStanding[];
  /** Coverage strengths and weak spots need (`datasetFacts().cut`) */
  cut: CoverageCut;
  /** The place's statistics that mostly track population (`datasetFacts().sizeDriven`) */
  sizeDriven: number[];
  /** The place's statistics from top-N lists (`datasetFacts().selectedLists`) */
  selectedLists: number[];
  similar: SimilarPlace[];
  /** Similarity-basis statistics the place has, and the categories they span */
  basisFit: { metrics: number; categories: number };
  /** The type's growth statistic (`growthMetricId`) */
  growth: number | null;
  /** Titles of the topics the place's statistics come from */
  topics: TopicTitle[];
}

/** Where the bundle script writes a place's file, relative to /data. */
export const placePagePath = (type: EntityType, slug: string) =>
  `${type}/pages/places/${slug}.json`;

const POPULATION = -1;

/** Everything a profile shows about the place at `index`, computed from its whole type. */
export function buildPlacePageData(
  full: Dataset,
  index: number,
  related: RelatedPlaces
): PlacePageData {
  const facts = datasetFacts(full);
  const rows = placeStandings(full, index, facts.rankable);
  const ids = new Set(rows.map((r) => r.metric.id));
  const basis = similarityBasisFor(full);
  const cats = new Set<string>();
  basis.columns.forEach((col, k) => {
    if (!Number.isNaN(col[index])) cats.add(basis.categories[k]);
  });
  const named = new Map<string, TopicTitle>();
  for (const r of rows) {
    const slug = r.metric.topics[0];
    const title = slug == null ? null : full.topicTitleOf(slug);
    if (slug != null && title != null && !named.has(slug))
      named.set(slug, { slug, type: full.type.id, title });
  }
  return {
    index,
    seo: placeSummary(full, index),
    related,
    metrics: full.metrics.filter((m) => ids.has(m.id) || m.id === POPULATION),
    standings: rows.map(({ metric, standing: s }) => [
      metric.id,
      s.value,
      s.n,
      s.better,
      s.tied,
      s.aheadOfNext,
      s.behindNext,
    ]),
    cut: facts.cut,
    sizeDriven: [...facts.sizeDriven].filter((id) => ids.has(id)),
    selectedLists: [...facts.selectedLists].filter((id) => ids.has(id)),
    similar: similarPlaces(basis, index, full.entities.length),
    basisFit: { metrics: basisCoverage(basis, index), categories: cats.size },
    growth: growthMetricId(full),
    topics: [...named.values()],
  };
}

/** A place profile's data, ready to render (see `placeView`). */
export interface PlaceView {
  /**
   * The type's places with this place's statistics' catalog entries, topic titles and every
   * place's population (for the locator map); its columns other than population are empty.
   */
  dataset: Dataset;
  index: number;
  /** Every statistic the place has, with its standing (as `placeStandings` returns) */
  rows: PlaceMetric[];
  facts: {
    cut: CoverageCut;
    sizeDriven: ReadonlySet<number>;
    selectedLists: ReadonlySet<number>;
  };
  similar: SimilarPlace[];
  basisFit: { metrics: number; categories: number };
  growth: number | null;
  /** The place's value of a statistic, NaN without one */
  value: (id: number) => number;
  /** Its standing with the highest value first (`standingAt(col, index, 1)`), null without one */
  highest: (id: number) => Standing | null;
}

/**
 * The population column every place type derives from its entities (the synthetic metric -1),
 * rebuilt from entities.json so the locator map needs no values file.
 */
export function populationRow(
  entities: readonly Entity[]
): ValuesFile['metrics'][number] {
  const idx: number[] = [];
  const vals: number[] = [];
  entities.forEach((e, i) => {
    if (typeof e.pop === 'number') {
      idx.push(i);
      vals.push(e.pop);
    }
  });
  return [POPULATION, idx, vals];
}

const views = new WeakMap<PlacePageData, PlaceView>();

/** Turns a place's stored data back into the rows, facts and lookups the profile renders. */
export function placeView(
  manifest: Manifest,
  type: EntityType,
  entities: Entity[],
  data: PlacePageData
): PlaceView {
  const hit = views.get(data);
  if (hit != null) return hit;
  const info = manifest.types.find((t) => t.id === type);
  if (info == null) throw new Error(`Unknown entity type ${type}`);
  const dataset = new Dataset(
    info,
    entities,
    data.metrics,
    { entityCount: entities.length, metrics: [populationRow(entities)] },
    data.topics
  );
  const rows: PlaceMetric[] = [];
  const byId = new Map<number, PlaceMetric>();
  for (const [id, value, n, better, tied, ahead, behind] of data.standings) {
    const metric = dataset.metric(id);
    if (metric == null) continue;
    const row: PlaceMetric = {
      metric,
      standing: standingFrom(value, n, better, tied, ahead, behind),
      direction: metricDirection(metric),
      polar: isPolar(metric),
    };
    rows.push(row);
    byId.set(id, row);
  }
  const view: PlaceView = {
    dataset,
    index: data.index,
    rows,
    facts: {
      cut: data.cut,
      sizeDriven: new Set(data.sizeDriven),
      selectedLists: new Set(data.selectedLists),
    },
    similar: data.similar,
    basisFit: data.basisFit,
    growth: data.growth,
    value: (id) => byId.get(id)?.standing.value ?? Number.NaN,
    highest: (id) => {
      const row = byId.get(id);
      if (row == null) return null;
      const s = row.standing;
      // Ranked the other way, the places "better" than this one are the lower values, so the
      // ones above it are those it beats.
      return row.direction === 1
        ? s
        : standingFrom(
            s.value,
            s.n,
            s.worse,
            s.tied,
            s.behindNext,
            s.aheadOfNext
          );
    },
  };
  views.set(data, view);
  return view;
}

/** Builds a place's data from the whole place type (server rendering and development). */
async function buildFromFull(
  qc: QueryClient,
  type: EntityType,
  slug: string
): Promise<PlacePageData> {
  const full = await loadDataset(qc, type);
  const index = full.entityBySlug.get(slug);
  if (index == null) throw new Error(`Unknown place ${type}/${slug}`);
  const related = await loadRelatedPlaces(qc, type, full.entities[index]);
  return buildPlacePageData(full, index, related);
}

/**
 * A place's data: built from the whole type while server rendering and on the dev server,
 * fetched from the file the bundle script wrote everywhere else.
 */
export const placePageQuery = (
  qc: QueryClient,
  type: EntityType,
  slug: string
) =>
  queryOptions({
    queryKey: ['place-page', type, slug],
    queryFn: () =>
      import.meta.env.SSR || import.meta.env.DEV
        ? buildFromFull(qc, type, slug)
        : getJson<PlacePageData>(placePagePath(type, slug)),
    staleTime: Infinity,
    gcTime: Infinity,
  });
