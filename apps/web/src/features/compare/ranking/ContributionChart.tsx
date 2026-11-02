import {
  barX,
  colorLegend,
  colorLegendItems,
  defineChart,
  ruleX,
  text,
} from '@tanstack/charts';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scaleOrdinal } from '@tanstack/charts/scales/ordinal';
import { tooltip } from '@tanstack/charts/tooltip';
import { useMemo } from 'react';

import type { CompareViewProps } from '../state';
import { metricPalette } from './colors';
import { formatScore } from './model';
import type { RankingModel } from './useRanking';
import { midSentence } from './words';
import { Card } from '~/components/ui';
import { chartColors, useTheme } from '~/lib/theme';

const TOP = 15;
/** Metrics beyond this many are summed into one "Other" segment so colours stay distinguishable. */
const MAX_SERIES = 9;

interface ContributionDatum {
  key: string;
  /** Entity id (y category; tick labels map it to "rank. name") */
  place: string;
  series: string;
  /** Weighted contribution to the place's score */
  value: number;
  /** Percentile on this metric (null for the "Other" segment) */
  pct: number | null;
  /** Right end of the place's positive stack, where the score label goes */
  end: number;
  scoreLabel: string;
}

/** "crime-safety" → "Crime & Safety" (category ids are one word or an "a-b" pair). */
export function categoryLabel(id: string): string {
  if (id === '') return 'Uncategorised';
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' & ');
}

/** One coloured segment: a single metric, or several metrics summed (category / "Other"). */
interface Series {
  label: string;
  ks: number[];
  other: boolean;
}

// Up to MAX_SERIES + 1 metrics get a segment each. Bigger baskets are grouped by each metric's
// primary category (largest contribution first), with the smallest categories folded into
// "Other", so the chart still says what builds the score instead of 30 indistinct slivers.
function seriesFor(model: RankingModel, top: readonly number[]): Series[] {
  const { inputs, labels, metrics, base } = model;
  const active = inputs.flatMap((inp, k) => (inp.weight > 0 ? [k] : []));
  if (active.length <= MAX_SERIES + 1)
    return active.map((k) => ({
      label: labels.get(inputs[k].id) ?? `#${inputs[k].id}`,
      ks: [k],
      other: false,
    }));
  const groups = new Map<string, number[]>();
  for (const k of active) {
    const cat = metrics[k].cats[0] ?? '';
    groups.set(cat, [...(groups.get(cat) ?? []), k]);
  }
  const mass = (ks: readonly number[]) => {
    let s = 0;
    for (const k of ks)
      for (const i of top) {
        const c = base.composite.contributions[k][i];
        if (Number.isFinite(c)) s += Math.abs(c);
      }
    return s;
  };
  const sorted = [...groups]
    .map(([cat, ks]) => ({ cat, ks, mass: mass(ks) }))
    .sort((a, b) => b.mass - a.mass);
  const keep = sorted.length > MAX_SERIES + 1 ? MAX_SERIES : sorted.length;
  const out: Series[] = sorted.slice(0, keep).map((g) => ({
    label: `${categoryLabel(g.cat)} (${g.ks.length})`,
    ks: g.ks,
    other: false,
  }));
  const rest = sorted.slice(keep).flatMap((g) => g.ks);
  if (rest.length > 0)
    out.push({ label: `Other (${rest.length})`, ks: rest, other: true });
  return out;
}

/** Contribution rows for the top places plus the colour domain (series labels, "Other" last). */
function buildRows(model: RankingModel, dataset: CompareViewProps['dataset']) {
  const { base, inputs, stats, entityIdx, method } = model;
  const { contributions, score, rank } = base.composite;
  const top = base.order.slice(0, TOP);
  const series = seriesFor(model, top);
  const grouped = series.some((s) => s.ks.length > 1);

  const rows: ContributionDatum[] = [];
  const totals: ContributionDatum[] = [];
  const tickLabel = new Map<string, string>();
  for (const i of top) {
    const entity = dataset.entities[entityIdx[i]];
    const scoreLabel = formatScore(score[i], method);
    tickLabel.set(entity.id, `${rank[i]}. ${entity.name}`);
    const place: ContributionDatum[] = [];
    for (const s of series) {
      let value = 0;
      let has = false;
      for (const k of s.ks) {
        const c = contributions[k][i];
        if (!Number.isFinite(c)) continue;
        value += c;
        has = true;
      }
      if (!has) continue;
      const single = s.ks.length === 1 ? s.ks[0] : -1;
      place.push({
        key: `${entity.id}:${s.label}`,
        place: entity.id,
        series: s.label,
        value,
        pct: single >= 0 ? stats[single].pct[i] : null,
        end: 0,
        scoreLabel,
      });
    }
    const end = place.reduce((s, d) => s + Math.max(0, d.value), 0);
    for (const d of place) d.end = end;
    rows.push(...place);
    if (place.length > 0) totals.push(place[place.length - 1]);
  }
  return {
    rows,
    totals,
    domain: series.map((s) => s.label),
    others: new Set(series.filter((s) => s.other).map((s) => s.label)),
    grouped,
    metricCount: inputs.filter((i) => i.weight > 0).length,
    tickLabel,
    hasNegative: rows.some((d) => d.value < 0),
  };
}

