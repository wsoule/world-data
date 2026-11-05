import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Dataset } from '../src/data/dataset';
import type {
  Entity,
  EntityType,
  Manifest,
  Metric,
  TopicSummary,
  ValuesFile,
} from '../src/data/types';
import { datasetFacts } from '../src/features/places/datasetFacts';
import {
  notableFacts,
  type PlaceMetric,
  placeStandings,
  qualifyingRows,
  standingAt,
  strengthsAndWeaknesses,
} from '../src/features/places/profileModel';
import { clampDescription, faqPage } from '../src/lib/seo';
import { placeSummary, placeTitle, summaryExtremes } from '../src/seo/content';

const DATA = join(import.meta.dir, '../public/data');
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(join(DATA, path), 'utf8')) as T;

const manifest = read<Manifest>('manifest.json');
const topicsIndex = read<TopicSummary[]>('topics.json');

function dataset(type: EntityType): Dataset {
  const info = manifest.types.find((t) => t.id === type);
  if (info == null) throw new Error(`no type ${type}`);
  return new Dataset(
    info,
    read<Entity[]>(`${type}/entities.json`),
    read<Metric[]>(`${type}/metrics.json`),
    read<ValuesFile>(`${type}/values.json`),
    topicsIndex
  );
}

const metric = (id: number, label: string): Metric => ({
  id,
  key: `m${id}`,
  label,
  fmt: null,
  unit: null,
  kind: 'num',
  pol: 1,
  year: null,
  years: [],
  n: 0,
  topics: [`topic-${id}`],
  cats: ['economics'],
  updated: null,
});

/** One place's row for a higher-is-better column, standing computed at `index`. */
function row(id: number, col: number[], index: number): PlaceMetric {
  const standing = standingAt(col, index, 1);
  if (standing == null) throw new Error('no standing');
  return { metric: metric(id, `M${id}`), standing, direction: 1, polar: true };
}

describe('summaryExtremes', () => {
  test('never lists one metric as both best and lowest', () => {
    // 3rd of 5 sits exactly at the median: neither a strength nor a weak spot.
    const { best, worst } = summaryExtremes([row(1, [5, 4, 3, 2, 1], 2)]);
    expect(best).toEqual([]);
    expect(worst).toEqual([]);
  });

  test('splits at the median and orders each side from the extreme inwards', () => {
    const col = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const rows = [
      row(1, col, 3), // 4th: above the median
      row(2, col, 0), // 1st
      row(3, col, 8), // 9th: below
      row(4, col, 9), // last
      row(5, col, 6), // 7th: below
    ];
    const { best, worst } = summaryExtremes(rows, 3);
    expect(best.map((r) => r.metric.id)).toEqual([2, 1]);
    expect(worst.map((r) => r.metric.id)).toEqual([4, 3, 5]);
  });

  test('a single strong metric stays off the lowest list', () => {
    const { best, worst } = summaryExtremes([row(1, [1, 2, 3, 4, 5], 3)]);
    expect(best.map((r) => r.metric.id)).toEqual([1]);
    expect(worst).toEqual([]);
  });
});

describe('placeSummary', () => {
  const counties = dataset('county');

  test('names Los Angeles County median income once, as a strength', () => {
    const idx = counties.entityBySlug.get('los-angeles-county-ca');
    if (idx == null) throw new Error('missing Los Angeles County');
    const { summary } = placeSummary(counties, idx);
    const best = /It ranks best for (.*?)\. It ranks lowest/.exec(summary)?.[1];
    const lowest = /It ranks lowest for (.*)\.$/.exec(summary)?.[1];
    expect(best).toMatch(/Median (Household )?Income/);
    expect(lowest).not.toMatch(/Median (Household )?Income/);
  });

  test('reads ties with rankText and keeps the FAQ JSON-LD equal to the visible answers', () => {
    const states = dataset('state');
    let tied = 0;
    states.entities.forEach((_, i) => {
      const seo = placeSummary(states, i);
      const strengths = /It ranks best for (.*?)\.(?: It ranks lowest|$)/.exec(
        seo.summary
      )?.[1];
      const weaknesses = /It ranks lowest for (.*)\.$/.exec(seo.summary)?.[1];
      if (strengths != null && weaknesses != null) {
        const names = (s: string) =>
          s.split(/\), /).map((x) => x.split(' (')[0]);
        const lowest = new Set(names(weaknesses));
        for (const n of names(strengths)) expect(lowest.has(n)).toBe(false);
      }
      if (/\(tied /.test(seo.summary)) tied++;
      expect(seo.jsonLd.at(-1)).toEqual(faqPage(seo.faq));
    });
    expect(tied).toBeGreaterThan(0);
  });

  test('top-N county lists never make a county best or worst', () => {
    const counties = dataset('county');
    const facts = datasetFacts(counties);
    // "The 1,000 most violent counties" and its siblings are flagged. (With the full-coverage
    // Census, CDC and NOAA county data the coverage cut is now half of all counties, so these
    // lists also fall below it; the flag keeps them out should the cut ever drop again.)
    for (const id of [25523, 25524, 25528])
      expect(facts.selectedLists.has(id)).toBe(true);
    // Median income covers most counties and still counts.
    expect(facts.selectedLists.has(25455)).toBe(false);
    const la = counties.entities.findIndex((e) =>
      e.name.startsWith('Los Angeles County')
    );
    const rows = placeStandings(counties, la, facts.rankable);
    const exclude = new Set([...facts.selectedLists, ...facts.sizeDriven]);
    const { best, worst } = strengthsAndWeaknesses(
      qualifyingRows(rows, facts.cut, exclude)
    );
    const named = [...best, ...worst].map((r) => r.metric.id);
    expect(named).not.toContain(25523);
    expect(named.every((id) => !facts.selectedLists.has(id))).toBe(true);
    const notable = notableFacts(rows, facts.cut, exclude);
    expect(
      notable.every((f) => !facts.selectedLists.has(f.row.metric.id))
    ).toBe(true);
  });

  test('size samples of the largest cities still count', () => {
    const cities = dataset('city');
    const facts = datasetFacts(cities);
    // Violent crime for the 184 largest cities: the best and worst of the biggest cities.
    expect(facts.selectedLists.has(25088)).toBe(false);
    // "The richest cities" lists only one end of income.
    expect(facts.selectedLists.has(25079)).toBe(true);
  });

  test('a place tied at the bottom reads "tied last"', () => {
    const countries = dataset('country');
    // Somalia and South Sudan share the lowest Corruption Perceptions Index score (9).
    const somalia = countries.entityBySlug.get('somalia');
    if (somalia == null) throw new Error('missing Somalia');
    const standings = placeStandings(countries, somalia);
    const { summary } = placeSummary(countries, somalia);
    expect(summary).toContain('Corruption Perception Index (tied last of');
    const tiedLast = standings.find(
      (p) =>
        summary.includes(`${p.metric.label} (tied last of`) &&
        p.standing.tied > 1 &&
        p.standing.rank + p.standing.tied - 1 >= p.standing.n
    );
    expect(tiedLast).toBeDefined();
  });
});

