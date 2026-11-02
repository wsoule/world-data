// Value and markup cleaning shared by the data build.

import { decodeEntities } from './astro';

/** Placeholders the source uses for "no data". */
const JUNK =
  /^(#N\/A|N\/A|NA|n\/a|-+|—|–|\.+|\\|\||TBD|unavailable|none|null|undefined|\?)$/i;

/**
 * Parses a cell as a number. Returns the number, `null` for a "no data"
 * placeholder (which should be dropped), or `undefined` when the value is
 * genuinely non-numeric text.
 */
export function toNumber(v: unknown): number | null | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s === '' || JUNK.test(s)) return null;
  // Currency signs, percent signs, a leading plus and the spaces around them
  // are decoration. Commas are only removed when they group thousands, so a
  // list such as "50, 60" (Hz) or "1958, 1962" stays text instead of
  // collapsing into 5060 or 19581962.
  const bare = s
    .replace(/^([-+]?)\s*[$€£]\s*/, '$1')
    .replace(/\s*%$/, '')
    .replace(/^\+/, '');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(bare)) {
    return Number(bare.replaceAll(',', ''));
  }
  if (/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(bare)) return Number(bare);
  return undefined;
}

/** Number or null, never undefined. */
export function toNumberOrNull(v: unknown): number | null {
  const n = toNumber(v);
  return typeof n === 'number' ? n : null;
}

/** Normalizes a cell to display text (HTML stripped, whitespace collapsed, capped length). */
export function toText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) {
    const joined = v.filter((x) => x != null).join(', ');
    return joined === '' ? null : joined;
  }
  if (typeof v !== 'string') return null;
  const s = decodeEntities(v.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
  if (s === '' || JUNK.test(s)) return null;
  return s.length > 280 ? `${s.slice(0, 277)}…` : s;
}

/** Trims floating-point noise (0.1 + 0.2) without changing integers. */
export function round(n: number): number {
  return Number.isInteger(n) ? n : Number(n.toPrecision(10));
}

/** Plain-ASCII URL slug. */
export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Keeps the first item for each key. */
export function dedupeBy<T>(list: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
