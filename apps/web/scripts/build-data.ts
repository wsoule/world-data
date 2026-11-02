// Turns the cached worldpopulationreview.com pages into the static dataset
// under public/data.
//
//   moonx web:data-build -- [--cache=.cache/pages] [--out=public/data]
//
// Output layout (all JSON, shapes in src/data/types.ts):
//   manifest.json               entity types, categories, build time
//   topics.json                 every topic (source page) with its metric ids
//   <type>/entities.json        the places of that type, population-descending
//   <type>/metrics.json         metric catalog (label, format, years, polarity, topics)
//   <type>/values.json          default-year value of every metric, sparse
//   <type>/topics/<slug>.json   one topic: sources, tables, every year of its metrics
//
// Only data, titles and source citations are kept. Page prose is
// intentionally not copied.

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import type {
  Entity,
  EntityType,
  EntityTypeInfo,
  Manifest,
  Metric,
  MetricKind,
  TopicFile,
  TopicSummary,
  ValuesFile,
} from '../src/data/types';
import { parseInlineData, parseIslands } from './lib/astro';
import { dedupeBy, round, slugify, toNumber, toText } from './lib/clean';
import {
  baseAttributes,
  type BaseAttributes,
  entityOf,
  nameIndex,
  populationOf,
  type Row,
  type RowEntity,
} from './lib/entities';
import {
  lastUpdated,
  type PageLink,
  pageTitle,
  sectionLinks,
  stripYear,
} from './lib/page';
import { CATEGORY_LABELS, guessPolarity } from './lib/reference';

const SITE = 'https://worldpopulationreview.com';

