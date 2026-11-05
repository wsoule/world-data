// The committed metric catalogs (public/data/<type>/metrics.json) must say what the data build
// would write today. The build's rules for polarity and its hand fixes change more often than the
// data is rebuilt from source, so a rule fixed in scripts/ without the matching data (or data
// patched by hand without the rule) fails here.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { METRIC_FIXES, POLARITY } from '../scripts/lib/metric-fixes';
import { guessPolarity } from '../scripts/lib/reference';
import type { EntityType, Metric } from '../src/data/types';

const DATA = join(import.meta.dir, '../public/data');
const TYPES: readonly EntityType[] = [
  'country',
  'state',
  'city',
  'county',
  'world-city',
];

const catalogs = new Map(
  TYPES.map((type) => [
    type,
    JSON.parse(
      readFileSync(join(DATA, type, 'metrics.json'), 'utf8')
    ) as Metric[],
  ])
);

/**
 * Metrics read from the ranking site's pages: numeric, not a synthetic base metric (negative
 * id) and not from another source (900,000 and up), whose polarity the source module declares.
 */
const scraped = (m: Metric): boolean =>
  m.kind === 'num' && m.id > 0 && m.id < 900_000;

describe('committed metric catalogs', () => {
  test('give every scraped metric the polarity the build rules give it', () => {
    const wrong: string[] = [];
    for (const [type, metrics] of catalogs) {
      for (const m of metrics) {
        if (!scraped(m)) continue;
        const want =
          METRIC_FIXES[`${type}:${m.id}`]?.pol ??
          guessPolarity(m.label, m.key, m.fmt, m.topics);
        if (m.pol !== want)
          wrong.push(`${type}:${m.id} ${m.label}: ${m.pol}, rules say ${want}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test('carry every hand fix', () => {
    for (const [key, fix] of Object.entries(METRIC_FIXES)) {
      const [type = '', id = ''] = key.split(':');
      const m = catalogs
        .get(type as EntityType)
        ?.find((x) => x.id === Number(id));
      expect(m == null ? `${key} missing` : key).toBe(key);
      if (m == null) continue;
      if (fix.label != null)
        expect(`${key} ${m.label}`).toBe(`${key} ${fix.label}`);
      if (fix.fmt != null) expect(`${key} ${m.fmt}`).toBe(`${key} ${fix.fmt}`);
      if (fix.unit != null)
        expect(`${key} ${m.unit}`).toBe(`${key} ${fix.unit}`);
      if (fix.pol != null) expect(`${key} ${m.pol}`).toBe(`${key} ${fix.pol}`);
    }
  });

  test('read the checked indexes and scores the right way round', () => {
    const pol = (type: EntityType, id: number) =>
      catalogs.get(type)?.find((m) => m.id === id)?.pol;
    // Lower is more peaceful (Iceland); higher is cleaner (Denmark, the UK's air, Vermont).
    expect(pol('country', 16946)).toBe(-1);
    expect(pol('country', 21700)).toBe(1);
    expect(pol('country', 15879)).toBe(1);
    expect(pol('state', 22180)).toBe(1);
    expect(pol('state', 21045)).toBe(1);
    expect(pol('state', 21159)).toBe(1);
  });

  test('name the metric each polarity fix was checked against', () => {
    // A typo in an id would silently fix another column: the label kept next to each fix is
    // the header of the column that was checked against its source page.
    const plain = (s: string) =>
      s.replace(/[’']/g, "'").replace(/ \(.*\)$/, '');
    const wrong: string[] = [];
    for (const [key, , label] of POLARITY) {
      const [type = '', id = ''] = key.split(':');
      const m = catalogs
        .get(type as EntityType)
        ?.find((x) => x.id === Number(id));
      const fixedLabel = METRIC_FIXES[key]?.label;
      if (m == null || !plain(m.label).startsWith(plain(label)))
        if (fixedLabel == null || m?.label !== fixedLabel)
          wrong.push(`${key}: fix says "${label}", catalog has "${m?.label}"`);
    }
    expect(wrong).toEqual([]);
  });

  /** The published polarity of each metric, as "type:id pol" for readable failures. */
  const pols = (type: EntityType, ids: readonly number[]): string[] =>
    ids.map(
      (id) =>
        `${type}:${id} ${catalogs.get(type)?.find((m) => m.id === id)?.pol}`
    );
  const all = (type: EntityType, ids: readonly number[], pol: number) =>
    ids.map((id) => `${type}:${id} ${pol}`);

  test('read sub-columns by their own words, not their page name', () => {
    // Healthiest States: physical inactivity, excessive drinking and too little sleep are bad.
    const healthiest = [8821, 8822, 8830];
    expect(pols('state', healthiest)).toEqual(all('state', healthiest, -1));
    // Most Dangerous Countries for Women: employment, phones, parliament seats, education and
    // financial inclusion are highest in the safest countries (Denmark, Iceland, Sweden).
    const women = [
      24424, 24425, 24426, 24427, 24428, 24429, 24430, 24431, 24432,
    ];
    expect(pols('country', women)).toEqual(all('country', women, 1));
    // A higher sheltered share of the homeless and GOCI resilience are good; an ecological
    // footprint and a used car's price over the average are not.
    expect(pols('state', [20686])).toEqual(all('state', [20686], 1));
    expect(pols('country', [13322])).toEqual(all('country', [13322], 1));
    expect(pols('country', [19009])).toEqual(all('country', [19009], -1));
    expect(pols('state', [9797])).toEqual(all('state', [9797], -1));
    // Neither good nor bad for the place: the US trade deficit and balance with a country, air
    // passengers and departures, unemployment benefit levels and lengths.
    const neutralCountry = [19314, 19317, 12848, 18471];
    expect(pols('country', neutralCountry)).toEqual(
      all('country', neutralCountry, 0)
    );
    const benefits = [20881, 20882, 20883, 20884, 11329, 11330];
    expect(pols('state', benefits)).toEqual(all('state', benefits, 0));
  });

  test('read whole scores the way their publishers define them', () => {
    // Pension-friendly states: 0-100 favourability scores (Hawaii's healthcare 100, New
    // Hampshire's crime rate 100).
    const pension = [9958, 9959, 9960, 9961, 9962, 9963, 9964];
    expect(pols('state', pension)).toEqual(all('state', pension, 1));
    // International Living's cost of living score is highest where living is cheapest.
    expect(pols('country', [19501])).toEqual(all('country', [19501], 1));
    // Varicella coverage among teens with or without a disease history.
    expect(pols('state', [24047, 24048])).toEqual(
      all('state', [24047, 24048], 1)
    );
    // Every World Justice Project score, criminal justice included.
    const wjp = [19335, 19340, 19342, 19343, 19344, 19345, 19346, 19347];
    expect(pols('country', wjp)).toEqual(all('country', wjp, 1));
    // The Women's Danger Index street safety part is higher where streets are less safe;
    // mortgages as a share of income and a cost of living index are costs.
    expect(pols('country', [16907, 17200])).toEqual(
      all('country', [16907, 17200], -1)
    );
    expect(pols('state', [20648])).toEqual(all('state', [20648], -1));
    // All eight livable wage columns read the same way, as a cost of living.
    const livable = [24644, 24645, 24647, 24648, 20586, 20587, 20589, 20590];
    expect(pols('state', livable)).toEqual(all('state', livable, -1));
    // Crop production is neither good nor bad.
    expect(pols('state', [13550])).toEqual(all('state', [13550], 0));
    // The road quality page's 2026 score and roughness are higher for worse roads.
    const roads = [25495, 11274, 11275];
    expect(pols('state', roads)).toEqual(all('state', roads, -1));
  });

  test('read rank columns in their source order', () => {
    // Rank 1 is the worst: the most water-scarce country, the state wasting the most food.
    expect(pols('country', [19529])).toEqual(all('country', [19529], 1));
    expect(pols('state', [7958])).toEqual(all('state', [7958], 1));
    // Rank 1 is neither: the northernmost country, the weirdest, the biggest fast-food eater
    // and the densest world city.
    const neutral = [12635, 16058, 16131];
    expect(pols('country', neutral)).toEqual(all('country', neutral, 0));
    expect(pols('world-city', [25620])).toEqual(all('world-city', [25620], 0));
  });
});
