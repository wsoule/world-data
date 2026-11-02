import { describe, expect, test } from 'bun:test';

import { normalize, scoreFields, searchItems } from '../src/lib/textSearch';

describe('normalize', () => {
  test('strips accents, case and punctuation', () => {
    expect(normalize('Curaçao, São Tomé!')).toBe('curacao sao tome');
  });
});

describe('scoreFields', () => {
  test('requires every token to match somewhere', () => {
    const fields = [{ text: 'Median Household Income', weight: 3 }];
    expect(scoreFields('median income', fields)).toBeGreaterThan(0);
    expect(scoreFields('median crime', fields)).toBe(0);
  });

  test('tolerates a single typo in longer words', () => {
    expect(
      scoreFields('houshold', [{ text: 'Household Income', weight: 1 }])
    ).toBeGreaterThan(0);
  });

  test('expands synonyms such as gdp', () => {
    expect(
      scoreFields('gdp', [
        { text: 'Gross Domestic Product per capita', weight: 1 },
      ])
    ).toBeGreaterThan(0);
  });
});

describe('searchItems', () => {
  const items = ['Income Inequality', 'Median Household Income', 'Crime Rate'];
  const fields = (s: string) => [{ text: s, weight: 1 }];

  test('returns everything for an empty query', () => {
    expect(searchItems(items, '  ', fields)).toEqual(items);
  });

  test('ranks matches and drops non-matches', () => {
    const r = searchItems(items, 'income', fields);
    expect(r).toHaveLength(2);
    expect(r).not.toContain('Crime Rate');
  });
});
