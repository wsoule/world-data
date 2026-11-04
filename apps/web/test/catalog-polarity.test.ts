// The committed metric catalogs (public/data/<type>/metrics.json) must say what the data build
// would write today. The build's rules for polarity and its hand fixes change more often than the
// data is rebuilt from source, so a rule fixed in scripts/ without the matching data (or data
// patched by hand without the rule) fails here.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { METRIC_FIXES } from '../scripts/lib/metric-fixes';
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
});
