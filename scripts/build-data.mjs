#!/usr/bin/env node
// Turns the cached worldpopulationreview.com pages into the static dataset under public/data.
//
//   node scripts/build-data.mjs [--cache=.cache/pages] [--out=public/data]
//
// Output layout (all JSON):
//   manifest.json                     entity types, categories, build stats
//   topics.json                       every topic (source page) with its metric ids
//   <type>/entities.json              the places of that type (countries, states, ...)
//   <type>/metrics.json               metric catalog (label, format, years, polarity, topics)
//   <type>/values.json                default-year value of every metric, sparse, aligned to entities
//   <type>/topics/<slug>.json         one topic: metadata, sources, tables and every year of its metrics
//
// Only data, titles and source citations are kept. Page prose is intentionally not copied.

import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'
import { decodeEntities, parseIslands, parseInlineData } from './lib/astro.mjs'
import { STATE_REGIONS, CATEGORY_LABELS, guessPolarity } from './lib/reference.mjs'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)
const CACHE = path.resolve(args.cache ?? process.env.WPR_CACHE ?? '.cache/pages')
const OUT = path.resolve(args.out ?? 'public/data')
const SITE = 'https://worldpopulationreview.com'

/** Entity types we support, keyed by the page prefix that ranks them. */
const TYPES = {
  'country-rankings': { id: 'country', label: 'Countries', singular: 'Country' },
  'state-rankings': { id: 'state', label: 'US States', singular: 'State' },
  'us-city-rankings': { id: 'city', label: 'US Cities', singular: 'US City' },
  'world-city-rankings': { id: 'world-city', label: 'World Cities', singular: 'World City' },
  'us-county-rankings': { id: 'county', label: 'US Counties', singular: 'County' },
}

const TEXT_FORMATS = new Set([null, '', 'pipesToList', 'csvToList', 'link', 'date', 'dateShort', 'clockTime', 'checkboxes', 'format', 'stateFlag', 'zipCode'])
const JUNK = /^(#N\/A|N\/A|NA|n\/a|-+|—|–|\.+|\\|\||TBD|unavailable|none|null|undefined|\?)$/i

const log = (...a) => console.log(...a)
const warnings = new Map()
const warn = (kind, detail) => {
  const w = warnings.get(kind) ?? { count: 0, examples: [] }
  w.count++
  if (w.examples.length < 5) w.examples.push(detail)
  warnings.set(kind, w)
}

// ---------------------------------------------------------------------------
// Value cleaning

function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s || JUNK.test(s)) return null
  const cleaned = s.replace(/[$€£,%\s]/g, '').replace(/^\+/, '')
  if (/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(cleaned)) return Number(cleaned)
  return undefined // not numeric
}

