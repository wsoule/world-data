// Computes the data stories (articles) from the published dataset into public/data/stories:
// one JSON file per story with its points, correlation, trend line, extremes and exceptions,
// plus index.json listing them with chart thumbnails for the home page and the articles index.
//
// Stories are the hand-picked ones in src/content/storyDefs.ts plus automatic "pair" articles:
// strongly related pairs of the curated metrics (PAIR_METRICS) from different sources, capped
// per place type, so only relationships worth reading get a page.

import { linearRegression, pearson, spearman } from '@world-data/stats';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  family,
  LOG_METRICS,
  PAIR_METRICS,
  STORY_DEFS,
  type StoryDef,
} from '../src/content/storyDefs';
import type {
  StoryData,
  StoryMetric,
  StoryPoint,
  StorySummary,
} from '../src/content/storyTypes';
import type { EntityType, Metric, TopicSummary } from '../src/data/types';
import { newestDate } from '../src/seo/indexing';

interface TypeData {
  entities: { id: string; name: string; slug: string }[];
  metrics: Map<number, Metric>;
  /** id → values aligned to entities (number, string or undefined) */
  values: Map<number, (number | string | undefined)[]>;
  /** Topic slug → its update date (topics.json), for metrics without one of their own */
  topicDates: Map<string, string | null>;
}

async function readType(
  dir: string,
  type: EntityType,
  topics: readonly TopicSummary[]
): Promise<TypeData> {
  const read = async <T>(f: string) =>
    JSON.parse(await readFile(path.join(dir, type, f), 'utf8')) as T;
  const entities = await read<TypeData['entities']>('entities.json');
  const metrics = new Map(
    (await read<Metric[]>('metrics.json')).map((m) => [m.id, m])
  );
  const raw = await read<{
    metrics: [number, number[], (number | string)[]][];
  }>('values.json');
  const values = new Map<number, (number | string | undefined)[]>();
  for (const [id, idx, vals] of raw.metrics) {
    const col = new Array<number | string | undefined>(entities.length);
    idx.forEach((e, k) => (col[e] = vals[k]));
    values.set(id, col);
  }
  const topicDates = new Map(
    topics.filter((t) => t.type === type).map((t) => [t.slug, t.updated])
  );
  return { entities, metrics, values, topicDates };
}

/**
 * The date of the newest data a story uses: each metric's update date, else the update (fetch)
 * date of its primary topic, which is what agency statistics carry. Never the build date, so a
 * story's date only moves when its data does.
 */
function storyDate(
  d: TypeData,
  ids: readonly (number | undefined)[]
): string | null {
  return newestDate(
    ids.map((id) => {
      const m = id == null ? undefined : d.metrics.get(id);
      if (m == null) return null;
      const topic = m.topics[0];
      return (
        m.updated ?? (topic == null ? null : d.topicDates.get(topic)) ?? null
      );
    })
  );
}

/** Four significant digits: plenty for a chart, a quarter of the bytes. */
const round = (v: number) => Number(v.toPrecision(4));

const num = (v: number | string | undefined) =>
  typeof v === 'number' && Number.isFinite(v) ? v : NaN;

