import { describe, expect, test } from 'bun:test';

import { Dataset } from '../src/data/dataset';
import type {
  Entity,
  EntityTypeInfo,
  Metric,
  TopicFile,
} from '../src/data/types';
import {
  akin,
  cueEnd,
  headlineOverride,
  HEADLINES,
  isYearValued,
  leadMetric,
  pickHeadline,
  titleCue,
  topicEnd,
  topicListOrder,
} from '../src/features/topic/headline';
import { rankingOrderLabel } from '../src/features/topic/model';
import {
  shorterTitles,
  topicClosing,
  topicClosings,
  topicDescription,
  topicPageTitle,
} from '../src/seo/content';
import {
  coverage,
  joinNames,
  listPhrase,
  rankEndNote,
  sourceAnswer,
  topicAnswers,
  valueGroups,
} from '../src/seo/topic-content';

const TYPE: EntityTypeInfo = {
  id: 'state',
  label: 'US States',
  singular: 'State',
  prefix: 'state-rankings',
  entities: 12,
  metrics: 0,
  numericMetrics: 0,
  topics: 0,
};

/** Twelve places, largest first, named A to L. */
const ENTITIES: Entity[] = 'ABCDEFGHIJKL'.split('').map((c, i) => ({
  id: c,
  name: `State ${c}`,
  slug: c.toLowerCase(),
  flag: null,
  group: null,
  pop: 1000 - i,
}));

function metric(
  id: number,
  label: string,
  extra: Partial<Metric> = {}
): Metric {
  return {
    id,
    key: `k${id}`,
    label,
    fmt: 'floatNumberTenths',
    unit: null,
    kind: 'num',
    pol: 0,
    year: null,
    years: [],
    n: 0,
    topics: [],
    cats: [],
    updated: null,
    ...extra,
  };
}

const TEMP_C = metric(1, 'Average Temperature (°C)');
const TEMP_F = metric(2, 'Average Temperature (°F)');
const POP = metric(3, 'Population', { fmt: 'numberWithCommas' });
const CRIME = metric(4, 'Violent Crime Rate', { pol: -1 });
const RANK = metric(5, 'Education Rank', { fmt: 'ranking', pol: -1 });
const JOINED = metric(6, 'Year Joined', { fmt: null });
const STATUS = metric(7, 'Legal Status', { kind: 'cat', fmt: null });
const NON_RELIGIOUS = metric(8, 'Pct Non-Religious', { fmt: 'percAlt' });

/** A topic over `columns`: [metric, values in entity order (null = no value)]. */
function topic(
  title: string,
  columns: [Metric, (number | string | null)[]][],
  extra: Partial<TopicFile> = {}
): TopicFile {
  const series: TopicFile['series'] = {};
  const places = new Set<number>();
  for (const [m, values] of columns) {
    const idx: number[] = [];
    const vals: (number | string)[] = [];
    values.forEach((v, i) => {
      if (v == null) return;
      idx.push(i);
      vals.push(v);
      places.add(i);
    });
    series[String(m.id)] = { _: [idx, vals] };
  }
  return {
    slug: title.toLowerCase().replaceAll(' ', '-'),
    type: 'state',
    title,
    cats: [],
    updated: null,
    url: 'https://worldpopulationreview.com/state-rankings/x',
    sources: [],
    related: [],
    tables: [{ name: '', metrics: columns.map(([m]) => m.id) }],
    metrics: columns.map(([m]) => m.id),
    entities: [...places].sort((a, b) => a - b),
    series,
    ...extra,
  };
}

const dataset = (metrics: Metric[]) =>
  new Dataset(TYPE, ENTITIES, metrics, { entityCount: 12, metrics: [] }, []);

