import {
  areaY,
  defineChart,
  dot,
  lineY,
  ruleX,
  ruleY,
  text,
} from '@tanstack/charts';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react';
import { linearRegressionRowsY } from '@tanstack/charts/regression';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scaleOrdinal } from '@tanstack/charts/scales/ordinal';
import { tooltip } from '@tanstack/charts/tooltip';
import { scaleLog, scaleSequential } from 'd3-scale';
import { useMemo } from 'react';

import { isRankMetric } from '../polarity';
import { groupLabel } from '../presets';
import { logTicks, rankTicks, type ScatterAnalysis } from './analysis';
import { baseRadius, type ColorModel, radiusMapper } from './colorModel';
import { axisTickFormat, linearAxisDomain } from './ticks';
import type { Dataset } from '~/data/dataset';
import type { Metric } from '~/data/types';
import { formatValue } from '~/lib/format';
import { chartColors, useTheme } from '~/lib/theme';

export interface ScatterChartProps {
  dataset: Dataset;
  analysis: ScatterAnalysis;
  xMetric: Metric;
  yMetric: Metric;
  sizeMetric: Metric | null;
  color: ColorModel;
  /** Reverse an axis so the better (lower) end of the metric is right / up */
  flipX: boolean;
  flipY: boolean;
  /** Highlighted entity ids (ringed and labelled) */
  highlight: ReadonlySet<string>;
  /** Point indexes (into analysis.points) to label as outliers */
  outliers: readonly number[];
  onToggle: (entityId: string) => void;
  height: number;
  ariaLabel: string;
  ariaDescription: string;
}

/** One plotted place with everything the marks and tooltip need. */
interface PlotDatum {
  key: string;
  name: string;
  group: string | null;
  x: number;
  y: number;
  /** Pixel radius */
  r: number;
  /** Colour-scale value: group key or colour-metric value */
  tint: string | number | null;
  size: number;
  colorValue: number;
  predicted: number;
  anchor: 'start' | 'middle' | 'end';
  /** Position as a fraction of the plot (0–1, after flips; y grows upward) */
  fx: number;
  fy: number;
}

const toPlot = (v: number, log: boolean) => (log ? Math.log10(v) : v);
const fromPlot = (v: number, log: boolean) => (log ? 10 ** v : v);

interface AxisSpec {
  domain: [number, number];
  ticks: number[] | undefined;
  nice: boolean;
}

/**
 * Axis domain and ticks: the data extent padded so edge dots and bubbles are
 * not cut off by the clipped plot. Log axes get decade ticks; rank axes start
 * at 1st (never 0th) and are not "niced" past it; other linear axes never
 * reach below zero for data that has no negative values (linearAxisDomain).
 */
function axisSpec(
  values: readonly number[],
  log: boolean,
  pad: number,
  rank: boolean
): AxisSpec {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    const t = toPlot(v, log);
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  if (!Number.isFinite(lo))
    return { domain: log ? [1, 10] : [0, 1], ticks: undefined, nice: false };
  const span = hi - lo > 0 ? hi - lo : Math.abs(hi) * 0.1 + 1;
  const domain: [number, number] = [
    fromPlot(lo - span * pad, log),
    fromPlot(hi + span * pad, log),
  ];
  if (log)
    return { domain, ticks: logTicks(domain[0], domain[1]), nice: false };
  if (rank) {
    domain[0] = Math.max(0, domain[0]);
    return { domain, ticks: rankTicks(domain[1]), nice: false };
  }
  // Nice here rather than in the chart so label placement (which works in
  // fractions of this domain) matches the rendered plot.
  return {
    domain: linearAxisDomain(lo, hi, pad),
    ticks: undefined,
    nice: false,
  };
}

/**
 * Greedy label placement: each label tries a few spots (above, below, then
 * one line further out) and takes the first that does not overlap a label
 * placed earlier; highlighted places go first. The plot is not measured yet,
 * so boxes are estimated in pixels from the label length and an approximate
 * plot size, which avoids most collisions without a layout pass. Returns the
 * text-mark `dy` per entity key.
 */
function placeLabels(
  labels: readonly PlotDatum[],
  plotWidth: number,
  plotHeight: number
): Map<string, number> {
  const CHAR = 6.3;
  const LINE = 14;
  const GAP = 16;
  const placed: { x0: number; x1: number; y: number }[] = [];
  const out = new Map<string, number>();
  for (const d of labels) {
    const w = d.name.length * CHAR;
    const cx = d.fx * plotWidth;
    const x0 =
      d.anchor === 'start' ? cx : d.anchor === 'end' ? cx - w : cx - w / 2;
    const cy = d.fy * plotHeight;
    const up = d.r + 8;
    const down = d.r + 9;
    // Offsets are upward pixels from the dot centre; near the top prefer below.
    const offsets =
      d.fy > 0.9
        ? [-down, up, -down - LINE, up + LINE]
        : [up, -down, up + LINE, -down - LINE];
    const free = (o: number) =>
      !placed.some(
        (p) => x0 < p.x1 && p.x0 < x0 + w && Math.abs(cy + o - p.y) < GAP
      );
    const offset = offsets.find(free) ?? offsets[0];
    placed.push({ x0, x1: x0 + w, y: cy + offset });
    out.set(d.key, -offset);
  }
  return out;
}

