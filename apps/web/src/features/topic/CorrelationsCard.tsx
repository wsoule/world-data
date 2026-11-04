import { Link } from '@tanstack/react-router';
import { strength } from '@world-data/stats';
import { ArrowDownRight, ArrowUpRight, ScatterChart } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';

import {
  type CorrelationHit,
  type CorrelationResult,
  findCorrelations,
} from './correlations';
import { placeNoun } from './model';
import { EmptyState } from '~/components/feedback';
import { Card, cx } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import {
  isRankColumn,
  rankOrder,
  rankOrderNote,
  readsBackwards,
} from '~/data/rankOrder';
import type { Metric } from '~/data/types';
import { formatInt } from '~/lib/format';
import { chartColors, useTheme } from '~/lib/theme';

/** True for rank columns (list positions), in either order. */
function isRank(metric: Metric | undefined): boolean {
  return metric != null && isRankColumn(metric);
}

/** True when the metric's raw number runs against its standing: a best-first rank. */
function backwards(metric: Metric | undefined): boolean {
  return metric != null && readsBackwards(metric);
}

/** The card's title, also shown by its stand-in while the card loads. */
export const correlationsTitle = (
  focus: Pick<Metric, 'label'>,
  yearLabel: string | null
) =>
  `What correlates with ${focus.label}${yearLabel != null ? ` (${yearLabel})` : ''}?`;

/**
 * "What correlates with this?": the focus metric (at the selected year) against every other
 * numeric metric of the dataset that is not part of this topic. Shows the six strongest
 * relationships each way with a strength bar and a link that opens the pair in the overlay.
 * Rank columns are read by standing, a better rank counting as higher, as the compare
 * Correlations view reads them: a best-first rank (1 = best) is correlated by its flipped number,
 * so a list where richer places rank better lands under "Higher together" for income with a
 * positive r; a worst-first rank (1 = worst, "Worst States to Live In") already grows as places
 * get better, so its raw number is used. A flipped hit's tooltip gives its r on the rank numbers
 * as listed.
 */
export function CorrelationsCard({
  dataset,
  focus,
  values,
  yearLabel,
  exclude,
}: {
  dataset: Dataset;
  focus: Metric;
  /** Focus values aligned to entities (NaN = missing) */
  values: Float64Array;
  yearLabel: string | null;
  /** Metric ids to leave out (this topic's own metrics) */
  exclude: readonly number[];
}) {
  const result = useMemo<CorrelationResult>(() => {
    const skip = new Set(exclude);
    const candidates = dataset.metrics.filter(
      (m) =>
        m.kind === 'num' &&
        m.meta !== true &&
        !skip.has(m.id) &&
        dataset.hasValues(m.id)
    );
    const focusBackwards = backwards(focus);
    return findCorrelations(
      values,
      candidates,
      (id) => dataset.numeric(id),
      6,
      (id) => dataset.metricFullLabel(id).toLowerCase(),
      // A best-first rank paired with a metric read the other way: its r is negated.
      (id) => backwards(dataset.metric(id)) !== focusBackwards
    );
  }, [dataset, values, exclude, focus]);

  const nounMany = placeNoun(dataset.type.id);
  const nounOne = placeNoun(dataset.type.id, 1);
  const title = correlationsTitle(focus, yearLabel);
  const focusHigher = isRank(focus)
    ? `rank better on ${focus.label}`
    : `have a higher ${focus.label}`;
  const hasRankHit = [...result.positive, ...result.negative].some((h) =>
    isRank(dataset.metric(h.id))
  );

  if (result.coverage < result.minOverlap) {
    return (
      <Card title={title}>
        <EmptyState title="Not enough places to compare">
          Correlations need at least {result.minOverlap} {nounMany} with data;
          this metric covers {formatInt(result.coverage)}.
        </EmptyState>
      </Card>
    );
  }

  const none = result.positive.length === 0 && result.negative.length === 0;
  return (
    <Card
      title={title}
      subtitle={
        <>
          Pearson r against {formatInt(result.tested)} other {nounOne} metrics
          sharing at least {formatInt(result.minOverlap)} {nounMany}
          {result.duplicates > 0
            ? `, ${formatInt(result.duplicates)} near-identical series hidden`
            : ''}
          .
          {isRank(focus) || hasRankHit
            ? ' Ranks are read by standing: a better rank counts as higher, whether rank 1 is the best place on a list or the worst.'
            : ''}{' '}
          Correlation is not causation.
        </>
      }
    >
      {none ? (
        <EmptyState title="No metric overlaps enough">
          No other {nounOne} metric shares enough {nounMany} with this one to
          measure a relationship.
        </EmptyState>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <HitList
            title="Higher together"
            hint={`Places that ${focusHigher} tend to score higher on these${hasRankHit ? ' (or rank better)' : ''}`}
            icon={<ArrowUpRight className="size-4" aria-hidden />}
            hits={result.positive}
            together
            dataset={dataset}
            focus={focus}
          />
          <HitList
            title="Opposite directions"
            hint={`Places that ${focusHigher} tend to score lower on these${hasRankHit ? ' (or rank worse)' : ''}`}
            icon={<ArrowDownRight className="size-4" aria-hidden />}
            hits={result.negative}
            together={false}
            dataset={dataset}
            focus={focus}
          />
        </div>
      )}
    </Card>
  );
}

