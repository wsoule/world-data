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
//   <type>/search.json          searchable metrics, compacted for the search palette
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
  Polarity,
  TopicFile,
  TopicSummary,
  ValuesFile,
} from '../src/data/types';
import { toSearchCatalog } from '../src/features/search/searchCatalog';
import { parseInlineData, parseIslands } from './lib/astro';
import {
  collapseRepeatedWords,
  dedupeBy,
  headerYearsFromKey,
  round,
  slugify,
  toNumber,
  toText,
} from './lib/clean';
import { copiedCountFields, looksLikeRanks } from './lib/columns';
import {
  baseAttributes,
  type BaseAttributes,
  entityOf,
  nameIndex,
  populationOf,
  type Row,
  type RowEntity,
} from './lib/entities';
import type { ExternalPage } from './lib/external';
import {
  lastUpdated,
  type PageLink,
  pageTitle,
  sectionLinks,
  stripYear,
} from './lib/page';
import { CATEGORY_LABELS, guessPolarity } from './lib/reference';
import { sourcePages } from './sources';

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
/** Downloads from other sources (see fetch-pages.ts), next to the page cache. */
const SOURCES = path.resolve(
  args.get('sources') ?? path.join(path.dirname(CACHE), 'sources')
);

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

/**
 * Converts values whose source format implies a different scale than the one
 * the label reads in: populations stored in thousands, kilometres shown as
 * miles, and "females per male" stored as males per female. Returns null when
 * a value cannot be converted.
 */
function scaleByFormat(fmt: string | null, n: number): number | null {
  switch (fmt) {
    case 'abbreviateNumber1k':
      return n * 1000;
    case 'km2MiRound':
      return Math.round(n * 0.621371);
    case 'reciprocalRatio':
      return n === 0 ? null : 1 / n;
    default:
      return n;
  }
}

/** The display format to publish after scaleByFormat has converted the values. */
function outputFormat(fmt: string | null): string | null {
  switch (fmt) {
    case 'abbreviateNumber1k':
      return 'abbreviateNumber';
    case 'km2MiRound':
      return 'numberWithCommas';
    case 'reciprocalRatio':
      return 'floatNumber';
    case '':
      return null;
    default:
      return fmt;
  }
}

/**
 * Money columns whose key says the figures are in millions or billions
 * ("…_InMillionUSD", "…_EstimatedWorthInBillions") are stored in dollars, so
 * the United States' gross national expenditure reads $26.7T, not $26.72M.
 */
function moneyScale(m: Pick<MetricAcc, 'key' | 'fmt'>): number {
  if (m.fmt?.startsWith('money') !== true) return 1;
  if (/InBillion/i.test(m.key)) return 1e9;
  if (/InMillion/i.test(m.key)) return 1e6;
  return 1;
}

/** scaleByFormat plus the key-implied money scale; null when unconvertible. */
function scaleValue(m: MetricAcc, n: number): number | null {
  const v = scaleByFormat(m.fmt, n);
  return v == null ? null : v * moneyScale(m);
}