/** A metric's label as it reads in a title or sentence: without a trailing unit. */
export const shortLabel = (label: string): string => {
  const bare = label.replace(/\s*\([^()]*\)$/, '').trim();
  return bare === '' ? label : bare;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/’/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const TYPE_NOUN: Record<EntityType, string> = {
  state: 'state',
  county: 'county',
  city: 'city',
  country: 'country',
  'world-city': 'world city',
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function info(m: Metric): StoryMetric {
  return {
    id: m.id,
    label: m.label,
    fmt: m.fmt,
    unit: m.unit,
    pol: m.pol,
    year: m.year,
    topic: m.topics[0] ?? null,
  };
}

/** Computes one story; null when its metrics are missing or overlap too little. */
function compute(
  d: TypeData,
  def: StoryDef,
  kind: StoryData['kind']
): StoryData | null {
  const xm = d.metrics.get(def.x);
  const ym = d.metrics.get(def.y);
  const xs = d.values.get(def.x);
  const ys = d.values.get(def.y);
  if (xm == null || ym == null || xs == null || ys == null) return null;
  const cm = def.color == null ? undefined : d.metrics.get(def.color);
  const cs = def.color == null ? undefined : d.values.get(def.color);
  const logX = def.logX === true;
  const points: StoryPoint[] = [];
  const tx: number[] = [];
  const ty: number[] = [];
  d.entities.forEach((e, i) => {
    const x = num(xs[i]);
    const y = num(ys[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || (logX && x <= 0)) return;
    const c = cs?.[i];
    points.push({
      name: e.name,
      slug: e.slug,
      x,
      y,
      ...(typeof c === 'string' ? { c } : {}),
    });
    tx.push(logX ? Math.log10(x) : x);
    ty.push(y);
  });
  if (points.length < 10) return null;
  const pr = pearson(tx, ty);
  const sr = spearman(tx, ty);
  const reg = linearRegression(tx, ty);
  const byY = [...points].sort((a, b) => b.y - a.y);
  const residual = points.map((p, i) => ({ p, res: reg.residuals[i] }));
  residual.sort((a, b) => b.res - a.res);
  const groups = new Map<string, { n: number; sx: number; sy: number }>();
  for (const p of points)
    if (p.c != null) {
      const g = groups.get(p.c) ?? { n: 0, sx: 0, sy: 0 };
      g.n++;
      g.sx += p.x;
      g.sy += p.y;
      groups.set(p.c, g);
    }
  return {
    slug: def.slug,
    kind,
    type: def.type,
    title: def.title,
    dek: def.dek,
    cats: def.cats,
    featured: def.featured === true,
    x: info(xm),
    y: info(ym),
    color: cm == null ? null : { id: cm.id, label: cm.label },
    logX,
    n: points.length,
    r: pr.r,
    rho: sr.r,
    p: pr.p,
    slope: reg.slope,
    intercept: reg.intercept,
    medianX: median(points.map((p) => p.x)),
    medianY: median(points.map((p) => p.y)),
    points: points.map((p) => [round(p.x), round(p.y), p.c ?? null]),
    top: byY.slice(0, 5),
    bottom: byY.slice(-5).reverse(),
    above: residual.slice(0, 3).map((r) => r.p),
    below: residual
      .slice(-3)
      .reverse()
      .map((r) => r.p),
    groups: [...groups]
      .map(([name, g]) => ({
        name,
        n: g.n,
        meanX: g.sx / g.n,
        meanY: g.sy / g.n,
      }))
      .sort((a, b) => b.n - a.n),
    date: storyDate(d, [def.x, def.y, def.color]),
  };
}

/** Which metric of a pair goes across: causes before outcomes (Census, World Bank, prices, climate). */
// Climate and prices first, then Census and World Bank, then outcomes (health, air, crime, votes).
const AXIS_ORDER = [9004, 9000, 9006, 9001, 9002, 9003, 9007, 9008];
const axisRank = (id: number) => {
  const i = AXIS_ORDER.indexOf(family(id));
  return i < 0 ? AXIS_ORDER.length : i;
};

/** Most pair articles per place type, and per metric, so no single metric floods the list. */
const PAIR_CAP: Partial<Record<EntityType, number>> = {
  state: 30,
  county: 35,
  country: 25,
  city: 10,
};
const PER_METRIC = 6;
const MIN_R = 0.5;

/** Strong cross-source pairs for one type, as story definitions. */
function pairDefs(
  d: TypeData,
  type: EntityType,
  taken: Set<string>
): StoryDef[] {
  const minN = Math.ceil(d.entities.length * (type === 'country' ? 0.5 : 0.6));
  const ids = [...PAIR_METRICS].filter((id) => {
    const m = d.metrics.get(id);
    return m != null && m.kind === 'num' && m.n >= minN;
  });
  const found: { a: number; b: number; r: number }[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [ids[i], ids[j]];
      // World Bank indicators are distinct measures; other families hold near-duplicates.
      if (family(a) === family(b) && family(a) !== 9001) continue;
      const [x, y] = axisRank(a) <= axisRank(b) ? [a, b] : [b, a];
      if (taken.has(`${type}:${x}:${y}`) || taken.has(`${type}:${y}:${x}`))
        continue;
      const lx = LOG_METRICS.has(x);
      const xv = (d.values.get(x) ?? []).map((v) => {
        const n = num(v);
        return lx ? (n > 0 ? Math.log10(n) : NaN) : n;
      });
      const yv = (d.values.get(y) ?? []).map(num);
      const c = pearson(xv, yv);
      if (Math.abs(c.r) >= MIN_R && Math.abs(c.r) < 0.97 && c.n >= minN)
        found.push({ a: x, b: y, r: c.r });
    }
  found.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
  const uses = new Map<number, number>();
  const out: StoryDef[] = [];
  for (const f of found) {
    if (out.length >= (PAIR_CAP[type] ?? 0)) break;
    if (
      (uses.get(f.a) ?? 0) >= PER_METRIC ||
      (uses.get(f.b) ?? 0) >= PER_METRIC
    )
      continue;
    uses.set(f.a, (uses.get(f.a) ?? 0) + 1);
    uses.set(f.b, (uses.get(f.b) ?? 0) + 1);
    const xs = shortLabel(d.metrics.get(f.a)?.label ?? '');
    const ys = shortLabel(d.metrics.get(f.b)?.label ?? '');
    const noun = TYPE_NOUN[type];
    out.push({
      slug: `${slugify(ys)}-vs-${slugify(xs)}-by-${slugify(noun)}`,
      type,
      x: f.a,
      y: f.b,
      logX: LOG_METRICS.has(f.a),
      title: `${ys} vs. ${xs} by ${noun.replace(/\b\w/g, (c) => c.toUpperCase())}`,
      dek: '',
      cats: [
        ...new Set(
          [d.metrics.get(f.a)?.cats[0], d.metrics.get(f.b)?.cats[0]].filter(
            (c): c is string => c != null
          )
        ),
      ],
    });
  }
  return out;
}

/** Up to 120 points scaled to 0–1 for a card thumbnail, plus the trend line's ends. */
function thumbnail(s: StoryData): Pick<StorySummary, 'thumb' | 'line'> {
  const tx = (x: number) => (s.logX ? Math.log10(x) : x);
  const xs = s.points.map((p) => tx(p[0]));
  const ys = s.points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0));
  const sy = (y: number) => (y1 === y0 ? 0.5 : (y - y0) / (y1 - y0));
  const step = Math.max(1, Math.ceil(s.points.length / 120));
  const thumb = s.points
    .filter((_, i) => i % step === 0)
    .map((p): [number, number, string | null] => [
      Math.round(sx(tx(p[0])) * 100) / 100,
      Math.round(sy(p[1]) * 100) / 100,
      p[2],
    ]);
  const ly = (x: number) => sy(s.intercept + s.slope * x);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const line: StorySummary['line'] = Number.isFinite(s.slope)
    ? [0, clamp(ly(x0)), 1, clamp(ly(x1))]
    : null;
  return { thumb, line };
}

/** Writes public/data/stories from the dataset in `dataDir`. Returns the number of stories. */
export async function buildStories(dataDir: string): Promise<number> {
  const out = path.join(dataDir, 'stories');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const types = [...new Set(STORY_DEFS.map((d) => d.type))].concat(
    Object.keys(PAIR_CAP) as EntityType[]
  );
  const topics = JSON.parse(
    await readFile(path.join(dataDir, 'topics.json'), 'utf8')
  ) as TopicSummary[];
  const data = new Map<EntityType, TypeData>();
  for (const t of new Set(types))
    data.set(t, await readType(dataDir, t, topics));

  const stories: StoryData[] = [];
  const taken = new Set<string>();
  for (const def of STORY_DEFS) {
    const s = compute(data.get(def.type) as TypeData, def, 'flagship');
    if (s == null) {
      console.warn(`story ${def.slug}: not enough data, skipped`);
      continue;
    }
    stories.push(s);
    taken.add(`${def.type}:${def.x}:${def.y}`);
  }
  for (const [type, d] of data)
    for (const def of pairDefs(d, type, taken)) {
      const s = compute(d, def, 'pair');
      if (s != null && !stories.some((x) => x.slug === s.slug)) stories.push(s);
    }

  const index: StorySummary[] = [];
  for (const s of stories) {
    await writeFile(path.join(out, `${s.slug}.json`), JSON.stringify(s));
    index.push({
      slug: s.slug,
      kind: s.kind,
      type: s.type,
      title: s.title,
      dek: s.dek,
      cats: s.cats,
      featured: s.featured,
      r: s.r,
      n: s.n,
      xLabel: s.x.label,
      yLabel: s.y.label,
      xId: s.x.id,
      yId: s.y.id,
      colorId: s.color?.id ?? null,
      logX: s.logX,
      date: s.date ?? null,
      // Only flagship stories show a chart on their cards.
      ...(s.kind === 'flagship' ? thumbnail(s) : { thumb: [], line: null }),
    });
  }
  await writeFile(path.join(out, 'index.json'), JSON.stringify(index));
  return stories.length;
}
