import { Link } from '@tanstack/react-router';
import type { Normalization } from '@world-data/stats';
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpWideNarrow,
  Download,
  RotateCcw,
} from 'lucide-react';
import { useId, useState } from 'react';

import { directionHint } from '../polarity';
import { type CompareViewProps, cycleDirection } from '../state';
import { BundleMenu } from './BundlePicker';
import { PlaceLink } from './PlaceLink';
import { DEFAULT_COVERAGE, type RankingModel } from './useRanking';
import { midSentence } from './words';
import { Button, Card, cx } from '~/components/ui';
import type { Metric } from '~/data/types';
import { formatValue, plural } from '~/lib/format';

const NORMS: { value: Normalization; label: string; hint: string }[] = [
  {
    value: 'percentile',
    label: 'Percentile (default)',
    hint: 'Where a place sits among all places, 0–100. Robust to outliers.',
  },
  {
    value: 'zscore',
    label: 'Z-score',
    hint: 'Standard deviations from the average. Rewards outliers; scores are z-values, not 0–100.',
  },
  {
    value: 'minmax',
    label: 'Min–max',
    hint: 'Linear 0–100 between the worst and best value. Keeps gaps, so one extreme squeezes everyone else.',
  },
];

const COLLAPSED_ROWS = 8;

/** Weights, directions, normalisation and coverage for the combined ranking. */
export function RankingControls({
  props,
  model,
  onExport,
}: {
  props: CompareViewProps;
  model: RankingModel;
  onExport: () => void;
}) {
  const { dataset, search, update, weight } = props;
  const { metrics, base, stats, entityIdx, method, minCoverage } = model;
  const [expanded, setExpanded] = useState(false);
  const normId = useId();
  const covId = useId();
  const placeWord = midSentence(dataset.type.label);
  const singular = midSentence(dataset.type.singular);
  const hasCustomWeights =
    search.w != null && metrics.some((m) => weight(m.id) !== 1);
  const hint = NORMS.find((n) => n.value === method)?.hint ?? '';
  const visible =
    expanded || metrics.length <= COLLAPSED_ROWS + 2
      ? metrics
      : metrics.slice(0, COLLAPSED_ROWS);

  // Weight sliders replace the history entry: dragging should not leave dozens of Back steps.
  const setWeight = (id: number, v: number) =>
    update(
      (s) => {
        const w = { ...(s.w ?? {}) };
        if (v === 1) delete w[String(id)];
        else w[String(id)] = v;
        return { w: Object.keys(w).length > 0 ? w : undefined };
      },
      { replace: true }
    );

  // One click moves a metric to its next direction (see cycleDirection).
  const flip = (m: Metric) => update((s) => ({ d: cycleDirection(s.d, m) }));

  return (
    <Card
      title="Weights & directions"
      subtitle={`${plural(base.active, 'metric')} in the score · ranking ${plural(base.order.length, singular, placeWord)}`}
      actions={
        <>
          <BundleMenu dataset={dataset} update={update} />
          <Button
            size="sm"
            onClick={() => update({ w: undefined })}
            disabled={!hasCustomWeights}
            title="Set every weight back to 1"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset weights
          </Button>
          <Button
            size="sm"
            onClick={onExport}
            disabled={base.order.length === 0}
          >
            <Download className="size-3.5" aria-hidden />
            Export CSV
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={normId} className="text-sm font-medium">
            Normalisation
          </label>
          <div className="mt-1.5">
            <select
              id={normId}
              value={method}
              onChange={(e) => {
                const n = NORMS.find((x) => x.value === e.target.value);
                if (n != null)
                  update({
                    norm: n.value === 'percentile' ? undefined : n.value,
                  });
              }}
              className="border-app bg-surface w-full rounded-lg border px-2 py-1.5 text-sm"
            >
              {NORMS.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-muted mt-1.5 text-xs">{hint}</p>
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={covId} className="text-sm font-medium">
              Minimum data coverage
            </label>
            <span className="tabular text-sm font-semibold">
              {Math.round(minCoverage * 100)}%
            </span>
          </div>
          <input
            id={covId}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={minCoverage}
            aria-valuetext={`${Math.round(minCoverage * 100)}% of total weight`}
            onChange={(e) => {
              const v = Number(e.target.value);
              update(
                { cov: v === DEFAULT_COVERAGE ? undefined : v },
                { replace: true }
              );
            }}
            className="accent-accent-600 dark:accent-accent-400 mt-2 w-full"
          />
          <p className="text-muted mt-1 text-xs">
            A {singular} needs data for {Math.round(minCoverage * 100)}% of the
            total weight to be ranked.{' '}
            <span
              className={cx(base.excluded > 0 && 'text-app font-medium')}
              title={
                base.noData > 0
                  ? `${plural(base.noData, singular, placeWord)} have no data for any of these metrics`
                  : undefined
              }
            >
              {base.excluded > 0
                ? `${plural(base.excluded, singular, placeWord)} excluded for missing data.`
                : `No ${placeWord} excluded.`}
            </span>
          </p>
        </div>
      </div>

      <div className="border-app mt-4 border-t pt-3">
        <div
          className="text-muted hidden grid-cols-[2rem_minmax(0,1fr)_9.5rem_12rem] gap-x-3 px-1 pb-1 text-[11px] font-medium tracking-wide uppercase sm:grid"
          aria-hidden
        >
          <span />
          <span>Metric</span>
          <span>Weight</span>
          <span>#1 on this metric</span>
        </div>
        <ul>
          {visible.map((m) => {
            const k = metrics.indexOf(m);
            const w = weight(m.id);
            const hint = directionHint(search, m);
            const s = stats[k];
            const bestIdx = s.best >= 0 ? entityIdx[s.best] : null;
            const ctx = dataset.metricContext(m.id);
            const topic = m.topics[0];
            const bestValue =
              s.best >= 0 ? model.inputs[k].values[s.best] : Number.NaN;
            return (
              <li
                key={m.id}
                className={cx(
                  'grid grid-cols-[2rem_minmax(0,1fr)] border-app items-center gap-x-3 gap-y-1.5 border-t px-1 py-2.5 first:border-t-0 sm:grid-cols-[2rem_minmax(0,1fr)_9.5rem_12rem]',
                  w === 0 && 'opacity-60'
                )}
              >
                <button
                  type="button"
                  onClick={() => flip(m)}
                  aria-label={`${m.label}: ${hint.label.toLowerCase()}, ${hint.action}`}
                  title={`${hint.label} (${hint.action})`}
                  className="border-app hover:bg-surface-2 focus-visible:outline-accent-500 grid size-8 place-items-center rounded-lg border focus-visible:outline-2"
                >
                  {hint.side === 0 ? (
                    <ArrowUpDown className="text-muted size-4" aria-hidden />
                  ) : hint.side === 1 ? (
                    <ArrowUpWideNarrow
                      className="text-good size-4"
                      aria-hidden
                    />
                  ) : (
                    <ArrowDownWideNarrow
                      className="text-bad size-4"
                      aria-hidden
                    />
                  )}
                </button>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium" title={m.label}>
                    {topic != null ? (
                      <Link
                        to="/topics/$type/$slug"
                        params={{ type: dataset.type.id, slug: topic }}
                        search={{ m: m.id }}
                        className="hover:underline"
                      >
                        {m.label}
                      </Link>
                    ) : (
                      m.label
                    )}
                  </div>
                  <div
                    className="text-muted truncate text-xs"
                    title={ctx ?? undefined}
                  >
                    {hint.side === 0
                      ? 'No better side · higher values score higher'
                      : hint.label}
                    {ctx != null ? ` · ${ctx}` : ''}
                    {m.year != null ? ` · ${m.year}` : ''}
                  </div>
                </div>
                <div className="col-start-2 flex items-center gap-2 sm:col-start-auto">
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={0.5}
                    value={w}
                    onChange={(e) => setWeight(m.id, Number(e.target.value))}
                    aria-label={`Weight for ${m.label}`}
                    aria-valuetext={w === 0 ? 'Excluded' : `${w} times`}
                    className="accent-accent-600 dark:accent-accent-400 min-w-0 flex-1"
                  />
                  <span
                    className={cx(
                      'tabular w-9 shrink-0 text-right text-xs font-semibold',
                      w === 0 && 'text-muted'
                    )}
                  >
                    {w === 0 ? 'Off' : `×${w}`}
                  </span>
                </div>
                <div className="col-start-2 min-w-0 text-sm sm:col-start-auto">
                  {bestIdx != null ? (
                    <div className="flex min-w-0 items-center gap-2 sm:block">
                      <PlaceLink
                        dataset={dataset}
                        index={bestIdx}
                        className="max-w-full font-medium"
                        flagSize={14}
                      />
                      <div className="text-muted tabular truncate text-xs sm:pl-5">
                        {formatValue(m, bestValue, { compact: true })}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted text-xs">No data</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {visible.length < metrics.length || expanded ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-accent-700 dark:text-accent-300 mt-2 text-sm font-medium hover:underline"
          >
            {expanded
              ? 'Show fewer metrics'
              : `Show all ${metrics.length} metrics`}
          </button>
        ) : null}
      </div>
    </Card>
  );
}
