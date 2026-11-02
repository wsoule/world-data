// Helpers for reading data embedded in Astro-rendered pages.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', eacute: 'é', copy: '©', reg: '®', deg: '°' }

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return NAMED[e.toLowerCase()] ?? m
  })
}

// Astro serializes island props as [type, value] tuples (see astro/runtime/server/serialize).
function revive(v) {
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number') return v
  const [t, x] = v
  switch (t) {
    case 0:
      if (x && typeof x === 'object' && !Array.isArray(x)) return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, revive(val)]))
      return x
    case 1:
      return Array.isArray(x) ? x.map(revive) : x
    case 3:
      return x
    case 4:
      return new Map(revive([1, x]))
    case 5:
      return [...revive([1, x])]
    case 6:
      return Number(x)
    case 7:
      return String(x)
    case 11:
      return x > 0 ? Infinity : -Infinity
    default:
      return x
  }
}

export function parseIslands(html) {
  const out = []
  for (const m of html.matchAll(/<astro-island\b([^>]*)>/g)) {
    const attrs = m[1]
    const props = attrs.match(/\sprops="([^"]*)"/)
    if (!props) continue
    try {
      const raw = JSON.parse(decodeEntities(props[1]))
      const component = attrs.match(/component-url="([^"]*)"/)?.[1] ?? null
      out.push({ component, props: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, revive(v)])) })
    } catch {
      // malformed island; ignore
    }
  }
  return out
}

export function parseInlineData(html) {
  const m = html.match(/const data = "(\[[\s\S]*?\])";/)
  if (!m) return null
  try {
    return JSON.parse(JSON.parse(`"${m[1]}"`))
  } catch {
    return null
  }
}