describe('titleCue', () => {
  test('reads the direction word of a title', () => {
    expect(titleCue('Coldest Countries')).toEqual({ kind: 'size', end: 'low' });
    expect(titleCue('Largest Cities')).toEqual({ kind: 'size', end: 'high' });
    expect(titleCue('Highest-Paid Jobs by State')).toEqual({
      kind: 'size',
      end: 'high',
    });
    expect(titleCue('Median Household Income by State')).toBeNull();
  });

  test('reads the adjective after most and least', () => {
    expect(titleCue('Most Dangerous Cities')).toMatchObject({
      kind: 'judged',
      good: false,
    });
    expect(titleCue('Least Corrupt Countries')).toMatchObject({
      kind: 'judged',
      good: true,
    });
    expect(titleCue('Most Expensive States')).toMatchObject({
      kind: 'size',
      end: 'high',
    });
    expect(titleCue('Least Religious States')).toEqual({
      kind: 'size',
      end: 'low',
      word: 'religious',
    });
  });

  test('reads age words', () => {
    expect(titleCue('Oldest Cities')).toEqual({ kind: 'age', old: true });
    expect(titleCue('Youngest Countries')).toEqual({ kind: 'age', old: false });
  });

  test('reads without, low-income, developing and first', () => {
    expect(titleCue('Countries Without Clean Water')).toEqual({
      kind: 'size',
      end: 'low',
    });
    expect(titleCue('Low-Income Countries')).toEqual({
      kind: 'size',
      end: 'low',
    });
    expect(titleCue('Developing Countries')).toMatchObject({
      kind: 'judged',
      good: false,
      fallback: 'low',
    });
    expect(titleCue('Which Country Celebrates the New Year First?')).toEqual({
      kind: 'size',
      end: 'low',
      orderOnly: true,
    });
    // A later direction word wins over the order-only "first".
    expect(titleCue('First Countries with the Highest Tax')).toEqual({
      kind: 'size',
      end: 'high',
    });
  });

  test('"first" speaks for an order column only', () => {
    const newYear = {
      type: 'country' as const,
      slug: 'n',
      title: 'Which Country Celebrates the New Year First?',
    };
    const order = metric(30, 'Order of New Year Arrival', { fmt: null });
    expect(topicEnd(newYear, order, order)).toBe('low');
    const firstWorld = {
      type: 'country' as const,
      slug: 'f',
      title: 'First World Countries',
    };
    const hdi = metric(31, 'Human Development Index', { pol: 1 });
    expect(topicEnd(firstWorld, hdi, hdi)).toBeNull();
  });
});

describe('HEADLINES', () => {
  test("an alias reads its primary page's entry", () => {
    expect(
      headlineOverride({ type: 'state', slug: 'cheapest-states-to-live-in' })
    ).toEqual(HEADLINES['state/least-expensive-states']);
    expect(
      headlineOverride({ type: 'state', slug: 'same-sex-marriage-states' })
    ).toEqual(HEADLINES['state/gay-marriage-by-state']);
    expect(headlineOverride({ type: 'state', slug: 'no-such-topic' })).toBe(
      undefined
    );
  });
});

describe('cueEnd', () => {
  test('turns judged words into an end by polarity', () => {
    const safest = titleCue('Safest States');
    expect(cueEnd(safest, { pol: -1, fmt: null })).toBe('low');
    expect(cueEnd(safest, { pol: 1, fmt: null })).toBe('high');
    expect(cueEnd(titleCue('Poorest States'), { pol: 0, fmt: null })).toBe(
      'low'
    );
  });

  test('reads size words on a rank column from rank 1', () => {
    expect(cueEnd(titleCue('Largest'), { pol: -1, fmt: 'ranking' })).toBe(
      'low'
    );
    expect(cueEnd(titleCue('Smallest'), { pol: -1, fmt: 'ranking' })).toBe(
      'high'
    );
  });

  test('reads oldest as the earliest year and the highest age', () => {
    const oldest = titleCue('Oldest Countries');
    expect(cueEnd(oldest, { pol: 0, fmt: null }, true)).toBe('low');
    expect(cueEnd(oldest, { pol: 0, fmt: null }, false)).toBe('high');
    expect(cueEnd(titleCue('Youngest'), { pol: 0, fmt: null }, true)).toBe(
      'high'
    );
  });
});

