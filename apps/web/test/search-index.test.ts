import { describe, expect, test } from 'bun:test';

import {
  foldSameLabel,
  groupResults,
  highlightParts,
  matchQuality,
  normalizeText,
  parseQuery,
  type RankedResult,
  type SearchDoc,
  SearchIndex,
  type SearchKind,
  spreadTopics,
  topicSubject,
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
      matchQuality(doc('Median Household Income'), ...q('household income'))
    ).toBe('phrase');
    expect(
      matchQuality(doc('Median Household Income'), ...q('income median'))
    ).toBe('words');
    expect(
      matchQuality(
        doc('Median Income - Four Person Household'),
        ...q('household income')
      )
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
      normSubject: normTitle,
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

  /** A metric document of `type` from topic `topic`. */
  const metric = (
    id: number,
    title: string,
    topic: string,
    type: 'state' | 'country' = 'state'
  ): SearchDoc =>
    base({
      id: `metric:${type}:${id}`,
      title,
      kind: 'metric',
      type,
      target: { kind: 'metric', type, id, topic },
    });
  const ranked = (doc: SearchDoc, score: number): RankedResult => ({
    doc,
    score,
    quality: 'phrase',
    terms: [],
    variants: [],
  });

  test('folds same-label metrics of one place type into the best one', () => {
    const nurse = metric(1, 'Hourly Mean Wage', 'nurse-salary');
    const teacher = metric(2, 'Hourly Mean Wage', 'teacher-salary');
    const country = metric(3, 'Hourly Mean Wage', 'wages', 'country');
    const other = metric(4, 'Annual Mean Wage', 'nurse-salary');
    const folded = foldSameLabel([
      ranked(nurse, 10),
      ranked(country, 9),
      ranked(teacher, 8),
      ranked(other, 7),
    ]);
    expect(folded.map((r) => r.doc.id)).toEqual([
      nurse.id,
      country.id,
      other.id,
    ]);
    expect(folded[0].variants.map((d) => d.id)).toEqual([teacher.id]);
    expect(folded[1].variants).toEqual([]);
  });

  test('never folds places that share a name', () => {
    const a = base({ id: 'place:a', title: 'Springfield', kind: 'place' });
    const b = base({ id: 'place:b', title: 'Springfield', kind: 'place' });
    expect(foldSameLabel([ranked(a, 2), ranked(b, 1)])).toHaveLength(2);
  });

  test('lowers further metrics from a topic that already placed one', () => {
    const r = spreadTopics([
      ranked(metric(1, 'One Person', 'household'), 10),
      ranked(metric(2, 'Two Person', 'household'), 10),
      ranked(metric(3, 'Three Person', 'household'), 10),
      ranked(metric(4, 'Headline', 'income'), 9),
    ]);
    expect(r.map((x) => x.score)).toEqual([10, 8.5, 10 * 0.85 ** 2, 9]);
  });

  test('indexes in slices, pausing between them, and publishes once', async () => {
    const index = new SearchIndex();
    let pauses = 0;
    const docs = Array.from({ length: 40 }, (_, i) =>
      base({ id: `t${i}`, title: `Topic ${i}` })
    );
    const added = await index.addInSlices(
      'topics',
      docs,
      (d) => (d.id === 't3' ? null : d),
      () => {
        pauses++;
        expect(index.version).toBe(0);
        return Promise.resolve();
      },
      0
    );
    expect(added).toBe(true);
    expect(pauses).toBe(2);
    expect(index.size).toBe(39);
    expect(index.version).toBe(1);
    expect(index.has('topics')).toBe(true);
    expect(
      await index.addInSlices('topics', docs, (d) => d, Promise.resolve)
    ).toBe(false);
    expect(index.search('topic 7')[0]?.doc.id).toBe('t7');
  });
});

describe('topicSubject', () => {
  test('drops the place-type ending of a topic title', () => {
    expect(topicSubject('Median Household Income by State')).toBe(
      'median household income'
    );
    expect(topicSubject('Happiest Countries in the World')).toBe(
      'happiest countries'
    );
    expect(topicSubject('Crime Rate by Country')).toBe('crime rate');
    expect(topicSubject('Happiest States')).toBe('happiest states');
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

  test('key metrics outrank weaker partial matches', () => {
    const firstMetric = (q: string) =>
      index.search(q, { kinds: new Set(['metric']) })[0]?.doc.id;
    // Census median household income (state 900603) backs the home comparisons.
    expect(firstMetric('income')).toBe('metric:state:900603');
    expect(firstMetric('household income')).toBe('metric:state:900603');
    expect(firstMetric('median household income')).toBe('metric:state:900603');
    const palette = groupResults(index.search('income'), 6).find(
      (g) => g.kind === 'metric'
    );
    expect(palette?.results[0]?.doc.id).toBe('metric:state:900603');
  });

  test('one topic’s breakdown columns do not crowd out other metrics', () => {
    const top = index
      .search('median income', { kinds: new Set(['metric']) })
      .slice(0, 6)
      .map((r) => r.doc.id);
    expect(top).toContain('metric:state:900603');
  });

  test('shows each label once per place type', () => {
    for (const q of ['hourly mean wage', 'population', 'legality']) {
      const keys = index
        .search(q)
        .filter((r) => r.doc.kind === 'metric')
        .map((r) => `${r.doc.type}:${r.doc.normTitle}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
    const wage = index.search('hourly mean wage')[0];
    expect(wage?.doc.title).toBe('Hourly Mean Wage');
    expect(wage?.variants.length).toBeGreaterThan(3);
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
