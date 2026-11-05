// GEO audit: checks what AI answer engines (ChatGPT search, Perplexity, Google AI Overviews,
// Copilot) and search crawlers get from a sample of the site's pages, without running
// JavaScript, the way their crawlers read them.
//
//   bun scripts/geo-audit.ts                       # live site, 60 pages
//   bun scripts/geo-audit.ts --base http://localhost:4173 --pages 120
//   bun scripts/geo-audit.ts --dist                # the local build in dist/client
//
// Pages come from the sitemap, sampled evenly within each kind (topic, place, article, other),
// so the same base and count audit the same pages. Each page is checked for an indexable,
// self-canonical head, one <h1>, a quotable lead (a sentence with a figure), a year and a source
// in the text, valid JSON-LD of the type the page should carry, and leftover NaN/undefined.
// It also fetches a few pages as the main AI crawlers to confirm none is turned away. Exits 1
// when any check fails, so it can gate a deploy.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { SITE_URL } from '../src/site';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : (args[i + 1] ?? '');
};
const DIST = args.includes('--dist')
  ? path.resolve(import.meta.dir, '../dist/client')
  : null;
const BASE = (flag('base') ?? SITE_URL).replace(/\/$/, '');
const PAGES = Number(flag('pages') ?? 60);

type Kind = 'topic' | 'place' | 'article' | 'other';
const kindOf = (p: string): Kind =>
  p.startsWith('/topics/')
    ? 'topic'
    : p.startsWith('/places/') && p.split('/').length > 3
      ? 'place'
      : p.startsWith('/articles/') && p !== '/articles/'
        ? 'article'
        : 'other';

/** JSON-LD types each kind of page must carry. */
const EXPECTED: Record<Kind, string[]> = {
  topic: ['Dataset', 'BreadcrumbList'],
  place: ['Place', 'BreadcrumbList'],
  article: ['Article', 'BreadcrumbList'],
  other: [],
};

/** schema.org subtypes that satisfy an expected type. */
const ALSO: Record<string, string[]> = {
  Article: ['NewsArticle', 'BlogPosting', 'Report'],
  Place: ['AdministrativeArea', 'City', 'Country', 'State', 'Continent'],
};

const AI_AGENTS = [
  'GPTBot/1.1',
  'OAI-SearchBot/1.0',
  'ChatGPT-User/1.0',
  'ClaudeBot/1.0',
  'Claude-SearchBot/1.0',
  'PerplexityBot/1.0',
  'Googlebot/2.1',
  'bingbot/2.0',
];

/** A page's HTML: from dist/client (path/index.html or path.html) or over HTTP. */
async function load(
  p: string,
  agent?: string
): Promise<{ status: number; html: string }> {
  if (DIST != null) {
    const clean = p.replace(/\/$/, '');
    for (const f of [`${clean}/index.html`, `${clean}.html`]) {
      const file = path.join(DIST, f);
      if (existsSync(file))
        return { status: 200, html: readFileSync(file, 'utf8') };
    }
    return { status: 404, html: '' };
  }
  const res = await fetch(`${BASE}${p}`, {
    redirect: 'manual',
    headers: {
      'user-agent':
        agent == null
          ? 'Mozilla/5.0 (compatible; RankodexGeoAudit/1.0)'
          : `Mozilla/5.0 (compatible; ${agent}; +audit)`,
    },
  });
  return { status: res.status, html: await res.text() };
}

