import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';

import {
  biggestChanges,
  type Change,
  comparedYears,
  directionOf,
  numericColumn,
  placeNoun,
} from './model';
import { Flag } from '~/components/Flag';
import { Card, cx } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import type { Metric, TopicFile } from '~/data/types';
import { formatInt, formatValue } from '~/lib/format';

/** Size of a change in the metric's own units ("+$1,204", "3 places" for ranks). */
function formatDelta(metric: Metric, delta: number): string {
  const size = Math.abs(delta);
  if (metric.fmt === 'ranking')
    return `${formatInt(size)} ${size === 1 ? 'place' : 'places'}`;
  return `${delta > 0 ? '+' : '−'}${formatValue(metric, size, { compact: true })}`;
}

/**
 * Biggest movers on the focus metric between the previous year and the selected one: the largest
 * improvements and declines (or increases and decreases for a metric without a better
 * direction). Clicking a place highlights it everywhere on the page.
 */
export function MoversCard({
  topic,
  dataset,
  focus,
  years,
  year,
  selected,
  onSelect,
}: {
  topic: TopicFile;
  dataset: Dataset;
  focus: Metric;
  years: readonly number[];
  year: number | null;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const movers = useMemo(() => {
    const pair = comparedYears(years, year);
    if (pair == null) return null;
    const n = dataset.entities.length;
    const result = biggestChanges(
      numericColumn(topic, focus.id, pair[0], n),
      numericColumn(topic, focus.id, pair[1], n),
      directionOf(focus)
    );
    return { pair, result };
  }, [topic, dataset, focus, years, year]);
  if (movers == null) return null;
  const { pair, result } = movers;

  const neutral = focus.pol === 0;
  const rank = focus.fmt === 'ranking';
  return (
    <Card
      title={`Biggest changes · ${pair[0]} → ${pair[1]}`}
      subtitle={`${formatInt(result.compared)} ${placeNoun(dataset.type.id, result.compared)} ${result.compared === 1 ? 'has' : 'have'} a value in both years.`}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <MoverList
          title={
            neutral ? 'Largest increases' : rank ? 'Climbed' : 'Improved most'
          }
          icon={<ArrowUpRight className="size-4" aria-hidden />}
          tone="good"
          neutral={neutral}
          changes={result.gains}
          dataset={dataset}
          focus={focus}
          selected={selected}
          onSelect={onSelect}
        />
        <MoverList
          title={
            neutral ? 'Largest decreases' : rank ? 'Fell' : 'Declined most'
          }
          icon={<ArrowDownRight className="size-4" aria-hidden />}
          tone="bad"
          neutral={neutral}
          changes={result.losses}
          dataset={dataset}
          focus={focus}
          selected={selected}
          onSelect={onSelect}
        />
      </div>
    </Card>
  );
}

function MoverList({
  title,
  icon,
  tone,
  neutral,
  changes,
  dataset,
  focus,
  selected,
  onSelect,
}: {
  title: string;
  icon: ReactNode;
  tone: 'good' | 'bad';
  neutral: boolean;
  changes: readonly Change[];
  dataset: Dataset;
  focus: Metric;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="min-w-0">
      <h3
        className={cx(
          'mb-2 flex items-center gap-1.5 text-sm font-semibold',
          !neutral && (tone === 'good' ? 'text-good' : 'text-bad')
        )}
      >
        {icon}
        {title}
      </h3>
      {changes.length === 0 ? (
        <p className="text-muted text-sm">No places moved this way.</p>
      ) : (
        <ul className="space-y-0.5">
          {changes.map((c) => {
            const e = dataset.entities[c.index];
            return (
              <li key={c.index}>
                <button
                  type="button"
                  onClick={() => onSelect(c.index)}
                  aria-pressed={selected === c.index}
                  className={cx(
                    'hover:bg-surface-2 -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
                    selected === c.index && 'bg-surface-2'
                  )}
                >
                  <Flag entity={e} type={dataset.type.id} size={18} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="text-muted tabular block truncate text-xs">
                      {formatValue(focus, c.from)} → {formatValue(focus, c.to)}
                    </span>
                  </span>
                  <span
                    className={cx(
                      'tabular shrink-0 text-xs font-semibold',
                      neutral
                        ? 'text-app'
                        : tone === 'good'
                          ? 'text-good'
                          : 'text-bad'
                    )}
                  >
                    {formatDelta(focus, c.delta)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