function HitList({
  title,
  hint,
  icon,
  hits,
  together,
  dataset,
  focus,
}: {
  title: string;
  hint: string;
  icon: ReactNode;
  hits: readonly CorrelationHit[];
  /** The "Higher together" list (accent bars); otherwise "Opposite directions" */
  together: boolean;
  dataset: Dataset;
  focus: Metric;
}) {
  const colors = chartColors(useTheme());
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      <p className="text-muted mb-2 text-xs">{hint}</p>
      {hits.length === 0 ? (
        <p className="text-muted border-app rounded-lg border border-dashed p-4 text-center text-sm">
          Nothing notable in this direction.
        </p>
      ) : (
        <ol className="space-y-1">
          {hits.map((h) => {
            const m = dataset.metric(h.id);
            if (m == null) return null;
            const ctx = dataset.metricContext(h.id);
            const s = strength(h.r);
            const positive = h.r > 0;
            const order = rankOrder(m);
            const pText =
              h.p < 0.001
                ? 'p < 0.001'
                : `p = ${h.p.toFixed(3)}${h.p >= 0.05 ? ' (not significant)' : ''}`;
            return (
              <li
                key={h.id}
                className="hover:bg-surface-2 -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  {m.topics[0] != null ? (
                    <Link
                      to="/topics/$type/$slug"
                      params={{ type: dataset.type.id, slug: m.topics[0] }}
                      search={{ m: m.id }}
                      className="block truncate text-sm font-medium hover:underline"
                      title={dataset.metricFullLabel(h.id)}
                    >
                      {m.label}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm font-medium">
                      {m.label}
                    </span>
                  )}
                  {ctx != null &&
                  ctx.toLowerCase() !== m.label.toLowerCase() ? (
                    <span className="text-muted block truncate text-xs">
                      {ctx}
                    </span>
                  ) : null}
                  {order != null ? (
                    <span
                      className="text-muted block text-xs"
                      title={`A rank: ${rankOrderNote(order)}. Read by standing here, so a better rank counts as higher.`}
                    >
                      A rank: {rankOrderNote(order)}
                    </span>
                  ) : null}
                  <div className="mt-1 flex items-center gap-2">
                    <div
                      className="bg-surface-2 h-1.5 w-24 shrink-0 overflow-hidden rounded-full sm:w-32"
                      role="img"
                      aria-label={`${s} ${positive ? 'positive' : 'negative'} correlation`}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round(Math.abs(h.r) * 100)}%`,
                          background: together
                            ? colors.accent
                            : colors.highlight,
                        }}
                      />
                    </div>
                    <span className="text-muted text-xs whitespace-nowrap">
                      <span
                        className={cx(
                          'tabular text-app font-semibold',
                          h.p >= 0.05 && 'opacity-60'
                        )}
                        title={
                          h.flipped
                            ? `${pText} · ranks read by standing (a better rank counts as higher); on the rank numbers as listed, r = ${h.r > 0 ? '−' : '+'}${Math.abs(h.r).toFixed(2)}`
                            : pText
                        }
                      >
                        r = {h.r > 0 ? '+' : '−'}
                        {Math.abs(h.r).toFixed(2)}
                      </span>{' '}
                      · {s} · n = {formatInt(h.n)}
                    </span>
                  </div>
                </div>
                <Link
                  to="/compare"
                  search={{
                    type: dataset.type.id,
                    view: 'scatter',
                    m: [focus.id, h.id],
                    x: h.id,
                    y: focus.id,
                  }}
                  className="border-app text-muted hover:text-app hover:bg-surface inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium"
                  aria-label={`Plot ${focus.label} against ${m.label}`}
                >
                  <ScatterChart className="size-3.5" aria-hidden />
                  Plot
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
