// Pre-draws the home page's maps. Shapes are projected once into compact SVG paths
// (public/data/maps/shapes-<geo>.json) and each map stores only a colour band per place
// (public/data/maps/home.json), so the home page renders eight maps as plain SVG on the server
// without loading datasets or map libraries. It also projects the world map every other page
// draws (public/data/maps/world-equalearth.json, see src/charts/geo/worldPlane.ts).
//
// Run by scripts/build-data.ts, or alone with `bun scripts/build-home-maps.ts` from apps/web.

import {
  geoAlbersUsa,
  geoEqualEarth,
  geoNaturalEarth1,
  geoPath,
  geoStream,
} from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

import { ISO_NUMERIC_TO_A3, NAME_TO_A3 } from '../src/charts/geo/isoNumeric';
import {
  encodeRing,
  WORLD_PLANE_PATH,
  type WorldPlaneFeature,
  type WorldPlaneFile,
} from '../src/charts/geo/worldPlane';
import type {
  CombinedMap,
  HomeMap,
  HomeMapsFile,
  MapShapes,
  PopularTopic,
} from '../src/content/mapTypes';
import {
  ACS,
  BLS,
  CDC_PLACES,
  ELECTIONS,
  FBI_CRIME,
  RPP,
  WORLD_BANK,
} from '../src/data/external';
import type { EntityType, Metric, TopicSummary } from '../src/data/types';
import { POPULAR_TOPICS } from '../src/features/home/presets';
import { FIPS_USPS } from './lib/states';

type Geo = MapShapes['geo'];

const W = 320;
const SIZE: Record<Geo, [number, number]> = {
  'us-states': [W, 200],
  'us-counties': [W, 200],
  world: [W, 165],
};

const req = (p: string) => path.join(process.cwd(), 'node_modules', p);

async function topo<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(req(file), 'utf8')) as T;
}

/** Features of one geography, keyed by the id our entities use (USPS code, FIPS, ISO3). */
async function features(
  geo: Geo
): Promise<Feature<Geometry, { id: string }>[]> {
  if (geo === 'world') {
    const t = await topo<Topology<{ countries: GeometryCollection }>>(
      'world-atlas/countries-110m.json'
    );
    const fc = feature(t, t.objects.countries) as FeatureCollection;
    return fc.features.flatMap((f) => {
      const a3 = ISO_NUMERIC_TO_A3[String(f.id)];
      // Antarctica takes space and has no data.
      return a3 == null || a3 === 'ATA'
        ? []
        : [{ ...f, properties: { id: a3 } }];
    });
  }
  if (geo === 'us-states') {
    const t = await topo<Topology<{ states: GeometryCollection }>>(
      'us-atlas/states-10m.json'
    );
    const fc = feature(t, t.objects.states) as FeatureCollection;
    return fc.features.flatMap((f) => {
      const code = FIPS_USPS[String(f.id).padStart(2, '0')];
      return code == null ? [] : [{ ...f, properties: { id: code } }];
    });
  }
  const t = await topo<Topology<{ counties: GeometryCollection }>>(
    'us-atlas/counties-10m.json'
  );
  const fc = feature(t, t.objects.counties) as FeatureCollection;
  return fc.features.map((f) => ({
    ...f,
    properties: { id: String(f.id).padStart(5, '0') },
  }));
}

/**
 * Thins a projected path for a ~320px map: snaps points to half pixels, drops points that land
 * on the previous one, and drops rings too small to see. A county outline of hundreds of points
 * becomes a handful, which is all a thumbnail-sized map can show.
 */
function thin(d: string): string {
  const out: string[] = [];
  for (const ring of d.split('M').slice(1)) {
    const pts: [number, number][] = [];
    for (const pair of ring.replace(/Z/g, '').split('L')) {
      const [x, y] = pair.split(',').map((v) => Math.round(Number(v) * 2) / 2);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const last = pts.at(-1);
      if (last == null || last[0] !== x || last[1] !== y) pts.push([x, y]);
    }
    if (pts.length < 3) continue;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    if (
      Math.max(...xs) - Math.min(...xs) < 1 &&
      Math.max(...ys) - Math.min(...ys) < 1
    )
      continue;
    out.push(`M${pts.map((p) => p.join(',')).join('L')}Z`);
  }
  return out.join('');
}