/**
 * Overlay scatter plot: one dot per place, optional size and colour
 * encodings, a least-squares trend with its 95% confidence band (fitted in the
 * plotted space, so log axes get a log fit), median guides that split the
 * quadrants, and labels for highlighted places and the biggest outliers.
 */
export function ScatterChart({
  dataset,
  analysis,
  xMetric,
  yMetric,
  sizeMetric,
  color,
  flipX,
  flipY,
  highlight,
  outliers,
  onToggle,
  height,
  ariaLabel,
  ariaDescription,
}: ScatterChartProps) {
  const theme = useTheme();
  const colors = useMemo(() => chartColors(theme), [theme]);

  const definition = useMemo(() => {
    const { points, logX, logY } = analysis;
    const n = points.length;
    const sizeValues =
      sizeMetric != null ? dataset.numeric(sizeMetric.id) : null;
    const radiusOf =
      sizeValues != null ? radiusMapper(sizeValues, n) : () => baseRadius(n);
    const pad = sizeMetric != null ? 0.08 : 0.05;
    const xAxis = axisSpec(
      points.map((p) => p.x),
      logX,
      pad,
      isRankMetric(xMetric)
    );
    const yAxis = axisSpec(
      points.map((p) => p.y),
      logY,
      pad,
      isRankMetric(yMetric)
    );
    const xDomain = xAxis.domain;
    const yDomain = yAxis.domain;
    const [txLo, txHi] = [toPlot(xDomain[0], logX), toPlot(xDomain[1], logX)];
    const [tyLo, tyHi] = [toPlot(yDomain[0], logY), toPlot(yDomain[1], logY)];

    const data: PlotDatum[] = points.map((p, i) => {
      const e = dataset.entities[p.idx];
      let fx = (p.tx - txLo) / (txHi - txLo);
      let fy = (p.ty - tyLo) / (tyHi - tyLo);
      if (flipX) fx = 1 - fx;
      if (flipY) fy = 1 - fy;
      const r = radiusOf(sizeValues?.[p.idx] ?? NaN);
      const colorValue = color.kind === 'metric' ? color.values[p.idx] : NaN;
      return {
        key: e.id,
        name: e.name,
        group: e.group,
        x: p.x,
        y: p.y,
        r,
        tint:
          color.kind === 'group'
            ? color.keyOf(e.group)
            : Number.isFinite(colorValue)
              ? colorValue
              : null,
        size: sizeValues?.[p.idx] ?? NaN,
        colorValue,
        predicted: analysis.predicted[i],
        anchor: fx > 0.86 ? 'end' : fx < 0.14 ? 'start' : 'middle',
        fx,
        fy,
      };
    });
    // Draw big bubbles first so small ones stay visible on top.
    data.sort((a, b) => b.r - a.r);
    const tinted = data.filter(
      (d) => color.kind !== 'metric' || d.tint != null
    );
    const untinted =
      color.kind === 'metric' ? data.filter((d) => d.tint == null) : [];
    const outlierKeys = new Set(
      outliers.map((i) => dataset.entities[points[i].idx].id)
    );
    const highlighted = data.filter((d) => highlight.has(d.key));
    const outlierLabels = data.filter(
      (d) => outlierKeys.has(d.key) && !highlight.has(d.key)
    );
    // Rough plot size: the chart is full-width on desktop and phone-width
    // when it is given the short mobile height.
    const labelDy = placeLabels(
      [...highlighted, ...outlierLabels],
      height < 400 ? 300 : 780,
      height - 70
    );
    const dyOf = (d: PlotDatum) => labelDy.get(d.key) ?? -(d.r + 8);

    const fit =
      n >= 3 && Number.isFinite(analysis.regression.slope)
        ? linearRegressionRowsY(points, { x: 'tx', y: 'ty', ci: 0.95 }).map(
            (row) => ({
              x: fromPlot(row.x, logX),
              y: fromPlot(row.y, logY),
              y1: row.y1 != null ? fromPlot(row.y1, logY) : undefined,
              y2: row.y2 != null ? fromPlot(row.y2, logY) : undefined,
            })
          )
        : [];

    const crowded = n > 500;
    const outline =
      color.kind === 'metric'
        ? { stroke: colors.text, strokeOpacity: 0.35, strokeWidth: 0.6 }
        : {
            stroke: colors.border,
            strokeOpacity: 1,
            strokeWidth: crowded ? 0.3 : 0.8,
          };
    const colorOptions =
      color.kind === 'group'
        ? { scale: scaleOrdinal(color.domain, color.range) }
        : color.kind === 'metric'
          ? {
              scale: scaleSequential(color.interpolate).domain([
                color.min,
                color.max,
              ]),
            }
          : undefined;
    const fmtX = (v: number) => formatValue(xMetric, v);
    const fmtY = (v: number) => formatValue(yMetric, v);
    const label = (m: Metric, log: boolean) =>
      `${m.label}${log ? ' (log scale)' : ''}`;

    return defineChart({
      marks: [
        decorative(
          ruleX([analysis.medianX], {
            stroke: colors.muted,
            strokeOpacity: 0.55,
            strokeDasharray: '3 4',
          })
        ),
        decorative(
          ruleY([analysis.medianY], {
            stroke: colors.muted,
            strokeOpacity: 0.55,
            strokeDasharray: '3 4',
          })
        ),
        decorative(
          areaY(fit, {
            x: 'x',
            y1: 'y1',
            y2: 'y2',
            fill: colors.accent,
            fillOpacity: theme === 'dark' ? 0.16 : 0.1,
          })
        ),
        decorative(
          lineY(fit, {
            x: 'x',
            y: 'y',
            stroke: colors.accent,
            strokeWidth: 2,
            strokeOpacity: 0.9,
          })
        ),
        dot(untinted, {
          x: 'x',
          y: 'y',
          key: 'key',
          r: 'r',
          fill: colors.missing,
          fillOpacity: 0.9,
          stroke: colors.muted,
          strokeOpacity: 0.5,
          strokeWidth: 0.6,
        }),
        dot(tinted, {
          x: 'x',
          y: 'y',
          key: 'key',
          r: 'r',
          color: colorOptions != null ? 'tint' : undefined,
          fill: colorOptions == null ? colors.point : undefined,
          fillOpacity: crowded ? 0.6 : sizeMetric != null ? 0.72 : 0.85,
          ...outline,
        }),
        decorative(
          dot(highlighted, {
            x: 'x',
            y: 'y',
            key: 'key',
            r: (d) => d.r + 3,
            fill: 'none',
            stroke: colors.highlight,
            strokeWidth: 2.25,
          })
        ),
        decorative(
          text(outlierLabels, {
            x: 'x',
            y: 'y',
            key: 'key',
            text: 'name',
            anchor: (d) => d.anchor,
            dy: dyOf,
            fontSize: 11,
            fill: colors.muted,
          })
        ),
        decorative(
          text(highlighted, {
            x: 'x',
            y: 'y',
            key: 'key',
            text: 'name',
            anchor: (d) => d.anchor,
            dy: dyOf,
            fontSize: 12,
            fontWeight: 600,
            fill: colors.text,
          })
        ),
      ],
      scales: {
        x: {
          scale: logX
            ? scaleLog().domain(xDomain)
            : scaleLinear().domain(xDomain),
          nice: xAxis.nice,
          reverse: flipX,
          grid: { stroke: colors.grid, strokeOpacity: 1 },
          axis: {
            label: label(xMetric, logX),
            ticks: {
              values: xAxis.ticks,
              format: axisTickFormat(xMetric, xDomain),
            },
          },
        },
        y: {
          scale: logY
            ? scaleLog().domain(yDomain)
            : scaleLinear().domain(yDomain),
          nice: yAxis.nice,
          reverse: flipY,
          grid: { stroke: colors.grid, strokeOpacity: 1 },
          axis: {
            label: label(yMetric, logY),
            ticks: {
              values: yAxis.ticks,
              format: axisTickFormat(yMetric, yDomain),
            },
          },
        },
      },
      color: colorOptions,
      clip: true,
      tooltip: {
        use: tooltip,
        sticky: false,
        content: (focused) => {
          const d = focused[0]?.datum;
          if (d == null) return { rows: [] };
          const rows = [
            { label: xMetric.label, value: fmtX(d.x) },
            { label: yMetric.label, value: fmtY(d.y) },
          ];
          if (sizeMetric != null)
            rows.push({
              label: sizeMetric.label,
              value: formatValue(sizeMetric, d.size),
            });
          if (color.kind === 'metric')
            rows.push({
              label: color.metric.label,
              value: formatValue(color.metric, d.colorValue),
            });
          if (d.group != null)
            rows.push({ label: groupLabel(dataset.type.id), value: d.group });
          rows.push({ label: 'Trend predicts', value: fmtY(d.predicted) });
          return { title: d.name, rows };
        },
      },
    });
  }, [
    analysis,
    dataset,
    xMetric,
    yMetric,
    sizeMetric,
    color,
    flipX,
    flipY,
    highlight,
    outliers,
    colors,
    theme,
    height,
  ]);

  return (
    <Chart
      definition={definition}
      height={height}
      ariaLabel={ariaLabel}
      ariaDescription={ariaDescription}
      onSelect={(point) => {
        if (point != null) onToggle(point.datum.key);
      }}
    />
  );
}