describe('topicEnd and topicListOrder', () => {
  const coldest = {
    type: 'state' as const,
    slug: 'c',
    title: 'Coldest States',
  };

  test('a size word speaks for the headline and metrics akin to it only', () => {
    expect(akin(TEMP_C, TEMP_F)).toBe(true);
    expect(akin(TEMP_C, POP)).toBe(false);
    expect(topicEnd(coldest, TEMP_C, TEMP_C)).toBe('low');
    expect(topicEnd(coldest, TEMP_F, TEMP_C)).toBe('low');
    expect(topicEnd(coldest, POP, TEMP_C)).toBeNull();
  });

  test('a judged word speaks for every metric with a better side', () => {
    const worst = { type: 'state' as const, slug: 'w', title: 'Worst States' };
    expect(topicEnd(worst, CRIME, TEMP_C)).toBe('high');
    expect(topicEnd(worst, POP, TEMP_C)).toBeNull();
  });

  test('a label that negates the title adjective turns the end round', () => {
    const least = {
      type: 'state' as const,
      slug: 'l',
      title: 'Least Religious States',
    };
    expect(topicEnd(least, NON_RELIGIOUS, NON_RELIGIOUS)).toBe('high');
  });

  test('lists values from the title end and rank columns from their last rank', () => {
    expect(topicListOrder(coldest, TEMP_C, TEMP_C)).toEqual({
      direction: -1,
      fromLast: false,
      byTitle: true,
    });
    const least = {
      type: 'state' as const,
      slug: 'le',
      title: 'Least Educated States',
    };
    expect(topicListOrder(least, RANK, RANK)).toEqual({
      direction: -1,
      fromLast: true,
      byTitle: true,
    });
    const plain = {
      type: 'state' as const,
      slug: 'p',
      title: 'Crime by State',
    };
    expect(topicListOrder(plain, CRIME, CRIME)).toEqual({
      direction: -1,
      fromLast: false,
      byTitle: false,
    });
  });

  test('labels a title-chosen order by value', () => {
    const order = topicListOrder(coldest, TEMP_C, TEMP_C);
    expect(rankingOrderLabel(TEMP_C, false, order)).toBe('Lowest first');
    expect(rankingOrderLabel(TEMP_C, true, order)).toBe('Highest first');
    expect(rankingOrderLabel(JOINED, false, { ...order, years: true })).toBe(
      'Earliest first'
    );
    const least = topicListOrder(
      { type: 'state', slug: 'le', title: 'Least Educated States' },
      RANK,
      RANK
    );
    expect(rankingOrderLabel(RANK, false, least)).toBe('Worst first');
  });
});

describe('isYearValued', () => {
  test('recognises unformatted whole-number years', () => {
    expect(isYearValued(JOINED, [1949, 2024, NaN])).toBe(true);
    expect(
      isYearValued(metric(9, 'Independence Year', { fmt: null }), [301, 2006])
    ).toBe(true);
    expect(isYearValued(metric(9, 'Score', { fmt: null }), [301, 2006])).toBe(
      false
    );
    expect(
      isYearValued(
        metric(9, 'Count', { fmt: 'numberWithCommas' }),
        [1990, 2000]
      )
    ).toBe(false);
    expect(isYearValued(metric(9, 'Share', { fmt: null }), [19.5, 2000])).toBe(
      false
    );
  });
});

describe('pickHeadline and leadMetric', () => {
  test('prefers a label that repeats the title over the first column', () => {
    const t = {
      type: 'state' as const,
      slug: 'x',
      title: 'Cost of Living Index by State',
    };
    const housing = metric(10, 'Housing Index');
    const overall = metric(11, 'Cost of Living Index');
    expect(pickHeadline(t, [housing, overall], () => undefined)?.id).toBe(11);
  });

  test('a title naming nothing a label repeats leads with an overall index', () => {
    const t = {
      type: 'state' as const,
      slug: 'x',
      title: 'Least Expensive States',
    };
    const grocery = metric(12, 'COLI Grocery Costs Index');
    const overallRank = metric(13, 'Overall Rank', { fmt: 'ranking' });
    const overall = metric(14, 'COLI Overall Index');
    const pick = (ms: Metric[]) => pickHeadline(t, ms, () => undefined)?.id;
    expect(pick([grocery, overallRank, overall])).toBe(14);
    // An overall rank is not an index: the first column leads.
    expect(pick([grocery, overallRank])).toBe(12);
  });

  test('leads with the hand-checked headline of a topic', () => {
    const income = metric(900603, 'Median Household Income');
    const ds = dataset([TEMP_C, income]);
    const t = topic('Median Household Income by State', [[TEMP_C, [1, 2, 3]]], {
      slug: 'median-household-income-by-state',
    });
    expect(leadMetric(t, ds)?.id).toBe(900603);
  });
});