/** Projects a geography to thinned SVG paths at the home map size. */
async function shapes(geo: Geo): Promise<MapShapes> {
  const fs = await features(geo);
  const [w, h] = SIZE[geo];
  // Counties use the states' projection so both US maps line up.
  const fitTo: FeatureCollection =
    geo === 'world'
      ? { type: 'FeatureCollection', features: fs }
      : { type: 'FeatureCollection', features: await features('us-states') };
  const projection = (
    geo === 'world' ? geoNaturalEarth1() : geoAlbersUsa()
  ).fitSize([w, h], fitTo);
  const draw = geoPath(projection).digits(2);
  const paths: Record<string, string> = {};
  for (const f of fs) {
    const d = thin(draw(f) ?? '');
    if (d !== '') paths[f.properties.id] = d;
  }
  return { geo, width: w, height: h, paths };
}

/**
 * Width of the projected world in file units: a unit stays under a pixel on the largest world
 * map the site draws (about 830 px wide).
 */
const WORLD_PLANE_WIDTH = 800;

/**
 * The world map's shapes (world-atlas countries-50m) projected with geoEqualEarth, the
 * projection Choropleth drew the world with in the browser, the sphere fitted to
 * WORLD_PLANE_WIDTH. Each country goes through the projection's own stream, so d3's
 * antimeridian clipping and adaptive resampling apply exactly as when the browser drew it, and
 * the browser only scales the result to the plot area with the sphere's bounds (`frame`) in
 * place of the globe. Points are rounded to whole units and repeats dropped; a country whose
 * rings all shrink below a unit keeps one unit-sized triangle, so it can still be hovered.
 */
async function worldPlane(): Promise<WorldPlaneFile> {
  const t = await topo<Topology<{ countries: GeometryCollection }>>(
    'world-atlas/countries-50m.json'
  );
  const fc = feature(t, t.objects.countries) as FeatureCollection<
    Geometry,
    { name: string }
  >;
  const projection = geoEqualEarth().fitWidth(WORLD_PLANE_WIDTH, {
    type: 'Sphere',
  });
  const [[x0, y0], [x1, y1]] = geoPath(projection).bounds({ type: 'Sphere' });
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const features: WorldPlaneFeature[] = fc.features.map((f) => {
    const polygons: number[][][] = [];
    let rings: number[][] = [];
    let ring: number[] | null = null;
    // The first point streamed, for a country too small to keep a ring.
    const seen: { first?: [number, number] } = {};
    const sink = projection.stream({
      point(x: number, y: number) {
        if (ring == null) return;
        const px = Math.round(x);
        const py = Math.round(y);
        seen.first ??= [px, py];
        const n = ring.length;
        if (n >= 2 && ring[n - 2] === px && ring[n - 1] === py) return;
        ring.push(px, py);
      },
      lineStart() {
        ring = [];
      },
      lineEnd() {
        if (ring != null && ring.length >= 6) rings.push(encodeRing(ring));
        ring = null;
      },
      polygonStart() {
        rings = [];
      },
      polygonEnd() {
        if (rings.length > 0) polygons.push(rings);
        rings = [];
      },
      sphere() {},
    });
    geoStream(f, sink);
    if (polygons.length === 0 && seen.first != null) {
      const [px, py] = seen.first;
      polygons.push([encodeRing([px, py, px + 1, py, px, py + 1])]);
    }
    const numeric = f.id == null ? null : String(f.id);
    return {
      id:
        (numeric == null ? undefined : ISO_NUMERIC_TO_A3[numeric]) ??
        NAME_TO_A3[f.properties.name] ??
        null,
      name: f.properties.name,
      p: polygons,
    };
  });
  const [tx, ty] = projection.translate();
  return {
    scale: round(projection.scale()),
    translate: [round(tx), round(ty)],
    frame: [
      [round(x0), round(y0)],
      [round(x1), round(y1)],
    ],
    features,
  };
}

interface TypeData {
  entities: { id: string; name: string }[];
  metrics: Map<number, Metric>;
  values: Map<number, Map<number, number>>;
}

async function readType(dir: string, type: EntityType): Promise<TypeData> {
  const read = async <T>(f: string) =>
    JSON.parse(await readFile(path.join(dir, type, f), 'utf8')) as T;
  const raw = await read<{
    metrics: [number, number[], (number | string)[]][];
  }>('values.json');
  const values = new Map<number, Map<number, number>>();
  for (const [id, idx, vals] of raw.metrics) {
    const m = new Map<number, number>();
    idx.forEach((e, k) => {
      const v = vals[k];
      if (typeof v === 'number' && Number.isFinite(v)) m.set(e, v);
    });
    values.set(id, m);
  }
  return {
    entities: await read('entities.json'),
    metrics: new Map(
      (await read<Metric[]>('metrics.json')).map((m) => [m.id, m])
    ),
    values,
  };
}

