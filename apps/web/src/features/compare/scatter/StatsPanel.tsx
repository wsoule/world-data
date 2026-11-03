import { Link } from '@tanstack/react-router';
import { describeCorrelation, strength } from '@world-data/stats';
import { Info, Pin, PinOff, TrendingDown, TrendingUp } from 'lucide-react';

import {
  type AxisMeaning,
  formatP,
  formatR,
  goodIsHigh,
  quadrants,
  relationshipSentence,
  residualLeaders,
  type ScatterAnalysis,
  verdict,
} from './analysis';
import { Flag } from '~/components/Flag';
import { InfoTip } from '~/components/InfoTip';
import { Badge, Card, cx } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import type { Metric } from '~/data/types';
import { formatValue, plural as pluralize } from '~/lib/format';
import type { GlossaryId } from '~/lib/glossary';

export interface StatsPanelProps {
  dataset: Dataset;
  analysis: ScatterAnalysis;
  xMetric: Metric;
  yMetric: Metric;
  x: AxisMeaning;
  y: AxisMeaning;
  flipX: boolean;
  flipY: boolean;
  highlight: ReadonlySet<string>;
  onToggle: (entityId: string) => void;
}

/** "US States" → "States", "World Cities" → "Cities". */
export function pluralNoun(dataset: Dataset): string {
  return dataset.type.label.replace(/^(US|World) /, '');
}

const STRENGTH_TONE = {
  none: 'neutral',
  weak: 'neutral',
  moderate: 'accent',
  strong: 'accent',
  'very strong': 'accent',
} as const;

