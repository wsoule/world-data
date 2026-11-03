import { Link, useNavigate } from '@tanstack/react-router';
import type { Normalization } from '@world-data/stats';
import { MapIcon, Trophy } from 'lucide-react';
import { useMemo } from 'react';

import {
  COMBINED_FOCUS,
  combinedScore,
  maskColumn,
  NORMALIZATION_LABELS,
  NORMALIZATIONS,
  type RankedRow,
  topAndBottom,
} from '../map/combined';
import { polarityFor, typeNoun } from '../polarity';
import type { CompareViewProps } from '../state';
import { useMediaQuery } from '../useMediaQuery';
import { Choropleth, type ColorScheme } from '~/charts/Choropleth';
import { EmptyState } from '~/components/feedback';
import { Flag } from '~/components/Flag';
import { Card, cx, Select } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import type { Metric, Polarity } from '~/data/types';
import { formatValue, ordinal } from '~/lib/format';

/** Everything one map needs: values, colours, formatting and wording. */
interface MapLayer {
  key: number;
  label: string;
  subtitle: string;
  values: Float64Array;
  /** Better side for the map colours: the 'score' ramp turns green towards it */
  polarity: Polarity;
  scheme: ColorScheme;
  /** Ranking direction for the top / bottom lists */
  direction: 1 | -1;
  format: (v: number) => string;
  formatLong: (v: number) => string;
  /** Headings for the best / worst lists */
  bestLabel: string;
  worstLabel: string;
}

const COVERAGE_OPTIONS = [
  { value: '0', label: 'Any data' },
  { value: '0.25', label: '≥ 25% of weight' },
  { value: '0.5', label: '≥ 50% of weight' },
  { value: '0.75', label: '≥ 75% of weight' },
  { value: '1', label: 'All metrics' },
] as const;

/** Small-multiple tiles get expensive with thousands of county shapes. */
const MAX_TILES = { county: 4, default: 9 } as const;

function metricLayer(
  dataset: Dataset,
  m: Metric,
  entityIdx: readonly number[],
  polarity: Polarity,
  direction: 1 | -1
): MapLayer {
  // Units such as "per 100k pop." go in the label once instead of after
  // every value, which keeps the ranked lists readable.
  const unit = m.unit != null && !/[$%°]/.test(m.unit) ? m.unit.trim() : '';
  const values = maskColumn(dataset.numeric(m.id), entityIdx);
  const format = (v: number) =>
    formatValue(m, v, { compact: true, unit: false });
  // Every tile with a better side uses the same red (worse) to green (better) ramp, so a colour
  // means the same thing side by side; the choropleth reverses it for a lower-is-better metric
  // and lists that legend from the highest value, so it still reads worst to best.
  return {
    key: m.id,
    label: unit !== '' ? `${m.label} (${unit})` : m.label,
    subtitle: [
      dataset.metricContext(m.id),
      m.year != null ? String(m.year) : null,
    ]
      .filter((s) => s != null)
      .join(' · '),
    values,
    polarity,
    scheme: polarity === 0 ? 'auto' : 'score',
    direction,
    format,
    formatLong: (v) => formatValue(m, v),
    bestLabel: polarity === 0 ? 'Highest' : 'Best',
    worstLabel: polarity === 0 ? 'Lowest' : 'Worst',
  };
}

/**
 * Map view: one metric or the combined score on a choropleth, ranked best and
 * worst lists beside it, and a small multiple of every basket metric so
 * geographic patterns can be compared at a glance.
 */
