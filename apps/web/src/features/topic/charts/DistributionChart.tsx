import { binX, defineChart, dodgeY, dot, rect, ruleX } from '@tanstack/charts';
import { Chart } from '@tanstack/charts/react';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scaleOrdinal } from '@tanstack/charts/scales/ordinal';
import { tooltip } from '@tanstack/charts/tooltip';
import type { Summary } from '@world-data/stats';
import { scaleLog } from 'd3-scale';
import { useMemo } from 'react';

import { logTicks, placeNoun } from '../model';
import type { Dataset } from '~/data/dataset';
import { formatInt } from '~/lib/format';
import { chartColors, useTheme } from '~/lib/theme';

/** Above this many places a beeswarm gets too crowded and we bin into a histogram. */
const SWARM_LIMIT = 400;

interface PlacePoint {
  key: string;
  index: number;
  name: string;
  value: number;
  state: 'place' | 'selected';
}

export interface DistributionProps {
  dataset: Dataset;
  values: Float64Array;
  stats: Summary;
  label: string;
  format: (v: number) => string;
  /** Short axis tick labels (no unit) */
  tickFormat: (v: number) => string;
  /** Log x axis (beeswarm only; values must be positive) */
  log?: boolean;
  selected: number | null;
  onSelect: (entityIndex: number) => void;
}

/**
 * Where every place sits on the focus metric: a beeswarm (one dot per place) for up to
 * SWARM_LIMIT places, a histogram beyond that. Both carry a solid median rule and dashed
 * quartile rules, and mark the selected place in the highlight colour.
 */
export function DistributionChart(props: DistributionProps) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const points = useMemo(() => {
    const out: PlacePoint[] = [];
    props.values.forEach((v, i) => {
      if (Number.isNaN(v)) return;
      const e = props.dataset.entities[i];
      out.push({
        key: e.id,
        index: i,
        name: e.name,
        value: v,
        state: i === props.selected ? 'selected' : 'place',
      });
    });
    return out;
  }, [props.values, props.dataset, props.selected]);
  const selectedName =
    props.selected != null && !Number.isNaN(props.values[props.selected])
      ? props.dataset.entities[props.selected].name
      : null;

  return (
    <div>
      {points.length > SWARM_LIMIT ? (
        <Histogram {...props} points={points} />
      ) : (
        <Beeswarm {...props} points={points} />
      )}
      <div
        className="text-muted mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        aria-hidden
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-0 border-l-2"
            style={{ borderColor: colors.text }}
          />
          Median
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-0 border-l-2 border-dashed"
            style={{ borderColor: colors.muted }}
          />
          Middle 50% (quartiles)
        </span>
        {selectedName != null ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ background: colors.highlight }}
            />
            {selectedName}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Beeswarm({
  dataset,
  stats,
  label,
  format,
  tickFormat,
  log = false,
  onSelect,
  points,
}: DistributionProps & { points: PlacePoint[] }) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const n = points.length;
  const r = n <= 40 ? 6 : n <= 120 ? 4.5 : n <= 250 ? 3.6 : 3;
  const height = n <= 40 ? 150 : n <= 120 ? 190 : 230;

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          ruleX([stats.q1, stats.q3], {
            stroke: colors.muted,
            strokeDasharray: '4 3',
            strokeOpacity: 0.9,
          }),
          ruleX([stats.median], {
            stroke: colors.text,
            strokeOpacity: 0.75,
            strokeWidth: 1.5,
          }),
          dot(points, {
            x: 'value',
            key: 'key',
            color: 'state',
            r,
            fillOpacity: 0.82,
            stroke: colors.border,
            strokeWidth: 0.6,
            layout: dodgeY({ anchor: 'middle', padding: 0.8, fit: 'compress' }),
          }),
        ],
        scales: {
          x: log
            ? {
                scale: scaleLog().domain([stats.min, stats.max]),
                axis: {
                  label: `${label} (log scale)`,
                  ticks: {
                    values: logTicks(stats.min, stats.max),
                    format: tickFormat,
                  },
                },
              }
            : {
                scale: scaleLinear,
                nice: true,
                axis: {
                  label,
                  ticks: { count: 5, format: tickFormat },
                },
              },
          y: null,
        },
        color: {
          scale: scaleOrdinal(
            ['place', 'selected'],
            [colors.accent, colors.highlight]
          ),
        },
        tooltip: {
          use: tooltip,
          content: (pts) => {
            const d = pts[0]?.datum;
            return d != null
              ? { title: d.name, rows: [{ label, value: format(d.value) }] }
              : { rows: [] };
          },
        },
      }),
    [points, stats, colors, r, label, format, tickFormat, log]
  );

  return (
    <Chart
      definition={definition}
      height={height}
      ariaLabel={`Distribution of ${label} across ${formatInt(points.length)} ${placeNoun(dataset.type.id)}`}
      onSelect={(p) => {
        if (p != null) onSelect(p.datum.index);
      }}
    />
  );
}

function Histogram({
  dataset,
  stats,
  label,
  format,
  tickFormat,
  selected,
  points,
}: DistributionProps & { points: PlacePoint[] }) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const noun = placeNoun(dataset.type.id);

  const definition = useMemo(() => {
    const bins = binX(points, {
      value: 'value',
      thresholds: 32,
      outputs: { count: { reduce: 'count' } },
    });
    const selectedBins = bins.filter((b) =>
      b.source.some((p) => p.index === selected)
    );
    return defineChart({
      marks: [
        rect(bins, {
          x1: 'x1',
          x2: 'x2',
          y1: () => 0,
          y2: 'count',
          inset: 0.5,
          fill: colors.accent,
          fillOpacity: 0.85,
        }),
        rect(selectedBins, {
          x1: 'x1',
          x2: 'x2',
          y1: () => 0,
          y2: 'count',
          inset: 0.5,
          fill: colors.highlight,
        }),
        ruleX([stats.q1, stats.q3], {
          stroke: colors.text,
          strokeDasharray: '4 3',
          strokeOpacity: 0.55,
        }),
        ruleX([stats.median], {
          stroke: colors.text,
          strokeOpacity: 0.8,
          strokeWidth: 1.5,
        }),
      ],
      scales: {
        x: {
          scale: scaleLinear,
          axis: {
            label,
            ticks: { count: 5, format: tickFormat },
          },
        },
        y: {
          scale: scaleLinear,
          grid: true,
          nice: true,
          axis: { label: `Number of ${noun}`, ticks: { count: 4 } },
        },
      },
      tooltip: {
        use: tooltip,
        content: (pts) => {
          const b = pts[0]?.datum;
          if (b == null) return { rows: [] };
          const names = b.source
            .slice(0, 3)
            .map((p) => p.name)
            .join(', ');
          return {
            title: `${format(b.x1)} – ${format(b.x2)}`,
            rows: [
              { label: noun, value: formatInt(b.count) },
              ...(names !== ''
                ? [
                    {
                      label: 'e.g.',
                      value: b.count > 3 ? `${names}…` : names,
                    },
                  ]
                : []),
            ],
          };
        },
      },
    });
  }, [points, selected, stats, colors, label, format, tickFormat, noun]);

  return (
    <Chart
      definition={definition}
      height={240}
      ariaLabel={`Histogram of ${label} across ${formatInt(points.length)} ${noun}`}
    />
  );
}