describe('placeSummary leads and markup', () => {
  const countries = dataset('country');
  const states = dataset('state');
  const counties = dataset('county');
  const at = (ds: Dataset, slug: string) => {
    const i = ds.entityBySlug.get(slug);
    if (i == null) throw new Error(`missing ${slug}`);
    return placeSummary(ds, i);
  };

  test('opens with dated, sourced figures', () => {
    const japan = at(countries, 'japan');
    expect(japan.summary).toMatch(
      /^Japan \(country in Asia\): population 122\.4M, 12th of 235; life expectancy [\d.]+ years \(World Bank 20\d\d\);/
    );
    expect(at(states, 'california').summary).toMatch(
      /median household income \$[\d,]+ \(Census ACS 2020–2024\)/
    );
    expect(at(counties, 'cook-county-il').summary).toMatch(/\(BLS 20\d\d\)/);
  });

  test('quotes headline metrics only, never a sub-column of another index', () => {
    const japan = at(countries, 'japan');
    const text = JSON.stringify(japan.faq);
    expect(text).not.toContain('Happy Planet');
  });

  // These two summarise every county, city and state, which takes longer than bun's 5 s default.
  test('calls a standing best or lowest only in the best or worst quarter', () => {
    for (const ds of [counties, dataset('city'), states]) {
      ds.entities.forEach((_, i) => {
        const { summary } = placeSummary(ds, i);
        const best = /It ranks best for (.*?)\.(?: It ranks lowest|$)/.exec(
          summary
        )?.[1];
        const lowest = /It ranks lowest for (.*)\.$/.exec(summary)?.[1];
        const ranks = (s: string) =>
          [
            ...s.matchAll(/(?:tied )?([\d,]+)(?:st|nd|rd|th) of ([\d,]+)\)/g),
          ].map((m) => [
            Number(m[1].replace(/,/g, '')),
            Number(m[2].replace(/,/g, '')),
          ]);
        for (const [rank, n] of ranks(best ?? ''))
          expect(rank).toBeLessThanOrEqual(Math.ceil(n * 0.25));
        for (const [rank, n] of ranks(lowest ?? ''))
          expect(rank).toBeGreaterThan(n - Math.ceil(n * 0.25));
      });
    }
  }, 30_000);

  test('builds meta descriptions from whole sentences', () => {
    for (const ds of [countries, states, counties]) {
      let whole = 0;
      ds.entities.forEach((_, i) => {
        const { description } = placeSummary(ds, i);
        if (clampDescription(description) === description) whole++;
      });
      expect(whole).toBe(ds.entities.length);
    }
  }, 30_000);

  test('gives each place its codes and its state', () => {
    expect(at(countries, 'japan').jsonLd[0].identifier).toEqual([
      {
        '@type': 'PropertyValue',
        propertyID: 'ISO 3166-1 alpha-3',
        value: 'JPN',
      },
    ]);
    expect(at(states, 'california').jsonLd[0].identifier).toEqual([
      { '@type': 'PropertyValue', propertyID: 'USPS', value: 'CA' },
      { '@type': 'PropertyValue', propertyID: 'FIPS', value: '06' },
    ]);
    const la = at(counties, 'los-angeles-county-ca').jsonLd[0];
    expect(la.identifier).toEqual([
      { '@type': 'PropertyValue', propertyID: 'FIPS', value: '06037' },
    ]);
    expect(la.containedInPlace).toEqual({
      '@type': 'State',
      name: 'California',
      containedInPlace: { '@type': 'Country', name: 'United States' },
    });
  });

  test('titles say the place type once', () => {
    expect(placeTitle('Cook County, IL', 'county')).toBe(
      'Cook County, IL: rankings and statistics'
    );
    expect(placeTitle('Orleans Parish, LA', 'county')).toBe(
      'Orleans Parish, LA: rankings and statistics'
    );
    expect(placeTitle('Georgia', 'state')).toBe(
      'Georgia: state rankings and statistics'
    );
    expect(placeTitle('Oklahoma City, OK', 'US city')).toBe(
      'Oklahoma City, OK: rankings and statistics'
    );
    expect(at(counties, 'cook-county-il').title).toBe(
      'Cook County, IL: rankings and statistics'
    );
  });
});