describe('valueGroups, coverage and joinNames', () => {
  test('groups values that print the same', () => {
    const groups = valueGroups(
      [
        [0, 115.63],
        [1, 115.6],
        [2, 99],
      ],
      (v) => v.toFixed(1)
    );
    expect(groups.map((g) => g.places)).toEqual([[0, 1], [2]]);
  });

  test('tells a top-N list from a sample of the largest places', () => {
    const rows = (idx: number[]) => idx.map((i): [number, number] => [i, i]);
    expect(coverage(12, rows([0, 1, 2, 3, 4, 5, 6]))).toEqual({
      partial: false,
      picked: false,
    });
    expect(coverage(12, rows([0, 1, 2]))).toEqual({
      partial: true,
      picked: false,
    });
    expect(coverage(12, rows([7, 9, 11]))).toEqual({
      partial: true,
      picked: true,
    });
  });

  test('switches to semicolons for names with commas', () => {
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
    expect(
      joinNames(['Kings County, NY', 'Queens County, NY', 'Bronx County, NY'])
    ).toBe('Kings County, NY; Queens County, NY and Bronx County, NY');
  });
});

describe('topicAnswers', () => {
  const temps = [10, 25, 3, 18, 7, 30, 22, 15, 12, 5, 20, 27];

  test('answers from the end the title asks for', () => {
    const ds = dataset([TEMP_C]);
    const cold = topicAnswers(
      topic('Coldest States', [[TEMP_C, temps]]),
      ds,
      TEMP_C,
      null
    );
    expect(cold.summary).toStartWith(
      'State C has the lowest Average Temperature (°C) (3.0), followed by State J (5.0) and State E (7.0).'
    );
    expect(cold.summary).toContain('State F has the highest (30.0).');
    expect(cold.faq[0].question).toBe(
      'Which state has the lowest Average Temperature (°C)?'
    );
    const hot = topicAnswers(
      topic('Hottest States', [[TEMP_C, temps]]),
      ds,
      TEMP_C,
      null
    );
    expect(hot.summary).toStartWith('State F has the highest');
    expect(hot.short).toBe(
      'State F has the highest Average Temperature (°C) (30.0). State C has the lowest (3.0).'
    );
  });

  test('writes ties as ties', () => {
    const ds = dataset([TEMP_C]);
    const tied = [30, 30, 3, 18, 7, 28, 22, 15, 12, 3, 20, 27];
    const { summary } = topicAnswers(
      topic('Heat', [[TEMP_C, tied]]),
      ds,
      TEMP_C,
      null
    );
    expect(summary).toStartWith(
      'State A and State B tie for the highest Average Temperature (°C) (30.0), followed by State F (28.0).'
    );
    expect(summary).toContain('State C and State J tie for the lowest (3.0).');
  });

  test('counts a tie shared by many and says how far the rest reach', () => {
    const ds = dataset([TEMP_C]);
    const many = [100, 100, 100, 100, 100, 100, 90, 80, 70, 60, 50, 40];
    const { summary } = topicAnswers(
      topic('Access', [[TEMP_C, many]]),
      ds,
      TEMP_C,
      null
    );
    expect(summary).toBe(
      '6 of the 12 US states with data share the highest Average Temperature (°C) (100.0); the rest range down to 40.0 (State L).'
    );
  });

  test('describes a column of a few values value by value', () => {
    const ds = dataset([TEMP_C]);
    const two = [24, 24, 12, 12, 12, 24, 12, 12, 24, 12, 12, 12];
    const { summary } = topicAnswers(
      topic('Seats', [[TEMP_C, two]]),
      ds,
      TEMP_C,
      null
    );
    expect(summary).toBe(
      'Average Temperature (°C) is 24.0 in 4 of the 12 US states with data (State A, State B, State F and State I) and 12.0 in the other 8.'
    );
  });

  test('scopes a partial list and drops the median of a top-N list', () => {
    const ds = dataset([CRIME]);
    // Three small places, picked by the metric itself.
    const picked = [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      5,
      9,
      7,
    ];
    const { summary, faq } = topicAnswers(
      topic('Crime in Some States', [[CRIME, picked]]),
      ds,
      CRIME,
      null
    );
    expect(summary).toBe(
      'State K has the highest Violent Crime Rate of the 3 US states listed (9.0), followed by State L (7.0). State J ranks last of the 3 listed (5.0).'
    );
    expect(faq.some((q) => q.question.includes('median'))).toBe(false);
    expect(faq[1].question).toBe(
      'Which state ranks last on Violent Crime Rate of those listed?'
    );
  });

  test('prints years without separators and reads them as earliest and latest', () => {
    const ds = dataset([JOINED]);
    const years = [
      1949, 2024, 1952, 1999, 2004, 1982, 2009, 2017, 2020, 1955, 1990, 2023,
    ];
    const { summary } = topicAnswers(
      topic('Members', [[JOINED, years]]),
      ds,
      JOINED,
      null
    );
    expect(summary).toStartWith(
      'State B has the latest Year Joined (2024), followed by State L (2023) and State I (2020).'
    );
    expect(summary).toContain('State A has the earliest (1949).');
  });

  test('reads a rank column from its last rank when the title asks for that end', () => {
    const ds = dataset([RANK]);
    const ranks = [3, 1, 2, 5, 4, 6, 7, 8, 9, 10, 11, 12];
    const { summary } = topicAnswers(
      topic('Least Educated States', [[RANK, ranks]]),
      ds,
      RANK,
      null
    );
    expect(summary).toBe(
      'State L ranks last on Education Rank (12th), behind State K (11th) and State J (10th); rank 1 is the best. State B ranks 1st.'
    );
  });

  test('answers a categorical topic by value', () => {
    const ds = dataset([STATUS]);
    const status = [
      'Legal',
      'Legal',
      'Banned',
      'Legal',
      'Banned',
      'Legal',
      'Legal',
      'Banned',
      'Limited',
      'Legal',
      'Legal',
      'Banned',
    ];
    const t = topic('Laws by State', [[STATUS, status]]);
    const { summary, faq } = topicAnswers(t, ds, null, null);
    expect(summary).toBe(
      '12 US states are on the Laws by State list: State A, State B, State C, State D, State E, State F, State G, State H, State I, State J, State K and State L. Legal Status: “Legal” in 7 of 12 US states; “Banned” in 4 (State C, State E, State H and State L) and “Limited” in 1 (State I).'
    );
    expect(faq.map((q) => q.question)).toContain(
      'In which US states is Legal Status “Banned”?'
    );
  });
});

