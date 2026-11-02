import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_PLACE_SORT,
  formatPlaceSort,
  parsePlaceSort,
  parsePlacesSearch,
} from '../src/features/places/search';

describe('places list URL state', () => {
  test('sort round-trips, with the default left out of the URL', () => {
    expect(parsePlaceSort('-density')).toEqual({ id: 'density', desc: true });
    expect(parsePlaceSort('name')).toEqual({ id: 'name', desc: false });
    expect(formatPlaceSort({ id: 'density', desc: true })).toBe('-density');
    expect(formatPlaceSort({ id: 'pop', desc: false })).toBe('pop');
    expect(formatPlaceSort(DEFAULT_PLACE_SORT)).toBeUndefined();
  });

  test('unknown sort columns fall back to the default', () => {
    expect(parsePlaceSort('-bogus')).toEqual(DEFAULT_PLACE_SORT);
    expect(parsePlaceSort(undefined)).toEqual(DEFAULT_PLACE_SORT);
  });

  test('validateSearch keeps real values and drops empty or default ones', () => {
    expect(
      parsePlacesSearch({
        q: 'an',
        g: ['Europe', 'Asia', 'Europe', ''],
        sort: '-density',
      })
    ).toEqual({ q: 'an', g: ['Europe', 'Asia'], sort: '-density' });
    expect(parsePlacesSearch({ g: 'Europe' })).toEqual({ g: ['Europe'] });
    expect(
      parsePlacesSearch({ q: '  ', g: [], sort: '-pop', other: 1 })
    ).toEqual({});
    expect(parsePlacesSearch({ sort: 'nope', g: [3] })).toEqual({});
  });
});
