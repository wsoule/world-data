// Helpers for reading data embedded in Astro-rendered pages.

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  hellip: '…',
  eacute: 'é',
  copy: '©',
  reg: '®',
  deg: '°',
};

/** Decodes named and numeric HTML entities. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, e: string) => {
    if (e.startsWith('#')) {
      const code =
        e[1] === 'x' || e[1] === 'X'
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED[e.toLowerCase()] ?? match;
  });
}

/** Any JSON-like value revived from Astro's prop serialization. */
export type Revived =
  | string
  | number
  | boolean
  | null
  | Revived[]
  | { [key: string]: Revived }
  | Map<Revived, Revived>;

/**
 * Astro serializes island props as `[type, value]` tuples (see
 * astro/runtime/server/serialize): 0 = plain value or object, 1 = array,
 * 3 = Date, 4 = Map, 5 = Set, 6 = BigInt, 7 = URL, 11 = Infinity. This
 * rebuilds ordinary values from those tuples.
 */
function revive(v: unknown): Revived {
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number')
    return v as Revived;
  const [t, x] = v as [number, unknown];
  switch (t) {
    case 0:
      if (x !== null && typeof x === 'object' && !Array.isArray(x)) {
        return Object.fromEntries(
          Object.entries(x).map(([k, val]) => [k, revive(val)])
        );
      }
      return x as Revived;
    case 1:
      return Array.isArray(x) ? x.map(revive) : (x as Revived);
    case 4:
      return new Map(
        (Array.isArray(x) ? x.map(revive) : []) as [Revived, Revived][]
      );
    case 5:
      return Array.isArray(x) ? x.map(revive) : [];
    case 6:
      return Number(x);
    case 7:
      return String(x);
    case 11:
      return Number(x) > 0 ? Infinity : -Infinity;
    default:
      return x as Revived;
  }
}

export interface Island {
  component: string | null;
  props: Record<string, Revived>;
}

/** Extracts and revives the props of every `<astro-island>` on a page. */
export function parseIslands(html: string): Island[] {
  const out: Island[] = [];
  for (const m of html.matchAll(/<astro-island\b([^>]*)>/g)) {
    const attrs = m[1] ?? '';
    const props = /\sprops="([^"]*)"/.exec(attrs);
    if (props?.[1] == null) continue;
    try {
      const raw = JSON.parse(decodeEntities(props[1])) as Record<
        string,
        unknown
      >;
      const component = /component-url="([^"]*)"/.exec(attrs)?.[1] ?? null;
      out.push({
        component,
        props: Object.fromEntries(
          Object.entries(raw).map(([k, v]) => [k, revive(v)])
        ),
      });
    } catch {
      // A malformed island is skipped; the page's other islands still count.
    }
  }
  return out;
}

/** Reads the `const data = "[...]"` table some index pages inline instead of using islands. */
export function parseInlineData(
  html: string
): Record<string, unknown>[] | null {
  const m = /const data = "(\[[\s\S]*?\])";/.exec(html);
  if (m?.[1] == null) return null;
  try {
    return JSON.parse(JSON.parse(`"${m[1]}"`) as string) as Record<
      string,
      unknown
    >[];
  } catch {
    return null;
  }
}