/** Stacked horizontal bars: how much each metric adds to the top places' combined score. */
export function ContributionChart({
  props,
  model,
}: {
  props: CompareViewProps;
  model: RankingModel;
}) {
  const { dataset, search, update } = props;
  const theme = useTheme();
  const { method } = model;
  const hlKey = (search.hl ?? []).join(',');

  const built = useMemo(() => buildRows(model, dataset), [model, dataset]);

  const definition = useMemo(() => {
    const { rows, totals, domain, others, tickLabel, hasNegative } = built;
    const colors = chartColors(theme);
    const palette = metricPalette(theme);
    const hl = new Set(hlKey === '' ? [] : hlKey.split(','));
    const range = domain.map((label, i) =>
      others.has(label)
        ? palette.other
        : palette.series[i % palette.series.length]
    );
    const colorOf = new Map(domain.map((d, i) => [d, range[i]]));
    const places = [...tickLabel.keys()];
    const fmt = (v: number) =>
      method === 'zscore' ? v.toFixed(2) : v.toFixed(1);
    return defineChart({
      marks: [
        barX(rows, {
          y: 'place',
          x: 'value',
          color: 'series',
          key: 'key',
          inset: 0.5,
        }),
        ...(hasNegative
          ? [decorative(ruleX([0], { stroke: colors.muted }))]
          : []),
        decorative(
          text(totals, {
            y: 'place',
            x: 'end',
            text: 'scoreLabel',
            anchor: 'start',
            dx: 6,
            fontSize: 11,
            fontWeight: 600,
            fill: colors.text,
          })
        ),
      ],
      scales: {
        y: {
          scale: scaleBand<string>().domain(places).padding(0.22),
          axis: {
            ticks: {
              size: 0,
              format: (v: string) => tickLabel.get(v) ?? v,
            },
            tickLabels: {
              fontWeight: ({ value }) => (hl.has(value) ? 700 : undefined),
            },
          },
        },
        x: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: {
            label:
              method === 'zscore'
                ? 'Weighted contribution (z-score units)'
                : 'Weighted contribution to the 0–100 score',
            ticks: { count: 5 },
          },
        },
      },
      color: {
        scale: scaleOrdinal<string, string>().domain(domain).range(range),
        legend: colorLegend({
          placement: 'top',
          items: colorLegendItems({
            justify: 'start',
            gap: 14,
            rowGap: 6,
            indicator: { shape: 'square', width: 10, height: 10, gap: 6 },
            label: { fontSize: 11 },
          }),
        }),
      },
      margin: { right: 48 },
      focus: 'group-y',
      tooltip: {
        use: tooltip,
        content: (points) => {
          const first = points[0]?.datum;
          if (first == null) return { rows: [] };
          return {
            title: `${tickLabel.get(first.place) ?? first.place} · score ${first.scoreLabel}`,
            rows: points.map((p) => ({
              label: p.datum.series,
              value:
                p.datum.pct != null
                  ? `${fmt(p.datum.value)}  (pct ${Math.round(p.datum.pct)})`
                  : fmt(p.datum.value),
              color: colorOf.get(p.datum.series),
            })),
          };
        },
      },
    });
  }, [built, hlKey, theme, method]);

  const placeCount = built.tickLabel.size;
  if (placeCount === 0) return null;
  return (
    <Card
      title={`What builds the score · top ${placeCount}`}
      subtitle={
        built.grouped
          ? `Each bar is a place's combined score split into weighted contributions, grouped by category (count of metrics in brackets) across all ${built.metricCount} metrics. Click a bar to highlight that place.`
          : "Each bar is a place's combined score split into weighted metric contributions. Click a bar to highlight that place."
      }
    >
      <Chart
        definition={definition}
        height={placeCount * 26 + 70 + Math.ceil(built.domain.length / 3) * 18}
        ariaLabel={`Stacked bars of each metric's weighted contribution to the combined score for the top ${placeCount} ${midSentence(dataset.type.label)}`}
        onSelect={(p) => {
          if (p == null) return;
          const id = p.datum.place;
          update((s) => {
            const cur = s.hl ?? [];
            const next = cur.includes(id)
              ? cur.filter((x) => x !== id)
              : [...cur, id];
            return { hl: next.length > 0 ? next : undefined };
          });
        }}
      />
    </Card>
  );
}