interface MapDef {
  id: string;
  title: string;
  type: EntityType;
  geo: Geo;
  metric: number;
  /** 'party' colours the Republican-minus-Democratic margin red to blue */
  scale: 'seq' | 'party';
  blurb: string;
}

const MAPS: MapDef[] = [
  {
    id: 'state-income',
    title: 'Median household income',
    type: 'state',
    geo: 'us-states',
    metric: ACS.medianHouseholdIncome,
    scale: 'seq',
    blurb: 'Typical household income in each state, from the Census Bureau.',
  },
  {
    id: 'state-vote',
    title: 'The 2024 presidential vote',
    type: 'state',
    geo: 'us-states',
    metric: ELECTIONS.margin,
    scale: 'party',
    blurb: 'How far each state leaned Republican or Democratic for president.',
  },
  {
    id: 'state-prices',
    title: 'Cost of living',
    type: 'state',
    geo: 'us-states',
    metric: RPP.allItems,
    scale: 'seq',
    blurb: 'How expensive everyday prices are, compared with the US average.',
  },
  {
    id: 'state-unemployment',
    title: 'Unemployment',
    type: 'state',
    geo: 'us-states',
    metric: BLS.unemployment,
    scale: 'seq',
    blurb: 'The share of people looking for work who can’t find a job.',
  },
  {
    id: 'county-vote',
    title: 'The 2024 vote, county by county',
    type: 'county',
    geo: 'us-counties',
    metric: ELECTIONS.margin,
    scale: 'party',
    blurb: 'Every county’s presidential margin, blue to red.',
  },
  {
    id: 'county-obesity',
    title: 'Adult obesity by county',
    type: 'county',
    geo: 'us-counties',
    metric: CDC_PLACES.obesity,
    scale: 'seq',
    blurb: 'The share of adults with obesity, from CDC health estimates.',
  },
  {
    id: 'world-life',
    title: 'Life expectancy around the world',
    type: 'country',
    geo: 'world',
    metric: WORLD_BANK.lifeExpectancy,
    scale: 'seq',
    blurb: 'How long a newborn can expect to live, from the World Bank.',
  },
  {
    id: 'world-gdp',
    title: 'Income per person around the world',
    type: 'country',
    geo: 'world',
    metric: WORLD_BANK.gdpPerCapitaPpp,
    scale: 'seq',
    blurb: 'Income per person, adjusted for what money buys in each country.',
  },
];

/** Margin bands for party maps (Republican minus Democratic, points). */
const PARTY_EDGES = [-30, -15, -5, 0, 5, 15, 30];
const SEQ_BANDS = 7;

/** Quantile edges splitting `values` into `bands` equal-count groups. */
function quantileEdges(values: number[], bands: number): number[] {
  const s = [...values].sort((a, b) => a - b);
  return Array.from(
    { length: bands - 1 },
    (_, i) => s[Math.floor(((i + 1) * s.length) / bands)]
  );
}

const bandOf = (v: number, edges: number[]) => {
  let i = 0;
  while (i < edges.length && v >= edges[i]) i++;
  return i;
};

/** Statistics the combined map offers, with short labels and which end is better. */
const COMBINED: { id: number; label: string; pol: 1 | -1; on: boolean }[] = [
  { id: ACS.medianHouseholdIncome, label: 'Income', pol: 1, on: true },
  { id: RPP.allItems, label: 'Cost of living', pol: -1, on: true },
  { id: BLS.unemployment, label: 'Unemployment', pol: -1, on: true },
  { id: ACS.bachelorsShare, label: 'College degrees', pol: 1, on: true },
  { id: FBI_CRIME.violent, label: 'Violent crime', pol: -1, on: true },
  { id: ACS.povertyRate, label: 'Poverty', pol: -1, on: false },
  { id: ACS.commuteMinutes, label: 'Commute time', pol: -1, on: false },
  { id: ACS.broadbandShare, label: 'Broadband', pol: 1, on: false },
];

/**
 * Each state's percentile on each COMBINED statistic, 100 = best given its direction (rank
 * based, so dollars and rates combine fairly, as the combined ranking does by default).
 */
