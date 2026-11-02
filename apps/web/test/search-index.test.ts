import { describe, expect, test } from 'bun:test';

import {
  groupResults,
  highlightParts,
  matchQuality,
  normalizeText,
  parseQuery,
  type SearchDoc,
  SearchIndex,
  type SearchKind,
} from '../src/features/search/searchIndex';
import { loadFullIndex } from './search-fixtures';

describe('normalizeText', () => {
  test('folds accents, case, punctuation and U.S.', () => {
    expect(normalizeText('Curaçao, São Tomé!')).toBe('curacao sao tome');
    expect(normalizeText('Poorest U.S. States')).toBe('poorest us states');
    expect(normalizeText("Côte d'Ivoire")).toBe('cote divoire');
  });
});

describe('parseQuery', () => {
  test('drops stopwords but keeps them in the comparison text', () => {
    expect(parseQuery('Income by State')).toEqual({
      text: 'income by state',
      tokens: ['income', 'state'],
    });
  });

  test('keeps stopwords when nothing else remains (state codes such as IN)', () => {
    expect(parseQuery('in').tokens).toEqual(['in']);
  });
});

describe('matchQuality', () => {
  const doc = (title: string, aliases: string[] = [], codes: string[] = []) => {
    const normTitle = normalizeText(title);
    return {
      normTitle,
      normTitleWords: normTitle.split(' '),
      normAliases: aliases.map(normalizeText),
      normCodes: codes.map(normalizeText),
    };
  };

  test('ranks exact, code, prefix and word matches', () => {
    const q = (s: string) => {
      const p = parseQuery(s);
      return [p.text, p.tokens] as const;
    };
    expect(matchQuality(doc('Japan'), ...q('japan'))).toBe('exact');
    expect(matchQuality(doc('California', ['CA']), ...q('ca'))).toBe('exact');
    expect(matchQuality(doc('Canada', [], ['CAN', 'ca']), ...q('ca'))).toBe(
      'code'
    );
    expect(matchQuality(doc('Japan'), ...q('jap'))).toBe('prefix');
    expect(
      matchQuality(doc('Median Household Income'), ...q('income median'))
    ).toBe('words');
    expect(matchQuality(doc('Tokyo'), ...q('japan'))).toBe('other');
  });
});

describe('highlightParts', () => {
  test('marks the typed prefix of each matching word', () => {
    expect(highlightParts('Median Household Income', 'inc med')).toEqual([
      { text: 'Med', match: true },
      { text: 'ian Household ', match: false },
      { text: 'Inc', match: true },
      { text: 'ome', match: false },
    ]);
  });

  test('marks whole words that matched through fuzziness or synonyms', () => {
    const parts = highlightParts('Homicide Rate', 'murder', ['homicide']);
    expect(parts[0]).toEqual({ text: 'Homicide', match: true });
  });

  test('returns the text untouched for an empty query', () => {
    expect(highlightParts('Japan', '')).toEqual([
      { text: 'Japan', match: false },
    ]);
  });
});

describe('SearchIndex (synthetic)', () => {
  const base = (over: Partial<SearchDoc> & Pick<SearchDoc, 'id' | 'title'>) => {
    const normTitle = normalizeText(over.title);
    return {
      kind: 'topic' as const,
      type: 'state' as const,
      subtitle: '',
      target: { kind: 'topic' as const, type: 'state' as const, slug: over.id },
      aliases: [],
      codes: [],
      context: '',
      categories: [],
      prior: 1,
      flag: null,
      normTitle,
      normTitleWords: normTitle.split(' '),
      normAliases: [],
      normCodes: [],
      ...over,
    };
  };

  test('adds each source once and bumps the version', () => {
    const index = new SearchIndex();
    index.add('a', [base({ id: 'x', title: 'Crime Rate by State' })]);
    index.add('a', [base({ id: 'y', title: 'Ignored' })]);
    expect(index.size).toBe(1);
    expect(index.version).toBe(1);
    expect(index.has('a')).toBe(true);
  });

  test('falls back to matching any word when all words find nothing', () => {
    const index = new SearchIndex();
    index.add('a', [
      base({ id: 'x', title: 'Crime Rate by State' }),
      base({ id: 'y', title: 'Obesity Rate by State' }),
    ]);
    const r = index.search('crime zebra');
    expect(r.map((x) => x.doc.id)).toEqual(['x']);
  });
});

