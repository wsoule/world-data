import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Metric, TopicSummary } from '../src/data/types';
import {
  featuredMetricIds,
  HOME_PRESETS,
  POPULAR_TOPICS,
} from '../src/features/home/presets';

const DATA = join(import.meta.dir, '..', 'public', 'data');
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(join(DATA, path), 'utf8')) as T;

describe('home presets', () => {
  for (const preset of HOME_PRESETS) {
    test(`${preset.id} points at well-covered numeric metrics`, () => {
      const metrics = new Map(
        read<Metric[]>(`${preset.search.type}/metrics.json`).map((m) => [
          m.id,
          m,
        ])
      );
      expect(preset.search.m.length).toBe(preset.metrics.length);
      for (const id of preset.search.m) {
        const m = metrics.get(id);
        expect(m?.kind).toBe('num');
        expect(m?.n ?? 0).toBeGreaterThan(40);
      }
      if (preset.search.view === 'scatter') {
        expect(preset.search.m).toContain(preset.search.x ?? NaN);
        expect(preset.search.m).toContain(preset.search.y ?? NaN);
      }
    });
  }

  test('popular topics all exist', () => {
    const topics = new Set(
      read<TopicSummary[]>('topics.json').map((t) => `${t.type}:${t.slug}`)
    );
    for (const t of POPULAR_TOPICS)
      expect(topics.has(`${t.type}:${t.slug}`)).toBe(true);
  });

  test('featured metrics are the preset metrics of one place type', () => {
    const state = featuredMetricIds('state');
    expect(state.has(24419)).toBe(true);
    expect(state.has(19182)).toBe(false);
    expect(featuredMetricIds('country').has(19182)).toBe(true);
    expect(featuredMetricIds('county').size).toBe(0);
  });
});