function toText(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return v.filter((x) => x != null).join(', ') || null
  if (typeof v !== 'string') return null
  const s = decodeEntities(v.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
  if (!s || JUNK.test(s)) return null
  return s.length > 280 ? s.slice(0, 277) + '…' : s
}

const round = (n) => (Number.isInteger(n) ? n : Number(n.toPrecision(10)))

// ---------------------------------------------------------------------------
// Page metadata

function pageTitle(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  if (!m) return null
  return decodeEntities(m[1].replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

function stripYear(title) {
  return title.replace(/\s+(19|20)\d{2}(\s*[-–]\s*(19|20)\d{2})?$/, '').trim()
}

function sectionLinks(html, id) {
  const i = html.search(new RegExp(`id="${id}"`))
  if (i < 0) return []
  const chunk = html.slice(i, i + 20000)
  const end = chunk.search(/<\/ol>|<\/ul>/)
  const body = end > 0 ? chunk.slice(0, end) : chunk
  return [...body.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    url: decodeEntities(m[1]),
    name: decodeEntities(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim(),
  }))
}

function lastUpdated(html) {
  const m = html.match(/Last Updated:<\/span>\s*([A-Z][a-z]+ \d{1,2}, \d{4})/)
  if (!m) return null
  const d = new Date(m[1] + ' UTC')
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Entity identity per type

const nameIndex = { country: new Map(), state: new Map() }

const AGGREGATE_NAMES = /^(total|totals|world|global|average|avg|median|sum|overall|(united states|u\.s\.|us) (total|average)|national|all states|all countries|other|others)$/i
const LABEL_FIELD = { country: 'country', state: 'state', city: 'city', 'world-city': 'worldCity', county: 'county' }

function entityOf(typeId, row) {
  const s = (v) => (typeof v === 'string' ? decodeEntities(v).trim() : v)
  if (row.isTotal || row.isAverage || row.isSummary) return null
  const label = s(row[LABEL_FIELD[typeId]] ?? row.name)
  if (typeof label === 'string' && AGGREGATE_NAMES.test(label)) return null
  if (typeId === 'state' && /^united states$/i.test(label ?? '')) return null
  if (typeId === 'state' && (row.code === 'US' || row.code === 'USA')) return null
  switch (typeId) {
    case 'country': {
      let id = typeof row.cca3 === 'string' && /^[A-Z]{3}$/.test(row.cca3) ? row.cca3 : null
      const name = s(row.country)
      if (!id && name) id = nameIndex.country.get(name.toLowerCase()) ?? null
      if (!id) return null
      if (name) nameIndex.country.set(name.toLowerCase(), id)
      return {
        id,
        name,
        flag: (row.cca2 || row.flagCode || '').toString().toLowerCase() || null,
        group: (Array.isArray(row.continent) ? s(row.continent[0]) : s(row.continent)) || null,
        sub: (Array.isArray(row.subregion) ? s(row.subregion[0]) : s(row.subregion)) || null,
      }
    }
    case 'state': {
      const name = s(row.state)
      let id = typeof row.code === 'string' && /^[A-Z]{2}$/.test(row.code) ? row.code : null
      if (!id && name) id = nameIndex.state.get(name.toLowerCase()) ?? null
      if (!id) return null
      if (name) nameIndex.state.set(name.toLowerCase(), id)
      return { id, name, flag: id.toLowerCase(), group: STATE_REGIONS[id] ?? 'Other', fips: row.fips ? String(row.fips).padStart(2, '0') : null }
    }
    case 'city': {
      const slug = s(row.slug)
      if (!slug) return null
      const code = s(row.code) || s(row.stateCode)
      return {
        id: slug,
        name: code ? `${s(row.city)}, ${code}` : s(row.city),
        flag: code ? code.toLowerCase() : null,
        group: STATE_REGIONS[code] ?? s(row.state) ?? null,
        sub: s(row.state) || null,
        lat: num(row.lat ?? row.latitude),
        lng: num(row.lng ?? row.longitude),
      }
    }
    case 'world-city': {
      const slug = s(row.slug)
      if (!slug) return null
      return {
        id: slug,
        name: s(row.worldCity) || s(row.city),
        flag: (row.cca2 || row.flagCode || '').toString().toLowerCase() || null,
        group: s(row.country) || null,
        sub: s(row.state) || null,
        lat: num(row.latitude ?? row.lat),
        lng: num(row.longitude ?? row.lng),
      }
    }
    case 'county': {
      const fips = row.fips != null ? String(row.fips).padStart(5, '0') : null
      if (!fips) return null
      const code = s(row.stateCode) || s(row.code)
      const county = s(row.county) || s(row.name)
      return {
        id: fips,
        name: code ? `${county}, ${code}` : county,
        flag: code ? code.toLowerCase() : null,
        group: STATE_REGIONS[code] ?? null,
        sub: s(row.state) || null,
        slug: s(row.slug) || null,
      }
    }
  }
  return null
}

const num = (v) => {
  const n = toNumber(v)
  return typeof n === 'number' ? n : null
}

// Entity-level attributes that pages repeat in their rows (population, density, growth, area).
function baseAttributes(typeId, row) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    density: n(row.densityMi) ?? (typeId === 'country' ? n(row.density) : null),
    growth: n(row.growthRate) ?? n(row.growth) ?? null,
    growth2020: n(row.growthSince2020),
    area: typeId === 'country' ? n(row.area) : n(row.areaMi),
  }
}

function populationOf(row) {
  let best = null
  let bestYear = -1
  for (const [k, v] of Object.entries(row)) {
    const m = k.match(/^pop(\d{4})$/)
    if (m && typeof v === 'number' && Number(m[1]) > bestYear) {
      bestYear = Number(m[1])
      best = v
    }
  }
  if (best == null && typeof row.population === 'number') best = row.population
  return best
}

// ---------------------------------------------------------------------------
// Main build

async function main() {
  const files = (await readdir(CACHE)).filter((f) => f.endsWith('.html.gz'))
  log(`reading ${files.length} cached pages from ${CACHE}`)

  /** @type {Record<string, {entities: Map<string, any>, metrics: Map<number, any>, topics: any[]}>} */
  const db = {}
  for (const t of Object.values(TYPES)) db[t.id] = { entities: new Map(), metrics: new Map(), topics: [] }

  const categoryTopics = new Map() // "type:slug" -> Set(category)
  const pages = []

  for (const f of files) {
    const [prefix, slug] = f.replace(/\.html\.gz$/, '').split('__')
    if (prefix === 'categories' && slug) {
      const html = gunzipSync(await readFile(path.join(CACHE, f))).toString('utf8')
      for (const [, p, s] of html.matchAll(/href="\/(country-rankings|state-rankings|us-city-rankings|world-city-rankings|us-county-rankings)\/([^"/?#]+)"/g)) {
        const key = `${TYPES[p].id}:${s}`
        if (!categoryTopics.has(key)) categoryTopics.set(key, new Set())
        categoryTopics.get(key).add(slug)
      }
      continue
    }
    if (TYPES[prefix] && slug) pages.push({ prefix, slug, file: f })
  }

  // Two passes so name→id fallbacks learned anywhere can resolve rows that lack ids.
  const parsed = []
  for (const p of pages) {
    const html = gunzipSync(await readFile(path.join(CACHE, p.file))).toString('utf8')
    const islands = parseIslands(html).filter((i) => Array.isArray(i.props.data) && Array.isArray(i.props.columns))
    if (!islands.length) {
      warn('page-without-structured-table', `${p.prefix}/${p.slug}${parseInlineData(html) ? ' (inline)' : ''}`)
      continue
    }
    const main = islands.reduce((a, b) => (b.props.data.length > a.props.data.length ? b : a))
    const columns = new Map()
    for (const isl of islands) for (const c of isl.props.columns) if (c && typeof c.id === 'number' && c.field) columns.set(c.field, c)
    // Drop pre-rendered display strings (HTML) early; they dominate memory.
    const rows = main.props.data.map((r) => {
      const o = {}
      for (const k in r) if (!k.endsWith('Disp')) o[k] = r[k]
      return o
    })
    const typeId = TYPES[p.prefix].id
    for (const r of rows) entityOf(typeId, r) // warm the name index
    parsed.push({
      ...p,
      typeId,
      rows,
      columns: [...columns.values()],
      tables: Array.isArray(main.props.tables) ? main.props.tables : null,
      title: pageTitle(html),
      sources: sectionLinks(html, 'sources').filter((s) => /^https?:/.test(s.url) && s.name),
      related: sectionLinks(html, 'related-pages')
        .map((l) => l.url.match(/^\/(country-rankings|state-rankings|us-city-rankings|world-city-rankings|us-county-rankings)\/([^/?#]+)/))
        .filter(Boolean)
        .map((m) => ({ type: TYPES[m[1]].id, slug: m[2] })),
      updated: lastUpdated(html),
    })
  }
  log(`${parsed.length} pages with structured tables`)

  for (const page of parsed) {
    const T = db[page.typeId]
    const rowEntities = []
    for (const r of page.rows) {
      const e = entityOf(page.typeId, r)
      if (!e) {
        warn(`row-without-identity:${page.typeId}`, `${page.slug}: ${JSON.stringify(r).slice(0, 120)}`)
        rowEntities.push(null)
        continue
      }
      const prev = T.entities.get(e.id)
      const pop = populationOf(r)
      const base = baseAttributes(page.typeId, r)
      if (!prev) T.entities.set(e.id, { ...e, pop, ...base })
      else {
        for (const [k, v] of Object.entries(base)) if (prev[k] == null && v != null) prev[k] = v
        for (const [k, v] of Object.entries(e)) if (prev[k] == null && v != null) prev[k] = v
        if (pop != null && (prev.pop == null || page.slug === 'population')) prev.pop = pop
      }
      rowEntities.push(e.id)
    }

    const topicMetrics = []
    const series = {} // metricId -> year|'_' -> Map(entityId -> value)
    for (const c of page.columns) {
      const id = c.id
      let m = T.metrics.get(id)
      if (!m) {
        m = {
          id,
          key: c.dbField || c.field.replace(/_(\d{4})$/, ''),
          headers: new Map(),
          fmt: c.format ?? null,
          unit: c.unit ?? null,
          sortAsc: c.sortAsc ?? 0,
          years: new Map(),
          topics: new Set(),
          updated: null,
          numeric: 0,
          strings: 0,
          distinct: new Set(),
          textLen: 0,
        }
        T.metrics.set(id, m)
      }
      const header = toText(c.header) || toText(c.label) || m.key
      m.headers.set(header, (m.headers.get(header) ?? 0) + 1)
      if (c.lastUpdated && (!m.updated || c.lastUpdated > m.updated)) m.updated = c.lastUpdated.slice(0, 10)
      m.topics.add(page.slug)
      if (!topicMetrics.includes(id)) topicMetrics.push(id)

      const year = typeof c.year === 'number' ? c.year : '_'
      if (!m.years.has(year)) m.years.set(year, new Map())
      const store = m.years.get(year)
      series[id] ??= {}
      series[id][year] ??= new Map()
      page.rows.forEach((r, i) => {
        const eid = rowEntities[i]
        if (!eid) return
        const raw = r[c.field]
        if (raw == null || raw === '') return
        const n = TEXT_FORMATS.has(m.fmt) ? undefined : toNumber(raw)
        let v
        if (typeof n === 'number') {
          v = round(n)
          m.numeric++
        } else if (n === null) {
          return // junk placeholder
        } else {
          v = toText(raw)
          if (v == null) return
          const asNum = toNumber(v)
          if (typeof asNum === 'number' && !TEXT_FORMATS.has(m.fmt)) {
            v = round(asNum)
            m.numeric++
          } else {
            m.strings++
            if (m.distinct.size < 50) m.distinct.add(v)
            m.textLen += v.length
          }
        }
        series[id][year].set(eid, v)
        const prev = store.get(eid)
        if (prev === undefined) store.set(eid, v)
        else if (prev !== v) warn('conflicting-value', `${page.typeId} ${id} ${year} ${eid}: ${prev} vs ${v} (${page.slug})`)
      })
    }

    T.topics.push({
      slug: page.slug,
      title: page.title ?? page.slug,
      sources: page.sources,
      related: page.related,
      updated: page.updated,
      cats: [...(categoryTopics.get(`${page.typeId}:${page.slug}`) ?? [])].sort(),
      tables: page.tables
        ? page.tables
            .map((t) => ({
              name: toText(t.name) ?? '',
              metrics: [...new Set((t.columns ?? []).map((field) => page.columns.find((c) => c.dbField === field || c.field === field)?.id).filter((x) => typeof x === 'number'))],
            }))
            .filter((t) => t.metrics.length)
        : [],
      metrics: topicMetrics,
      series,
      entityIds: [...new Set(rowEntities.filter(Boolean))],
    })
  }

  // The /countries index page carries population, area, density and growth for every country.
  try {
    const html = gunzipSync(await readFile(path.join(CACHE, 'countries.html.gz'))).toString('utf8')
    for (const r of parseInlineData(html) ?? []) {
      const id = nameIndex.country.get(String(r.country ?? '').toLowerCase())
      const e = id && db.country.entities.get(id)
      if (!e) {
        warn('countries-index-unmatched', r.country)
        continue
      }
      if (typeof r.pop2026 === 'number') e.pop = r.pop2026
      if (typeof r.area === 'number') e.area = r.area
      if (typeof r.density === 'number') e.density = r.density
      if (typeof r.growthRate === 'number') e.growth = r.growthRate
    }
  } catch (err) {
    warn('countries-index-missing', err.message)
  }

  // -------------------------------------------------------------------------
  // Finalize and write

  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })
  const manifest = { generatedAt: new Date().toISOString(), source: SITE, types: [], categories: [] }
  const topicIndex = []
  const categoryCounts = new Map()

  for (const [prefix, T] of Object.entries(TYPES)) {
    const D = db[T.id]
    if (!D.topics.length) continue
    const dir = path.join(OUT, T.id)
    await mkdir(path.join(dir, 'topics'), { recursive: true })

    // Entities: stable order by population desc then name.
    const entities = [...D.entities.values()]
      .filter((e) => e.name)
      .sort((a, b) => (b.pop ?? -1) - (a.pop ?? -1) || a.name.localeCompare(b.name))
    const index = new Map(entities.map((e, i) => [e.id, i]))
    const slugCounts = new Map()
    const entitiesOut = entities.map((e) => {
      let slug = slugify(e.name)
      const n = slugCounts.get(slug) ?? 0
      slugCounts.set(slug, n + 1)
      if (n) slug = `${slug}-${slugify(e.id)}`
      const out = { id: e.id, name: e.name, slug, flag: e.flag ?? null, group: e.group ?? null }
      if (e.sub) out.sub = e.sub
      if (e.pop != null) out.pop = e.pop
      if (e.lat != null && e.lng != null) Object.assign(out, { lat: e.lat, lng: e.lng })
      if (e.fips) out.fips = e.fips
      return out
    })

    // Metric catalog and default-year values.
    const topicSizes = new Map(D.topics.map((t) => [t.slug, t.metrics.length]))
    const topicRows = new Map(D.topics.map((t) => [t.slug, t.entityIds.length]))
    const metricsOut = []
    const values = []
    for (const m of D.metrics.values()) {
      const nonNull = m.numeric + m.strings
      if (!nonNull) continue
      let kind
      if (m.numeric / nonNull >= 0.9) kind = 'num'
      else if (m.distinct.size <= 15 && m.textLen / Math.max(1, m.strings) <= 40) kind = 'cat'
      else kind = 'text'

      const years = [...m.years.keys()].filter((y) => y !== '_').sort((a, b) => a - b)
      const coverage = (y) => [...m.years.get(y).values()].filter((v) => (kind === 'num' ? typeof v === 'number' : v != null)).length
      let year = null
      if (years.length) {
        const max = Math.max(...years.map(coverage))
        year = [...years].reverse().find((y) => coverage(y) >= max * 0.6) ?? years[years.length - 1]
      }
      const store = m.years.get(year ?? '_') ?? m.years.get(years[years.length - 1])
      const label = [...m.headers.entries()].sort((a, b) => b[1] - a[1])[0][0]

      const idx = []
      const vals = []
      for (const [eid, v] of store) {
        const i = index.get(eid)
        if (i == null) continue
        if (kind === 'num' && typeof v !== 'number') continue
        if (kind !== 'num' && typeof v === 'number') {
          idx.push(i)
          vals.push(String(v))
          continue
        }
        idx.push(i)
        vals.push(v)
      }
      const order = idx.map((_, k) => k).sort((a, b) => idx[a] - idx[b])
      if (!order.length) continue
      const topicSize = (slug) => topicSizes.get(slug) ?? 99
      // Primary topic: the page covering the most places (global over regional subsets), then the most focused one.
      const topics = [...m.topics].sort((a, b) => (topicRows.get(b) ?? 0) - (topicRows.get(a) ?? 0) || topicSize(a) - topicSize(b) || a.length - b.length)
      const cats = new Set()
      for (const s of topics) for (const c of categoryTopics.get(`${T.id}:${s}`) ?? []) cats.add(c)
      const entry = {
        id: m.id,
        key: m.key,
        label,
        fmt: m.fmt || null,
        unit: m.unit || null,
        kind,
        pol: kind === 'num' ? guessPolarity(label, m.key, m.fmt, topics) : 0,
        year,
        years,
        n: order.length,
        topics,
        cats: [...cats].sort(),
        updated: m.updated,
      }
      if (kind === 'cat') entry.cats_values = [...m.distinct].slice(0, 15)
      if (/\b(data|source|survey|reference|latest|report|measurement)\s+year\b|\byear of (data|estimate)\b|^year$|\bdata date\b|\bas of\b/i.test(label) || (m.fmt === 'year' && /data|source|estimate|updated/i.test(label))) entry.meta = true
      metricsOut.push(entry)
      if (kind !== 'text') values.push([m.id, order.map((k) => idx[k]), order.map((k) => vals[k])])
    }
    // Synthetic base metrics (negative ids) derived from entity attributes.
    const BASE = [
      { id: -1, attr: 'pop', key: 'population', label: 'Population', fmt: 'numberWithCommas', pol: 0, cats: ['population'] },
      { id: -2, attr: 'density', key: 'density', label: T.id === 'country' ? 'Population Density (per km²)' : 'Population Density (per mi²)', fmt: 'floatNumberTenths', pol: 0, cats: ['population', 'geography'] },
      { id: -3, attr: 'growth', key: 'growthRate', label: 'Population Growth Rate', fmt: 'perc', pol: 0, cats: ['population'] },
      { id: -4, attr: 'growth2020', key: 'growthSince2020', label: 'Population Growth Since 2020', fmt: 'perc', pol: 0, cats: ['population'] },
      { id: -5, attr: 'area', key: 'area', label: T.id === 'country' ? 'Land Area (km²)' : 'Land Area (mi²)', fmt: 'numberWithCommas', pol: 0, cats: ['geography'] },
    ]
    for (const b of BASE) {
      const idx = []
      const vals = []
      entities.forEach((e, i) => {
        const v = e[b.attr]
        if (typeof v === 'number' && Number.isFinite(v)) {
          idx.push(i)
          vals.push(round(v))
        }
      })
      if (idx.length < Math.max(3, entities.length * 0.3)) continue
      metricsOut.push({ id: b.id, key: b.key, label: b.label, fmt: b.fmt, unit: null, kind: 'num', pol: b.pol, year: null, years: [], n: idx.length, topics: [], cats: b.cats, updated: null, base: true })
      values.push([b.id, idx, vals])
    }
    metricsOut.sort((a, b) => a.id - b.id)

    // Topics.
    const metricSet = new Set(metricsOut.map((m) => m.id))
    let topicCount = 0
    for (const t of D.topics) {
      const metrics = t.metrics.filter((id) => metricSet.has(id))
      if (!metrics.length || !t.entityIds.length) continue
      const series = {}
      for (const id of metrics) {
        series[id] = {}
        for (const [year, store] of Object.entries(t.series[id] ?? {})) {
          const pairs = [...store].map(([eid, v]) => [index.get(eid), v]).filter(([i]) => i != null).sort((a, b) => a[0] - b[0])
          if (pairs.length) series[id][year] = [pairs.map((p) => p[0]), pairs.map((p) => p[1])]
        }
      }
      const topicOut = {
        slug: t.slug,
        type: T.id,
        title: stripYear(t.title),
        cats: t.cats,
        updated: t.updated,
        url: `${SITE}/${prefix}/${t.slug}`,
        sources: dedupeBy(t.sources, (s) => s.url),
        related: dedupeBy(t.related, (r) => `${r.type}:${r.slug}`),
        tables: t.tables.map((tb) => ({ name: tb.name, metrics: tb.metrics.filter((id) => metricSet.has(id)) })).filter((tb) => tb.metrics.length),
        metrics,
        entities: t.entityIds.map((id) => index.get(id)).filter((i) => i != null).sort((a, b) => a - b),
        series,
      }
      await writeFile(path.join(dir, 'topics', `${t.slug}.json`), JSON.stringify(topicOut))
      topicIndex.push({ slug: t.slug, type: T.id, title: topicOut.title, cats: t.cats, metrics, n: topicOut.entities.length, updated: t.updated })
      for (const c of t.cats) categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1)
      topicCount++
    }

    await writeFile(path.join(dir, 'entities.json'), JSON.stringify(entitiesOut))
    await writeFile(path.join(dir, 'metrics.json'), JSON.stringify(metricsOut))
    await writeFile(path.join(dir, 'values.json'), JSON.stringify({ entityCount: entitiesOut.length, metrics: values }))
    manifest.types.push({
      id: T.id,
      label: T.label,
      singular: T.singular,
      prefix,
      entities: entitiesOut.length,
      metrics: metricsOut.length,
      numericMetrics: metricsOut.filter((m) => m.kind === 'num').length,
      topics: topicCount,
    })
    log(`${T.id}: ${entitiesOut.length} entities, ${metricsOut.length} metrics (${metricsOut.filter((m) => m.kind === 'num').length} numeric), ${topicCount} topics`)
  }

  manifest.categories = Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ id, label, topics: categoryCounts.get(id) ?? 0 }))
  topicIndex.sort((a, b) => a.title.localeCompare(b.title))
  await writeFile(path.join(OUT, 'topics.json'), JSON.stringify(topicIndex))
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))

  log('\nwarnings:')
  for (const [k, w] of [...warnings].sort((a, b) => b[1].count - a[1].count)) log(`  ${k}: ${w.count}`, w.examples.slice(0, 2))
}

function slugify(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function dedupeBy(list, key) {
  const seen = new Set()
  return list.filter((x) => {
    const k = key(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