function combinedMap(d: TypeData): CombinedMap | null {
  const metrics = COMBINED.filter((c) => (d.values.get(c.id)?.size ?? 0) > 0);
  if (metrics.length === 0) return null;
  const places: CombinedMap['places'] = {};
  const names: CombinedMap['names'] = {};
  d.entities.forEach((e) => {
    places[e.id] = [];
    names[e.id] = e.name;
  });
  for (const c of metrics) {
    const vals = d.values.get(c.id) as Map<number, number>;
    const sorted = [...vals.values()].sort((a, b) => a - b);
    const n = sorted.length;
    d.entities.forEach((e, i) => {
      const v = vals.get(i);
      if (v == null) {
        places[e.id].push(null);
        return;
      }
      // Share of other places this one beats, oriented so 100 is the best end.
      const below = sorted.filter((x) => x < v).length;
      const equal = sorted.filter((x) => x === v).length;
      const pct = n > 1 ? ((below + (equal - 1) / 2) / (n - 1)) * 100 : 50;
      places[e.id].push(Math.round(c.pol === 1 ? pct : 100 - pct));
    });
  }
  return {
    metrics: metrics.map(({ id, label, pol }) => ({ id, label, pol })),
    defaults: metrics.filter((c) => c.on).map((c) => c.id),
    places,
    names,
  };
}

/** Writes public/data/maps. Returns how many home maps were drawn. */
export async function buildHomeMaps(dataDir: string): Promise<number> {
  const out = path.join(dataDir, 'maps');
  await mkdir(out, { recursive: true });
  for (const geo of ['us-states', 'us-counties', 'world'] as Geo[])
    await writeFile(
      path.join(out, `shapes-${geo}.json`),
      JSON.stringify(await shapes(geo))
    );
  await writeFile(
    path.join(dataDir, WORLD_PLANE_PATH),
    JSON.stringify(await worldPlane())
  );

  const topicInfo = new Map(
    (
      JSON.parse(
        await readFile(path.join(dataDir, 'topics.json'), 'utf8')
      ) as TopicSummary[]
    ).map((t) => [`${t.type}/${t.slug}`, t])
  );
  const cache = new Map<EntityType, TypeData>();
  const maps: HomeMap[] = [];
  for (const def of MAPS) {
    let d = cache.get(def.type);
    if (d == null) {
      d = await readType(dataDir, def.type);
      cache.set(def.type, d);
    }
    const metric = d.metrics.get(def.metric);
    const vals = d.values.get(def.metric);
    if (metric == null || vals == null || vals.size === 0) continue;
    const nums = [...vals.values()];
    const edges =
      def.scale === 'party' ? PARTY_EDGES : quantileEdges(nums, SEQ_BANDS);
    const bands: Record<string, number> = {};
    for (const [e, v] of vals) bands[d.entities[e].id] = bandOf(v, edges);
    maps.push({
      id: def.id,
      title: def.title,
      type: def.type,
      geo: def.geo,
      scale: def.scale,
      metric: {
        id: metric.id,
        label: metric.label,
        fmt: metric.fmt,
        unit: metric.unit,
        year: metric.year,
      },
      blurb: def.blurb,
      topic: metric.topics[0] ?? null,
      topicTitle:
        topicInfo.get(`${def.type}/${metric.topics[0] ?? ''}`)?.title ?? null,
      topicMetrics:
        topicInfo.get(`${def.type}/${metric.topics[0] ?? ''}`)?.metrics
          .length ?? 0,
      edges,
      min: Math.min(...nums),
      max: Math.max(...nums),
      bands,
    });
  }
  let states = cache.get('state');
  if (states == null) states = await readType(dataDir, 'state');
  // The home page's "Popular topics", as the index lists them (a renamed or dropped topic
  // drops out of the list).
  const popular: PopularTopic[] = POPULAR_TOPICS.flatMap((p) => {
    const t = topicInfo.get(`${p.type}/${p.slug}`);
    return t == null
      ? []
      : [
          {
            type: t.type,
            slug: t.slug,
            title: t.title,
            n: t.n,
            metrics: t.metrics.length,
          },
        ];
  });
  const file: HomeMapsFile = {
    maps,
    combined: combinedMap(states),
    popular,
  };
  await writeFile(path.join(out, 'home.json'), JSON.stringify(file));
  return maps.length;
}

if (import.meta.main)
  console.log(`${await buildHomeMaps(path.resolve('public/data'))} home maps`);
