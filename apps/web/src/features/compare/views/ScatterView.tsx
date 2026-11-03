import { ChartScatter, X } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';

import { polarityFor } from '../polarity';
import { groupLabel } from '../presets';
import { PopularMetricChips, PresetCards } from '../QuickStart';
import {
  analyzeScatter,
  type AxisMeaning,
  outlierPoints,
  relationshipSentence,
} from '../scatter/analysis';
import { buildColorModel, type ColorModel } from '../scatter/colorModel';
import { DotStrip } from '../scatter/DotStrip';
import { ScatterChart } from '../scatter/ScatterChart';
import { ScatterControls } from '../scatter/ScatterControls';
import {
  InsightCard,
  PerformersCard,
  pluralNoun,
  QuadrantCard,
  Takeaway,
} from '../scatter/StatsPanel';
import type { CompareSearch, CompareViewProps } from '../state';
import { useMediaQuery } from '../useMediaQuery';
import { EmptyState } from '~/components/feedback';
import { InfoTip } from '~/components/InfoTip';
import { MetricPicker } from '~/components/MetricPicker';
import { Button, Card } from '~/components/ui';
import {
  isRankColumn,
  type RankOrder,
  rankOrder,
  rankOrderNote,
  readsBackwards,
} from '~/data/rankOrder';
import type { Metric } from '~/data/types';
import { formatValue, plural } from '~/lib/format';
import { chartColors, useTheme } from '~/lib/theme';

/**
 * "Overlay": plot two basket metrics against each other with optional size
 * and colour encodings, a trend line, and a plain-English explanation.
 */
export function ScatterView(props: CompareViewProps) {
  if (props.metrics.length === 0) return <ScatterEmpty {...props} />;
  if (props.metrics.length === 1) return <SingleMetric {...props} />;
  return <Overlay {...props} />;
}

/** Toggles one entity id in the highlight list (empty list → undefined). */
function useToggleHighlight(update: CompareViewProps['update']) {
  return useCallback(
    (id: string) =>
      update((s) => {
        const hl = s.hl ?? [];
        const next = hl.includes(id) ? hl.filter((x) => x !== id) : [...hl, id];
        return { hl: next.length > 0 ? next : undefined };
      }),
    [update]
  );
}

function ScatterEmpty({ dataset, addMetric }: CompareViewProps) {
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <ChartScatter className="text-accent-600 size-4" aria-hidden />
          Pick two metrics to overlay
        </span>
      }
      subtitle="Start from a ready-made question, or add any metric and then a second one to plot against it."
    >
      <PresetCards dataset={dataset} />
      <h3 className="text-muted mt-5 mb-2 text-xs font-medium">
        Popular {dataset.type.label.toLowerCase()} metrics
      </h3>
      <PopularMetricChips dataset={dataset} onAdd={addMetric} limit={8} />
    </Card>
  );
}