/** Normalizes one cell, updating the metric's numeric/text tallies; null drops it. */
function cellValue(m: MetricAcc, raw: unknown): Cell | null {
  if (raw == null || raw === '') return null;
  const parsed = TEXT_FORMATS.has(m.fmt) ? undefined : toNumber(raw);
  const n = typeof parsed === 'number' ? scaleValue(m, parsed) : parsed;
  if (typeof n === 'number') {
    m.numeric++;
    return round(n);
  }
  if (n === null) return null;
  const text = toText(raw);
  if (text == null) return null;
  const asNum = toNumber(text);
  const scaled =
    typeof asNum === 'number' && !TEXT_FORMATS.has(m.fmt)
      ? scaleValue(m, asNum)
      : null;
  if (scaled != null) {
    m.numeric++;
    return round(scaled);
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
  // Count fields that only repeat another column (see copiedCountFields).
  const copies = copiedCountFields(page.columns, page.rows);
  for (const [field, of] of copies) {
    warn(
      'count-copies-another-column',
      `${page.type} ${page.slug}: ${field} repeats ${of}`
    );
  }
  for (const c of page.columns) {
    if (copies.has(c.field)) continue;
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
    const header = headerYearsFromKey(
      collapseRepeatedWords(toText(c.header) ?? toText(c.label) ?? m.key),
      m.key
    );
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

/** Polarity declared by external sources, keyed "<type>:<metric id>"; wins over the label guess. */
const EXTERNAL_POL = new Map<string, Polarity>();

/** An external source's topic as a parsed page, so it is ingested like a scraped one. */
function fromExternal(ext: ExternalPage): ParsedPage {
  for (const c of ext.columns)
    if (c.pol != null) EXTERNAL_POL.set(`${ext.type}:${c.id}`, c.pol);
  const prefix = (Object.keys(TYPES) as Prefix[]).find(
    (p) => TYPES[p].id === ext.type
  );
  if (prefix == null) throw new Error(`no prefix for type ${ext.type}`);
  return {
    prefix,
    slug: ext.slug,
    type: ext.type,
    rows: ext.rows,
    columns: ext.columns.map((c) => ({
      id: c.id,
      field: c.field,
      year: c.year,
      header: c.header,
      label: c.header,
      format: c.format,
      unit: c.unit,
      dbField: c.dbField,
      lastUpdated: ext.updated,
    })),
    tables: ext.tables,
    title: ext.title,
    sources: ext.sources,
    related: [],
    updated: ext.updated,
  };
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

/**
 * Labels of bookkeeping columns ("Data Year", "Year Measured", "Most Recent
 * Update") rather than comparable data. A label only counts when the column's
 * values are actually years or text, so "Orphanhood Due to COVID as of 2022"
 * (a count) stays a real metric.
 */
const META_LABEL =
  /\b(data|source|survey|reference|latest|report|measurement|update|count)\s+year\b|\byear (measured|assessed|rate confirmed|of (data|estimate|population count|count))\b|^year$|\bdata date\b|\bas of\b|\bmost recent (update|status update|exit cohort)\b/i;

/** True when every value is a whole number between 1800 and 2100. */
function looksLikeYears(values: readonly Cell[]): boolean {
  return (
    values.length > 0 &&
    values.every(
      (v) =>
        typeof v !== 'number' || (Number.isInteger(v) && v >= 1800 && v <= 2100)
    )
  );
}

/** Units that state a scale (the value is in millions, kilotonnes, …). */
const SCALE_UNITS: Record<string, { factor: number; base: string | null }> = {
  thousand: { factor: 1e3, base: null },
  thousands: { factor: 1e3, base: null },
  million: { factor: 1e6, base: null },
  millions: { factor: 1e6, base: null },
  mn: { factor: 1e6, base: null },
  billion: { factor: 1e9, base: null },
  billions: { factor: 1e9, base: null },
  bn: { factor: 1e9, base: null },
  kt: { factor: 1e3, base: 't' },
  mt: { factor: 1e6, base: 't' },
  bkwh: { factor: 1e9, base: 'kWh' },
};

/**
 * Scale words some keys carry when the column has no unit
 * ("IronOreProduction_MillionTons", "…AnnualVisitorsInMillions…").
 */
function unitFromKey(key: string): string | null {
  if (/MillionTons/i.test(key)) return 'Mt';
  if (/InMillions?(Of)?(LBs|Pounds)/i.test(key)) return 'million lbs';
  if (/InMillions?(_|$)/i.test(key)) return 'million';
  if (/InBillions?(_|$)/i.test(key)) return 'billion';
  return null;
}

/** Physical units that make a money format wrong ("Lithium Resources" in t). */
const PHYSICAL_UNIT = /^(t|kt|mt|kg|lbs?|bbl|oz|tonnes?|tons?)$/i;

/**
 * Source units do not always match the stored scale: "Lithium Reserves (Mt)"
 * holds 9,300,000 (tonnes) while "CO₂ Emissions (Mt)" holds 13,124 (Mt). When
 * values are too large to be in the stated scale, they are already in base
 * units, so the unit becomes the base unit (or none). "MT" means metric tons.
 */
function normalizeUnit(unit: string | null, maxAbs: number): string | null {
  if (unit == null || unit.trim() === '') return null;
  const u = unit.trim();
  if (u === 'MT') return 't';
  // A capital "M" means millions; a lower-case "m" is metres.
  const scale =
    u === 'M' ? { factor: 1e6, base: null } : SCALE_UNITS[u.toLowerCase()];
  if (scale == null) return u;
  return maxAbs >= scale.factor ? scale.base : u;
}

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
      label: km ? 'Total Area (km²)' : 'Land Area (mi²)',
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

/** Calendar year of the build; later years are projections, not data. */
const BUILD_YEAR = new Date().getUTCFullYear();

/**
 * Picks the default year (null = the undated column):
 * - projections (years after the build year) only count when nothing else
 *   exists;
 * - the latest year covering at least half as many places as the best year
 *   wins, so a barely-started year does not;
 * - if that year is more than five years older than the newest data, the
 *   newest year covering at least 15% of the best year (and 5 places) wins
 *   instead, so a decades-old series does not: Potato Production opens on
 *   2025's 13 surveyed states, not 2018's 49;
 * - an undated column covering 1.5× as many places beats the dated choice.
 */
function defaultYear(m: MetricAcc, kind: MetricKind): number | null {
  const coverageOf = (key: YearKey): number => {
    let n = 0;
    for (const v of m.years.get(key)?.values() ?? [])
      if (kind !== 'num' || typeof v === 'number') n++;
    return n;
  };
  const all = [...m.years.keys()]
    .filter((y): y is number => y !== '_')
    .sort((a, b) => a - b);
  const current = all.filter((y) => y <= BUILD_YEAR);
  const years = current.length > 0 ? current : all;
  if (years.length === 0) return null;
  const max = Math.max(...years.map(coverageOf));
  const newestFirst = [...years].reverse();
  let pick =
    newestFirst.find((y) => coverageOf(y) >= max * 0.5) ?? years.at(-1) ?? null;
  const newest = years.at(-1);
  if (pick != null && newest != null && newest - pick > 5) {
    pick =
      newestFirst.find((y) => coverageOf(y) >= Math.max(5, max * 0.15)) ?? pick;
  }
  if (
    m.years.has('_') &&
    pick != null &&
    coverageOf('_') >= coverageOf(pick) * 1.5
  ) {
    return null;
  }
  return pick;
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'per',
  'by',
  'of',
  'in',
  'with',
  'from',
  'total',
  'rate',
  'number',
  'average',
  'avg',
  // Place nouns appear in every "…-by-state" slug, so they are not evidence
  // that a page is about the metric.
  'state',
  'states',
  'country',
  'countries',
  'city',
  'cities',
  'county',
  'counties',
  'world',
]);

/** Lower-case word stems (trailing "s" dropped) used to match labels with topic slugs. */
function stems(text: string): Set<string> {
  return new Set(
    text
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
      .map((w) => w.replace(/s$/, ''))
  );
}

const LISTICLE =
  /^(best|worst|poorest|richest|most|least|safest|happiest|cheapest|top|largest|smallest|highest|lowest|coldest|hottest|dirtiest|cleanest|biggest|deadliest)-/;
const BY_PAGE = /-(by-(state|country|city|county)|in-the-world)$/;

/**
 * How well a topic suits a metric as its primary page: share of the metric's
 * label words found in the slug, plus a bonus for "…-by-state/-by-country"
 * pages and a penalty for "best/worst/…" listicles.
 */
function topicFit(label: string, key: string, slug: string): number {
  const want = stems(`${label} ${key}`);
  const have = [...stems(slug)];
  // Words of five or more letters also match by prefix (prison ~ prisoner).
  const matches = (w: string): boolean =>
    have.some(
      (h) =>
        h === w ||
        (Math.min(h.length, w.length) >= 5 &&
          (h.startsWith(w) || w.startsWith(h)))
    );
  let hit = 0;
  for (const w of want) if (matches(w)) hit++;
  const match = want.size === 0 ? 0 : hit / want.size;
  // With no word in common, a "…-by-state" page only breaks ties: it must not
  // outrank a page that shares even one word with the metric.
  if (match === 0)
    return (BY_PAGE.test(slug) ? 0.05 : 0) - (LISTICLE.test(slug) ? 0.3 : 0);
  return (
    match + (BY_PAGE.test(slug) ? 0.3 : 0) - (LISTICLE.test(slug) ? 0.3 : 0)
  );
}

/** Suffix naming a metric's unit or format ("(°F)", "(mi²)", "($)"), if any. */
function unitSuffix(m: Metric): string | null {
  if (m.unit != null) return `(${m.unit})`;
  if (m.fmt === 'degC') return '(°C)';
  if (m.fmt === 'degF') return '(°F)';
  if (m.fmt === 'moneyWithCurrencyEuros') return '(€)';
  if (m.fmt?.startsWith('money') === true) return '($)';
  if (m.fmt === 'perc' || m.fmt === 'percAlt') return '(%)';
  return null;
}

/** Words of a metric key missing from its label ("…LakeSurfaceArea(acres)" → Bass, Fishing, Best, acres). */
function keyWords(m: Metric): string[] {
  const labelWords = stems(m.label);
  return m.key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)|(\d)([A-Za-z])/g, '$1$3 $2$4')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => {
      const lw = w.toLowerCase();
      return (
        lw.length >= 2 &&
        !STOPWORDS.has(lw) &&
        !labelWords.has(lw.replace(/s$/, ''))
      );
    });
}