describe('sourceAnswer', () => {
  test('credits Rankodex and the agency for a topic built from a primary source', () => {
    expect(
      sourceAnswer({
        url: null,
        updated: '2026-11-03',
        sources: [
          {
            name: 'Crime in the United States - FBI Crime Data Explorer',
            url: 'https://cde.ucr.cjis.gov/',
          },
        ],
      })
    ).toBe(
      'Rankodex built this from Crime in the United States (FBI Crime Data Explorer), fetched Nov 3, 2026.'
    );
  });
});

describe('topicPageTitle', () => {
  test('frames a title with the longest variant that fits 65 characters', () => {
    expect(topicPageTitle('Coldest States', true)).toBe(
      'Coldest States: Ranked, Mapped & Compared'
    );
    expect(topicPageTitle('Median Household Income by State', true)).toBe(
      'Median Household Income by State: Ranked & Mapped'
    );
    expect(
      topicPageTitle(
        'Percentage of Households Making Over $250,000 by State',
        true
      )
    ).toBe('% of Households Making Over $250,000 by State: Ranked');
    expect(topicPageTitle('Education Rankings by Country', true)).toBe(
      'Education Rankings by Country: Mapped & Compared'
    );
    expect(topicPageTitle('Abortion Laws by State', false)).toBe(
      'Abortion Laws by State: Full List'
    );
    expect(topicPageTitle('Is Turkey a Muslim Country?', false)).toBe(
      'Is Turkey a Muslim Country? Answered with Data'
    );
  });

  test('falls back to shorter framings before leaving a title unframed', () => {
    expect(
      topicPageTitle('Net International Investment Position by Country', true)
    ).toBe('Net International Investment Position by Country: Map');
    expect(
      topicPageTitle('Countries Where Wearing a Burqa is Mandatory', false)
    ).toBe('Countries Where Wearing a Burqa is Mandatory: List');
    expect(
      topicPageTitle('Which Countries Practice Female Circumcision?', true)
    ).toBe('Which Countries Practice Female Circumcision? Answered');
    // A parenthesis that is not an acronym is part of the name.
    expect(
      topicPageTitle('Countries With Poor (or Limited) Internet Access', true)
    ).toBe('Countries With Poor (or Limited) Internet Access: Map');
  });

  test('keeps one of an acronym and its words when the title is too long', () => {
    // The source's own wording wins while any framing fits it.
    expect(
      topicPageTitle('European Free Trade Association (EFTA) Countries', false)
    ).toBe('European Free Trade Association (EFTA) Countries: List');
    expect(
      topicPageTitle(
        'Collective Security Treaty Organization (CSTO) Countries',
        false
      )
    ).toBe('CSTO Countries: Full List');
    expect(
      topicPageTitle(
        'North Atlantic Treaty Organization (NATO) Countries',
        true
      )
    ).toBe('North Atlantic Treaty Organization Countries: Ranked');
    expect(
      topicPageTitle(
        'South Asian Association for Regional Cooperation (SAARC) Countries',
        true
      )
    ).toBe('SAARC Countries: Ranked, Mapped & Compared');
    expect(
      topicPageTitle(
        'CIS (Commonwealth of Independent States) Countries',
        false
      )
    ).toBe('CIS Countries: Full List');
    expect(
      topicPageTitle('Countries of the European Economic (EEA) Area', false)
    ).toBe('Countries of the European Economic (EEA) Area: List');
    expect(
      shorterTitles('Countries with Red, White, and Blue Flags with One Star')
    ).toEqual(['Countries with Red, White and Blue Flags with One Star']);
    // A short title keeps its acronym.
    expect(topicPageTitle('NATO Countries', false)).toBe(
      'NATO Countries: Full List'
    );
  });

  test('never makes the <title> longer than 65 characters by framing it', () => {
    for (const title of [
      'Volleyball Rankings by Country / Beach Volleyball Rankings by Country',
      'South Asian Association for Regional Cooperation (SAARC) Countries',
      'Countries Where You’re Not Allowed to Renounce Citizenship',
      'Which Countries Require Six Months of Passport Validity?',
      'Countries with Black and White Flags with a Red Stripe',
    ]) {
      const framed = topicPageTitle(title, true);
      expect(framed === title || `${framed} — Rankodex`.length <= 65).toBe(
        true
      );
    }
  });

  test('names the topic within what a search snippet shows', () => {
    const closing =
      'Oil Producing Countries: 50 countries ranked on 2 metrics, mapped and compared.';
    const short =
      'United States has the highest Daily Oil Production of the 50 countries listed in 2025 (21.1M barrels/day). Yemen ranks last of the 50 listed (22K barrels/day).';
    const lead =
      'United States has the highest Daily Oil Production of the 50 countries listed in 2025 (21.1M barrels/day).';
    // The whole short answer would push the name past the snippet: its first sentence leads.
    expect(
      topicDescription([short, lead], closing, 'Oil Producing Countries')
    ).toBe(`${lead} ${closing}`);
    // A short answer that leaves room stays whole.
    expect(
      topicDescription(
        [
          'A has the highest X (1). B has the lowest (0).',
          'A has the highest X (1).',
        ],
        'Coldest States: 50 US states ranked on 1 metric, mapped and compared.',
        'Coldest States'
      )
    ).toBe(
      'A has the highest X (1). B has the lowest (0). Coldest States: 50 US states ranked on 1 metric, mapped and compared.'
    );
    // An answer that already names the topic needs no room for the closing.
    const list =
      '10 countries are on the Polynesian Countries list: New Zealand, French Polynesia, Samoa, Tonga, American Samoa, Cook Islands, Wallis and Futuna, Tuvalu, Niue and Tokelau.';
    expect(
      topicDescription(
        [list, list],
        'Polynesian Countries: 10 countries and 1 metric in one table.',
        'Polynesian Countries'
      )
    ).toStartWith(list);
    // A shorter closing keeps the description to whole sentences.
    expect(
      topicDescription(
        [`${'A has the highest X (1). '.repeat(3)}B has the lowest (0).`],
        topicClosings('Coldest States', 50, 3, true, TYPE),
        'Coldest States'
      )
    ).toBe(
      `${'A has the highest X (1). '.repeat(3)}B has the lowest (0). Coldest States: 50 US states ranked on 3 metrics.`
    );
    // A long categorical breakdown: the closing leads.
    const breakdown =
      'Call Recordings Law: “Single-Party Consent” in 38 of 51 US states; “Two-Party Consent” in 10 and “Mixed Consent” in 3 (Oregon, Connecticut and Hawaii).';
    expect(
      topicDescription(
        [breakdown, breakdown],
        'Two-Party Consent States: 51 US states and 2 metrics in one table.',
        'Two-Party Consent States'
      )
    ).toBe(
      `Two-Party Consent States: 51 US states and 2 metrics in one table. ${breakdown}`
    );
  });

  test('frames a question "Answered" only when its lead answers it', () => {
    expect(topicPageTitle('How Many States Did Trump Win?', true, true)).toBe(
      'How Many States Did Trump Win? Answered with Data'
    );
    expect(topicPageTitle('How Many States Did Trump Win?', true, false)).toBe(
      'How Many States Did Trump Win? Data & Map'
    );
  });

  test('names the topic in the closing sentence of its description', () => {
    expect(topicClosing('Coldest States', 50, 3, true, TYPE)).toBe(
      'Coldest States: 50 US states ranked on 3 metrics, mapped and compared.'
    );
    expect(topicClosing('Is X?', 1, 1, false, TYPE)).toBe(
      'Is X: 1 state and 1 metric in one table.'
    );
    expect(topicClosing(null, 9, 2, false, TYPE)).toBe(
      '9 US states and 2 metrics in one table.'
    );
    expect(topicClosings('Coldest States', 50, 3, true, TYPE)).toEqual([
      'Coldest States: 50 US states ranked on 3 metrics, mapped and compared.',
      'Coldest States: 50 US states ranked on 3 metrics.',
      'Coldest States: 50 US states, ranked and mapped.',
      'Coldest States: the full ranking.',
    ]);
  });
});