/** Site paths listed in the sitemap. */
async function sitemapPaths(): Promise<string[]> {
  const xml =
    DIST != null
      ? readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8')
      : await (await fetch(`${BASE}/sitemap.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    new URL(m[1]).pathname.replace(/(.)\/$/, '$1')
  );
}

/** `n` paths spread evenly over each kind, at least a few of each so small kinds are seen. */
function sample(paths: string[], n: number): string[] {
  const byKind = new Map<Kind, string[]>();
  for (const p of paths) {
    const k = kindOf(p);
    byKind.set(k, [...(byKind.get(k) ?? []), p]);
  }
  const out: string[] = [];
  for (const list of byKind.values()) {
    const want = Math.min(
      list.length,
      Math.max(5, Math.round((n * list.length) / paths.length))
    );
    const step = list.length / want;
    for (let i = 0; i < want; i++) out.push(list[Math.floor(i * step)]);
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
const textOf = (html: string) =>
  decode(
    html
      .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
const attr = (html: string, re: RegExp) => {
  const m = html.match(re);
  return m == null ? null : decode(m[1]);
};

/** Every @type in a JSON-LD value, nested ones included. */
function ldTypes(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) ldTypes(x, out);
  else if (v != null && typeof v === 'object') {
    const t = (v as Record<string, unknown>)['@type'];
    for (const x of Array.isArray(t) ? t : [t])
      if (typeof x === 'string') out.add(x);
    for (const x of Object.values(v)) ldTypes(x, out);
  }
  return out;
}

/** Problems with one page (empty when it passes), plus warnings that do not fail the run. */
function audit(
  p: string,
  status: number,
  html: string
): { fails: string[]; warns: string[] } {
  const fails: string[] = [];
  const warns: string[] = [];
  if (status !== 200) return { fails: [`status ${status}`], warns };
  const kind = kindOf(p);

  const title = attr(html, /<title>([^<]*)<\/title>/);
  if (title == null || title.length < 15) fails.push('title missing or short');
  else if (title.length > 70) warns.push(`title ${title.length} chars`);
  const desc = attr(html, /<meta name="description" content="([^"]*)"/);
  if (desc == null || desc.length < 50)
    fails.push('description missing or short');
  else if (desc.length > 170) warns.push(`description ${desc.length} chars`);

  const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);
  if (canonical == null) fails.push('no canonical');
  else if (new URL(canonical).pathname.replace(/(.)\/$/, '$1') !== p)
    fails.push(`canonical points elsewhere (${new URL(canonical).pathname})`);
  if (/<meta name="robots" content="[^"]*noindex/.test(html))
    fails.push('noindex page in the sitemap');
  if (attr(html, /<meta property="og:image" content="([^"]*)"/) == null)
    warns.push('no og:image');

  const h1s = html.match(/<h1\b/g)?.length ?? 0;
  if (h1s !== 1) fails.push(`${h1s} <h1> elements`);

  // The lead: the opening paragraphs after the <h1> (a dek, the answer and the line that backs
  // it), which answer engines quote most often. The first must be a real sentence and a figure
  // must appear among the first three.
  const afterH1 = html.slice(Math.max(0, html.search(/<\/h1>/)));
  const paras = [...afterH1.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
    .slice(0, 3)
    .map((m) => textOf(m[1]));
  const lead = paras[0] ?? '';
  if (kind !== 'other') {
    if (lead.length < 60) fails.push('no lead paragraph after the <h1>');
    else {
      if (!/\d/.test(paras.join(' '))) fails.push('lead has no figure');
      if (lead.length > 600) warns.push(`lead ${lead.length} chars`);
    }
  }

  const text = textOf(html.slice(html.search(/<body\b/)));
  const words = text.split(' ').length;
  if (words < 150) fails.push(`only ${words} words of text`);
  if (kind !== 'other') {
    if (!/\b(19|20)\d\d\b/.test(text.slice(0, 3000)))
      fails.push('no year near the top');
    if (!/\bsources?\b/i.test(text)) fails.push('no source named');
  }
  const junk = text.match(/\b(NaN|undefined|Infinity|null)\b/);
  if (junk != null) fails.push(`"${junk[0]}" in the text`);

  const types = new Set<string>();
  for (const m of html.matchAll(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
  )) {
    try {
      ldTypes(JSON.parse(m[1]), types);
    } catch {
      fails.push('JSON-LD does not parse');
    }
  }
  for (const t of EXPECTED[kind])
    if (!types.has(t) && !(ALSO[t] ?? []).some((x) => types.has(x)))
      fails.push(`no ${t} JSON-LD`);
  if (
    (kind === 'topic' || kind === 'article') &&
    !/"date(Modified|Published)"/.test(html)
  )
    // Undated sources (a fixed list such as the Confederate states) have no date to give.
    warns.push('no dateModified/datePublished');

  if (html.length > 1_500_000)
    warns.push(`${Math.round(html.length / 1024)} KB of HTML`);
  return { fails, warns };
}

/** Runs `fn` over `items` with at most `n` in flight, keeping the order. */
async function pool<T, R>(
  items: T[],
  n: number,
  fn: (x: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

const all = await sitemapPaths();
const pages = sample(all, PAGES);
console.log(
  `GEO audit of ${DIST ?? BASE}: ${pages.length} of ${all.length} sitemap pages\n`
);

const results = await pool(pages, 4, async (p) => {
  const { status, html } = await load(p);
  return { p, ...audit(p, status, html) };
});

const failCounts = new Map<string, number>();
for (const r of results) {
  for (const f of r.fails) {
    const key = f
      .replace(/\d+/g, 'N')
      .replace(/\(.*\)/, '')
      .trim();
    failCounts.set(key, (failCounts.get(key) ?? 0) + 1);
  }
  if (r.fails.length > 0)
    console.log(`FAIL ${r.p}\n     ${r.fails.join('; ')}`);
  if (r.warns.length > 0) console.log(`warn ${r.p}: ${r.warns.join('; ')}`);
}

const byKind = new Map<Kind, { n: number; ok: number }>();
for (const r of results) {
  const k = byKind.get(kindOf(r.p)) ?? { n: 0, ok: 0 };
  k.n++;
  if (r.fails.length === 0) k.ok++;
  byKind.set(kindOf(r.p), k);
}
console.log('\nPassed by kind');
for (const [k, v] of byKind) console.log(`  ${k.padEnd(8)} ${v.ok}/${v.n}`);
if (failCounts.size > 0) {
  console.log('\nMost common failures');
  for (const [f, n] of [...failCounts].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(3)}  ${f}`);
}

// Crawler access: the home page and one page of each kind, fetched as each AI and search bot.
// Cloudflare's bot rules verify real crawlers by network, so this catches user-agent rules and
// origin problems, not every block; Cloudflare's AI Crawl Control shows what real crawlers got.
let blocked = 0;
if (DIST == null) {
  const probe = [
    '/',
    ...(['topic', 'place', 'article'] as const).flatMap(
      (k) => pages.find((p) => kindOf(p) === k) ?? []
    ),
  ];
  console.log('\nCrawler access');
  for (const agent of AI_AGENTS) {
    const codes = await Promise.all(
      probe.map(async (p) => (await load(p, agent)).status)
    );
    const ok = codes.every((c) => c === 200);
    if (!ok) blocked++;
    console.log(
      `  ${agent.padEnd(22)} ${ok ? 'ok' : `got ${codes.join(', ')}`}`
    );
  }
}

const failed = results.filter((r) => r.fails.length > 0).length;
console.log(
  `\n${results.length - failed}/${results.length} pages pass${blocked > 0 ? `, ${blocked} crawlers turned away` : ''}`
);
process.exit(failed > 0 || blocked > 0 ? 1 : 0);