/**
 * Suffixes that tell apart metrics sharing a label inside one topic. Each
 * metric gets its unit when no other member shares it, else the words of its
 * key the other members lack ("(acres)" vs "(mi2)"), else nothing; ids break
 * any tie that remains.
 */
function disambiguate(group: readonly Metric[]): string[] {
  const units = group.map(unitSuffix);
  const words = group.map(keyWords);
  const common = words.reduce(
    (acc, ws) => acc.filter((w) => ws.includes(w)),
    words[0] ?? []
  );
  const suffixes = group.map((m, i) => {
    const unit = units[i];
    if (unit != null && units.filter((u) => u === unit).length === 1)
      return unit;
    const own = (words[i] ?? []).filter((w) => !common.includes(w));
    return own.length > 0 ? `(${own.slice(0, 3).join(' ')})` : (unit ?? '');
  });
  return suffixes.map((x, i) =>
    suffixes.filter((y) => y === x).length === 1
      ? x
      : `${x} (#${group[i]?.id ?? ''})`.trim()
  );
}

/**
 * Hand corrections for source columns whose header or format is wrong:
 * 20363 is keyed "…PctOfMammalSpeciesAtRisk" but titled as the fish column,
 * 23920 is keyed "…_5to6Years" but titled "Ages 4-5", 23931 holds dollars
 * under a cents header, 15277 holds percentages under a dollar format,
 * 19747 holds euros with no format, and 23862 holds World Energy Trilemma
 * scores (Denmark 83.2 is the best) under a "Rank" header and rank format.
 */