function SingleMetric({
  dataset,
  search,
  metrics,
  entityIdx,
  direction,
  update,
}: CompareViewProps) {
  const metric = metrics[0];
  const toggle = useToggleHighlight(update);
  const highlight = useMemo(() => new Set(search.hl ?? []), [search.hl]);
  const addSecond = (id: number) =>
    update((s) => ({
      m: s.m.includes(id) ? s.m : [...s.m, id],
      x: metric.id,
      y: id,
    }));
  const dir = direction(metric.id);
  return (
    <div className="space-y-4">
      <Card
        title="Add a second metric to overlay"
        subtitle={`Plot ${metric.label} against anything else to see whether they move together.`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <MetricPicker
            dataset={dataset}
            onSelect={addSecond}
            exclude={search.m}
            placeholder="Choose a metric to plot against"
          />
          <span className="text-muted text-xs">or try</span>
          <PopularMetricChips
            dataset={dataset}
            onAdd={addSecond}
            exclude={search.m}
            limit={5}
          />
        </div>
      </Card>
      <Card
        title={metric.label}
        subtitle={`${dataset.metricContext(metric.id) ?? ''} · each dot is a ${dataset.type.singular.toLowerCase()}`}
      >
        <DotStrip
          dataset={dataset}
          metric={metric}
          entityIdx={entityIdx}
          direction={dir}
          reverse={readsBackwards(metric, dir)}
          highlight={highlight}
          onToggle={toggle}
        />
      </Card>
    </div>
  );
}

function meaningOf(search: CompareSearch, m: Metric, dir: 1 | -1): AxisMeaning {
  return {
    label: m.label,
    dir,
    neutral: polarityFor(search, m) === 0,
    isRank: isRankColumn(m),
  };
}

function Overlay(props: CompareViewProps) {
  const { dataset, search, metrics, entityIdx, direction, update } = props;
  const narrow = useMediaQuery('(max-width: 640px)');

  const valid = (id: number | undefined) =>
    id != null && dataset.metric(id)?.kind === 'num' ? id : undefined;
  const xId = valid(search.x) ?? metrics[0].id;
  const yWanted = valid(search.y);
  const yId =
    yWanted != null && yWanted !== xId
      ? yWanted
      : (metrics.find((m) => m.id !== xId)?.id ?? metrics[1].id);

  // Persist the default axes so the URL always describes what is on screen.
  useEffect(() => {
    if (search.x !== xId || search.y !== yId)
      update({ x: xId, y: yId }, { replace: true });
  }, [search.x, search.y, xId, yId, update]);

  const xMetric = dataset.metric(xId) ?? metrics[0];
  const yMetric = dataset.metric(yId) ?? metrics[1];
  const sizeMetric =
    search.r != null ? (dataset.metric(search.r) ?? null) : null;
  const dirX = direction(xMetric.id);
  const dirY = direction(yMetric.id);
  const x = useMemo(
    () => meaningOf(search, xMetric, dirX),
    [search, xMetric, dirX]
  );
  const y = useMemo(
    () => meaningOf(search, yMetric, dirY),
    [search, yMetric, dirY]
  );

  // Axis flips live in the URL (`fl`) so shared links keep them. Best-first
  // ranks start flipped so #1 sits at the right / top; a worst-first rank's
  // better places already have the larger numbers, so it needs no flip.
  const flips = search.fl ?? {};
  const flipX =
    dirX === -1 && (flips[String(xMetric.id)] ?? readsBackwards(xMetric, dirX));
  const flipY =
    dirY === -1 && (flips[String(yMetric.id)] ?? readsBackwards(yMetric, dirY));

  const log = search.log ?? [];
  const logX = log.includes('x');
  const logY = log.includes('y');
  const analysis = useMemo(
    () =>
      analyzeScatter({
        entityIdx,
        xs: dataset.numeric(xMetric.id),
        ys: dataset.numeric(yMetric.id),
        logX,
        logY,
      }),
    [entityIdx, dataset, xMetric, yMetric, logX, logY]
  );
  const color = useMemo(
    () =>
      buildColorModel(
        dataset,
        search.c,
        (id) => polarityFor(search, dataset.metric(id)),
        analysis.points.map((p) => p.idx),
        groupLabel(dataset.type.id)
      ),
    [dataset, search, analysis]
  );
  const highlight = useMemo(() => new Set(search.hl ?? []), [search.hl]);
  const outliers = useMemo(() => outlierPoints(analysis, 3), [analysis]);
  const toggle = useToggleHighlight(update);

  const setAxis = (axis: 'x' | 'y', id: number) => {
    const other = axis === 'x' ? yId : xId;
    update((s) => ({
      m: s.m.includes(id) ? s.m : [...s.m, id],
      ...(id === other
        ? { x: yId, y: xId }
        : axis === 'x'
          ? { x: id }
          : { y: id }),
    }));
  };
  const swap = () =>
    update((s) => {
      const next = (s.log ?? []).map((a) => (a === 'x' ? 'y' : 'x'));
      return { x: yId, y: xId, log: next.length > 0 ? next : undefined };
    });
  const toggleLog = (axis: 'x' | 'y') =>
    update((s) => {
      const cur = s.log ?? [];
      const next = cur.includes(axis)
        ? cur.filter((a) => a !== axis)
        : [...cur, axis];
      return { log: next.length > 0 ? next : undefined };
    });
  const toggleFlip = (axis: 'x' | 'y') => {
    const id = axis === 'x' ? xMetric.id : yMetric.id;
    const cur = axis === 'x' ? flipX : flipY;
    update((s) => ({ fl: { ...(s.fl ?? {}), [String(id)]: !cur } }));
  };
  const addAndSet = (key: 'r' | 'c', id: number) =>
    update((s) => ({ m: s.m.includes(id) ? s.m : [...s.m, id], [key]: id }));

  const noun = pluralNoun(dataset);
  const sentence = relationshipSentence(analysis.pearson, x, y, noun)
    .map((p) => p.text)
    .join('');
  const n = analysis.points.length;
  const statsProps = {
    dataset,
    analysis,
    xMetric,
    yMetric,
    x,
    y,
    flipX,
    flipY,
    highlight,
    onToggle: toggle,
  };

  return (
    <div className="space-y-4">
      {n >= 3 ? (
        <Takeaway dataset={dataset} analysis={analysis} x={x} y={y} />
      ) : null}
      <ScatterControls
        dataset={dataset}
        search={search}
        metrics={metrics}
        xId={xMetric.id}
        yId={yMetric.id}
        canLogX={analysis.canLogX}
        canLogY={analysis.canLogY}
        canFlipX={dirX === -1}
        canFlipY={dirY === -1}
        flipX={flipX}
        flipY={flipY}
        onAxis={setAxis}
        onSwap={swap}
        onSize={(id) =>
          id == null ? update({ r: undefined }) : addAndSet('r', id)
        }
        onColor={(c) =>
          typeof c === 'number' ? addAndSet('c', c) : update({ c })
        }
        onLog={toggleLog}
        onFlip={toggleFlip}
      />
      <Card
        title={
          <>
            {yMetric.label} <span className="text-muted font-normal">vs</span>{' '}
            {xMetric.label}
          </>
        }
        subtitle={`${plural(n, dataset.type.singular.toLowerCase(), noun.toLowerCase())}${analysis.missing > 0 ? ` · ${analysis.missing} without data for both` : ''} · click a dot to highlight it`}
        actions={
          highlight.size > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => update({ hl: undefined })}
            >
              <X className="size-3.5" aria-hidden /> Clear highlights
            </Button>
          ) : null
        }
      >
        {n < 3 ? (
          <EmptyState title="Too few places have both values">
            Only {n} {n === 1 ? 'place has' : 'places have'} data for both
            metrics{search.g != null ? ' within the current filter' : ''}. Try
            another pair or clear the region filter.
          </EmptyState>
        ) : (
          <>
            <ScatterChart
              dataset={dataset}
              analysis={analysis}
              xMetric={xMetric}
              yMetric={yMetric}
              sizeMetric={sizeMetric}
              color={color}
              flipX={flipX}
              flipY={flipY}
              highlight={highlight}
              outliers={outliers}
              onToggle={toggle}
              height={narrow ? 360 : 480}
              ariaLabel={`Scatter plot of ${yMetric.label} against ${xMetric.label} for ${n} ${noun.toLowerCase()}`}
              ariaDescription={sentence}
            />
            <ChartLegend
              color={color}
              sizeMetric={sizeMetric}
              xMetric={xMetric}
              yMetric={yMetric}
              xOrder={rankOrder(xMetric, dirX)}
              yOrder={rankOrder(yMetric, dirY)}
              flipX={flipX}
              flipY={flipY}
              n={n}
            />
          </>
        )}
      </Card>
      {n >= 3 ? (
        <>
          <InsightCard dataset={dataset} analysis={analysis} x={x} y={y} />
          <div className="grid gap-4 xl:grid-cols-2">
            <QuadrantCard {...statsProps} />
            <PerformersCard {...statsProps} />
          </div>
        </>
      ) : null}
    </div>
  );
}

