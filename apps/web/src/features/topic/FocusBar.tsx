import { Link } from '@tanstack/react-router';
import { BarChart3, Map as MapIcon, Trophy, X } from 'lucide-react';
import { useId } from 'react';

import { LATEST, placeNoun, tableLabels } from './model';
import type { AdjustControl } from './TopicPage';
import { AdjustPicker } from '~/components/AdjustPicker';
import { Flag } from '~/components/Flag';
import { InfoTip } from '~/components/InfoTip';
import { PolarityIcon } from '~/components/MetricPicker';
import { cx } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import { rankOrder, rankOrderNote } from '~/data/rankOrder';
import type { Metric, TopicTable } from '~/data/types';
import { formatInt, formatValue } from '~/lib/format';

/** At most this many focus metrics render as pills; more switch to a grouped dropdown. */
const PILL_LIMIT = 4;

/** Tooltip of the "Latest" year choice (the source's column without a year). */
const LATEST_TITLE =
  "The source's current figures, without a year; often covers more places";

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
  undated,
  coverage,
  selected,
  selectedRank,
  onFocus,
  onYear,
  onClearSelected,
  adjust,
}: {
  dataset: Dataset;
  tables: readonly TopicTable[];
  metrics: readonly Metric[];
  focus: Metric;
  /** Dated years of the focus metric, oldest first */
  years: readonly number[];
  /** Year shown, or null for the undated series */
  year: number | null;
  /** The focus metric has an undated series, offered as "Latest" */
  undated: boolean;
  coverage: number;
  selected: number | null;
  selectedRank: { rank: number; value: number } | null;
  onFocus: (id: number) => void;
  /** A year, or null for the undated series */
  onYear: (year: number | null) => void;
  onClearSelected: () => void;
  adjust: AdjustControl;
}) {
  const metricId = useId();
  const yearId = useId();
  // Year choices, oldest first; null is the undated series, listed last as "Latest".
  const choices: (number | null)[] =
    undated && years.length > 0 ? [...years, null] : [...years];
  const yearText = year != null ? ` in ${year}` : '';
  const type = dataset.type.id;
  const total = dataset.type.entities;
  const noun = placeNoun(dataset.type.id, total);
  const usePills =
    metrics.length > 1 &&
    metrics.length <= PILL_LIMIT &&
    metrics.reduce((s, m) => s + m.label.length, 0) <= 90;
  const labels = tableLabels(tables);
  const grouped = tables
    .map((table, index) => ({ table, label: labels[index], index }))
    .filter(({ table }) =>
      table.metrics.some((id) => metrics.some((m) => m.id === id))
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
                <InfoTip term="direction" />
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
                    ? grouped.map(({ table: t, label, index }) => (
                        // Source pages can repeat a table name, so the index keys it.
                        <optgroup key={index} label={label}>
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

          {choices.length > 1 ? (
            <div className="flex items-center gap-2">
              <label
                htmlFor={choices.length > 6 ? yearId : undefined}
                id={`${yearId}-label`}
                className="text-muted text-xs font-medium"
              >
                Year
              </label>
              {choices.length <= 6 ? (
                <div
                  role="radiogroup"
                  aria-labelledby={`${yearId}-label`}
                  className="border-app bg-surface-2 inline-flex flex-wrap rounded-lg border p-0.5"
                >
                  {choices.map((y) => (
                    <button
                      key={y ?? LATEST}
                      type="button"
                      role="radio"
                      aria-checked={y === year}
                      onClick={() => onYear(y)}
                      title={y == null ? LATEST_TITLE : undefined}
                      className={cx(pill(y === year), 'tabular px-2')}
                    >
                      {y ?? 'Latest'}
                    </button>
                  ))}
                </div>
              ) : (
                <select
                  id={yearId}
                  value={year == null ? LATEST : String(year)}
                  onChange={(e) =>
                    onYear(
                      e.target.value === LATEST ? null : Number(e.target.value)
                    )
                  }
                  className="border-app bg-surface tabular rounded-lg border px-2 py-1.5 text-sm font-medium"
                >
                  {[...choices].reverse().map((y) => (
                    <option
                      key={y ?? LATEST}
                      value={y == null ? LATEST : String(y)}
                    >
                      {y ?? 'Latest'}
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
            title={`${formatInt(coverage)} of ${formatInt(total)} ${noun} have a value for this metric${yearText}`}
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
            Open full map
          </Link>
        </div>
      </div>

      {adjust.options.length > 0 ? (
        <AdjustPicker
          options={adjust.options}
          value={adjust.value}
          onChange={adjust.set}
          note={adjust.note}
          className="border-app mt-2 border-t pt-2"
        />
      ) : null}

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
  const order = rankOrder(focus);
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
      {rank != null && order != null ? (
        // A rank column's value is the place's position on the list.
        <span className="text-muted">
          <span className="text-app tabular font-medium">
            {formatValue(focus, rank.value)}
          </span>{' '}
          of {formatInt(coverage)} · {rankOrderNote(order)}
        </span>
      ) : rank != null ? (
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
