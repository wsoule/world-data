import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Dataset } from '../src/data/dataset';
import type {
  Entity,
  EntityType,
  Manifest,
  Metric,
  TopicFile,
  TopicSummary,
  ValuesFile,
} from '../src/data/types';
import { leadMetric } from '../src/features/topic/headline';
import {
  displayTables,
  focusableMetrics,
  hasUndated,
  resolveYear,
  seriesYears,
} from '../src/features/topic/model';
import { ORGANIZATION_ID } from '../src/lib/seo';
import { datasetCredit, topicSummary } from '../src/seo/content';
import { TOPIC_ALIASES } from '../src/seo/indexing';
import { topicAnswers } from '../src/seo/topic-content';

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

/** The page's default focus metric and year, resolved the way TopicPage does. */
function pageDefault(topic: TopicFile, ds: Dataset) {
  const tables = displayTables(topic, (id) => ds.metric(id) != null);
  const focusables = focusableMetrics(tables, (id) => ds.metric(id));
  const id = leadMetric(topic, ds)?.id;
  const focus = focusables.find((m) => m.id === id) ?? focusables[0] ?? null;
  if (focus == null) return null;
  const year = resolveYear(
    seriesYears(topic, focus.id),
    undefined,
    focus.year,
    hasUndated(topic, focus.id)
  );
  return { focus, year };
}