describe('listPhrase', () => {
  test('names the kind of place a list title is', () => {
    expect(listPhrase('G20 Countries')).toBe('are G20 countries');
    expect(listPhrase('Cotton Belt States')).toBe('are Cotton Belt states');
  });

  test('leaves out titles that name an end, a negation, a question or a name', () => {
    expect(listPhrase('Most Visited Countries')).toBeNull();
    expect(listPhrase('Countries Without KFC')).toBeNull();
    expect(listPhrase('States Without Ticks')).toBeNull();
    expect(listPhrase('Euthanasia Legal in What States')).toBeNull();
    expect(listPhrase('Continental United States')).toBeNull();
    expect(listPhrase('R34 Legal in States')).toBeNull();
    expect(listPhrase('Which Countries Use 24 Hour Time?')).toBeNull();
  });
});

describe('rankEndNote', () => {
  test('says best or worst by polarity', () => {
    expect(rankEndNote(RANK, 'US state')?.clause).toBe('rank 1 is the best');
    expect(
      rankEndNote({ ...RANK, label: 'Most Hated Rank', pol: 1 }, 'US state')
        ?.sentence
    ).toBe('Rank 1 is the worst US state.');
  });

  test('never calls rank 1 of a neutral rank the best', () => {
    const density = metric(40, 'Population Density Rank', {
      fmt: 'ranking',
      pol: 0,
    });
    expect(rankEndNote(density, 'city')?.clause).toBe(
      'rank 1 has the highest Population Density'
    );
    expect(
      rankEndNote(
        { ...density, label: 'Weirdness Rank (Insider Monkey)' },
        'country'
      )?.clause
    ).toBe('rank 1 has the highest Weirdness');
    // A label that names only the rank says nothing about its end.
    expect(rankEndNote({ ...density, label: 'Rank' }, 'country')).toBeNull();
    const t = topic('Population Density by State', [
      [{ ...density, label: 'Density Rank' }, [1, 2, 3, 4, 5]],
    ]);
    const ds = dataset([{ ...density, label: 'Density Rank' }]);
    const text = topicAnswers(t, ds, ds.metric(40) ?? null, null);
    expect(text.summary).not.toContain('best');
    expect(text.summary).toContain('rank 1 has the highest Density');
  });
});