const METRIC_FIXES: Record<
  string,
  { label?: string; unit?: string; fmt?: string; pol?: Polarity }
> = {
  'country:19747': { fmt: 'moneyWithCurrencyEuros' },
  'country:23862': {
    label: 'Energy Sustainability Score',
    fmt: 'floatNumberTenths',
    pol: 1,
  },
  'state:15277': {
    label: 'Avg Median Down Payment for House (%)',
    fmt: 'percAlt',
  },
  'state:15864': { label: 'Gas Tax (¢/gallon)' },
  'state:20363': { label: '% of Mammal Species at Risk' },
  'state:23920': { label: 'CSR: Ages 5-6' },
  'state:23931': { label: 'Gas Tax ($/gallon)', unit: '$/gallon' },
};

/**
 * Metric id → slugs of the topics where that metric has at least one value.
 * A column can appear on a page with nothing but "no data" placeholders:
 * "States without NBA Teams" lists 29 states whose only cell, "NBA Teams",
 * is "-" on every row. Such a column is left off that topic, and a topic
 * left with no metric is not published, since it has no value to show.
 */
function topicsWithValues(
  topics: readonly TopicAcc[]
): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  for (const t of topics) {
    for (const [id, byYear] of t.series) {
      if (![...byYear.values()].some((store) => store.size > 0)) continue;
      const set = out.get(id) ?? new Set<string>();
      set.add(t.slug);
      out.set(id, set);
    }
  }
  return out;
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
  const withValues = topicsWithValues(D.topics);
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

    // Primary topic: the page whose title best matches the metric (dedicated
    // "…-by-country" pages over listicles), then the one covering the most
    // places (global over regional subsets), then the most focused one.
    const ownTopics = withValues.get(m.id) ?? new Set<string>();
    const topics = [...m.topics]
      .filter((s) => ownTopics.has(s))
      .sort((a, b) =>
        firstNonZero(
          Math.sign(topicFit(label, m.key, b) - topicFit(label, m.key, a)),
          (topicRows.get(b) ?? 0) - (topicRows.get(a) ?? 0),
          (topicSizes.get(a) ?? 99) - (topicSizes.get(b) ?? 99),
          a.length - b.length,
          a.localeCompare(b)
        )
      );
    const cats = new Set<string>();
    for (const s of topics)
      for (const c of categories.get(`${T.id}:${s}`) ?? []) cats.add(c);
    const maxAbs = Math.max(
      0,
      ...pairs.map((p) => (typeof p[1] === 'number' ? Math.abs(p[1]) : 0))
    );
    const fix = METRIC_FIXES[`${T.id}:${m.id}`];
    const unit =
      fix?.unit ??
      (kind === 'num'
        ? normalizeUnit(
            m.unit != null && m.unit.trim() !== ''
              ? m.unit
              : moneyScale(m) === 1
                ? unitFromKey(m.key)
                : null,
            maxAbs
          )
        : m.unit === ''
          ? null
          : m.unit);
    const ranks =
      kind === 'num' &&
      fix?.fmt == null &&
      looksLikeRanks(
        label,
        m.fmt,
        pairs.flatMap((p) => (typeof p[1] === 'number' ? [p[1]] : []))
      );
    const sourceFmt = ranks ? 'ranking' : m.fmt;
    const fmt = fix?.fmt ?? outputFormat(sourceFmt);
    const entry: Metric = {
      id: m.id,
      key: m.key,
      label: fix?.label ?? label,
      fmt:
        fmt?.startsWith('money') === true &&
        unit != null &&
        PHYSICAL_UNIT.test(unit)
          ? 'abbreviateNumber'
          : fmt,
      unit,
      kind,
      pol:
        kind !== 'num'
          ? 0
          : (fix?.pol ??
            EXTERNAL_POL.get(`${T.id}:${m.id}`) ??
            guessPolarity(label, m.key, sourceFmt, topics)),
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
    const yearish = kind !== 'num' || looksLikeYears(pairs.map((p) => p[1]));
    if (
      (META_LABEL.test(label) && yearish) ||
      (m.fmt === 'year' && /data|source|estimate|updated|measured/i.test(label))
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
  // Metrics sharing a label inside one topic ("Land Area" in mi² and km²)
  // get a suffix from their unit, format or key so pickers and tables can
  // tell them apart.
  const byId = new Map(metricsOut.map((m) => [m.id, m]));
  const renamed = new Set<number>();
  for (const t of D.topics) {
    const groups = new Map<string, Metric[]>();
    for (const id of t.metrics) {
      const m = byId.get(id);
      if (m == null || renamed.has(id)) continue;
      const group = groups.get(m.label) ?? [];
      group.push(m);
      groups.set(m.label, group);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const suffixes = disambiguate(group);
      group.forEach((m, i) => {
        const suffix = suffixes[i] ?? '';
        if (suffix !== '') m.label = `${m.label} ${suffix}`;
        renamed.add(m.id);
      });
    }
  }
  metricsOut.sort((a, b) => a.id - b.id);

  // Topics.
  const metricSet = new Set(metricsOut.map((m) => m.id));
  let topicCount = 0;
  for (const t of D.topics) {
    const shown = (id: number) =>
      metricSet.has(id) && withValues.get(id)?.has(t.slug) === true;
    const metrics = t.metrics.filter(shown);
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
          metrics: tb.metrics.filter(shown),
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
  await writeFile(
    path.join(dir, 'search.json'),
    JSON.stringify(toSearchCatalog(metricsOut))
  );
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
  const external = await sourcePages(SOURCES, {
    known: (type) => {
      const prefix = (Object.keys(TYPES) as Prefix[]).find(
        (p) => TYPES[p].id === type
      );
      const T = prefix == null ? undefined : db.get(prefix);
      return [...(T?.entities.values() ?? [])].map((e) => ({
        id: e.id,
        name: e.name,
        flag: e.flag ?? null,
        sub: e.sub ?? null,
      }));
    },
  });
  for (const ext of external) {
    const page = fromExternal(ext);
    const T = db.get(page.prefix);
    if (T == null) continue;
    // External rows only attach to places the ranking pages already know: an unknown id (a World
    // Bank region such as "Arab World", a territory we do not list) must not become a new place.
    const known = page.rows.filter((r) => {
      const e = entityOf(page.type, r);
      return e != null && T.entities.has(e.id);
    });
    if (known.length < page.rows.length)
      warn(
        'external-row-unknown-place',
        `${ext.slug}: ${page.rows.length - known.length} of ${page.rows.length} rows`
      );
    page.rows = known;
    categories.set(`${ext.type}:${ext.slug}`, new Set(ext.cats));
    ingestPage(page, T, categories);
  }
  console.log(`${external.length} topics from other sources`);
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
