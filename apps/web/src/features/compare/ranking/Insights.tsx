import { Crown, Shuffle, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';

import type { CompareViewProps } from '../state';
import { percentileScale, percentileStops } from './colors';
import { formatScore, type MetricStanding } from './model';
import { PlaceLink } from './PlaceLink';
import type { RankingModel } from './useRanking';
import { midSentence } from './words';
import { Card } from '~/components/ui';
import { formatValue, ordinal } from '~/lib/format';
import { useTheme } from '~/lib/theme';

/** One metric line: label, place's value, rank and a percentile pill. */
function StandingRow({
  standing,
  idx,
  model,
}: {
  standing: MetricStanding;
  idx: number;
  model: RankingModel;
}) {
  const theme = useTheme();
  const scale = useMemo(() => percentileScale(theme), [theme]);
  const k = model.inputs.findIndex((i) => i.id === standing.id);
  const metric = model.metrics[k];
  const label = model.labels.get(standing.id) ?? metric.label;
  // A rank-formatted metric's value is itself a rank ("1st"), so only print the value otherwise.
  const value =
    metric.fmt === 'ranking'
      ? null
      : formatValue(metric, model.inputs[k].values[idx], { compact: true });
  return (
    <li className="flex items-start gap-2 py-1">
      <span
        className="tabular mt-0.5 inline-grid h-5 w-8 shrink-0 place-items-center rounded text-[10px] font-semibold"
        style={{
          background: scale(standing.pct),
          color: percentileStops(theme).text,
        }}
        title={`Percentile ${Math.round(standing.pct)}`}
      >
        {Math.round(standing.pct)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm leading-snug" title={label}>
          {label}
        </span>
        <span className="text-muted tabular block text-xs">
          {value != null ? `${value} · ` : ''}
          {ordinal(standing.rank)} of {standing.n}
        </span>
      </span>
    </li>
  );
}

/** "Why #1?": who leads, by how much, and on which metrics. */
export function WhyFirstCard({
  props,
  model,
}: {
  props: CompareViewProps;
  model: RankingModel;
}) {
  const { dataset } = props;
  const { insight, base, entityIdx, method, stats, inputs } = model;
  if (insight == null) return null;
  const leader = insight.leader;
  const runner = insight.runnerUp;
  const wins = stats.filter(
    (s, k) => inputs[k].weight > 0 && s.rank[leader] === 1
  ).length;
  // Active metrics the leader has no value for: missing data can be why a place leads.
  const missing = stats.flatMap((s, k) =>
    inputs[k].weight > 0 && Number.isNaN(s.pct[leader])
      ? [model.labels.get(s.id) ?? `#${s.id}`]
      : []
  );
  // Only call a metric "weakest" when it is actually below the strongest ones.
  const floor = Math.min(...insight.strongest.map((s) => s.pct));
  const weakest = insight.weakest.filter((s) => s.pct < floor);
  const lowest = Math.min(
    ...insight.strongest.map((s) => s.pct),
    ...weakest.map((s) => s.pct)
  );
  const marginText =
    runner == null
      ? `the only ${midSentence(dataset.type.singular)} with enough data`
      : insight.ties > 1
        ? `tied with ${insight.ties - 1} other${insight.ties > 2 ? 's' : ''}`
        : `leads by ${formatScore(insight.margin, method).replace(/^\+/, '')} ${method === 'zscore' ? 'z' : 'points'}`;
  return (
    <Card title="Why #1?" className="@container">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          <Crown className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <PlaceLink
            dataset={dataset}
            index={entityIdx[leader]}
            flagSize={20}
            className="max-w-full text-lg font-semibold"
          />
          <p className="text-muted mt-0.5 text-sm">
            Score{' '}
            <span className="text-app tabular font-semibold">
              {formatScore(base.composite.score[leader], method)}
            </span>{' '}
            · {marginText}
            {runner != null && insight.ties === 1 ? (
              <>
                {' over '}
                <PlaceLink
                  dataset={dataset}
                  index={entityIdx[runner]}
                  flagSize={12}
                  className="text-app max-w-[12rem] align-bottom"
                />
              </>
            ) : null}
          </p>
          <p className="text-muted mt-0.5 text-xs">
            #1 on {wins} of {base.active} metrics
            {missing.length > 0
              ? ` · ranked on ${base.active - missing.length} of ${base.active}`
              : ''}
          </p>
        </div>
      </div>
      {missing.length > 0 ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/25 dark:text-amber-200">
          No data for {missing.join(', ')}. Its score averages only the metrics
          it has; raise the minimum data coverage to require more.
        </p>
      ) : null}
      <div className="mt-4 grid gap-x-6 gap-y-3 @lg:grid-cols-2">
        <div>
          <h3 className="text-good flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
            <TrendingUp className="size-3.5" aria-hidden /> Strongest
          </h3>
          <ul className="mt-1">
            {insight.strongest.map((s) => (
              <StandingRow key={s.id} standing={s} idx={leader} model={model} />
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-bad flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
            <TrendingDown className="size-3.5" aria-hidden /> Weakest
          </h3>
          {weakest.length > 0 ? (
            <ul className="mt-1">
              {weakest.map((s) => (
                <StandingRow
                  key={s.id}
                  standing={s}
                  idx={leader}
                  model={model}
                />
              ))}
            </ul>
          ) : (
            <p className="text-muted mt-1.5 text-sm">
              No weak spot: at or above the {ordinal(Math.round(lowest))}{' '}
              percentile on every metric it has.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** "Biggest surprise": the place whose combined rank differs most from its typical metric rank. */
export function SurpriseCard({
  props,
  model,
}: {
  props: CompareViewProps;
  model: RankingModel;
}) {
  const { dataset } = props;
  const { surprise, stats, inputs, entityIdx } = model;
  const singular = midSentence(dataset.type.singular);

  // The place's best and worst active metrics, as evidence for the explanation.
  const extremes = useMemo(() => {
    if (surprise == null) return null;
    const standings: MetricStanding[] = [];
    stats.forEach((s, k) => {
      const p = s.pct[surprise.idx];
      if (inputs[k].weight > 0 && !Number.isNaN(p))
        standings.push({
          id: s.id,
          pct: p,
          rank: s.rank[surprise.idx],
          n: s.n,
        });
    });
    standings.sort((a, b) => b.pct - a.pct);
    return { best: standings[0], worst: standings[standings.length - 1] };
  }, [surprise, stats, inputs]);

  return (
    <Card title="Biggest surprise">
      {surprise == null || extremes == null ? (
        <p className="text-muted text-sm">
          No surprises: every {singular} ranks about where its individual
          metrics put it.
        </p>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <span className="bg-accent-50 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200 grid size-10 shrink-0 place-items-center rounded-xl">
              <Shuffle className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <PlaceLink
                dataset={dataset}
                index={entityIdx[surprise.idx]}
                flagSize={20}
                className="max-w-full text-lg font-semibold"
              />
              <p className="text-muted mt-0.5 text-sm">
                <span className="text-app font-semibold">
                  {ordinal(surprise.combinedRank)}
                </span>{' '}
                combined, but a typical{' '}
                <span className="text-app font-semibold">
                  {ordinal(Math.round(surprise.medianRank))}
                </span>{' '}
                metric by metric (median rank).
              </p>
            </div>
          </div>
          <p className="text-muted mt-3 text-sm">
            {surprise.delta > 0
              ? 'A few standout metrics lift it well above its usual position.'
              : 'A few weak metrics drag it well below its usual position.'}
          </p>
          <ul className="mt-2">
            {extremes.best != null ? (
              <StandingRow
                standing={extremes.best}
                idx={surprise.idx}
                model={model}
              />
            ) : null}
            {extremes.worst != null && extremes.worst !== extremes.best ? (
              <StandingRow
                standing={extremes.worst}
                idx={surprise.idx}
                model={model}
              />
            ) : null}
          </ul>
        </>
      )}
    </Card>
  );
}
