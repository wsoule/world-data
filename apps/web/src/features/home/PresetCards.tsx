// "Start comparing" cards: ready-made workbench comparisons (combined ranking, overlay,
// correlations, map) from HOME_PRESETS, shown on the home page.

import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  ChartScatter,
  Grid3x3,
  Map as MapIcon,
  Trophy,
} from 'lucide-react';

import { HOME_PRESETS, type HomePreset } from './presets';
import { Badge, cx } from '~/components/ui';
import type { EntityType } from '~/data/types';

/** Grid of every home preset; the first card is featured and spans two columns. */
export function PresetCards() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {HOME_PRESETS.map((p, i) => (
        <PresetCard key={p.id} preset={p} featured={i === 0} />
      ))}
    </div>
  );
}

const TYPE_GROUP_LABEL: Record<EntityType, string> = {
  country: 'Countries',
  state: 'US states',
  city: 'US cities',
  'world-city': 'World cities',
  county: 'US counties',
};

/** Icon and label for each workbench view a home preset can open. */
const PRESET_VIEWS = {
  ranking: { icon: Trophy, label: 'Combined ranking' },
  scatter: { icon: ChartScatter, label: 'Overlay' },
  matrix: { icon: Grid3x3, label: 'Correlations' },
  map: { icon: MapIcon, label: 'Map' },
} as const;

function PresetCard({
  preset,
  featured,
}: {
  preset: HomePreset;
  featured: boolean;
}) {
  const view = preset.search.view;
  const ranking = view === 'ranking';
  // Overlays name their two axes; basket views number their metrics.
  const axes = view === 'scatter';
  const { icon: Icon, label } =
    view === 'ranking' || view === 'matrix' || view === 'map'
      ? PRESET_VIEWS[view]
      : PRESET_VIEWS.scatter;
  return (
    <Link
      to="/compare"
      search={preset.search}
      className={cx(
        'card group hover:border-accent-300 dark:hover:border-accent-700 flex flex-col p-5 transition-all hover:shadow-md',
        featured &&
          'from-accent-50 to-surface dark:from-accent-900/30 bg-gradient-to-br dark:to-transparent',
        (featured || preset.wide === true) && 'lg:col-span-2'
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cx(
            'grid size-9 place-items-center rounded-xl',
            ranking
              ? 'bg-accent-600 text-white'
              : 'bg-accent-50 text-accent-600 dark:bg-accent-900/40 dark:text-accent-300'
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="text-muted text-xs font-medium tracking-wide uppercase">
          {label}
        </span>
        <Badge className="ml-auto">
          {TYPE_GROUP_LABEL[preset.search.type]}
        </Badge>
      </div>
      <h3 className="mt-4 text-base font-semibold">{preset.title}</h3>
      <p className="text-muted mt-1 text-sm">{preset.question}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {preset.metrics.map((m, i) => (
          <span
            key={m}
            className="border-app bg-surface inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
          >
            {axes ? (
              <span className="text-muted font-mono text-[10px]">
                {i === 0 ? 'x' : 'y'}
              </span>
            ) : (
              <span className="text-muted tabular">{i + 1}</span>
            )}
            {m}
          </span>
        ))}
      </div>
      <div className="text-accent-600 dark:text-accent-300 mt-auto flex items-center gap-1 pt-5 text-sm font-medium">
        {preset.cta}
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
    </Link>
  );
}
