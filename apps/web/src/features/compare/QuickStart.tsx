import { Link } from '@tanstack/react-router';
import { ArrowRight, ChartScatter, Plus } from 'lucide-react';

import { popularMetrics, presetSearch, scatterPresets } from './presets';
import { PolarityIcon } from '~/components/MetricPicker';
import { cx } from '~/components/ui';
import type { Dataset } from '~/data/dataset';

/** Cards that open a ready-made two-metric overlay for the current type. */
export function PresetCards({
  dataset,
  className,
}: {
  dataset: Dataset;
  className?: string;
}) {
  const presets = scatterPresets(dataset);
  if (presets.length === 0) return null;
  return (
    <ul className={cx('grid gap-3 sm:grid-cols-2', className)}>
      {presets.map((p) => {
        const xm = dataset.metric(p.x);
        const ym = dataset.metric(p.y);
        return (
          <li key={p.title} className="min-w-0">
            <Link
              to="/compare"
              search={presetSearch(dataset.type.id, p)}
              className="group border-app bg-surface hover:border-accent-400 focus-visible:outline-accent-500 flex h-full items-start gap-3 rounded-xl border p-3 transition-colors focus-visible:outline-2"
            >
              <span className="bg-accent-50 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200 grid size-9 shrink-0 place-items-center rounded-lg">
                <ChartScatter className="size-4.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-semibold">
                  {p.title}
                  <ArrowRight
                    className="text-muted size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </span>
                <span className="text-muted mt-0.5 block text-xs">
                  {p.description}
                </span>
                {xm != null && ym != null ? (
                  <span className="text-muted mt-1.5 block truncate text-[11px]">
                    {xm.label} × {ym.label}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** One-click chips that add a popular, well-covered metric to the basket. */
export function PopularMetricChips({
  dataset,
  onAdd,
  exclude,
  limit = 8,
}: {
  dataset: Dataset;
  onAdd: (id: number) => void;
  exclude?: readonly number[];
  limit?: number;
}) {
  const metrics = popularMetrics(dataset, limit, exclude);
  if (metrics.length === 0) return null;
  const total = dataset.entities.length;
  return (
    <ul className="flex flex-wrap gap-2">
      {metrics.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onAdd(m.id)}
            title={`${dataset.metricFullLabel(m.id)} · ${m.n} of ${total} have data`}
            className="border-app bg-surface hover:border-accent-400 hover:bg-accent-50 dark:hover:bg-accent-900/30 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors"
          >
            <Plus className="text-muted size-3.5" aria-hidden />
            {m.label}
            <PolarityIcon pol={m.pol} />
          </button>
        </li>
      ))}
    </ul>
  );
}
