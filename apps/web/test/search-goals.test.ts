import { describe, expect, test } from 'bun:test';

import { validateCompareSearch } from '../src/features/compare/state';
import {
  GOALS,
  ideasFor,
  inferGoal,
  siteHref,
} from '../src/features/search/goals';

describe('inferGoal', () => {
  test('reads intent from everyday words', () => {
    expect(inferGoal('where should I retire')).toBe('move');
    expect(inferGoal('cheapest places to live')).toBe('move');
    expect(inferGoal('correlation between income and health')).toBe('research');
    expect(inferGoal('best countries to visit')).toBe('travel');
    expect(inferGoal('weird facts')).toBe('curious');
  });

  test('stays undecided for plain topics or mixed intent', () => {
    expect(inferGoal('median income')).toBeNull();
    expect(inferGoal('Japan')).toBeNull();
    expect(inferGoal('safe places to visit')).toBeNull();
  });
});

describe('ideasFor', () => {
  test('a query that only names the goal gets its first ideas', () => {
    const ideas = ideasFor('move', 'moving', null);
    expect(ideas.map((i) => i.id)).toEqual(
      GOALS[0].ideas.slice(0, 3).map((i) => i.id)
    );
  });

  test('other words narrow the curated ideas', () => {
    const ids = ideasFor('move', 'retire', null).map((i) => i.id);
    expect(ids).toContain('move-retire');
    expect(ids).not.toContain('move-weather');
  });

  test('a top metric adds a goal-flavoured follow-up first', () => {
    const target = {
      kind: 'metric' as const,
      type: 'state' as const,
      id: 42,
      topic: null,
    };
    const research = ideasFor('research', 'median income', {
      target,
      title: 'Median Income',
    });
    expect(research[0].title).toBe('What goes with Median Income?');
    const move = ideasFor('move', 'median income', {
      target,
      title: 'Median Income',
    });
    expect(move[0].title).toBe('Map Median Income');
  });
});

describe('siteHref', () => {
  test('writes params the compare page reads back', () => {
    const href = siteHref('/compare', {
      type: 'state',
      view: 'ranking',
      bundle: 'quality',
      m: [1, 2],
    });
    const params = new URLSearchParams(href.split('?')[1]);
    const raw: Record<string, unknown> = {};
    for (const [k, v] of params) {
      try {
        raw[k] = JSON.parse(v);
      } catch {
        raw[k] = v;
      }
    }
    const s = validateCompareSearch(raw);
    expect(s.view).toBe('ranking');
    expect(s.bundle).toBe('quality');
    expect(s.m).toEqual([1, 2]);
  });

  test('every curated idea links to a site path', () => {
    for (const g of GOALS)
      for (const idea of g.ideas) expect(idea.href.startsWith('/')).toBe(true);
  });
});