describe('topicAnswers', () => {
  // The page shows the loader's topicSummary() text for its default view and
  // topicAnswers() for any other metric or year, so the two must agree
  // wherever the default view's year is the metric's own default.
  for (const type of manifest.types.map((t) => t.id)) {
    test(`matches topicSummary for the default view of every ${type} topic`, () => {
      const ds = dataset(type);
      let compared = 0;
      for (const file of readdirSync(join(DATA, type, 'topics'))) {
        if (!file.endsWith('.json')) continue;
        const topic = read<TopicFile>(`${type}/topics/${file}`);
        const def = pageDefault(topic, ds);
        if (def == null || def.year !== def.focus.year) continue;
        // A hand-picked headline the page cannot focus (a statistic from another topic, or a
        // text column) is described by the loader text alone.
        if (leadMetric(topic, ds)?.id !== def.focus.id) continue;
        const seo = topicSummary(topic, ds, manifest.categories);
        const answers = topicAnswers(topic, ds, def.focus, def.year);
        expect(answers.summary).toBe(seo.summary);
        expect(answers.faq).toEqual(seo.faq);
        compared++;
      }
      expect(compared).toBeGreaterThan(10);
    });
  }

  test('describes the focused metric and year', () => {
    const ds = dataset('country');
    const topic = read<TopicFile>(
      'country/topics/gdp-per-capita-by-country.json'
    );
    const un = ds.metric(19182);
    if (un == null) throw new Error('missing metric 19182');
    const { summary, faq } = topicAnswers(topic, ds, un, 2022);
    expect(summary).toStartWith(
      'Monaco has the highest GDP per Capita - UN in 2022'
    );
    expect(faq[0].question).toBe(
      'Which country has the highest GDP per Capita - UN?'
    );
    expect(faq[2].answer).toContain('in 2022');
  });

  test('names who ranks first on a rank column and which end that is', () => {
    const ds = dataset('state');
    const worst = read<TopicFile>('state/topics/worst-states-to-live-in.json');
    const overall = ds.metric(23998);
    if (overall == null) throw new Error('missing metric 23998');
    const w = topicAnswers(worst, ds, overall, 2025);
    expect(w.summary).toStartWith(
      'Louisiana ranks 1st on Overall Worst States Rank (US News) in 2025'
    );
    expect(w.summary).toContain('rank 1 is the worst');
    expect(w.summary).toEndWith('Utah ranks last (50th).');
    expect(w.faq[0].question).toBe(
      'Which state ranks first on Overall Worst States Rank (US News)?'
    );
    // No median of positions.
    expect(w.faq.some((q) => q.question.includes('median'))).toBe(false);

    const education = read<TopicFile>(
      'state/topics/best-states-for-education.json'
    );
    const rank = ds.metric(20594);
    if (rank == null) throw new Error('missing metric 20594');
    const e = topicAnswers(education, ds, rank, rank.year);
    expect(e.summary).toContain('ranks 1st on Best Education Rank (USNews)');
    expect(e.summary).toContain('rank 1 is the best');
  });

  test('reads the undated series without a year', () => {
    const ds = dataset('country');
    const topic = read<TopicFile>(
      'country/topics/labor-force-participation-rate-by-country.json'
    );
    const lfp = ds.metric(12610);
    if (lfp == null) throw new Error('missing metric 12610');
    const { faq } = topicAnswers(topic, ds, lfp, null);
    expect(faq[2].answer).toMatch(/across the 186 countries with data\.$/);
  });

  test('answers a list topic with its places and a breakdown by value', () => {
    const ds = dataset('country');
    const topic = read<TopicFile>('country/topics/14-eyes-countries.json');
    const { summary, faq } = topicAnswers(topic, ds, null, null);
    expect(summary).toStartWith(
      '14 countries are 14 Eyes countries: United States, Germany,'
    );
    expect(summary).toContain(
      'Member of 5 Eyes: “No” in 9 of 14 countries and “Yes” in 5 (United States, United Kingdom, Canada, Australia and New Zealand).'
    );
    expect(faq.length).toBeGreaterThan(1);
  });

  test('reads opposite titles over one table from opposite ends', () => {
    const ds = dataset('state');
    const cold = topicSummary(
      read<TopicFile>('state/topics/coldest-states.json'),
      ds,
      manifest.categories
    );
    const hot = topicSummary(
      read<TopicFile>('state/topics/hottest-states.json'),
      ds,
      manifest.categories
    );
    // Both lead with NOAA's normals (HEADLINES): the source's own column copies Florida's
    // 72.6 °F into Georgia.
    expect(cold.summary).toStartWith(
      'Alaska has the lowest Average Temperature (°F)'
    );
    expect(hot.summary).toStartWith(
      'Florida has the highest Average Temperature (°F)'
    );
    expect(hot.summary).toContain('NOAA’s 1991–2020 average temperature');
    for (const page of [cold, hot])
      expect(page.description).not.toContain('Georgia');
    expect(cold.description).not.toBe(hot.description);
  });

  test('answers better- and worse-end titles by what the index means', () => {
    const ds = dataset('country');
    const lead = (slug: string) =>
      topicSummary(
        read<TopicFile>(`country/topics/${slug}.json`),
        ds,
        manifest.categories
      ).summary;
    expect(lead('safest-countries-in-the-world')).toStartWith(
      'Iceland has the lowest Global Peace Index'
    );
    expect(lead('poorest-countries-in-the-world')).toStartWith(
      'Burundi has the lowest GDP per Capita'
    );
    expect(lead('least-corrupt-countries')).toStartWith(
      'Denmark has the highest Corruption Perception Index'
    );
    expect(lead('most-corrupt-countries')).toStartWith(
      'Somalia and South Sudan tie for the lowest Corruption Perception Index'
    );
  });

  test('leads median household income with the all-households Census figure', () => {
    const ds = dataset('state');
    const topic = read<TopicFile>(
      'state/topics/median-household-income-by-state.json'
    );
    expect(leadMetric(topic, ds)?.id).toBe(900603);
    const { summary } = topicSummary(topic, ds, manifest.categories);
    expect(summary).toStartWith(
      'District of Columbia has the highest Median Household Income in 2024'
    );
    expect(summary).toContain(
      'American Community Survey 5-year estimate (2020–2024)'
    );
  });

  test('never quotes the source’s wrong Mississippi income as an answer', () => {
    const ds = dataset('state');
    const poorest = read<TopicFile>('state/topics/poorest-states.json');
    expect(leadMetric(poorest, ds)?.id).toBe(900603);
    expect(topicSummary(poorest, ds, manifest.categories).summary).toStartWith(
      'Mississippi has the lowest Median Household Income in 2024'
    );
    // Every topic carrying metric 24419, whose Mississippi value ($34,203) is far below the
    // Census Bureau's.
    const carrying = readdirSync(join(DATA, 'state/topics'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => read<TopicFile>(`state/topics/${f}`))
      .filter((t) => t.metrics.includes(24419));
    expect(carrying.length).toBeGreaterThan(1);
    for (const topic of carrying) {
      const seo = topicSummary(topic, ds, manifest.categories);
      const text = [
        seo.summary,
        seo.description,
        ...seo.faq.map((q) => q.answer),
      ].join(' ');
      expect(`${topic.slug}: ${text}`).not.toContain('$34,203');
    }
  });

  test('credits Rankodex and the agency on a topic built from a primary source', () => {
    const ds = dataset('state');
    const topic = read<TopicFile>('state/topics/crime-rates-by-state-fbi.json');
    expect(topic.url).toBeNull();
    const seo = topicSummary(topic, ds, manifest.categories);
    expect(seo.faq.at(-1)?.answer).toBe(
      'Rankodex built this from Crime in the United States (FBI Crime Data Explorer), fetched Nov 3, 2026.'
    );
    const dataset_ = seo.jsonLd[0];
    expect(dataset_.dateModified).toBe(topic.updated);
    expect(dataset_.creator).toEqual({ '@id': ORGANIZATION_ID });
    expect(dataset_.publisher).toEqual({ '@id': ORGANIZATION_ID });
    expect(dataset_.isBasedOn).toEqual([
      {
        '@type': 'CreativeWork',
        name: 'Crime in the United States - FBI Crime Data Explorer',
        url: topic.sources[0]?.url,
      },
    ]);
  });

  test('credits World Population Review as creator of a topic compiled from its page', () => {
    const ds = dataset('country');
    const topic = read<TopicFile>(
      'country/topics/most-peaceful-countries.json'
    );
    const dataset_ = topicSummary(topic, ds, manifest.categories).jsonLd[0];
    const wpr = {
      '@type': 'Organization',
      name: 'World Population Review',
      url: 'https://worldpopulationreview.com',
    };
    expect(dataset_.creator).toEqual(wpr);
    expect(dataset_.publisher).toEqual({ '@id': ORGANIZATION_ID });
    expect(dataset_.isBasedOn).toEqual({
      '@type': 'CreativeWork',
      url: 'https://worldpopulationreview.com/country-rankings/most-peaceful-countries',
      creator: wpr,
      isBasedOn: topic.sources.map((s) => ({
        '@type': 'CreativeWork',
        name: s.name,
        url: s.url,
      })),
    });
  });

  test('names each cited source once, and leaves out a missing name', () => {
    const credit = datasetCredit({
      url: null,
      sources: [
        { name: 'A - Agency', url: 'https://a.example/' },
        { name: 'A again', url: 'https://a.example/' },
        { name: '', url: 'https://b.example/' },
      ],
    });
    expect(credit.isBasedOn).toEqual([
      {
        '@type': 'CreativeWork',
        name: 'A - Agency',
        url: 'https://a.example/',
      },
      { '@type': 'CreativeWork', url: 'https://b.example/' },
    ]);
    expect(datasetCredit({ url: null, sources: [] }).isBasedOn).toBeUndefined();
  });

  for (const type of manifest.types.map((t) => t.id)) {
    test(`writes no boilerplate and one metric count for every ${type} topic`, () => {
      const ds = dataset(type);
      for (const file of readdirSync(join(DATA, type, 'topics'))) {
        if (!file.endsWith('.json')) continue;
        const topic = read<TopicFile>(`${type}/topics/${file}`);
        const seo = topicSummary(topic, ds, manifest.categories);
        expect(seo.description).not.toMatch(
          /: compare [\d,]+ .* on [\d,]+ metrics?\./
        );
        const counts = new Set(
          [...seo.description.matchAll(/([\d,]+) metrics?\b/g)].map((m) => m[1])
        );
        expect(counts.size).toBeLessThanOrEqual(1);
        // Years print without a thousands separator ("latest Year Joined (2024)").
        expect(seo.summary).not.toMatch(
          /\b(?:latest|earliest)\b[^.]*\([12],\d{3}\)/
        );
      }
    });
  }
});

describe('topic leads answer the question the title asks', () => {
  const loaded = new Map<EntityType, Dataset>();
  const cached = (type: EntityType): Dataset => {
    const hit = loaded.get(type) ?? dataset(type);
    loaded.set(type, hit);
    return hit;
  };
  const page = (type: EntityType, slug: string) =>
    topicSummary(
      read<TopicFile>(`${type}/topics/${slug}.json`),
      cached(type),
      manifest.categories
    );

  test('a membership column whose label repeats the title leads', () => {
    expect(page('country', 'g20-countries').summary).toMatch(
      /^19 countries are G20 countries: /
    );
    expect(page('country', 'g8-countries').summary).toMatch(
      /^8 countries are G8 countries: /
    );
    expect(page('country', 'global-north-countries').summary).toMatch(
      /^\d+ countries are Global North countries: /
    );
  });

  test('a categorical value the title names leads, and its places are listed', () => {
    const trump = page('state', 'how-many-states-did-trump-win-in-2016');
    expect(trump.summary).toMatch(
      /^2016 Winner: “Trump” in 30 of \d+ US states \(.+\); “Clinton” in 19/
    );
    expect(trump.title).toContain('Answered');
    const authoritarian = page(
      'country',
      'what-countries-have-authoritarian-government'
    );
    expect(authoritarian.summary).toMatch(
      /^Type of Government: “Authoritarian” in/
    );
  });

  test('the income-group pages lead with their own group', () => {
    const lead = (slug: string) => page('country', slug).summary.split(';')[0];
    expect(lead('low-income-countries')).toMatch(/“Lower” in \d+ of/);
    expect(lead('high-income-countries')).toMatch(/“High” in \d+ of/);
    expect(lead('middle-income-countries')).toMatch(
      /“(Upper|Lower) Middle” in/
    );
    const leads = ['low', 'middle', 'high'].map((g) =>
      lead(`${g}-income-countries`)
    );
    expect(new Set(leads).size).toBe(3);
  });

  test('a developing-countries title reads from the low end of development', () => {
    expect(page('country', 'developing-countries').summary).toMatch(
      /has the lowest Human Development Index/
    );
    expect(page('country', 'developed-countries').summary).toMatch(
      /has the highest Human Development Index/
    );
  });

  test('order and value columns read from the end the title means', () => {
    expect(
      page('country', 'which-country-celebrates-new-year-first').summary
    ).toMatch(/^Kiribati has the lowest Order of New Year Arrival \(1\)/);
    expect(
      page('country', 'what-country-has-the-highest-currency').summary
    ).toMatch(/^Kuwait has the lowest Rate for 1 Dollar/);
    expect(page('country', 'countries-without-clean-water').summary).toMatch(
      /has the lowest % w\/ Safe Water/
    );
  });

  test('a per-place name column lists the names, not their numbers', () => {
    expect(page('state', 'largest-city-by-state').summary).toMatch(
      /^Largest City by State: Los Angeles \(California\); Houston \(Texas\)/
    );
    expect(page('state', 'highest-paying-jobs-by-state').summary).toMatch(
      /^Highest Paying Jobs by State: \w/
    );
    for (const slug of [
      'most-dangerous-cities-by-state',
      'biggest-church-by-state',
      'richest-families-by-state',
      'small-towns-by-state',
    ])
      expect(page('state', slug).summary).not.toMatch(
        /has the (highest|lowest)/
      );
  });

  test('a list every place shares one value of names its members or that value', () => {
    expect(page('state', 'cotton-belt-states').summary).toMatch(
      /^17 US states are Cotton Belt states: /
    );
    expect(page('state', 'lsd-legal-states').summary).toMatch(
      /^LSD Legality: “Illegal” in all 51 US states listed \(/
    );
    for (const type of manifest.types.map((t) => t.id))
      for (const file of readdirSync(join(DATA, type, 'topics'))) {
        if (!file.endsWith('.json')) continue;
        const seo = page(type, file.slice(0, -5));
        expect(seo.description).not.toMatch(/” for all [\d,]+ /);
      }
  });

  test('every alias leads with the same metric as its primary', () => {
    for (const [type, aliases] of Object.entries(TOPIC_ALIASES))
      for (const [alias, primary] of Object.entries(aliases ?? {})) {
        const ds = cached(type as EntityType);
        const a = leadMetric(
          read<TopicFile>(`${type}/topics/${alias}.json`),
          ds
        );
        const p = leadMetric(
          read<TopicFile>(`${type}/topics/${primary}.json`),
          ds
        );
        expect(`${type}/${alias}: ${a?.id}`).toBe(`${type}/${alias}: ${p?.id}`);
      }
    expect(page('state', 'least-expensive-states').summary).toMatch(
      /^West Virginia has the lowest COLI Overall Index/
    );
    expect(page('state', 'cheapest-states-to-live-in').summary).toMatch(
      /^West Virginia has the lowest COLI Overall Index/
    );
  });
});

describe('topic Dataset markup', () => {
  const loaded = new Map<EntityType, Dataset>();
  const cached = (type: EntityType): Dataset => {
    const hit = loaded.get(type) ?? dataset(type);
    loaded.set(type, hit);
    return hit;
  };
  const ld = (type: EntityType, slug: string) => {
    const seo = topicSummary(
      read<TopicFile>(`${type}/topics/${slug}.json`),
      cached(type),
      manifest.categories
    );
    return {
      seo,
      dataset: seo.jsonLd[0],
      crumbs: seo.jsonLd[1] as { itemListElement: { item: string }[] },
    };
  };

  test('an alias names its primary page as the Dataset url and last breadcrumb', () => {
    for (const [type, aliases] of Object.entries(TOPIC_ALIASES))
      for (const [alias, primary] of Object.entries(aliases ?? {})) {
        const { seo, dataset, crumbs } = ld(type as EntityType, alias);
        if (seo.noindex) continue;
        const url = `https://rankodex.com/topics/${type}/${primary}`;
        expect(dataset.url).toBe(url);
        expect(crumbs.itemListElement.at(-1)?.item).toBe(url);
      }
  });

  test('dateModified is the date the page shows: its own, else its newest metric’s', () => {
    for (const type of ['state', 'country'] as const)
      for (const file of readdirSync(join(DATA, type, 'topics'))) {
        if (!file.endsWith('.json')) continue;
        const topic = read<TopicFile>(`${type}/topics/${file}`);
        const ds = cached(type);
        let shown = topic.updated;
        if (shown == null)
          for (const id of topic.metrics) {
            const u = ds.metric(id)?.updated;
            if (u != null && (shown == null || u > shown)) shown = u;
          }
        const { dataset } = ld(type, topic.slug);
        expect(dataset.dateModified ?? null).toBe(shown?.slice(0, 10) ?? null);
      }
  });

  test('an outside headline figure is measured and its publisher credited', () => {
    const { dataset } = ld('state', 'hottest-states');
    const variables = dataset.variableMeasured as { name: string }[];
    expect(variables[0].name).toBe('Average Temperature (°F)');
    expect(JSON.stringify(dataset.isBasedOn)).toContain(
      'nClimDiv Climate Division Data - NOAA'
    );
    const poorest = ld('state', 'poorest-states').dataset;
    expect(JSON.stringify(poorest.isBasedOn)).toContain(
      'American Community Survey 5-Year Estimates'
    );
  });
});
