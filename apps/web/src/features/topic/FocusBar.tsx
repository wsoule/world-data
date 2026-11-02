import { Link } from '@tanstack/react-router';
import { BarChart3, Map as MapIcon, Trophy, X } from 'lucide-react';
import { useId } from 'react';

import { placeNoun } from './model';
import { Flag } from '~/components/Flag';
import { PolarityIcon } from '~/components/MetricPicker';
import { cx } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import type { Metric, TopicTable } from '~/data/types';
import { formatInt, formatValue } from '~/lib/format';

/** At most this many focus metrics render as pills; more switch to a grouped dropdown. */
const PILL_LIMIT = 4;

const pill = (on: boolean) =>
  cx(
    'rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-colors',
    on ? 'bg-surface text-app shadow-sm' : 'text-muted hover:text-app'
  );

const actionClass =
  'border-app bg-surface hover:bg-surface-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap';

/**
 * The control strip for the metric every chart on the page shows: which metric, which year, and
 * shortcuts that open it in the compare workbench. Also shows the place picked on a chart or in
 * the table, with its value and rank.
 */
export function FocusBar({
  dataset,
  tables,
  metrics,
  focus,
  years,
  year,
  coverage,
  selected,
  selectedRank,
  onFocus,
  onYear,
  onClearSelected,
}: {
  dataset: Dataset;
  tables: readonly TopicTable[];
  metrics: readonly Metric[];
  focus: Metric;
  years: readonly number[];
  year: number | null;
  coverage: number;
  selected: number | null;
  selectedRank: { rank: number; value: number } | null;
  onFocus: (id: number) => void;
  onYear: (year: number) => void;
  onClearSelected: () => void;
}) {
  const metricId = useId();
  const yearId = useId();
  const type = dataset.type.id;
  const total = dataset.type.entities;
  const noun = placeNoun(dataset.type.id, total);
  const usePills =
    metrics.length > 1 &&
    metrics.length <= PILL_LIMIT &&
    metrics.reduce((s, m) => s + m.label.length, 0) <= 90;
  const grouped = tables.filter((t) =>
    t.metrics.some((id) => metrics.some((m) => m.id === id))
  );

  return (
    <section
      aria-label="Focus metric"
      className="card bg-surface/95 z-30 px-4 py-3 backdrop-blur md:sticky md:top-16"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label
              htmlFor={usePills ? undefined : metricId}
              className="text-muted text-xs font-medium"
              id={`${metricId}-label`}
            >
              Showing
            </label>
            {metrics.length <= 1 ? (
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {focus.label}
                <PolarityIcon pol={focus.pol} />
              </span>
            ) : usePills ? (
              <div
                role="radiogroup"
                aria-labelledby={`${metricId}-label`}
                className="border-app bg-surface-2 inline-flex flex-wrap rounded-lg border p-0.5"
              >
                {metrics.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={m.id === focus.id}
                    onClick={() => onFocus(m.id)}
                    className={pill(m.id === focus.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5">
                <select
                  id={metricId}
                  value={String(focus.id)}
                  onChange={(e) => onFocus(Number(e.target.value))}
                  className="border-app bg-surface max-w-[min(21rem,78vw)] min-w-0 rounded-lg border px-2 py-1.5 text-sm font-medium"
                >
                  {grouped.length > 1
                    ? grouped.map((t) => (
                        <optgroup key={t.name} label={t.name}>
                          {metrics
                            .filter((m) => t.metrics.includes(m.id))
                            .map((m) => (
                              <option key={m.id} value={String(m.id)}>
                                {m.label}
                              </option>
                            ))}
                        </optgroup>
                      ))
                    : metrics.map((m) => (
                        <option key={m.id} value={String(m.id)}>
                          {m.label}
                        </option>
                      ))}
                </select>
                <PolarityIcon pol={focus.pol} />
              </span>
            )}
          </div>

          {years.length > 1 ? (
            <div className="flex items-center gap-2">
              <label
                htmlFor={years.length > 6 ? yearId : undefined}
                id={`${yearId}-label`}
                className="text-muted text-xs font-medium"
              >
                Year
              </label>
              {years.length <= 6 ? (
                <div
                  role="radiogroup"
                  aria-labelledby={`${yearId}-label`}
                  className="border-app bg-surface-2 inline-flex rounded-lg border p-0.5"
                >
                  {years.map((y) => (
                    <button
                      key={y}
                      type="button"
                      role="radio"
                      aria-checked={y === year}
                      onClick={() => onYear(y)}
                      className={cx(pill(y === year), 'tabular px-2')}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              ) : (
                <select
                  id={yearId}
                  value={String(year ?? '')}
                  onChange={(e) => onYear(Number(e.target.value))}
                  className="border-app bg-surface tabular rounded-lg border px-2 py-1.5 text-sm font-medium"
                >
                  {[...years].reverse().map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : year != null ? (
            <span className="text-muted text-xs">
              Year <span className="text-app tabular font-medium">{year}</span>
            </span>
          ) : null}

          <span
            className="text-muted tabular text-xs"
            title={`${formatInt(coverage)} of ${formatInt(total)} ${noun} have a value for this metric${year != null ? ` in ${year}` : ''}`}
          >
            {formatInt(coverage)} of {formatInt(total)} {noun}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to="/compare"
            search={{ type, view: 'scatter', m: [focus.id], x: focus.id }}
            className={actionClass}
          >
            <BarChart3 className="size-3.5" aria-hidden />
            Compare this metric
          </Link>
          <Link
            to="/compare"
            search={{ type, view: 'ranking', m: [focus.id] }}
            className={actionClass}
          >
            <Trophy className="size-3.5" aria-hidden />
            Add to combined ranking
          </Link>
          <Link
            to="/compare"
            search={{ type, view: 'map', m: [focus.id], f: focus.id }}
            className={actionClass}
          >
            <MapIcon className="size-3.5" aria-hidden />
            Map in workbench
          </Link>
        </div>
      </div>

      {selected != null ? (
        <SelectedPlace
          dataset={dataset}
          index={selected}
          focus={focus}
          rank={selectedRank}
          coverage={coverage}
          onClear={onClearSelected}
        />
      ) : null}
    </section>
  );
}

function SelectedPlace({
  dataset,
  index,
  focus,
  rank,
  coverage,
  onClear,
}: {
  dataset: Dataset;
  index: number;
  focus: Metric;
  rank: { rank: number; value: number } | null;
  coverage: number;
  onClear: () => void;
}) {
  const e = dataset.entities[index];
  return (
    <div
      className="border-app mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-sm"
      aria-live="polite"
    >
      <Flag entity={e} type={dataset.type.id} size={20} />
      <Link
        to="/places/$type/$slug"
        params={{ type: dataset.type.id, slug: e.slug }}
        className="font-semibold hover:underline"
      >
        {e.name}
      </Link>
      {rank != null ? (
        <span className="text-muted">
          <span className="text-app tabular font-medium">
            {formatValue(focus, rank.value)}
          </span>{' '}
          · ranked{' '}
          <span className="text-app tabular font-medium">
            {formatInt(rank.rank)}
          </span>{' '}
          of {formatInt(coverage)}
        </span>
      ) : (
        <span className="text-muted">No data for this metric</span>
      )}
      <button
        type="button"
        onClick={onClear}
        className="text-muted hover:text-app hover:bg-surface-2 ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs"
        aria-label={`Clear selection of ${e.name}`}
      >
        <X className="size-3.5" aria-hidden />
        Clear
      </button>
    </div>
  );
}
