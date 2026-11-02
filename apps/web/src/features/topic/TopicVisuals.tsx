import type { Summary } from '@world-data/stats';
import { ArrowUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { DistributionChart } from './charts/DistributionChart';
import { RankedBars } from './charts/RankedBars';
import { TrendChart, type TrendSeries } from './charts/TrendChart';
import {
  isSkewed,
  placeNoun,
  type RankedEntry,
  rankWindow,
  trendPoints,
} from './model';
import { Button, Card, Segmented, Stat } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import type { Metric, TopicFile } from '~/data/types';
import { formatInt, formatValue } from '~/lib/format';
import { chartColors, GROUP_PALETTE, useTheme } from '~/lib/theme';

/** Formatters every visual receives: value labels (with unit) and short axis ticks. */
export interface Formats {
  format: (v: number) => string;
  tickFormat: (v: number) => string;
}

/** Rankings up to this length are always shown in full. */
const SHORT_RANKING = 60;
/** Places beyond which the "show all" option of the ranking is not offered. */
const SHOW_ALL_LIMIT = 300;

/**
 * Ranked bars for the focus metric: every place when the list is short, otherwise the top 15 and
 * bottom 5 with a toggle for all. The order can be flipped (worst first), keeping true ranks.
 */
export function RankingCard({
  dataset,
  focus,
  ranked,
  formats,
  selected,
  onSelect,
}: {
  dataset: Dataset;
  focus: Metric;
  ranked: readonly RankedEntry[];
  formats: Formats;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const [mode, setMode] = useState<'ends' | 'all'>('ends');
  const [reversed, setReversed] = useState(false);
  const short = ranked.length <= SHORT_RANKING;
  const showAll = short || mode === 'all';
  const isRank = focus.fmt === 'ranking';
  const slice = useMemo(() => {
    const ordered = reversed ? [...ranked].reverse() : [...ranked];
    return showAll
      ? rankWindow(ordered, ordered.length, 0)
      : rankWindow(ordered);
  }, [ranked, showAll, reversed]);
  const noun = placeNoun(dataset.type.id);
  const canToggle = !short && ranked.length <= SHOW_ALL_LIMIT;
  const neutral = focus.pol === 0;
  const firstLabel = neutral
    ? reversed
      ? 'Lowest first'
      : 'Highest first'
    : reversed
      ? 'Worst first'
      : 'Best first';
  const bars = (
    <RankedBars
      dataset={dataset}
      head={slice.head}
      tail={slice.tail}
      total={ranked.length}
      label={focus.label}
      format={formats.format}
      tickFormat={formats.tickFormat}
      invert={isRank}
      selected={selected}
      onSelect={onSelect}
      rowHeight={showAll && ranked.length > 30 ? 19 : 22}
    />
  );
  return (
    <Card
      title={short ? `All ${formatInt(ranked.length)} ranked` : 'Ranking'}
      subtitle={
        showAll
          ? `${firstLabel}${isRank ? '; rank 1 has the longest bar' : ''}.`
          : `${firstLabel}: the top 15 and bottom 5 of ${formatInt(ranked.length)} ${noun}.`
      }
      actions={
        <>
          {canToggle ? (
            <Segmented
              size="sm"
              ariaLabel="Ranking length"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'ends', label: 'Top & bottom' },
                { value: 'all', label: `All ${formatInt(ranked.length)}` },
              ]}
            />
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={reversed}
            onClick={() => setReversed((r) => !r)}
            title="Reverse the order"
            className={reversed ? 'bg-surface-2 text-app' : 'text-muted'}
          >
            <ArrowUpDown className="size-3.5" aria-hidden />
            Reverse
          </Button>
        </>
      }
    >
      {showAll && ranked.length > 24 ? (
        <div className="-mx-4 -mb-4 max-h-[440px] overflow-y-auto px-4 pb-4">
          {bars}
        </div>
      ) : (
        bars
      )}
    </Card>
  );
}

/**
 * Where the places sit on the focus metric (beeswarm or histogram with median and quartile
 * rules) next to summary tiles. Skewed positive metrics default to a log axis, with a toggle.
 */
export function DistributionCard({
  dataset,
  focus,
  values,
  stats,
  ranked,
  formats,
  wide,
  selected,
  onSelect,
}: {
  dataset: Dataset;
  focus: Metric;
  values: Float64Array;
  stats: Summary;
  ranked: readonly RankedEntry[];
  formats: Formats;
  /** Full-width card: chart and tiles side by side */
  wide: boolean;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const skewed = isSkewed(stats);
  const [scale, setScale] = useState<'linear' | 'log' | null>(null);
  const log = (scale ?? (skewed ? 'log' : 'linear')) === 'log';
  const canLog = stats.min > 0 && ranked.length <= 400;
  const full = (v: number) => formatValue(focus, v);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  // Lower-is-better metrics list the lowest value first; label tiles by meaning, not size.
  const lowFirst = focus.pol === -1;
  const tiles = [
    {
      label: lowFirst ? 'Lowest (best)' : 'Highest',
      entry: best,
    },
    {
      label: lowFirst ? 'Highest (worst)' : 'Lowest',
      entry: worst,
    },
  ];
  const noun = placeNoun(dataset.type.id);

  const statsGrid = (
    <div
      className={
        wide
          ? 'grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2'
          : 'grid grid-cols-2 gap-3 sm:grid-cols-4'
      }
    >
      <Stat
        label="Median"
        value={full(stats.median)}
        hint={`Middle half ${formats.format(stats.q1)} – ${formats.format(stats.q3)}`}
      />
      <Stat
        label="Average"
        value={full(stats.mean)}
        hint={`${formatInt(stats.n)} ${placeNoun(dataset.type.id, stats.n)}`}
      />
      {tiles.map((t) => (
        <Stat
          key={t.label}
          label={t.label}
          value={t.entry != null ? full(t.entry.value) : '—'}
          hint={
            <span className="block truncate">
              {t.entry != null ? dataset.entities[t.entry.index].name : ''}
            </span>
          }
        />
      ))}
    </div>
  );
  const chart =
    stats.n >= 3 ? (
      <DistributionChart
        dataset={dataset}
        values={values}
        stats={stats}
        label={focus.label}
        format={formats.format}
        tickFormat={formats.tickFormat}
        log={canLog && log}
        selected={selected}
        onSelect={onSelect}
      />
    ) : null;

  return (
    <Card
      title="Distribution"
      subtitle={
        ranked.length > 400
          ? `How many ${noun} fall in each range; the lines mark the median and the middle half.`
          : `Each dot is one ${placeNoun(dataset.type.id, 1)}; the lines mark the median and the middle half.`
      }
      actions={
        canLog ? (
          <Segmented
            size="sm"
            ariaLabel="Axis scale"
            value={log ? 'log' : 'linear'}
            onChange={setScale}
            options={[
              { value: 'linear', label: 'Linear' },
              {
                value: 'log',
                label: 'Log',
                title: 'Logarithmic axis for skewed values',
              },
            ]}
          />
        ) : null
      }
    >
      {chart == null ? (
        statsGrid
      ) : wide ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {chart}
          {statsGrid}
        </div>
      ) : (
        <div className="space-y-4">
          {chart}
          {statsGrid}
        </div>
      )}
    </Card>
  );
}

/** Places drawn on the trend chart besides the median. */
const TREND_PLACES = 5;

/**
 * Year-by-year lines: the median across all places (not for ranks, whose median is constant)
 * plus the selected place and the top places of the selected year.
 */
export function TrendCard({
  topic,
  dataset,
  focus,
  years,
  year,
  ranked,
  formats,
  withMedian,
  selected,
}: {
  topic: TopicFile;
  dataset: Dataset;
  focus: Metric;
  years: number[];
  year: number | null;
  ranked: readonly RankedEntry[];
  formats: Formats;
  /** Draw the median line (off for ranks and for very few places) */
  withMedian: boolean;
  selected: number | null;
}) {
  const colors = chartColors(useTheme());
  const isRank = focus.fmt === 'ranking';
  const { points, series } = useMemo(() => {
    const picks: number[] = [];
    if (selected != null) picks.push(selected);
    for (const e of ranked) {
      if (picks.length >= TREND_PLACES) break;
      if (!picks.includes(e.index)) picks.push(e.index);
    }
    const places = picks.map((index) => ({
      index,
      name: dataset.entities[index].name,
    }));
    const medianLabel = `Median of all ${placeNoun(dataset.type.id)}`;
    const pts = trendPoints(
      topic,
      focus.id,
      years,
      places,
      dataset.entities.length,
      medianLabel
    );
    const s: TrendSeries[] = [
      ...(withMedian
        ? [{ name: medianLabel, color: colors.muted, median: true }]
        : []),
      ...places.map((p, k) => ({
        name: p.name,
        color:
          p.index === selected
            ? colors.highlight
            : GROUP_PALETTE[k % GROUP_PALETTE.length],
      })),
    ];
    return {
      points: withMedian ? pts : pts.filter((p) => p.series !== medianLabel),
      series: s,
    };
  }, [topic, dataset, focus, years, ranked, selected, withMedian, colors]);

  const top = Math.min(TREND_PLACES, ranked.length);
  return (
    <Card
      title={`Over time · ${years[0]}–${years[years.length - 1]}`}
      subtitle={`${selected != null ? 'The highlighted place and the' : 'The'} top ${top} in ${year ?? 'the selected year'}${isRank ? '; rank 1 at the top' : withMedian ? ', against the median' : ''}.`}
    >
      <TrendChart
        points={points}
        series={series}
        years={years}
        label={focus.label}
        format={formats.format}
        tickFormat={formats.tickFormat}
        reversed={isRank}
      />
      <ul
        className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"
        aria-label="Lines"
      >
        {series.map((s) => (
          <li
            key={s.name}
            className="text-muted inline-flex items-center gap-1.5"
          >
            <span
              className="inline-block w-4"
              style={{
                borderTop: `2px ${s.median === true ? 'dashed' : 'solid'} ${s.color}`,
              }}
            />
            {s.name}
          </li>
        ))}
      </ul>
    </Card>
  );
}
