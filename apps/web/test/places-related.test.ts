import { describe, expect, test } from 'bun:test';

import type { Entity } from '../src/data/types';
import {
  relatedPlaces,
  relatedTypes,
  shortPlaceName,
} from '../src/features/places/relatedPlaces';

const place = (
  name: string,
  slug: string,
  extra: Partial<Entity> = {}
): Entity => ({
  id: slug,
  name,
  slug,
  flag: null,
  group: null,
  ...extra,
});

const states = [
  place('California', 'california', { flag: 'ca', group: 'West' }),
  place('Texas', 'texas', { flag: 'tx', group: 'South' }),
];
const cities = [
  place('Los Angeles, CA', 'los-angeles-ca', { flag: 'ca', sub: 'California' }),
  place('Houston, TX', 'houston-tx', { flag: 'tx', sub: 'Texas' }),
  place('San Diego, CA', 'san-diego-ca', { flag: 'ca', sub: 'California' }),
];
const counties = [
  place('Los Angeles County, CA', 'los-angeles-county-ca', {
    flag: 'ca',
    sub: 'California',
  }),
  place('Harris County, TX', 'harris-county-tx', { flag: 'tx', sub: 'Texas' }),
];
const countries = [
  place('Japan', 'japan', { flag: 'jp', group: 'Asia' }),
  place('DR Congo', 'dr-congo', { flag: 'cd', group: 'Africa' }),
];
const worldCities = [
  place('Tokyo', 'tokyo', { flag: 'jp', group: 'Japan' }),
  place('Kinshasa', 'kinshasa', { flag: 'cd', group: 'Congo (Kinshasa)' }),
  place('Osaka', 'osaka', { flag: 'jp', group: 'Japan' }),
];

describe('relatedPlaces', () => {
  test('a state lists its cities and counties, largest first', () => {
    const r = relatedPlaces('state', states[0], {
      city: cities,
      county: counties,
    });
    expect(r.parent).toBeNull();
    expect(r.children).toEqual([
      {
        type: 'city',
        title: 'Cities in California',
        places: [
          { name: 'Los Angeles, CA', slug: 'los-angeles-ca' },
          { name: 'San Diego, CA', slug: 'san-diego-ca' },
        ],
      },
      {
        type: 'county',
        title: 'Counties in California',
        places: [
          { name: 'Los Angeles County, CA', slug: 'los-angeles-county-ca' },
        ],
      },
    ]);
  });

  test('cities and counties link to their state; world cities to their country', () => {
    expect(
      relatedPlaces('county', counties[1], { state: states }).parent
    ).toEqual({
      type: 'state',
      name: 'Texas',
      slug: 'texas',
    });
    expect(
      relatedPlaces('world-city', worldCities[0], { country: countries }).parent
    ).toEqual({ type: 'country', name: 'Japan', slug: 'japan' });
  });

  test('falls back to the flag code when names differ', () => {
    expect(
      relatedPlaces('world-city', worldCities[1], { country: countries }).parent
        ?.slug
    ).toBe('dr-congo');
    const congo = relatedPlaces('country', countries[1], {
      'world-city': worldCities,
    });
    expect(congo.children[0].places.map((p) => p.slug)).toEqual(['kinshasa']);
  });

  test('a country lists its world cities; missing lists add nothing', () => {
    const japan = relatedPlaces('country', countries[0], {
      'world-city': worldCities,
    });
    expect(japan.children.map((g) => [g.title, g.places.length])).toEqual([
      ['Cities in Japan', 2],
    ]);
    expect(relatedPlaces('country', countries[0], {})).toEqual({
      parent: null,
      children: [],
    });
  });

  test('relatedTypes names the lists a loader needs', () => {
    expect(relatedTypes('state')).toEqual(['city', 'county']);
    expect(relatedTypes('county')).toEqual(['state']);
    expect(relatedTypes('world-city')).toEqual(['country']);
    expect(relatedTypes('country')).toEqual(['world-city']);
    expect(relatedTypes('city')).toEqual(['state']);
  });

  test('shortPlaceName drops the state suffix', () => {
    expect(shortPlaceName('Los Angeles County, CA')).toBe('Los Angeles County');
    expect(shortPlaceName('Tokyo')).toBe('Tokyo');
  });
});
