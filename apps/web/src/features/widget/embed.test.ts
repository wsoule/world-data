import { expect, test } from 'bun:test';

import { embedSnippet, widgetPlaces, widgetUrl } from './embed';

test('widgetPlaces clamps and defaults', () => {
  expect(widgetPlaces(undefined)).toBe(10);
  expect(widgetPlaces(Number.NaN)).toBe(10);
  expect(widgetPlaces(0)).toBe(1);
  expect(widgetPlaces(500)).toBe(50);
  expect(widgetPlaces(12.4)).toBe(12);
});

test('widgetUrl leaves out unset params', () => {
  expect(widgetUrl('state', 'dumbest-states')).toEndWith(
    '/widget?t=state&s=dumbest-states'
  );
  expect(widgetUrl('country', 'gdp', 42, 20)).toEndWith(
    '/widget?t=country&s=gdp&m=42&n=20'
  );
});

test('embedSnippet is one iframe pointing at the widget', () => {
  const html = embedSnippet('state', 'dumbest-states', 7);
  expect(html).toStartWith('<iframe src="');
  expect(html).toContain('/widget?t=state&s=dumbest-states&m=7');
  expect(html).toEndWith('</iframe>');
});
