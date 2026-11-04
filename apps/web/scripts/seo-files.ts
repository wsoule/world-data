// Post-build: writes crawl and machine-readable files into dist/client next to
// the prerendered pages.
//
//   robots.txt      allows search and AI crawlers, points at the sitemap
//   llms.txt        site summary and entry points for AI answer engines
//   llms-full.txt   every topic with a one-line answer-first fact
//   site.webmanifest
//   404.html        the server render of an unknown path (the not-found view),
//                   which static hosts serve with a 404 status for any path
//                   without a page
//   data/<type>/topics/<slug>.csv   each topic's default-year table
//
// It also tidies what `vite build` leaves behind: sitemap URLs lose the
// trailing slash index routes get ("/categories/" -> "/categories", which the
// server would 308) and their duplicate entries, the sitemap keeps only pages
// whose own HTML is indexable and self-canonical (place profiles decide that
// while rendering), and TanStack's pages.json build manifest is removed so it
// is not published.
//
// Run by the web:build moon task (and the Dockerfile) after `vite build`, from
// apps/web: 404.html needs the server bundle that build leaves in dist/server.

import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
  Entity,
  EntityType,
  Manifest,
  Metric,
  TopicFile,
  TopicSummary,
} from '../src/data/types';
import { formatValue, typeNoun } from '../src/lib/format';
import { absoluteUrl, SITE, SITE_URL } from '../src/site';
import {
  belongsInSitemap,
  canonicalSitemap,
  filterSitemap,
  type PageIndexing,
  pageIndexing,
  setLastmod,
  sitemapLocs,
} from './lib/sitemap';
import { prerenderPages } from './prerender-pages';

const DATA = path.resolve('public/data');
const OUT = path.resolve('dist/client');

/** Crawlers named explicitly so their access is unambiguous. */
const AI_CRAWLERS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'GPTBot',
  'Claude-SearchBot',
  'Claude-User',
  'ClaudeBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Bingbot',
  'DuckAssistBot',
  'MistralAI-User',
];

const readJson = async <T>(file: string): Promise<T> =>
  JSON.parse(await readFile(path.join(DATA, file), 'utf8')) as T;

