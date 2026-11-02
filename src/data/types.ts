// Shapes of the static JSON produced by scripts/build-data.mjs (served from /data).

export type EntityType = 'country' | 'state' | 'city' | 'world-city' | 'county'

export const ENTITY_TYPES: readonly EntityType[] = ['country', 'state', 'city', 'world-city', 'county']

export function isEntityType(v: unknown): v is EntityType {
  return typeof v === 'string' && (ENTITY_TYPES as readonly string[]).includes(v)
}

export interface EntityTypeInfo {
  id: EntityType
  label: string
  singular: string
  /** worldpopulationreview.com path prefix, e.g. "country-rankings" */
  prefix: string
  entities: number
  metrics: number
  numericMetrics: number
  topics: number
}

export interface CategoryInfo {
  id: string
  label: string
  topics: number
}

export interface Manifest {
  generatedAt: string
  source: string
  types: EntityTypeInfo[]
  categories: CategoryInfo[]
}

/** A place: country, state, city, county. Order in entities.json is population-descending. */
export interface Entity {
  /** Stable id: ISO3 for countries, USPS code for states, slug for cities, FIPS for counties */
  id: string
  name: string
  /** URL slug, unique within the type */
  slug: string
  /** lowercase flag code: ISO2 for countries, state code for states/cities/counties */
  flag: string | null
  /** Grouping used for colour/filtering: continent (countries), census region (states), country (world cities) */
  group: string | null
  sub?: string
  pop?: number
  lat?: number
  lng?: number
  /** 2-digit state FIPS (states only) */
  fips?: string
}

export type MetricKind = 'num' | 'cat' | 'text'
/** 1 = higher is better, -1 = lower is better, 0 = neutral/unknown */
export type Polarity = 1 | -1 | 0

export interface Metric {
  /** Source metric id (negative for synthetic base metrics such as population) */
  id: number
  key: string
  label: string
  /** Source display format, see src/lib/format.ts */
  fmt: string | null
  unit: string | null
  kind: MetricKind
  pol: Polarity
  /** Default year used in values.json (null = undated) */
  year: number | null
  /** All years available in topic files */
  years: number[]
  /** Number of entities with a value at the default year */
  n: number
  /** Topic slugs containing this metric; first is the primary (most focused) topic */
  topics: string[]
  cats: string[]
  updated: string | null
  /** Bookkeeping column such as "Data Year" — hide from pickers by default */
  meta?: boolean
  /** Synthetic metric derived from entity attributes */
  base?: boolean
  cats_values?: string[]
}

/** values.json: default-year values, sparse: [metricId, entityIndexes, values] */
export interface ValuesFile {
  entityCount: number
  metrics: [number, number[], (number | string)[]][]
}

export interface TopicSummary {
  slug: string
  type: EntityType
  title: string
  cats: string[]
  metrics: number[]
  /** number of entities covered */
  n: number
  updated: string | null
}

export interface TopicSource {
  name: string
  url: string
}

export interface TopicTable {
  name: string
  metrics: number[]
}

/** <type>/topics/<slug>.json */
export interface TopicFile {
  slug: string
  type: EntityType
  title: string
  cats: string[]
  updated: string | null
  /** Original page on worldpopulationreview.com */
  url: string
  sources: TopicSource[]
  related: { type: EntityType; slug: string }[]
  tables: TopicTable[]
  metrics: number[]
  /** entity indexes (into entities.json) present on this topic */
  entities: number[]
  /** metricId -> year ("_" when undated) -> [entityIndexes, values] */
  series: Record<string, Record<string, [number[], (number | string)[]]>>
}
