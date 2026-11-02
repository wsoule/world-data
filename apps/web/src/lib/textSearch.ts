// Small token-based matcher for in-page filtering (metric pickers, entity pickers, tables).
// Every query token must match a word (prefix) or substring in the haystack. Matches in the
// primary field score higher than secondary fields. Tolerates one typo for tokens ≥ 5 chars.

export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%$]+/g, ' ')
    .trim();
}

const SYNONYMS: Record<string, string[]> = {
  gdp: ['gross domestic product'],
  income: ['earnings', 'salary', 'wage'],
  pop: ['population'],
  edu: ['education'],
  crime: ['crimes', 'criminal'],
  happy: ['happiness', 'happiest'],
  rich: ['richest', 'wealth', 'wealthiest'],
  poor: ['poverty', 'poorest'],
  life: ['life expectancy'],
  cost: ['cost of living'],
  temp: ['temperature'],
  usa: ['united states'],
  us: ['united states'],
  uk: ['united kingdom'],
};

function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenScore(token: string, words: string[], text: string): number {
  let best = 0;
  for (const w of words) {
    if (w === token) return 3;
    if (w.startsWith(token)) best = Math.max(best, 2);
    else if (
      token.length >= 5 &&
      withinOneEdit(token, w.slice(0, token.length + 1))
    )
      best = Math.max(best, 0.8);
  }
  if (best === 0 && token.length >= 3 && text.includes(token)) best = 1;
  return best;
}

export interface SearchField {
  text: string;
  weight: number;
}

/** Returns a score > 0 when every token matches somewhere, else 0. */
export function scoreFields(query: string, fields: SearchField[]): number {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return 1;
  const prepared = fields.map((f) => {
    const text = normalize(f.text);
    return { text, words: text.split(' '), weight: f.weight };
  });
  let total = 0;
  for (const t of tokens) {
    let best = 0;
    const variants = [t, ...(SYNONYMS[t] ?? [])];
    for (const v of variants) {
      const vt = v.split(' ');
      for (const f of prepared) {
        const s =
          vt.length > 1
            ? f.text.includes(v)
              ? 2
              : 0
            : tokenScore(v, f.words, f.text);
        best = Math.max(best, s * f.weight);
      }
    }
    if (best === 0) return 0;
    total += best;
  }
  // Prefer shorter primary text (more specific) on ties.
  return total + 1 / (1 + (prepared[0]?.text.length ?? 0));
}

export function searchItems<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => SearchField[],
  limit = Infinity
): T[] {
  const q = query.trim();
  if (q === '') return items.slice(0, limit);
  const scored: [T, number][] = [];
  for (const item of items) {
    const s = scoreFields(q, fields(item));
    if (s > 0) scored.push([item, s]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, limit).map(([i]) => i);
}