/** HTML legend under the chart: colours, sizes, trend, medians and axis flips. */
function ChartLegend({
  color,
  sizeMetric,
  xMetric,
  yMetric,
  xOrder,
  yOrder,
  flipX,
  flipY,
  n,
}: {
  color: ColorModel;
  sizeMetric: Metric | null;
  xMetric: Metric;
  yMetric: Metric;
  /** How each axis reads as list positions, with the reader's directions (null: values) */
  xOrder: RankOrder | null;
  yOrder: RankOrder | null;
  flipX: boolean;
  flipY: boolean;
  n: number;
}) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const flips = [
    flipX ? `${xMetric.label} runs right-to-left (best on the right)` : null,
    flipY ? `${yMetric.label} runs top-to-bottom (best at the top)` : null,
  ].filter((f) => f != null);
  // A rank axis drawn unflipped says which end rank 1 is, so "1st" at the left or bottom is
  // not mistaken for the best place on a worst-first list (or the reverse).
  const rankNotes = [
    xOrder != null && !flipX
      ? `${xMetric.label}: ${rankOrderNote(xOrder)}, so better places sit ${xOrder === 'worst-first' ? 'to the right' : 'to the left'}`
      : null,
    yOrder != null && !flipY
      ? `${yMetric.label}: ${rankOrderNote(yOrder)}, so better places sit ${yOrder === 'worst-first' ? 'higher up' : 'lower down'}`
      : null,
  ].filter((f) => f != null);
  return (
    <div className="text-muted mt-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {color.kind === 'group' ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-app font-medium">{color.title}</span>
            {color.domain.map((g, i) => (
              <span key={g} className="inline-flex items-center gap-1">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: color.range[i] }}
                  aria-hidden
                />
                {g}
              </span>
            ))}
          </div>
        ) : null}
        {color.kind === 'metric' ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-app font-medium">{color.metric.label}</span>
            <span className="tabular">
              {formatValue(color.metric, color.min, { compact: true })}
            </span>
            <span
              className="inline-block h-2.5 w-24 rounded-full"
              style={{
                background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => color.interpolate(t)).join(', ')})`,
              }}
              aria-hidden
            />
            <span className="tabular">
              {formatValue(color.metric, color.max, { compact: true })}
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block size-2.5 rounded-full border"
                style={{
                  background: colors.missing,
                  borderColor: colors.muted,
                }}
                aria-hidden
              />
              no data
            </span>
          </div>
        ) : null}
        {sizeMetric != null ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-end gap-0.5" aria-hidden>
              <span className="inline-block size-1.5 rounded-full border border-current" />
              <span className="inline-block size-3 rounded-full border border-current" />
            </span>
            Size:{' '}
            <span className="text-app font-medium">{sizeMetric.label}</span>
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <svg width="24" height="12" aria-hidden>
            <rect
              y="1"
              width="24"
              height="10"
              rx="2"
              fill={colors.accent}
              fillOpacity={0.18}
            />
            <line
              x1="0"
              y1="6"
              x2="24"
              y2="6"
              stroke={colors.accent}
              strokeWidth="2"
            />
          </svg>
          Trend line with 95% confidence band
          <InfoTip term="trend-line" />
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-5 border-t border-dashed"
            style={{ borderColor: colors.muted }}
            aria-hidden
          />
          Medians
        </span>
        <span>
          Labelled: highlighted places and the {Math.min(3, n)} biggest outliers
        </span>
      </div>
      {flips.length > 0 ? (
        <p className="text-app">
          <span className="font-medium">Flipped so better is up/right:</span>{' '}
          {flips.join('; ')}.
        </p>
      ) : null}
      {rankNotes.length > 0 ? (
        <p className="text-app">{rankNotes.join('; ')}.</p>
      ) : null}
    </div>
  );
}
