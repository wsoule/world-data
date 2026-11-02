import { describe, expect, test } from 'bun:test';

import type { Metric } from '../src/data/types';
import { directionHint } from '../src/features/compare/polarity';
import {
  cycleDirection,
  validateCompareSearch,
} from '../src/features/compare/state';

const metric = (id: number, pol: -1 | 0 | 1): Metric => ({
  id,
  key: `m${id}`,
  label: `Metric ${id}`,
  fmt: null,
  unit: null,
  kind: 'num',
  pol,
  year: null,
  years: [],
  n: 10,
  topics: [],
  cats: [],
  updated: null,
});

describe('cycleDirection', () => {
  test('a neutral metric cycles none → higher → lower → none', () => {
    const pop = metric(-1, 0);
    const one = cycleDirection(undefined, pop);
    expect(one).toEqual({ '-1': 1 });
    const two = cycleDirection(one, pop);
    expect(two).toEqual({ '-1': -1 });
    expect(cycleDirection(two, pop)).toBeUndefined();
  });

  test('a metric with a direction toggles and drops a redundant override', () => {
    const crime = metric(7, -1);
    const flipped = cycleDirection({ '3': 1 }, crime);
    expect(flipped).toEqual({ '3': 1, '7': 1 });
    expect(cycleDirection(flipped, crime)).toEqual({ '3': 1 });
  });
});

describe('directionHint', () => {
  const base = validateCompareSearch({ type: 'state', m: [-1] });

  test('never calls a neutral metric better or worse', () => {
    const hint = directionHint(base, metric(-1, 0));
    expect(hint.side).toBe(0);
    expect(hint.label).toBe('No better or worse side');
  });

  test('follows the user override', () => {
    const hint = directionHint({ ...base, d: { '-1': -1 } }, metric(-1, 0));
    expect(hint.side).toBe(-1);
    expect(hint.action).toBe('click to set no side');
  });
});