export function MapView({
  dataset,
  search,
  metrics,
  entityIdx,
  direction,
  weight,
  update,
}: CompareViewProps) {
  const navigate = useNavigate();
  const narrow = useMediaQuery('(max-width: 640px)');
  const canCombine = metrics.length >= 2;
  const norm: Normalization = search.norm ?? 'percentile';
  const cov = search.cov ?? 0.5;

  const focus =
    search.f === COMBINED_FOCUS && canCombine
      ? COMBINED_FOCUS
      : (metrics.find((m) => m.id === search.f)?.id ??
        (canCombine ? COMBINED_FOCUS : metrics[0]?.id));

  const layers = useMemo(
    () =>
      metrics.map((m) =>
        metricLayer(
          dataset,
          m,
          entityIdx,
          polarityFor(search, m),
          direction(m.id)
        )
      ),
    [dataset, metrics, entityIdx, search, direction]
  );

  const combined = useMemo((): MapLayer | null => {
    if (!canCombine) return null;
    const { score } = combinedScore(
      layers.map((l) => ({
        values: l.values,
        direction: l.direction,
        weight: weight(l.key),
      })),
      dataset.entities.length,
      norm,
      cov
    );
    const z = norm === 'zscore';
    const fmt = (v: number) =>
      z
        ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`
        : v.toFixed(0);
    return {
      key: COMBINED_FOCUS,
      label: 'Combined score',
      subtitle: `${metrics.length} metrics · ${NORMALIZATION_LABELS[norm].toLowerCase()} · higher is better`,
      values: score,
      polarity: 1,
      scheme: 'score',
      direction: 1,
      format: fmt,
      formatLong: (v) => (z ? fmt(v) : `${fmt(v)} / 100`),
      bestLabel: 'Top',
      worstLabel: 'Bottom',
    };
  }, [canCombine, layers, weight, dataset, norm, cov, metrics.length]);

  if (metrics.length === 0 || focus == null)
    return (
      <EmptyState
        title="Add a metric to map it"
        icon={<MapIcon className="text-muted size-8" aria-hidden />}
      />
    );

  const active =
    focus === COMBINED_FOCUS && combined != null
      ? combined
      : (layers.find((l) => l.key === focus) ?? layers[0]);
  const openPlace = (i: number) =>
    void navigate({
      to: '/places/$type/$slug',
      params: { type: dataset.type.id, slug: dataset.entities[i].slug },
    });
  // World maps are about twice as wide as tall; US maps are squarer.
  const world =
    dataset.type.id === 'country' || dataset.type.id === 'world-city';
  const mapHeight = world ? (narrow ? 210 : 340) : narrow ? 250 : 420;
  const tileLimit =
    dataset.type.id === 'county' ? MAX_TILES.county : MAX_TILES.default;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-3 p-3 sm:p-4">
        <div
          role="radiogroup"
          aria-label="Map focus"
          className="flex min-w-0 flex-1 flex-wrap gap-1.5"
        >
          {combined != null ? (
            <FocusChip
              active={active.key === COMBINED_FOCUS}
              onClick={() => update({ f: COMBINED_FOCUS })}
            >
              <Trophy className="size-3.5" aria-hidden /> Combined score
            </FocusChip>
          ) : null}
          {metrics.map((m) => (
            <FocusChip
              key={m.id}
              active={active.key === m.id}
              onClick={() => update({ f: m.id })}
            >
              {m.label}
            </FocusChip>
          ))}
        </div>
        {active.key === COMBINED_FOCUS ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="text-muted flex items-center gap-1.5">
              Scale
              <Select
                ariaLabel="Normalization"
                value={norm}
                options={NORMALIZATIONS.map((n) => ({
                  value: n,
                  label: NORMALIZATION_LABELS[n],
                }))}
                onChange={(n) =>
                  update({ norm: n === 'percentile' ? undefined : n })
                }
              />
            </label>
            <label className="text-muted flex items-center gap-1.5">
              Needs
              <Select
                ariaLabel="Minimum coverage"
                value={String(cov)}
                options={COVERAGE_OPTIONS}
                onChange={(v) => {
                  const n = Number(v);
                  update({ cov: n === 0.5 ? undefined : n });
                }}
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <Card
          title={active.label}
          subtitle={
            active.key === COMBINED_FOCUS ? (
              <>
                {active.subtitle}. Directions and weights come from the basket;
                fine-tune them in{' '}
                <button
                  type="button"
                  className="text-accent-600 dark:text-accent-300 underline"
                  onClick={() => update({ view: 'ranking' })}
                >
                  Combined ranking
                </button>
                .
              </>
            ) : (
              active.subtitle
            )
          }
        >
          <Choropleth
            dataset={dataset}
            values={active.values}
            format={active.format}
            label={active.label}
            polarity={active.polarity}
            scheme={active.scheme}
            highlight={search.hl}
            onSelect={openPlace}
            height={mapHeight}
          />
        </Card>
        <RankedLists dataset={dataset} layer={active} />
      </div>

      {metrics.length >= 2 ? (
        <section aria-label="Every metric, side by side">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <h2 className="text-sm font-semibold">Side by side</h2>
            <p className="text-muted text-xs">
              Click a title to focus it. On every map green is better and red is
              worse; blue marks metrics with no better side (darker = higher).
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {[...(combined != null ? [combined] : []), ...layers]
              .slice(0, tileLimit)
              .map((l) => (
                <div
                  key={l.key}
                  className={cx(
                    'card min-w-0 p-3',
                    l.key === active.key && 'ring-accent-500 ring-2'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => update({ f: l.key })}
                    aria-pressed={l.key === active.key}
                    className="hover:text-accent-700 dark:hover:text-accent-300 mb-1 block w-full truncate text-left text-sm font-medium"
                    title={`Focus ${l.label}`}
                  >
                    {l.label}
                  </button>
                  <Choropleth
                    dataset={dataset}
                    values={l.values}
                    format={l.format}
                    label={l.label}
                    polarity={l.polarity}
                    scheme={l.scheme}
                    highlight={search.hl}
                    onSelect={openPlace}
                    height={200}
                  />
                </div>
              ))}
          </div>
          {metrics.length + 1 > tileLimit ? (
            <p className="text-muted mt-2 text-xs">
              Showing the first {tileLimit} maps; reorder the basket to change
              which appear.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function FocusChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cx(
        'inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-3 py-1 text-sm transition-colors',
        active
          ? 'border-accent-500 bg-accent-600 text-white'
          : 'border-app bg-surface text-muted hover:text-app'
      )}
    >
      {children}
    </button>
  );
}

/** Best and worst ten places for the focused layer, each linking to its profile. */
function RankedLists({
  dataset,
  layer,
}: {
  dataset: Dataset;
  layer: MapLayer;
}) {
  const { top, bottom, count } = useMemo(
    () => topAndBottom(layer.values, layer.direction, 10),
    [layer]
  );
  if (count === 0)
    return (
      <Card title="Ranking">
        <p className="text-muted text-sm">
          No {typeNoun(dataset.type.label)} have data for this yet.
        </p>
      </Card>
    );
  const lo = Math.min(
    ...top.map((r) => r.value),
    ...bottom.map((r) => r.value)
  );
  const hi = Math.max(
    ...top.map((r) => r.value),
    ...bottom.map((r) => r.value)
  );
  return (
    <Card
      title={`Ranking of ${count} ${typeNoun(dataset.type.label)}`}
      subtitle={layer.label}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <RankList
          title={`${layer.bestLabel} 10`}
          rows={top}
          dataset={dataset}
          layer={layer}
          lo={lo}
          hi={hi}
          tone="good"
        />
        {bottom.length > 0 ? (
          <RankList
            title={`${layer.worstLabel} ${bottom.length}`}
            rows={bottom}
            dataset={dataset}
            layer={layer}
            lo={lo}
            hi={hi}
            tone="bad"
          />
        ) : null}
      </div>
    </Card>
  );
}

function RankList({
  title,
  rows,
  dataset,
  layer,
  lo,
  hi,
  tone,
}: {
  title: string;
  rows: RankedRow[];
  dataset: Dataset;
  layer: MapLayer;
  lo: number;
  hi: number;
  tone: 'good' | 'bad';
}) {
  const span = hi > lo ? hi - lo : 1;
  return (
    <div className="min-w-0">
      <h3
        className={cx(
          'mb-1.5 text-xs font-semibold tracking-wide uppercase',
          layer.polarity === 0
            ? 'text-muted'
            : tone === 'good'
              ? 'text-good'
              : 'text-bad'
        )}
      >
        {title}
      </h3>
      <ol className="space-y-0.5">
        {rows.map((r) => {
          const e = dataset.entities[r.idx];
          // Bar length follows the ranking direction so longer always means "more first".
          const t = (r.value - lo) / span;
          const share = layer.direction === 1 ? t : 1 - t;
          return (
            <li key={e.id}>
              <Link
                to="/places/$type/$slug"
                params={{ type: dataset.type.id, slug: e.slug }}
                className="hover:bg-surface-2 relative flex items-center gap-2 overflow-hidden rounded-md px-1.5 py-1 text-sm"
                title={`${e.name}: ${layer.formatLong(r.value)} (${ordinal(r.rank)})`}
              >
                <span
                  className="bg-accent-500/10 dark:bg-accent-400/15 absolute inset-y-0.5 left-0 rounded"
                  style={{ width: `${Math.max(4, share * 100)}%` }}
                  aria-hidden
                />
                <span className="tabular text-muted relative min-w-6 shrink-0 text-right text-xs">
                  {r.rank}
                </span>
                <Flag
                  entity={e}
                  type={dataset.type.id}
                  size={16}
                  className="relative"
                />
                <span className="relative min-w-0 flex-1 truncate">
                  {e.name}
                </span>
                <span className="tabular relative shrink-0 text-xs font-medium">
                  {layer.format(r.value)}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
