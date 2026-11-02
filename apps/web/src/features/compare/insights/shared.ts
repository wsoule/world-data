import type { CompareSearch } from '../state';
import type { EntityType, Metric } from '~/data/types';

/** How to refer to the places of an entity type in sentences ("3 of 51 states"). */
export function placeNoun(type: EntityType): { one: string; many: string } {
  switch (type) {
    case 'country':
      return { one: 'country', many: 'countries' };
    case 'state':
      return { one: 'state', many: 'states' };
    case 'county':
      return { one: 'county', many: 'counties' };
    default:
      return { one: 'city', many: 'cities' };
  }
}

/** Truncate a label to `max` characters with an ellipsis (whole words when possible). */
export function shortLabel(label: string, max: number): string {
  if (label.length <= max) return label;
  const cut = label.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9%$]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 0)
  );

/**
 * True when two metric labels name essentially the same measure ("GDP per Capita - UN" vs
 * "GDP per Capita - World Bank"): at least half of their words are shared. Combined with a very
 * high correlation this marks a republished copy rather than a discovery.
 */
export function similarLabels(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared) >= 0.5;
}

/**
 * True when a metric has no inherent better/worse direction (population, area…) and the user has
 * not set one. Views still rank such metrics high-to-low but colour them neutrally.
 */
export function isNeutral(search: CompareSearch, metric: Metric): boolean {
  return metric.pol === 0 && search.d?.[String(metric.id)] == null;
}
