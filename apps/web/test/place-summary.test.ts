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
import { faqPage } from '../src/lib/seo';
import { placeSummary, summaryExtremes } from '../src/seo/content';

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
    expect(summary).toContain('It ranks best for Median Income');
    expect(summary).not.toContain('It ranks lowest for Median Income');
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
    // "The 1,000 most violent counties" and its siblings are flagged.
    for (const id of [25523, 25524, 25528]) {
      expect(counties.metric(id)?.n).toBeGreaterThanOrEqual(facts.cut.minN);
      expect(facts.selectedLists.has(id)).toBe(true);
    }
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
    const uk = countries.entityBySlug.get('united-kingdom');
    if (uk == null) throw new Error('missing United Kingdom');
    const standings = placeStandings(countries, uk);
    const { summary } = placeSummary(countries, uk);
    const tiedLast = standings.find(
      (p) =>
        summary.includes(`${p.metric.label} (tied last of`) &&
        p.standing.tied > 1 &&
        p.standing.rank + p.standing.tied - 1 >= p.standing.n
    );
    expect(tiedLast).toBeDefined();
  });
});