/** Headline reading of the relationship plus the numbers behind it. */
export function InsightCard({
  dataset,
  analysis,
  x,
  y,
}: Pick<StatsPanelProps, 'dataset' | 'analysis' | 'x' | 'y'>) {
  const noun = pluralNoun(dataset);
  const c = analysis.pearson;
  const parts = relationshipSentence(c, x, y, noun);
  const v = verdict(c, x, y);
  const s = strength(c.r);
  const r2 = analysis.regression.r2;
  const logged = analysis.logX || analysis.logY;
  const logNote = logged
    ? `Pearson r, R² and the trend line use the log of ${[
        analysis.logX ? x.label : null,
        analysis.logY ? y.label : null,
      ]
        .filter((l) => l != null)
        .join(
          ' and '
        )}; on the raw values r = ${formatR(analysis.rawPearson.r)}.`
    : null;
  // A negative r can still mean "better goes with better" when one metric is
  // lower-is-better (e.g. a rank); say so to avoid a contradictory reading.
  const flipped = [x, y].filter((a) => !a.neutral && !goodIsHigh(a));
  const negative = c.r < 0;
  const signContradicts = v != null && negative === (v === 'together');
  const signNote =
    signContradicts && flipped.length > 0
      ? `It reads as ${negative ? 'negative' : 'positive'} only because lower is better for ${flipped.map((a) => a.label).join(' and ')}.`
      : null;
  return (
    <Card title="What this shows">
      <p className="text-base leading-relaxed">
        {parts.map((p, i) =>
          p.strong === true ? (
            <strong key={i} className="font-semibold">
              {p.text}
            </strong>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
      </p>
      {v != null ? (
        <p
          className={cx(
            'mt-2 inline-flex items-center gap-1.5 text-sm font-medium',
            v === 'together' ? 'text-good' : 'text-bad'
          )}
        >
          {v === 'together' ? (
            <TrendingUp className="size-4" aria-hidden />
          ) : (
            <TrendingDown className="size-4" aria-hidden />
          )}
          {v === 'together'
            ? 'Doing well on one tends to go with doing well on the other.'
            : 'A trade-off: doing well on one tends to go with doing worse on the other.'}
        </p>
      ) : null}
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCell
          label="Pearson r"
          term="pearson"
          value={formatR(c.r)}
          hint={<Badge tone={STRENGTH_TONE[s]}>{s}</Badge>}
          title="Linear correlation from −1 to 1"
        />
        <StatCell
          label="Spearman ρ"
          term="spearman"
          value={formatR(analysis.spearman.r)}
          hint="rank-based"
          title="Correlation of the rank orders; robust to outliers and skew"
        />
        <StatCell
          label="R²"
          term="r-squared"
          value={Number.isFinite(r2) ? r2.toFixed(2) : '—'}
          hint={
            Number.isFinite(r2)
              ? `${Math.round(r2 * 100)}% of variation`
              : undefined
          }
          title="Share of the variation in the vertical metric explained by the trend line"
        />
        <StatCell
          label="p-value"
          term="p-value"
          value={formatP(c.p)}
          hint={
            Number.isFinite(c.p)
              ? c.p < 0.05
                ? 'significant'
                : 'not significant'
              : undefined
          }
          title="Chance of a correlation at least this strong if there were no real relationship"
        />
        <StatCell
          label="Places"
          value={String(c.n)}
          hint={
            analysis.missing > 0
              ? `${analysis.missing} lack data`
              : 'all have data'
          }
          title={`${dataset.type.label} with values for both metrics`}
        />
      </dl>
      <p className="text-muted mt-3 text-xs">
        {describeCorrelation(c)} between the{' '}
        {logged ? 'plotted (log-scale) values' : 'raw values'}.
        {signNote != null ? ` ${signNote}` : ''}
        {logNote != null ? ` ${logNote}` : ''}
      </p>
      <p className="text-muted border-app mt-3 flex gap-2 border-t pt-3 text-xs leading-relaxed">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Correlation is not causation. Both metrics may be driven by something
          else (wealth, urbanisation, age, region), and each comes from a
          different source and year.
        </span>
      </p>
    </Card>
  );
}

function StatCell({
  label,
  value,
  hint,
  title,
  term,
}: {
  label: string;
  /** Glossary entry explained by an ⓘ next to the label */
  term?: GlossaryId;
  value: string;
  hint?: React.ReactNode;
  title: string;
}) {
  return (
    <div className="bg-surface-2 rounded-lg px-3 py-2" title={title}>
      <dt className="text-muted flex items-center gap-1 text-xs">
        {label}
        {term != null ? <InfoTip term={term} /> : null}
      </dt>
      <dd className="tabular text-lg leading-tight font-semibold">{value}</dd>
      {hint != null ? (
        <dd className="text-muted mt-0.5 text-xs">{hint}</dd>
      ) : null}
    </div>
  );
}

/** "Better X" / "Worse X" (or "High"/"Low" for metrics with no better side). */
function sideLabel(a: AxisMeaning, high: boolean): string {
  if (a.neutral) return `${high ? 'High' : 'Low'} ${a.label}`;
  return `${high === goodIsHigh(a) ? 'Better' : 'Worse'} ${a.label}`;
}

/** Median split into four groups, laid out the same way as the chart. */
export function QuadrantCard({
  dataset,
  analysis,
  xMetric,
  yMetric,
  x,
  y,
  flipX,
  flipY,
}: StatsPanelProps) {
  const { cells, onMedian } = quadrants(analysis, x, y);
  const layout: { xHigh: boolean; yHigh: boolean }[] = [];
  for (const top of [true, false])
    for (const right of [false, true])
      layout.push({ xHigh: right !== flipX, yHigh: top !== flipY });
  // Both neutral: the "high on both" cell is marked, in a neutral colour. One neutral: no cell
  // is best (quadrants() marks none), and members are ordered by the directional metric.
  const bothNeutral = x.neutral && y.neutral;
  const mixed = x.neutral !== y.neutral;
  const both = bothNeutral ? 'High on both' : 'Best on both';
  const directional = x.neutral ? y : x;
  return (
    <Card
      title="Four groups, split at the medians"
      subtitle={`Median ${xMetric.label}: ${formatValue(xMetric, analysis.medianX)} · median ${yMetric.label}: ${formatValue(yMetric, analysis.medianY)}`}
    >
      <div className="grid grid-cols-2 gap-2">
        {layout.map(({ xHigh, yHigh }) => {
          const cell = cells.find(
            (c) => c.xHigh === xHigh && c.yHigh === yHigh
          );
          if (cell == null) return null;
          const shown = cell.members.slice(0, cell.best ? 3 : 2);
          return (
            <div
              key={`${xHigh}-${yHigh}`}
              className={cx(
                'min-w-0 rounded-lg border p-3',
                !cell.best
                  ? 'border-app bg-surface-2'
                  : bothNeutral
                    ? 'border-accent-300 bg-accent-50 dark:border-accent-800 dark:bg-accent-900/30'
                    : 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="tabular text-2xl font-semibold">
                  {cell.members.length}
                </span>
                {cell.best ? (
                  <Badge tone={bothNeutral ? 'accent' : 'good'}>{both}</Badge>
                ) : null}
              </div>
              <div className="text-muted mt-1 space-y-0.5 text-xs">
                <p className="truncate" title={sideLabel(y, yHigh)}>
                  {yHigh !== flipY ? '↑' : '↓'} {sideLabel(y, yHigh)}
                </p>
                <p className="truncate" title={sideLabel(x, xHigh)}>
                  {xHigh !== flipX ? '→' : '←'} {sideLabel(x, xHigh)}
                </p>
              </div>
              {shown.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {shown.map((pi) => {
                    const e = dataset.entities[analysis.points[pi].idx];
                    return (
                      <li
                        key={e.id}
                        className="flex min-w-0 items-center gap-1.5 text-xs"
                      >
                        <Flag entity={e} type={dataset.type.id} size={14} />
                        <Link
                          to="/places/$type/$slug"
                          params={{ type: dataset.type.id, slug: e.slug }}
                          className={cx(
                            'truncate hover:underline',
                            cell.best ? 'font-medium' : 'text-muted'
                          )}
                        >
                          {e.name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-muted mt-3 text-xs">
        {mixed
          ? `${x.neutral ? x.label : y.label} has no better or worse side, so no group is called best; each lists its best on ${directional.label} first.`
          : cells.find((c) => c.best) != null
            ? bothNeutral
              ? 'Each group lists its highest on both metrics first.'
              : 'Leaders are ordered by their combined percentile on both metrics.'
            : null}
        {onMedian > 0
          ? ` ${pluralize(onMedian, 'place')} sitting exactly on a median ${onMedian === 1 ? 'is' : 'are'} left out.`
          : ''}
      </p>
    </Card>
  );
}

/** Places furthest above and below the trend line, in direction-aware terms. */
export function PerformersCard({
  dataset,
  analysis,
  xMetric,
  yMetric,
  x,
  y,
  highlight,
  onToggle,
}: StatsPanelProps) {
  const { better, worse } = residualLeaders(analysis, y, 5);
  const heading = (good: boolean) => {
    if (y.isRank)
      return `Rank ${good ? 'better' : 'worse'} on ${y.label} than expected`;
    const high = good === goodIsHigh(y);
    return `${high ? 'Higher' : 'Lower'} ${y.label} than expected`;
  };
  const lists = [
    { key: 'better', good: true, rows: better },
    { key: 'worse', good: false, rows: worse },
  ];
  return (
    <Card
      title={
        y.neutral ? 'Above and below the trend' : 'Over- and under-performers'
      }
      subtitle={`Distance from the trend line: what ${xMetric.label} alone would predict`}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        {lists.map((list) => (
          <div key={list.key} className="min-w-0">
            <h3
              className={cx(
                'mb-2 flex items-center gap-1.5 text-xs font-semibold',
                y.neutral ? 'text-app' : list.good ? 'text-good' : 'text-bad'
              )}
            >
              {list.good === goodIsHigh(y) ? (
                <TrendingUp className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <TrendingDown className="size-3.5 shrink-0" aria-hidden />
              )}
              <span className="min-w-0">{heading(list.good)}</span>
            </h3>
            {list.rows.length === 0 ? (
              <p className="text-muted text-xs">Nobody stands out.</p>
            ) : (
              <ol className="space-y-1">
                {list.rows.map((row) => {
                  const p = analysis.points[row.point];
                  const e = dataset.entities[p.idx];
                  const pinned = highlight.has(e.id);
                  return (
                    <li
                      key={e.id}
                      className="hover:bg-surface-2 -mx-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm"
                    >
                      <Flag entity={e} type={dataset.type.id} size={16} />
                      <Link
                        to="/places/$type/$slug"
                        params={{ type: dataset.type.id, slug: e.slug }}
                        className="min-w-0 flex-1 truncate font-medium hover:underline"
                      >
                        {e.name}
                      </Link>
                      <span
                        className="tabular shrink-0 text-right text-xs"
                        title={`${xMetric.label}: ${formatValue(xMetric, p.x)}`}
                      >
                        {formatValue(yMetric, p.y, { compact: true })}
                        <span className="text-muted">
                          {' '}
                          vs{' '}
                          {formatValue(yMetric, row.predicted, {
                            compact: true,
                          })}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-pressed={pinned}
                        aria-label={
                          pinned
                            ? `Unhighlight ${e.name}`
                            : `Highlight ${e.name} on the chart`
                        }
                        title={
                          pinned ? 'Remove highlight' : 'Highlight on the chart'
                        }
                        onClick={() => onToggle(e.id)}
                        className={cx(
                          'shrink-0 rounded p-1',
                          pinned
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-muted hover:text-app'
                        )}
                      >
                        {pinned ? (
                          <PinOff className="size-3.5" />
                        ) : (
                          <Pin className="size-3.5" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ))}
      </div>
      <p className="text-muted mt-3 text-xs">
        Each row shows the actual value vs what the trend predicts from{' '}
        {x.label}. Large gaps point to something the trend doesn’t capture.
      </p>
    </Card>
  );
}
