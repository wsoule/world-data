// Downloads the ranking pages of worldpopulationreview.com into a local gzip
// cache so build-data.ts can run offline as often as needed.
//
//   moonx web:data-fetch -- [--refresh] [--concurrency=6] [--cache=.cache/pages]
//
// The site's robots.txt allows crawling. Concurrency stays low and pages that
// are already cached are skipped unless --refresh is passed.

import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { fetchSources } from './sources';

const BASE = 'https://worldpopulationreview.com';

/** Parses `--key=value` / `--flag` command-line arguments. */
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
const CONCURRENCY = Number(args.get('concurrency') ?? 6);
const REFRESH = args.get('refresh') === 'true';
/** Downloads from sources other than the ranking site, next to the page cache. */
const SOURCES = path.resolve(
  args.get('sources') ?? path.join(path.dirname(CACHE), 'sources')
);

const RANKING_PREFIXES = new Set([
  'country-rankings',
  'state-rankings',
  'us-city-rankings',
  'world-city-rankings',
  'us-county-rankings',
  'categories',
]);
const EXTRA = [
  '/countries',
  '/states',
  '/cities',
  '/us-cities',
  '/us-counties',
  '/categories',
];

/** Cache file for a site path, e.g. /state-rankings/x → state-rankings__x.html.gz */
const fileFor = (u: string): string => {
  const name = u.replace(/^\/|\/$/g, '').replaceAll('/', '__');
  return path.join(CACHE, `${name === '' ? 'index' : name}.html.gz`);
};

async function exists(f: string): Promise<boolean> {
  try {
    await access(f);
    return true;
  } catch {
    return false;
  }
}

/** GET with exponential backoff; resolves null for 404s. */
async function get(url: string, attempt = 0): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'world-data-builder/1.0 (+https://github.com/wsoule/world-data)',
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (attempt >= 4) throw err;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return get(url, attempt + 1);
  }
}

/** Every site path listed in the sitemap index. */
async function sitemapUrls(): Promise<string[]> {
  const index = (await get(`${BASE}/sitemap-index.xml`)) ?? '';
  const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1] ?? ''
  );
  const urls: string[] = [];
  for (const m of maps) {
    const xml = (await get(m)) ?? '';
    for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (loc != null) urls.push(loc.replace(BASE, ''));
    }
  }
  return urls;
}

async function main(): Promise<void> {
  await mkdir(CACHE, { recursive: true });
  const all = await sitemapUrls();
  const wanted = all.filter((u) => {
    const parts = u.split('/').filter((p) => p !== '');
    return parts.length === 2 && RANKING_PREFIXES.has(parts[0] ?? '');
  });
  const urls = [...new Set([...wanted, ...EXTRA])];
  console.log(`${urls.length} pages to cache in ${CACHE}`);

  let next = 0;
  const stats = { ok: 0, cached: 0, missing: 0, failed: 0 };
  async function worker(): Promise<void> {
    while (next < urls.length) {
      const u = urls[next++];
      if (u == null) break;
      const f = fileFor(u);
      if (!REFRESH && (await exists(f))) {
        stats.cached++;
        continue;
      }
      try {
        const html = await get(BASE + u);
        if (html == null) {
          stats.missing++;
          continue;
        }
        await writeFile(`${f}.tmp`, gzipSync(html));
        await rename(`${f}.tmp`, f);
        stats.ok++;
      } catch (err) {
        stats.failed++;
        console.warn('failed', u, err instanceof Error ? err.message : err);
      }
      if ((stats.ok + stats.failed) % 100 === 0) console.log(stats);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log('done', stats);

  await fetchSources(
    SOURCES,
    path.resolve('public/data/city/entities.json'),
    REFRESH
  );
}

await main();
