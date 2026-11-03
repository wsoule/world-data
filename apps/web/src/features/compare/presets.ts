import type { CompareSearch } from './state';
import type { Dataset } from '~/data/dataset';
import { ACS, ELECTIONS } from '~/data/external';
import type { EntityType, Metric } from '~/data/types';

/**
 * A ready-made two-metric comparison. `x` is plotted horizontally and `y`
 * vertically; the optional encodings mirror the compare URL contract.
 */
export interface ScatterPreset {
  title: string;
  description: string;
  x: number;
  y: number;
  r?: number;
  /** Colour by region ('group') or by a metric, such as the election winner */
  c?: 'group' | number;
  log?: ('x' | 'y')[];
}

// Metric ids verified against public/data/<type>/metrics.json (external ones from
// src/data/external.ts). Pairs were
// chosen for broad overlapping coverage so the plots are never sparse.
const PRESETS: Record<EntityType, ScatterPreset[]> = {
  state: [
    {
      title: 'Education vs how states voted',
      description: 'Do states with more college graduates vote differently?',
      x: ACS.bachelorsShare,
      y: ELECTIONS.republicanShare,
      c: ELECTIONS.winner,
    },
    {
      title: 'Education vs income',
      description: 'Do states with better schools earn more?',
      x: 20594,
      y: 24419,
    },
    {
      title: 'Poverty vs violent crime',
      description: 'Is crime higher where more people are poor?',
      x: 11725,
      y: 20784,
    },
    {
      title: 'GDP vs happiness',
      description: 'Does a richer economy make a happier state?',
      x: 25591,
      y: 20482,
    },
    {
      title: 'GDP vs life expectancy',
      description: 'Do people live longer in wealthier states?',
      x: 25591,
      y: 20608,
    },
  ],
  country: [
    {
      title: 'Education vs income',
      description: 'Education index against median income',
      x: 16684,
      y: 16628,
      c: 'group',
    },
    {
      title: 'Poverty vs homicide',
      description: 'Multidimensional poverty against homicide rate',
      x: 19260,
      y: 19986,
      c: 'group',
    },
    {
      title: 'GDP vs happiness',
      description: 'Does money buy happiness? (log GDP, sized by population)',
      x: 19182,
      y: 14450,
      r: -1,
      c: 'group',
      log: ['x'],
    },
    {
      title: 'GDP vs life expectancy',
      description: 'The Preston curve, sized by population',
      x: 19182,
      y: 18683,
      r: -1,
      c: 'group',
      log: ['x'],
    },
  ],
  city: [
    {
      title: 'Density vs violent crime',
      description: 'Are denser cities more violent?',
      x: -2,
      y: 25088,
      log: ['x'],
    },
    {
      title: 'Size vs traffic',
      description: 'Do bigger cities have worse congestion?',
      x: -1,
      y: 24970,
      log: ['x'],
    },
    {
      title: 'Air pollution vs violent crime',
      description: 'PM2.5 concentration against violent crime',
      x: 25069,
      y: 25088,
    },
  ],
  'world-city': [
    {
      title: 'Cost of living vs purchasing power',
      description: 'Are expensive cities also the best paid?',
      x: 25120,
      y: 25125,
    },
    {
      title: 'Size vs pollution',
      description: 'Do megacities have dirtier air?',
      x: -1,
      y: 25126,
      log: ['x'],
    },
  ],
  county: [
    {
      title: 'Education vs how counties voted',
      description:
        'College graduates against the Republican vote, coloured by winner',
      x: ACS.bachelorsShare,
      y: ELECTIONS.republicanShare,
      c: ELECTIONS.winner,
    },
    {
      title: 'Income vs life expectancy',
      description: 'Do richer counties live longer?',
      x: 25455,
      y: 25502,
    },
    {
      title: 'Income vs violent crime',
      description: 'Median income against violent crime rate',
      x: 25455,
      y: 25524,
    },
    {
      title: 'Binge drinking vs life expectancy',
      description: 'Does heavy drinking show up in lifespans?',
      x: 25500,
      y: 25502,
    },
  ],
};

// Curated starting metrics per type (most-asked questions first). Anything
// missing from the dataset is skipped and topped up by coverage.
const POPULAR: Record<EntityType, number[]> = {
  state: [24419, 20594, 20784, 20425, 20482, 20608, 21217, 11725, 21640, 25591],
  country: [19182, 14450, 18683, -1, 21913, 16684, 19986, 16628, 22764, 17796],
  city: [-1, -2, 25088, 25069, 24970, 25081],
  'world-city': [-1, 25120, 25125, 25126, 25129, 25159],
  county: [25455, 25502, 25524, 25500, -1, -2],
};

/** Preset comparisons for a type whose metrics all exist in the dataset. */
export function scatterPresets(dataset: Dataset): ScatterPreset[] {
  const has = (id: number | undefined) =>
    id == null || (dataset.metric(id) != null && dataset.hasValues(id));
  return PRESETS[dataset.type.id].filter(
    (p) =>
      has(p.x) &&
      has(p.y) &&
      has(p.r) &&
      has(typeof p.c === 'number' ? p.c : undefined)
  );
}

/** URL state that opens a preset in the overlay (scatter) view. */
export function presetSearch(
  type: EntityType,
  preset: ScatterPreset
): CompareSearch {
  const m = [preset.x, preset.y];
  if (preset.r != null && !m.includes(preset.r)) m.push(preset.r);
  return {
    type,
    view: 'scatter',
    m,
    x: preset.x,
    y: preset.y,
    r: preset.r,
    c: preset.c,
    log: preset.log,
  };
}

/**
 * Well-covered metrics to suggest as one-click starting points: the curated
 * list first, then the best-covered remaining metrics, skipping labels that
 * repeat (e.g. the same "Land Area" in two units).
 */
export function popularMetrics(
  dataset: Dataset,
  limit = 8,
  exclude: readonly number[] = []
): Metric[] {
  const skip = new Set(exclude);
  const out: Metric[] = [];
  const seenLabels = new Set<string>();
  const push = (m: Metric | undefined) => {
    if (m == null || out.length >= limit) return;
    if (skip.has(m.id) || m.kind !== 'num' || m.meta === true) return;
    if (!dataset.hasValues(m.id)) return;
    const label = m.label.toLowerCase();
    if (seenLabels.has(label)) return;
    seenLabels.add(label);
    out.push(m);
  };
  for (const id of POPULAR[dataset.type.id]) push(dataset.metric(id));
  if (out.length < limit) {
    const byCoverage = dataset
      .numericMetrics(Math.ceil(dataset.entities.length * 0.3))
      .filter((m) => m.base !== true)
      .sort((a, b) => b.n - a.n);
    for (const m of byCoverage) push(m);
  }
  return out;
}

/** Human name for the entity grouping of a type (used for colour legends). */
export function groupLabel(type: EntityType): string {
  if (type === 'country') return 'Continent';
  if (type === 'world-city') return 'Country';
  return 'Region';
}