function robots(): string {
  return [
    '# Search engines and AI answer engines are welcome to crawl and cite this site.',
    'User-agent: *',
    'Allow: /',
    'Disallow: /search',
    '',
    ...AI_CRAWLERS.flatMap((ua) => [
      `User-agent: ${ua}`,
      'Allow: /',
      'Disallow: /search',
      '',
    ]),
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');
}

/** The built page for a site URL: dist/client/<path>/index.html. */
function pageFile(loc: string): string {
  const route = decodeURIComponent(new URL(loc).pathname).replace(
    /^\/+|\/+$/g,
    ''
  );
  return path.join(OUT, route, 'index.html');
}

/**
 * Robots and canonical tags of a built page, read from its first 64 KB (the
 * largest <head> is about 16 KB), or the whole file if the head runs longer.
 */
async function builtPageIndexing(file: string): Promise<PageIndexing> {
  const handle = await open(file);
  try {
    const buf = Buffer.alloc(65_536);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    const start = buf.toString('utf8', 0, bytesRead);
    return pageIndexing(
      start.includes('</head>') ? start : await readFile(file, 'utf8')
    );
  } finally {
    await handle.close();
  }
}

/**
 * Rewrites sitemap.xml: canonical <loc>s without duplicates, then only the
 * URLs whose built page is indexable and names itself as canonical. Thin place
 * profiles (isIndexablePlace) are removed here, since only the rendered page
 * knows; topics already left out by prerender-pages.ts would be too. Each
 * <lastmod> is the page's data date from prerender-pages.ts, or none. Fails
 * when a listed URL has no page. Returns how many URLs were kept and dropped
 * per section ("places/world-city", "topics/state", …).
 */
async function tidySitemap(): Promise<{
  kept: number;
  dropped: Map<string, number>;
}> {
  const file = path.join(OUT, 'sitemap.xml');
  const xml = canonicalSitemap(await readFile(file, 'utf8'));
  const keep = new Set<string>();
  const dropped = new Map<string, number>();
  const missing: string[] = [];
  for (const loc of sitemapLocs(xml)) {
    let page: PageIndexing;
    try {
      page = await builtPageIndexing(pageFile(loc));
    } catch {
      missing.push(loc);
      continue;
    }
    if (belongsInSitemap(loc, page)) {
      keep.add(loc);
      continue;
    }
    const section = new URL(loc).pathname.split('/').slice(1, 3).join('/');
    dropped.set(section, (dropped.get(section) ?? 0) + 1);
  }
  if (missing.length > 0) {
    throw new Error(
      `sitemap.xml lists URLs without a built page:\n${missing.join('\n')}`
    );
  }
  const lastmod = new Map(
    prerenderPages(DATA).map((p) => [
      absoluteUrl(p.path),
      p.sitemap?.lastmod ?? null,
    ])
  );
  await writeFile(
    file,
    setLastmod(
      filterSitemap(xml, (loc) => keep.has(loc)),
      (loc) => lastmod.get(loc) ?? null
    )
  );
  return { kept: keep.size, dropped };
}

/** A path no route matches, rendered to make 404.html. */
const NOT_FOUND_PATH = '/__not-found';

/** The fetch handler TanStack Start builds into dist/server/server.js. */
interface ServerEntry {
  default: { fetch: (request: Request) => Promise<Response> };
}

/**
 * The 404 page: the built server entry renders a path no route matches, the
 * same way it renders every prerendered page. The file holds the not-found
 * view itself (title, robots noindex, header and footer) plus the router state
 * for a global not-found, so the browser hydrates it without a mismatch at
 * whatever unknown URL the host serves it for. The SPA shell cannot do this:
 * its markup is the app's loading state, not the not-found view the client
 * renders, so every 404 used to fail hydration (React error #418).
 */
async function notFoundPage(): Promise<string> {
  const entry = path.resolve('dist/server/server.js');
  const server = (await import(pathToFileURL(entry).href)) as ServerEntry;
  const res = await server.default.fetch(
    new Request(new URL(NOT_FOUND_PATH, SITE_URL))
  );
  const html = await res.text();
  if (
    res.status !== 404 ||
    !html.includes(`<title>Page not found — ${SITE.name}</title>`) ||
    !html.includes('name="robots" content="noindex')
  ) {
    throw new Error(
      `404.html: rendering ${NOT_FOUND_PATH} gave status ${res.status} without the not-found title and robots tag`
    );
  }
  return html;
}

/** CSV-escapes one cell. */
const csvCell = (v: string | number | null): string => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Default-year column of a topic metric as entity index → value. */
function topicColumn(
  topic: TopicFile,
  metric: Metric
): Map<number, number | string> {
  const series = topic.series[String(metric.id)] ?? {};
  const year = metric.year == null ? '_' : String(metric.year);
  const pick = series[year] ?? series[Object.keys(series).sort().at(-1) ?? '_'];
  const out = new Map<number, number | string>();
  if (pick == null) return out;
  pick[0].forEach((i, k) => {
    const v = pick[1][k];
    if (v !== undefined) out.set(i, v);
  });
  return out;
}

/** One answer-first sentence: who leads and who trails on the topic's first numeric metric. */
function topicFact(
  topic: TopicFile,
  metrics: Map<number, Metric>,
  entities: Entity[]
): string {
  const metric = topic.metrics
    .map((id) => metrics.get(id))
    .find((m) => m?.kind === 'num');
  if (metric == null) return '';
  const col = [...topicColumn(topic, metric)].filter(
    (e): e is [number, number] => typeof e[1] === 'number'
  );
  if (col.length < 2) return '';
  const better = metric.pol === -1 ? 1 : -1;
  col.sort((a, b) => better * (a[1] - b[1]));
  const [topI, topV] = col[0];
  const [lowI, lowV] = col[col.length - 1];
  const year = metric.year == null ? '' : ` (${metric.year})`;
  const lead = metric.pol === -1 ? 'lowest' : 'highest';
  const tail = metric.pol === -1 ? 'highest' : 'lowest';
  return `${metric.label}${year}: ${entities[topI].name} has the ${lead} (${formatValue(metric, topV)}); ${entities[lowI].name} the ${tail} (${formatValue(metric, lowV)}).`;
}

/**
 * Fails the build when a page references a hashed asset that is not in
 * dist/client, for example a stylesheet whose hash differs between the client
 * and server builds. Checks the pages every visitor can land on first.
 */
async function assertAssetsExist(pages: readonly string[]): Promise<void> {
  const missing = new Set<string>();
  for (const page of pages) {
    const html = await readFile(path.join(OUT, page), 'utf8');
    for (const [, ref] of html.matchAll(/["'(](\/assets\/[^"')?#\s]+)/g)) {
      if (ref == null) continue;
      try {
        await readFile(path.join(OUT, ref));
      } catch {
        missing.add(`${page}: ${ref}`);
      }
    }
  }
  if (missing.size > 0) {
    throw new Error(
      `Pages reference assets that were not built:\n${[...missing].join('\n')}`
    );
  }
}

async function main(): Promise<void> {
  const site = SITE;
  const manifest = await readJson<Manifest>('manifest.json');
  const topics = await readJson<TopicSummary[]>('topics.json');

  const full: string[] = [
    `# ${site.name} — every topic`,
    '',
    `> ${site.description}`,
    '',
    `Each line links a topic page with its key fact. Data is compiled from World Population Review and the primary sources cited on each page; tables are also available as CSV at ${SITE_URL}/data/<type>/topics/<slug>.csv.`,
    '',
  ];
  let csvCount = 0;

  for (const t of manifest.types) {
    const type: EntityType = t.id;
    const entities = await readJson<Entity[]>(`${type}/entities.json`);
    const metricList = await readJson<Metric[]>(`${type}/metrics.json`);
    const metrics = new Map(metricList.map((m) => [m.id, m]));
    full.push(`## ${t.label}`, '');
    const ofType = topics.filter((x) => x.type === type);
    await mkdir(path.join(OUT, 'data', type, 'topics'), { recursive: true });
    for (const summary of ofType) {
      const topic = await readJson<TopicFile>(
        `${type}/topics/${summary.slug}.json`
      );
      const fact = topicFact(topic, metrics, entities);
      full.push(
        `- [${topic.title}](${SITE_URL}/topics/${type}/${topic.slug})${fact === '' ? '' : `: ${fact}`}`
      );

      // CSV: one row per place, one column per metric at its default year.
      const cols = topic.metrics
        .map((id) => metrics.get(id))
        .filter((m): m is Metric => m != null);
      const data = cols.map((m) => topicColumn(topic, m));
      const header = [
        'place',
        'id',
        ...cols.map((m) =>
          m.year == null ? m.label : `${m.label} (${m.year})`
        ),
      ];
      const rows = topic.entities.map((i) => [
        entities[i].name,
        entities[i].id,
        ...data.map((d) => d.get(i) ?? null),
      ]);
      const csv = [header, ...rows]
        .map((r) => r.map(csvCell).join(','))
        .join('\n');
      await writeFile(
        path.join(OUT, 'data', type, 'topics', `${topic.slug}.csv`),
        `${csv}\n`
      );
      csvCount++;
    }
    full.push('');
  }

  const popular = topics
    .filter((t) => t.type === 'country' || t.type === 'state')
    .sort((a, b) => b.metrics.length * b.n - a.metrics.length * a.n)
    .slice(0, 40);
  const llms = [
    `# ${site.name}`,
    '',
    `> ${site.description}`,
    '',
    `${site.name} covers ${manifest.types.map((t) => `${t.entities.toLocaleString('en-US')} ${typeNoun(t.label)}`).join(', ')}, across ${manifest.types.reduce((s, t) => s + t.topics, 0).toLocaleString('en-US')} topics. Every topic page states its sources and update date. Figures are compiled from World Population Review and the primary sources it cites.`,
    '',
    '## Start here',
    '',
    `- [All categories](${SITE_URL}/categories): browse topics by subject`,
    ...manifest.types.map(
      (t) =>
        `- [${t.label}](${SITE_URL}/places/${t.id}): every place with population and links to its report card`
    ),
    `- [Every topic with its key fact](${SITE_URL}/llms-full.txt)`,
    '',
    '## Categories',
    '',
    ...manifest.categories.map(
      (c) =>
        `- [${c.label}](${SITE_URL}/categories/${c.id}): ${c.topics.toLocaleString('en-US')} topics`
    ),
    '',
    '## Popular topics',
    '',
    ...popular.map(
      (t) => `- [${t.title}](${SITE_URL}/topics/${t.type}/${t.slug})`
    ),
    '',
    '## Data access',
    '',
    `- Each topic table is downloadable as CSV: ${SITE_URL}/data/<type>/topics/<slug>.csv (types: ${manifest.types.map((t) => t.id).join(', ')}).`,
    `- Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ];

  const webManifest = {
    name: site.name,
    short_name: site.name,
    description: site.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#4f46e5',
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };

  await writeFile(path.join(OUT, 'robots.txt'), robots());
  await writeFile(path.join(OUT, '404.html'), await notFoundPage());
  await assertAssetsExist([
    'index.html',
    '404.html',
    'compare/index.html',
    'topics/state/median-household-income-by-state/index.html',
  ]);
  const sitemap = await tidySitemap();
  await rm(path.join(OUT, 'pages.json'), { force: true });
  await writeFile(path.join(OUT, 'llms.txt'), llms.join('\n'));
  await writeFile(path.join(OUT, 'llms-full.txt'), full.join('\n'));
  await writeFile(
    path.join(OUT, 'site.webmanifest'),
    `${JSON.stringify(webManifest, null, 2)}\n`
  );
  const dropped = [...sitemap.dropped]
    .map(([section, n]) => `${n} ${section}`)
    .join(', ');
  console.log(
    `seo-files: robots.txt, 404.html, sitemap.xml (${sitemap.kept} URLs${dropped === '' ? '' : `; left out as noindex or non-canonical: ${dropped}`}), llms.txt, llms-full.txt (${topics.length} topics), site.webmanifest, ${csvCount} CSV files`
  );
}

await main();