describe('SearchIndex (real dataset)', () => {
  const index = loadFullIndex();
  const first = (q: string) => index.search(q)[0]?.doc;
  const firstGroup = (q: string): SearchKind | undefined =>
    groupResults(index.search(q), 5)[0]?.kind;

  test('indexes every kind across all types', () => {
    const kinds = new Set([...index.docs.values()].map((d) => d.kind));
    expect([...kinds].sort()).toEqual(['category', 'metric', 'place', 'topic']);
    const types = new Set([...index.docs.values()].map((d) => d.type));
    for (const t of ['country', 'state', 'city', 'world-city', 'county'])
      expect(types.has(t as SearchDoc['type'])).toBe(true);
  });

  test('"japan" finds the country first', () => {
    expect(first('japan')).toMatchObject({ kind: 'place', title: 'Japan' });
    expect(firstGroup('japan')).toBe('place');
  });

  test('"ca" finds California by its state code', () => {
    expect(first('ca')).toMatchObject({ kind: 'place', title: 'California' });
  });

  test('"us" and "usa" find the United States', () => {
    expect(first('us')?.title).toBe('United States');
    expect(first('usa')?.title).toBe('United States');
  });

  test('"income" opens on income metrics', () => {
    expect(firstGroup('income')).toBe('metric');
    expect(first('income')?.title.toLowerCase()).toContain('income');
  });

  test('"crime" opens on crime metrics or topics', () => {
    const group = firstGroup('crime');
    expect(group === 'metric' || group === 'topic').toBe(true);
    expect(first('crime')?.title.toLowerCase()).toContain('crime');
  });

  test('"happiest" opens on the happiest-places topics', () => {
    expect(firstGroup('happiest')).toBe('topic');
  });

  test('a category name opens on the category', () => {
    expect(first('economics')).toMatchObject({
      kind: 'category',
      title: 'Economics',
    });
  });

  test('tolerates typos', () => {
    const titles = index
      .search('houshold incme')
      .slice(0, 10)
      .map((r) => r.doc.title);
    expect(titles.some((t) => /household income/i.test(t))).toBe(true);
  });

  test('expands synonyms such as gdp', () => {
    const titles = index
      .search('gross domestic product')
      .map((r) => r.doc.title);
    expect(titles.length).toBeGreaterThan(0);
    expect(index.search('gdp').length).toBeGreaterThan(0);
  });

  test('"income by state" keeps to state results', () => {
    const top = index.search('income by state').slice(0, 10);
    expect(top.every((r) => r.doc.type === 'state')).toBe(true);
  });

  test('filters by kind and place type', () => {
    const r = index.search('population', {
      kinds: new Set(['metric']),
      types: new Set(['country']),
    });
    expect(r.length).toBeGreaterThan(0);
    expect(
      r.every((x) => x.doc.kind === 'metric' && x.doc.type === 'country')
    ).toBe(true);
  });

  test('groupResults caps each group and reports totals', () => {
    const groups = groupResults(index.search('crime'), { metric: 3, topic: 2 });
    const metric = groups.find((g) => g.kind === 'metric');
    expect(metric?.results.length).toBe(3);
    expect(metric?.total).toBeGreaterThan(3);
    expect(groups.find((g) => g.kind === 'topic')?.results.length).toBe(2);
  });

  test('suggests a correction for a misspelled query', () => {
    expect(index.search('xqzv')).toEqual([]);
    expect(index.suggest('happines')).not.toBeNull();
  });
});
