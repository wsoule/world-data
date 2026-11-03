import { describe, expect, test } from 'bun:test';

import type { StoryData } from '../src/content/storyTypes';
import {
  shortLabel,
  storyText,
  takeaway,
} from '../src/features/articles/prose';

const metric = (id: number, label: string) => ({
  id,
  label,
  fmt: 'percAlt',
  unit: null,
  pol: 0 as const,
  year: 2024,
  topic: null,
});

const place = (name: string, x: number, y: number) => ({
  name,
  slug: name.toLowerCase(),
  x,
  y,
});

const story = (r: number, p: number, dek = ''): StoryData => ({
  slug: 's',
  kind: 'pair',
  type: 'state',
  title: 'T',
  dek,
  cats: [],
  featured: false,
  x: metric(1, 'Bachelor’s Degree or Higher (% of Adults 25+)'),
  y: metric(2, 'Republican Vote Share (President, %)'),
  color: null,
  logX: false,
  n: 51,
  r,
  rho: r,
  p,
  slope: -1,
  intercept: 80,
  medianX: 34,
  medianY: 51,
  points: [],
  top: [place('Wyoming', 30, 72)],
  bottom: [place('Vermont', 44, 33)],
  above: [place('Utah', 36, 60)],
  below: [place('Hawaii', 36, 37)],
  groups: [],
});

describe('article prose', () => {
  test('metric names drop their trailing unit inside sentences', () => {
    expect(shortLabel('Republican Vote Share (President, %)')).toBe(
      'Republican Vote Share'
    );
    expect(shortLabel('(%)')).toBe('(%)');
  });

  test('the answer follows the sign of the correlation', () => {
    expect(takeaway(story(-0.85, 0.0001))).toBe(
      'States with higher Bachelor’s Degree or Higher tend to have lower Republican Vote Share.'
    );
    expect(takeaway(story(0.6, 0.001))).toContain('tend to have higher');
    expect(takeaway(story(0.2, 0.01))).toContain('tend slightly');
  });

  test('a weak or insignificant correlation is reported as no clear link', () => {
    expect(takeaway(story(0.09, 0.55))).toMatch(/^There is no clear link/);
    expect(takeaway(story(0.05, 0.001))).toMatch(/^There is no clear link/);
  });

  test('pair articles without a teaser get the answer as their dek', () => {
    const t = storyText(story(-0.85, 0.0001));
    expect(t.dek).toContain('tend to have lower');
    expect(t.paragraphs.join(' ')).toContain('not proof that one causes');
    expect(storyText(story(-0.85, 0.0001, 'Custom teaser')).dek).toBe(
      'Custom teaser'
    );
  });
});
