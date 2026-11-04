import { type QueryClient, useSuspenseQueries } from '@tanstack/react-query';

import {
  entitiesQuery,
  manifestQuery,
  metricsQuery,
  topicsIndexQuery,
  valuesQuery,
} from './api';
import type {
  Entity,
  EntityType,
  EntityTypeInfo,
  Manifest,
  Metric,
  TopicSummary,
  ValuesFile,
} from './types';

/** What a Dataset reads from a topic summary: its place type, slug and title. */
export type TopicTitle = Pick<TopicSummary, 'slug' | 'type' | 'title'>;

/**
 * Everything needed to analyse one entity type, with fast lookups.
 * Columns are materialised lazily: `numeric(id)` returns a Float64Array aligned to `entities`
 * with NaN for missing values; `text(id)` returns string|null per entity.
 */
export class Dataset {
  readonly type: EntityTypeInfo;
  readonly entities: Entity[];
  readonly metrics: Metric[];
  readonly entityIndex = new Map<string, number>();
  readonly entityBySlug = new Map<string, number>();
  readonly metricById = new Map<number, Metric>();
  /** Distinct entity groups (continents / census regions / countries), most common first */
  readonly groups: string[];
  private readonly raw = new Map<number, [number[], (number | string)[]]>();
  private readonly numCache = new Map<number, Float64Array>();
  private readonly textCache = new Map<number, (string | null)[]>();
  private readonly topicTitle: Map<string, string>;

  constructor(
    type: EntityTypeInfo,
    entities: Entity[],
    metrics: Metric[],
    values: ValuesFile,
    topics: readonly TopicTitle[]
  ) {
    this.type = type;
    this.entities = entities;
    this.metrics = metrics;
    entities.forEach((e, i) => {
      this.entityIndex.set(e.id, i);
      this.entityBySlug.set(e.slug, i);
    });
    for (const m of metrics) this.metricById.set(m.id, m);
    for (const [id, idx, vals] of values.metrics) this.raw.set(id, [idx, vals]);
    const counts = new Map<string, number>();
    for (const e of entities)
      if (e.group) counts.set(e.group, (counts.get(e.group) ?? 0) + 1);
    this.groups = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g);
    this.topicTitle = new Map(
      topics.filter((t) => t.type === type.id).map((t) => [t.slug, t.title])
    );
  }

  metric(id: number): Metric | undefined {
    return this.metricById.get(id);
  }

  /** Title of the topic a metric primarily belongs to (useful to disambiguate short labels). */
  metricContext(id: number): string | null {
    const m = this.metricById.get(id);
    const slug = m?.topics[0];
    return slug ? (this.topicTitle.get(slug) ?? null) : null;
  }

  topicTitleOf(slug: string): string | null {
    return this.topicTitle.get(slug) ?? null;
  }

  /** "Label — Topic" when the label alone is ambiguous or short. */
  metricFullLabel(id: number): string {
    const m = this.metricById.get(id);
    if (m == null) return `Metric ${id}`;
    const ctx = this.metricContext(id);
    if (!ctx || ctx.toLowerCase().includes(m.label.toLowerCase()))
      return m.label;
    return `${m.label} — ${ctx}`;
  }

  hasValues(id: number): boolean {
    return this.raw.has(id);
  }

  /** The default-year values of one metric as stored in values.json, or undefined without any. */
  row(id: number): [number[], (number | string)[]] | undefined {
    return this.raw.get(id);
  }

  numeric(id: number): Float64Array {
    let col = this.numCache.get(id);
    if (col != null) return col;
    col = new Float64Array(this.entities.length).fill(NaN);
    const r = this.raw.get(id);
    if (r != null) {
      const [idx, vals] = r;
      for (let k = 0; k < idx.length; k++) {
        const v = vals[k];
        if (typeof v === 'number') col[idx[k]] = v;
      }
    }
    this.numCache.set(id, col);
    return col;
  }

  text(id: number): (string | null)[] {
    let col = this.textCache.get(id);
    if (col != null) return col;
    col = new Array<string | null>(this.entities.length).fill(null);
    const r = this.raw.get(id);
    if (r != null) {
      const [idx, vals] = r;
      for (let k = 0; k < idx.length; k++) col[idx[k]] = String(vals[k]);
    }
    this.textCache.set(id, col);
    return col;
  }

  /** Raw value of one metric for one entity index. */
  value(id: number, entityIndex: number): number | string | null {
    const m = this.metricById.get(id);
    if (m == null) return null;
    if (m.kind === 'num') {
      const v = this.numeric(id)[entityIndex];
      return Number.isNaN(v) ? null : v;
    }
    return this.text(id)[entityIndex];
  }

  /** Numeric, non-meta metrics, most covered first. */
  numericMetrics(minCoverage = 0): Metric[] {
    return this.metrics.filter(
      (m) => m.kind === 'num' && m.meta !== true && m.n >= minCoverage
    );
  }
}

const cache = new WeakMap<ValuesFile, Dataset>();

function build(
  manifest: Manifest,
  type: EntityType,
  entities: Entity[],
  metrics: Metric[],
  values: ValuesFile,
  topics: TopicSummary[]
) {
  let ds = cache.get(values);
  if (ds == null) {
    const info = manifest.types.find((t) => t.id === type);
    if (info == null) throw new Error(`Unknown entity type ${type}`);
    ds = new Dataset(info, entities, metrics, values, topics);
    cache.set(values, ds);
  }
  return ds;
}

/** Suspense hook: loads (or reuses) everything for an entity type. */
export function useDataset(type: EntityType): Dataset {
  const [manifest, topics, entities, metrics, values] = useSuspenseQueries({
    queries: [
      manifestQuery,
      topicsIndexQuery,
      entitiesQuery(type),
      metricsQuery(type),
      valuesQuery(type),
    ],
  });
  return build(
    manifest.data,
    type,
    entities.data,
    metrics.data,
    values.data,
    topics.data
  );
}

/** Whether everything `useDataset(type)` reads is already loaded, so it would not suspend. */
export function isDatasetLoaded(qc: QueryClient, type: EntityType): boolean {
  return [
    manifestQuery.queryKey,
    topicsIndexQuery.queryKey,
    entitiesQuery(type).queryKey,
    metricsQuery(type).queryKey,
    valuesQuery(type).queryKey,
  ].every((key) => qc.getQueryData(key) !== undefined);
}

/** For route loaders: prefetch everything `useDataset(type)` needs. */
export async function loadDataset(
  qc: QueryClient,
  type: EntityType
): Promise<Dataset> {
  const [manifest, topics, entities, metrics, values] = await Promise.all([
    qc.ensureQueryData(manifestQuery),
    qc.ensureQueryData(topicsIndexQuery),
    qc.ensureQueryData(entitiesQuery(type)),
    qc.ensureQueryData(metricsQuery(type)),
    qc.ensureQueryData(valuesQuery(type)),
  ]);
  return build(manifest, type, entities, metrics, values, topics);
}
