#!/usr/bin/env node
// Downloads the ranking pages of worldpopulationreview.com into a local gzip cache.
//
//   node scripts/fetch-pages.mjs [--refresh] [--concurrency=6] [--cache=.cache/pages]
//
// The site's robots.txt allows crawling. We keep concurrency low and cache every
// page so `build-data.mjs` can be re-run offline as often as needed.

import { mkdir, writeFile, rename, access } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'

const BASE = 'https://worldpopulationreview.com'
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)
const CACHE = path.resolve(args.cache ?? process.env.WPR_CACHE ?? '.cache/pages')
const CONCURRENCY = Number(args.concurrency ?? 6)
const REFRESH = Boolean(args.refresh)

const RANKING_PREFIXES = [
  'country-rankings',
  'state-rankings',
  'us-city-rankings',
  'world-city-rankings',
  'us-county-rankings',
  'categories',
]
const EXTRA = ['/countries', '/states', '/cities', '/us-cities', '/us-counties', '/categories']

const fileFor = (u) => path.join(CACHE, (u.replace(/^\/|\/$/g, '').replaceAll('/', '__') || 'index') + '.html.gz')

async function exists(f) {
  try {
    await access(f)
    return true
  } catch {
    return false
  }
}

async function get(url, attempt = 0) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'world-data-builder/1.0 (+https://github.com/wsoule/world-data)' } })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (err) {
    if (attempt >= 4) throw err
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    return get(url, attempt + 1)
  }
}

async function sitemapUrls() {
  const index = await get(`${BASE}/sitemap-index.xml`)
  const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  const urls = []
  for (const m of maps) {
    const xml = await get(m)
    for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(loc.replace(BASE, ''))
  }
  return urls
}

async function main() {
  await mkdir(CACHE, { recursive: true })
  const all = await sitemapUrls()
  const wanted = all.filter((u) => {
    const parts = u.split('/').filter(Boolean)
    return parts.length === 2 && RANKING_PREFIXES.includes(parts[0])
  })
  const urls = [...new Set([...wanted, ...EXTRA])]
  console.log(`${urls.length} pages to cache in ${CACHE}`)

  let i = 0
  const stats = { ok: 0, cached: 0, missing: 0, failed: 0 }
  async function worker() {
    while (i < urls.length) {
      const u = urls[i++]
      const f = fileFor(u)
      if (!REFRESH && (await exists(f))) {
        stats.cached++
        continue
      }
      try {
        const html = await get(BASE + u)
        if (html == null) {
          stats.missing++
          continue
        }
        await writeFile(f + '.tmp', gzipSync(html))
        await rename(f + '.tmp', f)
        stats.ok++
      } catch (err) {
        stats.failed++
        console.warn('failed', u, err.message)
      }
      if ((stats.ok + stats.failed) % 100 === 0) console.log(stats)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log('done', stats)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
