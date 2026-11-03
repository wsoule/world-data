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
  rankingOrderLabel,
  rankWindow,
  trendPicks,
  trendPoints,
} from './model';
import { Button, Card, Segmented, Stat } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import { rankOrder, rankOrderNote } from '~/data/rankOrder';
import type { Metric, TopicFile } from '~/data/types';
import { formatInt, formatValue } from '~/lib/format';
import { chartColors, GROUP_PALETTE, useTheme } from '~/lib/theme';

/**
 * Formatter every visual of the selected year receives for its value labels (with unit), in
 * one form for the whole view (see `labelFormat`). Axis ticks are not shared: each chart labels
 * its own axis from its own domain with `axisTickFormat`.
 */
export interface Formats {
  format: (v: number) => string;
}

/** Rankings up to this length are always shown in full. */
const SHORT_RANKING = 60;
/** Places beyond which the "show all" option of the ranking is not offered. */
const SHOW_ALL_LIMIT = 300;

/**
 * Ranked bars for the focus metric: every place when the list is short, otherwise the first 15
 * and last 5 with a toggle for all. The order can be flipped, keeping true ranks. Rank columns
 * keep their own order (rank 1 first, with the longest bar), so a worst-first list opens on its
 * worst place.
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
  const order = rankOrder(focus);
  const slice = useMemo(() => {
    const ordered = reversed ? [...ranked].reverse() : [...ranked];
    return showAll
      ? rankWindow(ordered, ordered.length, 0)
      : rankWindow(ordered);
  }, [ranked, showAll, reversed]);
  const noun = placeNoun(dataset.type.id);
  const canToggle = !short && ranked.length <= SHOW_ALL_LIMIT;
  const firstLabel = rankingOrderLabel(focus, reversed);
  const bars = (
    <RankedBars
      dataset={dataset}
      head={slice.head}
      tail={slice.tail}
      total={ranked.length}
      label={focus.label}
      metric={focus}
      format={formats.format}
      invert={order != null}
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
          ? `${firstLabel}${order != null ? `; ${rankOrderNote(order)} and has the longest bar` : ''}.`
          : `${firstLabel}: the first 15 and last 5 of ${formatInt(ranked.length)} ${noun}${order != null ? `; ${rankOrderNote(order)}` : ''}.`
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
        metric={focus}
        format={formats.format}
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

/** Top places drawn on the trend chart besides the median (plus the selected place). */
const TREND_PLACES = 5;

/**
 * Line colours for the top places: the group palette without the highlight colours of either
 * theme, so the selected place's line is never confused with another.
 */
const TREND_PALETTE = GROUP_PALETTE.filter(
  (c) =>
    c !== chartColors('light').highlight && c !== chartColors('dark').highlight
);

/**
 * Year-by-year lines: the median across all places (not for ranks, whose median is constant)
 * plus the top places of the selected year and the selected place. Top places keep their colour
 * by rank; the selected place is drawn in the highlight colour with a thicker line.
 */
export function TrendCard({
  topic,
  dataset,
  focus,
  years,
  year,
  ranked,
  withMedian,
  selected,
}: {
  topic: TopicFile;
  dataset: Dataset;
  focus: Metric;
  years: number[];
  year: number | null;
  /** The page's ranking, in list order: its first places get a line */
  ranked: readonly RankedEntry[];
  /** Draw the median line (off for ranks and for very few places) */
  withMedian: boolean;
  selected: number | null;
}) {
  const colors = chartColors(useTheme());
  const order = rankOrder(focus);
  const { points, series, extra } = useMemo(() => {
    const picks = trendPicks(ranked, selected, TREND_PLACES);
    const places = picks.map((p) => ({
      index: p.index,
      name: dataset.entities[p.index].name,
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
        color: picks[k].selected
          ? colors.highlight
          : TREND_PALETTE[picks[k].slot % TREND_PALETTE.length],
        highlight: picks[k].selected,
      })),
    ];
    return {
      points: withMedian ? pts : pts.filter((p) => p.series !== medianLabel),
      series: s,
      // The selection is drawn on top of the top places rather than replacing one.
      extra: picks.some((p) => p.slot < 0),
    };
  }, [topic, dataset, focus, years, ranked, selected, withMedian, colors]);

  const top = Math.min(TREND_PLACES, ranked.length);
  const when = year != null ? `in ${year}` : 'on the latest figures';
  // A worst-first list's first places are its worst ones.
  const lead = order === 'worst-first' ? `The ${top} worst` : `The top ${top}`;
  return (
    <Card
      title={`Over time · ${years[0]}–${years[years.length - 1]}`}
      subtitle={`${lead} ${when}${extra ? ' and the highlighted place' : ''}${order != null ? '; rank 1 at the top' : withMedian ? ', against the median' : ''}.`}
    >
      <TrendChart
        points={points}
        series={series}
        years={years}
        label={focus.label}
        metric={focus}
        reversed={order != null}
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
                borderTop: `${s.highlight === true ? 3 : 2}px ${s.median === true ? 'dashed' : 'solid'} ${s.color}`,
              }}
            />
            <span
              className={s.highlight === true ? 'text-app font-medium' : ''}
            >
              {s.name}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