/** Parses `--key=value` command-line arguments. */
function parseArgs(argv: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of argv) {
    const [k = '', v] = a.replace(/^--/, '').split('=');
    out.set(k, v ?? 'true');
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const CACHE = path.resolve(
  args.get('cache') ?? process.env.WPR_CACHE ?? '.cache/pages'
);
const OUT = path.resolve(args.get('out') ?? 'public/data');

type Prefix =
  | 'country-rankings'
  | 'state-rankings'
  | 'us-city-rankings'
  | 'world-city-rankings'
  | 'us-county-rankings';

/** Entity types we support, keyed by the page prefix that ranks them. */
const TYPES: Record<
  Prefix,
  { id: EntityType; label: string; singular: string }
> = {
  'country-rankings': {
    id: 'country',
    label: 'Countries',
    singular: 'Country',
  },
  'state-rankings': { id: 'state', label: 'US States', singular: 'State' },
  'us-city-rankings': { id: 'city', label: 'US Cities', singular: 'US City' },
  'world-city-rankings': {
    id: 'world-city',
    label: 'World Cities',
    singular: 'World City',
  },
  'us-county-rankings': {
    id: 'county',
    label: 'US Counties',
    singular: 'County',
  },
};

const isPrefix = (p: string): p is Prefix => Object.hasOwn(TYPES, p);
const PREFIX_LINK =
  /^\/(country-rankings|state-rankings|us-city-rankings|world-city-rankings|us-county-rankings)\/([^/?#]+)/;

/** Source formats whose cells are text even when they look numeric. */
const TEXT_FORMATS = new Set<string | null>([
  null,
  '',
  'pipesToList',
  'csvToList',
  'link',
  'date',
  'dateShort',
  'clockTime',
  'checkboxes',
  'format',
  'stateFlag',
  'zipCode',
]);

/** A metric column definition as the source page declares it. */
interface SourceColumn {
  id: number;
  field: string;
  year: number | null;
  header: unknown;
  label: unknown;
  format: string | null;
  unit: string | null;
  dbField: string | null;
  lastUpdated: string | null;
}

/** Narrows an island column object to a metric column (base columns have string ids). */
function toColumn(c: unknown): SourceColumn | null {
  if (c === null || typeof c !== 'object') return null;
  const o = c as Record<string, unknown>;
  if (typeof o.id !== 'number' || typeof o.field !== 'string') return null;
  const s = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  return {
    id: o.id,
    field: o.field,
    year: typeof o.year === 'number' ? o.year : null,
    header: o.header,
    label: o.label,
    format: s(o.format),
    unit: s(o.unit),
    dbField: s(o.dbField),
    lastUpdated: s(o.lastUpdated),
  };
}

/** Stored cell value: number for numeric cells, text otherwise. */
type Cell = number | string;
/** Year key: the column's year, or '_' for undated columns. */
type YearKey = number | '_';

interface MetricAcc {
  id: number;
  key: string;
  headers: Map<string, number>;
  fmt: string | null;
  unit: string | null;
  years: Map<YearKey, Map<string, Cell>>;
  topics: Set<string>;
  updated: string | null;
  numeric: number;
  strings: number;
  distinct: Set<string>;
  textLen: number;
}

interface ParsedPage {
  prefix: Prefix;
  slug: string;
  type: EntityType;
  rows: Row[];
  columns: SourceColumn[];
  tables: { name: unknown; columns: unknown }[] | null;
  title: string | null;
  sources: PageLink[];
  related: { type: EntityType; slug: string }[];
  updated: string | null;
}

interface TopicAcc {
  slug: string;
  title: string;
  sources: PageLink[];
  related: { type: EntityType; slug: string }[];
  updated: string | null;
  cats: string[];
  tables: { name: string; metrics: number[] }[];
  metrics: number[];
  series: Map<number, Map<YearKey, Map<string, Cell>>>;
  entityIds: string[];
}

type EntityAcc = RowEntity & BaseAttributes & { pop: number | null };

interface TypeAcc {
  entities: Map<string, EntityAcc>;
  metrics: Map<number, MetricAcc>;
  topics: TopicAcc[];
}

const warnings = new Map<string, { count: number; examples: string[] }>();

/** Counts a data-quality issue and keeps a few examples for the build log. */
function warn(kind: string, detail: string): void {
  const w = warnings.get(kind) ?? { count: 0, examples: [] };
  w.count++;
  if (w.examples.length < 5) w.examples.push(detail);
  warnings.set(kind, w);
}

const readPage = async (file: string): Promise<string> =>
  gunzipSync(await readFile(path.join(CACHE, file))).toString('utf8');

/** "type:slug" → categories the topic is listed under. */
async function readCategories(
  files: readonly string[]
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  for (const f of files) {
    const [prefix, slug] = f.replace(/\.html\.gz$/, '').split('__');
    if (prefix !== 'categories' || slug == null) continue;
    const html = await readPage(f);
    for (const m of html.matchAll(
      /href="\/(country-rankings|state-rankings|us-city-rankings|world-city-rankings|us-county-rankings)\/([^"/?#]+)"/g
    )) {
      const p = m[1] ?? '';
      if (!isPrefix(p)) continue;
      const key = `${TYPES[p].id}:${m[2] ?? ''}`;
      const set = out.get(key) ?? new Set<string>();
      set.add(slug);
      out.set(key, set);
    }
  }
  return out;
}

/** Reads one ranking page's main table, column definitions and metadata. */
function parsePage(
  prefix: Prefix,
  slug: string,
  html: string
): ParsedPage | null {
  const islands = parseIslands(html).filter(
    (i) => Array.isArray(i.props.data) && Array.isArray(i.props.columns)
  );
  if (islands.length === 0) {
    const inline = parseInlineData(html) == null ? '' : ' (inline)';
    warn('page-without-structured-table', `${prefix}/${slug}${inline}`);
    return null;
  }
  const rowsOf = (i: (typeof islands)[number]): unknown[] =>
    Array.isArray(i.props.data) ? i.props.data : [];
  const main = islands.reduce((a, b) =>
    rowsOf(b).length > rowsOf(a).length ? b : a
  );
  const columns = new Map<string, SourceColumn>();
  for (const isl of islands) {
    const cols = Array.isArray(isl.props.columns) ? isl.props.columns : [];
    for (const c of cols) {
      const col = toColumn(c);
      if (col != null) columns.set(col.field, col);
    }
  }
  // Drop pre-rendered display strings (HTML) early; they dominate memory.
  const rows: Row[] = rowsOf(main).map((r) => {
    const o: Row = {};
    if (r !== null && typeof r === 'object') {
      for (const [k, v] of Object.entries(r)) if (!k.endsWith('Disp')) o[k] = v;
    }
    return o;
  });
  const type = TYPES[prefix].id;
  const tables = Array.isArray(main.props.tables)
    ? main.props.tables.map((t) => {
        const o = (
          t !== null && typeof t === 'object' && !Array.isArray(t) ? t : {}
        ) as Record<string, unknown>;
        return { name: o.name, columns: o.columns };
      })
    : null;
  return {
    prefix,
    slug,
    type,
    rows,
    columns: [...columns.values()],
    tables,
    title: pageTitle(html),
    sources: sectionLinks(html, 'sources').filter(
      (s) => /^https?:/.test(s.url) && s.name !== ''
    ),
    related: sectionLinks(html, 'related-pages').flatMap((l) => {
      const m = PREFIX_LINK.exec(l.url);
      const p = m?.[1] ?? '';
      return m?.[2] != null && isPrefix(p)
        ? [{ type: TYPES[p].id, slug: m[2] }]
        : [];
    }),
    updated: lastUpdated(html),
  };
}

/** Normalizes one cell, updating the metric's numeric/text tallies; null drops it. */
function cellValue(m: MetricAcc, raw: unknown): Cell | null {
  if (raw == null || raw === '') return null;
  const n = TEXT_FORMATS.has(m.fmt) ? undefined : toNumber(raw);
  if (typeof n === 'number') {
    m.numeric++;
    return round(n);
  }
  if (n === null) return null;
  const text = toText(raw);
  if (text == null) return null;
  const asNum = toNumber(text);
  if (typeof asNum === 'number' && !TEXT_FORMATS.has(m.fmt)) {
    m.numeric++;
    return round(asNum);
  }
  m.strings++;
  if (m.distinct.size < 50) m.distinct.add(text);
  m.textLen += text.length;
  return text;
}

/** Merges one parsed page into the per-type accumulators. */
function ingestPage(
  page: ParsedPage,
  T: TypeAcc,
  categories: Map<string, Set<string>>
): void {
  const rowEntities: (string | null)[] = [];
  for (const r of page.rows) {
    const e = entityOf(page.type, r);
    if (e == null) {
      warn(
        `row-without-identity:${page.type}`,
        `${page.slug}: ${JSON.stringify(r).slice(0, 120)}`
      );
      rowEntities.push(null);
      continue;
    }
    const pop = populationOf(r);
    const base = baseAttributes(page.type, r);
    const prev = T.entities.get(e.id);
    if (prev == null) {
      T.entities.set(e.id, { ...e, ...base, pop });
    } else {
      // Fill gaps from later pages without overwriting what we already know.
      const target = prev as unknown as Record<string, unknown>;
      for (const [k, v] of [...Object.entries(base), ...Object.entries(e)]) {
        if (target[k] == null && v != null) target[k] = v;
      }
      if (pop != null && prev.pop == null) prev.pop = pop;
    }
    rowEntities.push(e.id);
  }

  const topicMetrics: number[] = [];
  const series: TopicAcc['series'] = new Map();
  for (const c of page.columns) {
    let m = T.metrics.get(c.id);
    if (m == null) {
      m = {
        id: c.id,
        key: c.dbField ?? c.field.replace(/_(\d{4})$/, ''),
        headers: new Map(),
        fmt: c.format,
        unit: c.unit,
        years: new Map(),
        topics: new Set(),
        updated: null,
        numeric: 0,
        strings: 0,
        distinct: new Set(),
        textLen: 0,
      };
      T.metrics.set(c.id, m);
    }
    const header = toText(c.header) ?? toText(c.label) ?? m.key;
    m.headers.set(header, (m.headers.get(header) ?? 0) + 1);
    if (
      c.lastUpdated != null &&
      (m.updated == null || c.lastUpdated > m.updated)
    ) {
      m.updated = c.lastUpdated.slice(0, 10);
    }
    m.topics.add(page.slug);
    if (!topicMetrics.includes(c.id)) topicMetrics.push(c.id);

    const year: YearKey = c.year ?? '_';
    const store = m.years.get(year) ?? new Map<string, Cell>();
    m.years.set(year, store);
    const bySeries = series.get(c.id) ?? new Map<YearKey, Map<string, Cell>>();
    series.set(c.id, bySeries);
    const topicStore = bySeries.get(year) ?? new Map<string, Cell>();
    bySeries.set(year, topicStore);

    page.rows.forEach((r, i) => {
      const eid = rowEntities[i];
      if (eid == null || m == null) return;
      const v = cellValue(m, r[c.field]);
      if (v == null) return;
      topicStore.set(eid, v);
      const prev = store.get(eid);
      if (prev === undefined) store.set(eid, v);
      else if (prev !== v) {
        warn(
          'conflicting-value',
          `${page.type} ${c.id} ${year} ${eid}: ${prev} vs ${v} (${page.slug})`
        );
      }
    });
  }

  T.topics.push({
    slug: page.slug,
    title: page.title ?? page.slug,
    sources: page.sources,
    related: page.related,
    updated: page.updated,
    cats: [...(categories.get(`${page.type}:${page.slug}`) ?? [])].sort(),
    tables: (page.tables ?? [])
      .map((t) => {
        const fields = Array.isArray(t.columns) ? t.columns : [];
        const ids = fields
          .map(
            (field) =>
              page.columns.find((c) => c.dbField === field || c.field === field)
                ?.id
          )
          .filter((x): x is number => typeof x === 'number');
        return { name: toText(t.name) ?? '', metrics: [...new Set(ids)] };
      })
      .filter((t) => t.metrics.length > 0),
    metrics: topicMetrics,
    series,
    entityIds: [...new Set(rowEntities.filter((x): x is string => x != null))],
  });
}

/** The /countries index carries population, area, density and growth for every country. */
async function mergeCountryIndex(T: TypeAcc): Promise<void> {
  try {
    const html = await readPage('countries.html.gz');
    for (const r of parseInlineData(html) ?? []) {
      const name = typeof r.country === 'string' ? r.country : '';
      const id = nameIndex.country.get(name.toLowerCase());
      const e = id == null ? undefined : T.entities.get(id);
      if (e == null) {
        warn('countries-index-unmatched', name);
        continue;
      }
      if (typeof r.pop2026 === 'number') e.pop = r.pop2026;
      if (typeof r.area === 'number') e.area = r.area;
      if (typeof r.density === 'number') e.density = r.density;
      if (typeof r.growthRate === 'number') e.growth = r.growthRate;
    }
  } catch (err) {
    warn(
      'countries-index-missing',
      err instanceof Error ? err.message : String(err)
    );
  }
}

/** Labels that are bookkeeping ("Data Year", "As of") rather than comparable data. */
const META_LABEL =
  /\b(data|source|survey|reference|latest|report|measurement)\s+year\b|\byear of (data|estimate)\b|^year$|\bdata date\b|\bas of\b/i;

/** Synthetic base metrics (negative ids) derived from entity attributes. */
function baseMetricDefs(type: EntityType): {
  id: number;
  attr: 'pop' | keyof BaseAttributes;
  key: string;
  label: string;
  fmt: string;
  cats: string[];
}[] {
  const km = type === 'country';
  return [
    {
      id: -1,
      attr: 'pop',
      key: 'population',
      label: 'Population',
      fmt: 'numberWithCommas',
      cats: ['population'],
    },
    {
      id: -2,
      attr: 'density',
      key: 'density',
      label: km
        ? 'Population Density (per km²)'
        : 'Population Density (per mi²)',
      fmt: 'floatNumberTenths',
      cats: ['population', 'geography'],
    },
    {
      id: -3,
      attr: 'growth',
      key: 'growthRate',
      label: 'Population Growth Rate',
      fmt: 'perc',
      cats: ['population'],
    },
    {
      id: -4,
      attr: 'growth2020',
      key: 'growthSince2020',
      label: 'Population Growth Since 2020',
      fmt: 'perc',
      cats: ['population'],
    },
    {
      id: -5,
      attr: 'area',
      key: 'area',
      label: km ? 'Land Area (km²)' : 'Land Area (mi²)',
      fmt: 'numberWithCommas',
      cats: ['geography'],
    },
  ];
}

/** Comparator chaining: the first non-zero comparison result. */
function firstNonZero(...results: number[]): number {
  return results.find((r) => r !== 0) ?? 0;
}

/** Classifies a metric as numeric, categorical or free text from its cell tallies. */
function kindOf(m: MetricAcc): MetricKind | null {
  const nonNull = m.numeric + m.strings;
  if (nonNull === 0) return null;
  if (m.numeric / nonNull >= 0.9) return 'num';
  if (m.distinct.size <= 15 && m.textLen / Math.max(1, m.strings) <= 40)
    return 'cat';
  return 'text';
}

/**
 * Picks the default year: the latest year whose coverage is at least 60% of
 * the best-covered year, so a barely-started new year does not win.
 */
function defaultYear(m: MetricAcc, kind: MetricKind): number | null {
  const years = [...m.years.keys()]
    .filter((y): y is number => y !== '_')
    .sort((a, b) => a - b);
  if (years.length === 0) return null;
  const coverage = (y: number): number => {
    let n = 0;
    for (const v of m.years.get(y)?.values() ?? [])
      if (kind !== 'num' || typeof v === 'number') n++;
    return n;
  };
  const max = Math.max(...years.map(coverage));
  return (
    [...years].reverse().find((y) => coverage(y) >= max * 0.6) ??
    years.at(-1) ??
    null
  );
}

/** Writes every output file for one entity type and returns its manifest entry. */
async function writeType(
  prefix: Prefix,
  D: TypeAcc,
  categories: Map<string, Set<string>>,
  topicIndex: TopicSummary[],
  categoryCounts: Map<string, number>
): Promise<EntityTypeInfo | null> {
  const T = TYPES[prefix];
  if (D.topics.length === 0) return null;
  const dir = path.join(OUT, T.id);
  await mkdir(path.join(dir, 'topics'), { recursive: true });

  // Entities: stable order by population desc, then name.
  const entities = [...D.entities.values()].sort((a, b) =>
    firstNonZero((b.pop ?? -1) - (a.pop ?? -1), a.name.localeCompare(b.name))
  );
  const index = new Map(entities.map((e, i) => [e.id, i]));
  const slugCounts = new Map<string, number>();
  const entitiesOut: Entity[] = entities.map((e) => {
    let slug = slugify(e.name);
    const n = slugCounts.get(slug) ?? 0;
    slugCounts.set(slug, n + 1);
    if (n > 0) slug = `${slug}-${slugify(e.id)}`;
    const out: Entity = {
      id: e.id,
      name: e.name,
      slug,
      flag: e.flag,
      group: e.group,
    };
    if (e.sub != null) out.sub = e.sub;
    if (e.pop != null) out.pop = e.pop;
    if (e.lat != null && e.lng != null) {
      out.lat = e.lat;
      out.lng = e.lng;
    }
    if (e.fips != null) out.fips = e.fips;
    return out;
  });

  // Metric catalog and default-year values.
  const topicSizes = new Map(D.topics.map((t) => [t.slug, t.metrics.length]));
  const topicRows = new Map(D.topics.map((t) => [t.slug, t.entityIds.length]));
  const metricsOut: Metric[] = [];
  const values: ValuesFile['metrics'] = [];
  for (const m of D.metrics.values()) {
    const kind = kindOf(m);
    if (kind == null) continue;
    const year = defaultYear(m, kind);
    const store = m.years.get(year ?? '_');
    if (store == null) continue;
    const label =
      [...m.headers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? m.key;

    const pairs: [number, Cell][] = [];
    for (const [eid, v] of store) {
      const i = index.get(eid);
      if (i == null) continue;
      if (kind === 'num') {
        if (typeof v === 'number') pairs.push([i, v]);
      } else {
        pairs.push([i, String(v)]);
      }
    }
    if (pairs.length === 0) continue;
    pairs.sort((a, b) => a[0] - b[0]);

    // Primary topic: the page covering the most places (global over regional
    // subsets), then the most focused one.
    const topics = [...m.topics].sort((a, b) =>
      firstNonZero(
        (topicRows.get(b) ?? 0) - (topicRows.get(a) ?? 0),
        (topicSizes.get(a) ?? 99) - (topicSizes.get(b) ?? 99),
        a.length - b.length,
        a.localeCompare(b)
      )
    );
    const cats = new Set<string>();
    for (const s of topics)
      for (const c of categories.get(`${T.id}:${s}`) ?? []) cats.add(c);
    const entry: Metric = {
      id: m.id,
      key: m.key,
      label,
      fmt: m.fmt === '' ? null : m.fmt,
      unit: m.unit === '' ? null : m.unit,
      kind,
      pol: kind === 'num' ? guessPolarity(label, m.key, m.fmt, topics) : 0,
      year,
      years: [...m.years.keys()]
        .filter((y): y is number => y !== '_')
        .sort((a, b) => a - b),
      n: pairs.length,
      topics,
      cats: [...cats].sort(),
      updated: m.updated,
    };
    if (kind === 'cat') {
      entry.cats_values = [...m.distinct]
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
        .slice(0, 15);
    }
    if (
      META_LABEL.test(label) ||
      (m.fmt === 'year' && /data|source|estimate|updated/i.test(label))
    ) {
      entry.meta = true;
    }
    metricsOut.push(entry);
    if (kind !== 'text')
      values.push([m.id, pairs.map((p) => p[0]), pairs.map((p) => p[1])]);
  }

  for (const b of baseMetricDefs(T.id)) {
    const idx: number[] = [];
    const vals: number[] = [];
    entities.forEach((e, i) => {
      const v = e[b.attr];
      if (typeof v === 'number' && Number.isFinite(v)) {
        idx.push(i);
        vals.push(round(v));
      }
    });
    if (idx.length < Math.max(3, entities.length * 0.3)) continue;
    metricsOut.push({
      id: b.id,
      key: b.key,
      label: b.label,
      fmt: b.fmt,
      unit: null,
      kind: 'num',
      pol: 0,
      year: null,
      years: [],
      n: idx.length,
      topics: [],
      cats: b.cats,
      updated: null,
      base: true,
    });
    values.push([b.id, idx, vals]);
  }
  metricsOut.sort((a, b) => a.id - b.id);

  // Topics.
  const metricSet = new Set(metricsOut.map((m) => m.id));
  let topicCount = 0;
  for (const t of D.topics) {
    const metrics = t.metrics.filter((id) => metricSet.has(id));
    if (metrics.length === 0 || t.entityIds.length === 0) continue;
    const series: TopicFile['series'] = {};
    for (const id of metrics) {
      const byYear: Record<string, [number[], Cell[]]> = {};
      for (const [year, store] of t.series.get(id) ?? []) {
        const pairs = [...store]
          .flatMap(([eid, v]): [number, Cell][] => {
            const i = index.get(eid);
            return i == null ? [] : [[i, v]];
          })
          .sort((a, b) => a[0] - b[0]);
        if (pairs.length > 0)
          byYear[String(year)] = [
            pairs.map((p) => p[0]),
            pairs.map((p) => p[1]),
          ];
      }
      series[String(id)] = byYear;
    }
    const topicOut: TopicFile = {
      slug: t.slug,
      type: T.id,
      title: stripYear(t.title),
      cats: t.cats,
      updated: t.updated,
      url: `${SITE}/${prefix}/${t.slug}`,
      sources: dedupeBy(t.sources, (s) => s.url),
      related: dedupeBy(t.related, (r) => `${r.type}:${r.slug}`),
      tables: t.tables
        .map((tb) => ({
          name: tb.name,
          metrics: tb.metrics.filter((id) => metricSet.has(id)),
        }))
        .filter((tb) => tb.metrics.length > 0),
      metrics,
      entities: t.entityIds
        .flatMap((id) => {
          const i = index.get(id);
          return i == null ? [] : [i];
        })
        .sort((a, b) => a - b),
      series,
    };
    await writeFile(
      path.join(dir, 'topics', `${t.slug}.json`),
      JSON.stringify(topicOut)
    );
    topicIndex.push({
      slug: t.slug,
      type: T.id,
      title: topicOut.title,
      cats: t.cats,
      metrics,
      n: topicOut.entities.length,
      updated: t.updated,
    });
    for (const c of t.cats)
      categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
    topicCount++;
  }

  await writeFile(path.join(dir, 'entities.json'), JSON.stringify(entitiesOut));
  await writeFile(path.join(dir, 'metrics.json'), JSON.stringify(metricsOut));
  const valuesFile: ValuesFile = {
    entityCount: entitiesOut.length,
    metrics: values,
  };
  await writeFile(path.join(dir, 'values.json'), JSON.stringify(valuesFile));
  const numeric = metricsOut.filter((m) => m.kind === 'num').length;
  console.log(
    `${T.id}: ${entitiesOut.length} entities, ${metricsOut.length} metrics (${numeric} numeric), ${topicCount} topics`
  );
  return {
    id: T.id,
    label: T.label,
    singular: T.singular,
    prefix,
    entities: entitiesOut.length,
    metrics: metricsOut.length,
    numericMetrics: numeric,
    topics: topicCount,
  };
}

async function main(): Promise<void> {
  const files = (await readdir(CACHE)).filter((f) => f.endsWith('.html.gz'));
  console.log(`reading ${files.length} cached pages from ${CACHE}`);

  const db = new Map<Prefix, TypeAcc>();
  for (const p of Object.keys(TYPES)) {
    if (isPrefix(p))
      db.set(p, { entities: new Map(), metrics: new Map(), topics: [] });
  }
  const categories = await readCategories(files);

  // Pass 1 parses every page (and teaches the name → id index); pass 2 ingests,
  // so rows that only carry a name resolve against ids learned anywhere.
  const parsed: ParsedPage[] = [];
  for (const f of files) {
    const [prefix = '', slug] = f.replace(/\.html\.gz$/, '').split('__');
    if (!isPrefix(prefix) || slug == null) continue;
    const page = parsePage(prefix, slug, await readPage(f));
    if (page == null) continue;
    for (const r of page.rows) entityOf(page.type, r);
    parsed.push(page);
  }
  console.log(`${parsed.length} pages with structured tables`);
  for (const page of parsed) {
    const T = db.get(page.prefix);
    if (T != null) ingestPage(page, T, categories);
  }
  const countries = db.get('country-rankings');
  if (countries != null) await mergeCountryIndex(countries);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    source: SITE,
    types: [],
    categories: [],
  };
  const topicIndex: TopicSummary[] = [];
  const categoryCounts = new Map<string, number>();
  for (const [prefix, D] of db) {
    const info = await writeType(
      prefix,
      D,
      categories,
      topicIndex,
      categoryCounts
    );
    if (info != null) manifest.types.push(info);
  }
  manifest.categories = Object.entries(CATEGORY_LABELS).map(([id, label]) => ({
    id,
    label,
    topics: categoryCounts.get(id) ?? 0,
  }));
  topicIndex.sort((a, b) => a.title.localeCompare(b.title));
  await writeFile(path.join(OUT, 'topics.json'), JSON.stringify(topicIndex));
  await writeFile(
    path.join(OUT, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  console.log('\nwarnings:');
  for (const [k, w] of [...warnings].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${k}: ${w.count}`, w.examples.slice(0, 2));
  }
}

await main();
