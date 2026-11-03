import { getRouteApi, Link } from '@tanstack/react-router';
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpWideNarrow,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Grid3x3,
  Map as MapIcon,
  Sparkles,
  Spline,
  Table2,
  Trophy,
  X,
} from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';

import { directionHint, typeNoun } from './polarity';
import { PopularMetricChips, PresetCards } from './QuickStart';
import { useBundles } from './ranking/BundlePicker';
import { ShareButton } from './ShareButton';
import {
  type CompareSearch,
  type CompareView,
  type CompareViewProps,
  cycleDirection,
  effectiveDirection,
  effectiveWeight,
  filteredEntities,
} from './state';
import { MapView } from './views/MapView';
import { MatrixView } from './views/MatrixView';
import { ParallelView } from './views/ParallelView';
import { RankingView } from './views/RankingView';
import { ScatterView } from './views/ScatterView';
import { TableView } from './views/TableView';
import { EntityPicker } from '~/components/EntityPicker';
import { Flag } from '~/components/Flag';
import { InfoTip } from '~/components/InfoTip';
import { MetricPicker } from '~/components/MetricPicker';
import { TypeTabs } from '~/components/TypeTabs';
import { Badge, cx, PageHeader } from '~/components/ui';
import {
  isIncomeLike,
  priceLevels,
  withCostAdjustment,
} from '~/data/costOfLiving';
import { useDataset } from '~/data/dataset';
import type { EntityType } from '~/data/types';
import type { GlossaryId } from '~/lib/glossary';

const route = getRouteApi('/compare');

/**
 * Glossary entry that explains a view, shown as an ⓘ after the view's hint. The ranking and
 * correlation views explain their terms on their own card titles instead.
 */
const VIEW_TERMS: Partial<Record<CompareView, GlossaryId>> = {
  scatter: 'overlay',
  parallel: 'rank-lines',
};

const VIEWS: {
  id: CompareView;
  label: string;
  icon: typeof BarChart3;
  hint: string;
  component: (p: CompareViewProps) => ReactNode;
}[] = [
  {
    id: 'scatter',
    label: 'Overlay',
    icon: BarChart3,
    hint: 'Plot two metrics against each other',
    component: ScatterView,
  },
  {
    id: 'ranking',
    label: 'Combined ranking',
    icon: Trophy,
    hint: 'Layer metrics into one score to see who ranks #1',
    component: RankingView,
  },
  {
    id: 'matrix',
    label: 'Correlations',
    icon: Grid3x3,
    hint: 'Which metrics move together, and what stands out',
    component: MatrixView,
  },
  {
    id: 'parallel',
    label: 'Rank lines',
    icon: Spline,
    hint: 'Follow each place across every metric',
    component: ParallelView,
  },
  {
    id: 'table',
    label: 'Table',
    icon: Table2,
    hint: 'Every selected metric side by side',
    component: TableView,
  },
  {
    id: 'map',
    label: 'Map',
    icon: MapIcon,
    hint: 'See a metric or the combined score geographically',
    component: MapView,
  },
];

export function CompareShell() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const dataset = useDataset(search.type);

  // Discrete changes push a history entry so Back undoes them; callers pass `replace` for
  // sliders, typing and automatic URL normalisation.
  const update = useCallback<CompareViewProps['update']>(
    (patch, options) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          ...(typeof patch === 'function' ? patch(prev) : patch),
        }),
        replace: options?.replace === true,
        resetScroll: false,
      });
    },
    [navigate]
  );

  // A `bundle` link fills an empty basket with that bundle's metrics, then drops the param
  // (replacing the entry, so Back skips the intermediate URL). Unknown or empty bundles for this
  // place type just clear it.
  const bundles = useBundles(dataset);
  useEffect(() => {
    if (search.bundle == null) return;
    const b = bundles.find((x) => x.id === search.bundle);
    update(
      b != null && b.metricIds.length > 0 && search.m.length === 0
        ? { m: b.metricIds, bundle: undefined }
        : { bundle: undefined },
      { replace: true }
    );
  }, [search.bundle, search.m.length, bundles, update]);

  const metrics = useMemo(
    () => search.m.map((id) => dataset.metric(id)).filter((m) => m != null),
    [search.m, dataset]
  );
  const entityIdx = useMemo(
    () => filteredEntities(dataset, search),
    [dataset, search]
  );
  const direction = useCallback(
    (id: number) => effectiveDirection(search, dataset.metric(id)),
    [search, dataset]
  );
  const weight = useCallback(
    (id: number) => effectiveWeight(search, id),
    [search]
  );
  const addMetric = useCallback(
    (id: number) =>
      update((s) => ({ m: s.m.includes(id) ? s.m : [...s.m, id] })),
    [update]
  );
  const removeMetric = useCallback(
    (id: number) =>
      update((s) => {
        const w = { ...(s.w ?? {}) };
        const d = { ...(s.d ?? {}) };
        const fl = { ...(s.fl ?? {}) };
        delete w[String(id)];
        delete d[String(id)];
        delete fl[String(id)];
        return {
          m: s.m.filter((x) => x !== id),
          x: s.x === id ? undefined : s.x,
          y: s.y === id ? undefined : s.y,
          r: s.r === id ? undefined : s.r,
          c: s.c === id ? undefined : s.c,
          f: s.f === id ? undefined : s.f,
          w,
          d,
          fl: Object.keys(fl).length > 0 ? fl : undefined,
        };
      }),
    [update]
  );

  // With ?col every view reads wages and incomes at the US-average price level.
  const adjusted = useMemo(
    () =>
      search.col === true && priceLevels(dataset) != null
        ? withCostAdjustment(dataset)
        : dataset,
    [search.col, dataset]
  );
  const props: CompareViewProps = {
    dataset: adjusted,
    search,
    metrics,
    entityIdx,
    direction,
    weight,
    update,
    addMetric,
    removeMetric,
  };
  const active = VIEWS.find((v) => v.id === search.view) ?? VIEWS[0];
  const activeTerm = VIEW_TERMS[active.id];
  const View = active.component;
  // Below the lg breakpoint the metric, filter and highlight cards collapse behind a summary
  // bar so the chart comes first. While the basket is empty they stay open, but below the
  // onboarding panel, so a first visit on a phone sees the ready-made questions first.
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();
  const showPanel = panelOpen || metrics.length === 0;

  // A new place type has different metric ids, so start a fresh basket.
  const switchType = (type: EntityType) => {
    void navigate({ search: { type, view: search.view, m: [] } });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Compare"
        title="Overlay, combine and rank"
        subtitle="Pick any metrics, then switch views to plot them together, build a combined score, or find what correlates."
        actions={
          <>
            <TypeTabs value={search.type} onChange={switchType} compact />
            <ShareButton />
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-6">
        {metrics.length > 0 ? (
          <PanelToggle
            {...props}
            open={panelOpen}
            controls={panelId}
            onToggle={() => setPanelOpen((o) => !o)}
          />
        ) : null}
        <aside
          id={panelId}
          className={cx(
            'content-start gap-4 sm:grid-cols-2 lg:grid lg:grid-cols-1',
            showPanel ? 'grid' : 'hidden'
          )}
        >
          <Basket {...props} />
          <GroupFilter {...props} />
          <Highlights {...props} />
        </aside>
        <div
          className={cx(
            'min-w-0',
            metrics.length === 0 && 'max-lg:order-first'
          )}
        >
          <div
            role="tablist"
            aria-label="Comparison view"
            className="border-app bg-surface-2 mb-3 flex gap-1 overflow-x-auto rounded-xl border p-1"
          >
            {VIEWS.map((v) => (
              <button
                key={v.id}
                role="tab"
                type="button"
                aria-selected={v.id === active.id}
                title={v.hint}
                onClick={() => update({ view: v.id })}
                className={cx(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
                  v.id === active.id
                    ? 'bg-surface text-app shadow-sm'
                    : 'text-muted hover:text-app'
                )}
              >
                <v.icon className="size-4" aria-hidden />
                {v.label}
              </button>
            ))}
          </div>
          {metrics.length === 0 ? (
            <Onboarding {...props} />
          ) : (
            <>
              <p className="text-muted mb-4 flex items-center gap-1.5 text-sm">
                {active.hint}
                {activeTerm != null ? <InfoTip term={activeTerm} /> : null}
              </p>
              <View {...props} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** First-run panel: preset questions and popular metrics for the current type. */
function Onboarding({ dataset, addMetric }: CompareViewProps) {
  return (
    <section className="card overflow-hidden">
      <div className="border-app from-accent-50 dark:from-accent-900/30 border-b bg-gradient-to-br to-transparent px-5 py-5">
        <div className="text-accent-700 dark:text-accent-300 mb-1 inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <Sparkles className="size-3.5" aria-hidden /> Start a comparison
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          What do you want to find out about {typeNoun(dataset.type.label)}?
        </h2>
        <p className="text-muted mt-1 max-w-2xl text-sm">
          Open a ready-made question, or add metrics to the basket. Every view
          works from the same basket, and the URL captures the whole comparison
          so you can share it.
        </p>
      </div>
      <div className="space-y-5 p-5">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Ready-made questions</h3>
          <PresetCards dataset={dataset} />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">
            Or start from a popular metric
          </h3>
          <PopularMetricChips dataset={dataset} onAdd={addMetric} limit={10} />
        </div>
      </div>
    </section>
  );
}

/**
 * Phone and tablet summary of the side panel: which metrics, filters and highlights are active,
 * and a button that shows or hides the full cards. Hidden from the lg breakpoint up, where the
 * cards always sit beside the chart.
 */
function PanelToggle({
  metrics,
  search,
  open,
  controls,
  onToggle,
}: CompareViewProps & {
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const extras = [
    search.g != null && search.g.length > 0
      ? `only ${search.g.join(', ')}`
      : null,
    search.hl != null && search.hl.length > 0
      ? `${search.hl.length} highlighted`
      : null,
  ].filter((s) => s != null);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className="card hover:bg-surface-2 flex w-full items-center gap-3 px-4 py-3 text-left lg:hidden"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          Metrics{' '}
          <span className="text-muted font-normal">({metrics.length})</span>
          {extras.length > 0 ? (
            <span className="text-muted font-normal">
              {' '}
              · {extras.join(' · ')}
            </span>
          ) : null}
        </span>
        <span className="text-muted line-clamp-2 text-xs">
          {metrics.map((m) => m.label).join(' · ')}
        </span>
      </span>
      <span className="text-accent-700 dark:text-accent-300 inline-flex shrink-0 items-center gap-1 text-xs font-medium">
        {open ? 'Hide' : 'Edit'}
        <ChevronDown
          className={cx('size-4 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </span>
    </button>
  );
}

/** Share of the filtered places with a value for each basket metric. */
function useCoverage(
  dataset: CompareViewProps['dataset'],
  metrics: CompareViewProps['metrics'],
  entityIdx: readonly number[]
): Map<number, number> {
  return useMemo(() => {
    const out = new Map<number, number>();
    for (const m of metrics) {
      const col = dataset.numeric(m.id);
      let n = 0;
      for (const i of entityIdx) if (!Number.isNaN(col[i])) n++;
      out.set(m.id, n);
    }
    return out;
  }, [dataset, metrics, entityIdx]);
}

function Basket({
  dataset,
  search,
  metrics,
  entityIdx,
  addMetric,
  removeMetric,
  update,
}: CompareViewProps) {
  const total = entityIdx.length;
  const coverage = useCoverage(dataset, metrics, entityIdx);
  const noun = typeNoun(dataset.type.label);

  // Swap a metric with its neighbour; unknown ids are dropped on the way.
  const move = (id: number, delta: -1 | 1) =>
    update((s) => {
      const m = s.m.filter((x) => dataset.metric(x) != null);
      const i = m.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= m.length) return {};
      [m[i], m[j]] = [m[j], m[i]];
      return { m };
    });

  return (
    <section className="card p-4 sm:col-span-2 lg:col-span-1">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1 text-sm font-semibold">
          Metrics
          {metrics.length > 0 ? (
            <span className="text-muted font-normal">({metrics.length})</span>
          ) : null}
          <InfoTip term="direction" />
        </h2>
        {metrics.length > 0 ? (
          <button
            type="button"
            className="text-muted hover:text-app text-xs"
            onClick={() =>
              update({
                m: [],
                x: undefined,
                y: undefined,
                r: undefined,
                c: undefined,
                w: undefined,
                d: undefined,
                f: undefined,
                fl: undefined,
                log: undefined,
              })
            }
          >
            Clear all
          </button>
        ) : null}
      </div>
      {metrics.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {metrics.map((m, i) => {
            const hint = directionHint(search, m);
            const covered = coverage.get(m.id) ?? 0;
            const share = total > 0 ? covered / total : 0;
            return (
              <li
                key={m.id}
                className="group border-app bg-surface flex items-start gap-1.5 rounded-lg border p-2"
              >
                <button
                  type="button"
                  title={`${hint.label} (${hint.action})`}
                  aria-label={`${m.label}: ${hint.label.toLowerCase()}, ${hint.action}`}
                  onClick={() => update((s) => ({ d: cycleDirection(s.d, m) }))}
                  className="hover:bg-surface-2 mt-0.5 shrink-0 rounded p-0.5"
                >
                  {hint.side === 0 ? (
                    <ArrowUpDown className="text-muted size-4" />
                  ) : hint.side === 1 ? (
                    <ArrowUpWideNarrow className="text-good size-4" />
                  ) : (
                    <ArrowDownWideNarrow className="text-bad size-4" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  {m.topics[0] != null ? (
                    <Link
                      to="/topics/$type/$slug"
                      params={{ type: dataset.type.id, slug: m.topics[0] }}
                      search={{ m: m.id }}
                      className="block text-sm leading-snug font-medium hover:underline"
                      title={`${dataset.metricFullLabel(m.id)} — open topic`}
                    >
                      {m.label}
                    </Link>
                  ) : (
                    <div className="text-sm leading-snug font-medium">
                      {m.label}
                    </div>
                  )}
                  <div
                    className="text-muted truncate text-xs"
                    title={dataset.metricContext(m.id) ?? undefined}
                  >
                    {dataset.metricContext(m.id) ?? m.cats.join(', ')}
                    {m.year != null ? ` · ${m.year}` : ''}
                  </div>
                  <div
                    className="mt-1.5 flex items-center gap-2"
                    title={`${covered} of ${total} ${noun} have data`}
                  >
                    <div
                      className="bg-surface-2 h-1.5 flex-1 overflow-hidden rounded-full"
                      role="meter"
                      aria-label={`${m.label} coverage`}
                      aria-valuemin={0}
                      aria-valuemax={total}
                      aria-valuenow={covered}
                    >
                      <div
                        className={cx(
                          'h-full rounded-full',
                          share >= 0.8
                            ? 'bg-accent-500'
                            : share >= 0.5
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                        )}
                        style={{ width: `${Math.round(share * 100)}%` }}
                      />
                    </div>
                    <span className="tabular text-muted shrink-0 text-[11px]">
                      {covered}/{total}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-center">
                  <button
                    type="button"
                    aria-label={`Move ${m.label} up`}
                    title="Move up"
                    disabled={i === 0}
                    onClick={() => move(m.id, -1)}
                    className="text-muted hover:bg-surface-2 hover:text-app rounded p-0.5 disabled:opacity-25"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${m.label} down`}
                    title="Move down"
                    disabled={i === metrics.length - 1}
                    onClick={() => move(m.id, 1)}
                    className="text-muted hover:bg-surface-2 hover:text-app rounded p-0.5 disabled:opacity-25"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${m.label}`}
                  title="Remove"
                  onClick={() => removeMetric(m.id)}
                  className="text-muted hover:bg-surface-2 hover:text-app shrink-0 rounded p-0.5"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <MetricPicker
        dataset={dataset}
        onSelect={addMetric}
        exclude={search.m}
        placeholder={
          metrics.length === 0 ? 'Add a metric' : 'Add another metric'
        }
      />
      {metrics.length === 0 ? (
        <p className="text-muted mt-3 text-xs">
          Search thousands of {noun} metrics — try “income”, “education”,
          “crime” or “happiness”.
        </p>
      ) : null}
      <CostToggle
        dataset={dataset}
        search={search}
        metrics={metrics}
        update={update}
      />
    </section>
  );
}

/**
 * "Adjust wages and incomes for cost of living", shown when the basket holds a wage or income
 * and the place type has price levels. Lists which basket metrics it changes.
 */
function CostToggle({
  dataset,
  search,
  metrics,
  update,
}: Pick<CompareViewProps, 'dataset' | 'search' | 'metrics' | 'update'>) {
  const prices = priceLevels(dataset);
  const income = metrics.filter(isIncomeLike);
  if (prices == null || income.length === 0) return null;
  return (
    <div className="border-app mt-3 border-t pt-3 text-xs">
      <span className="inline-flex items-center gap-1">
        <label className="inline-flex cursor-pointer items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={search.col === true}
            onChange={(e) =>
              update({ col: e.target.checked ? true : undefined })
            }
            className="accent-accent-600"
          />
          <span>
            Adjust for cost of living
            {prices.year != null ? (
              <span className="text-muted font-normal">
                {' '}
                ({prices.year} prices)
              </span>
            ) : null}
          </span>
        </label>
        <InfoTip term="cost-of-living" />
      </span>
      {search.col === true ? (
        <p className="text-muted mt-1">
          Adjusted: {income.map((m) => m.label).join(', ')}
        </p>
      ) : null}
    </div>
  );
}

function GroupFilter({ dataset, search, update }: CompareViewProps) {
  if (dataset.groups.length < 2 || dataset.groups.length > 12) return null;
  const selected = new Set(search.g ?? []);
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Filter</h2>
        {selected.size > 0 ? (
          <button
            type="button"
            className="text-muted hover:text-app text-xs"
            onClick={() => update({ g: undefined })}
          >
            Show all
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {dataset.groups.map((g) => {
          const on = selected.has(g);
          return (
            <button
              key={g}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = new Set(selected);
                if (on) next.delete(g);
                else next.add(g);
                update({ g: next.size > 0 ? [...next] : undefined });
              }}
              className={cx(
                'rounded-full border px-2.5 py-0.5 text-xs',
                on
                  ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-900/40 dark:text-accent-200'
                  : 'border-app text-muted hover:text-app'
              )}
            >
              {g}
            </button>
          );
        })}
      </div>
      <p className="text-muted mt-2 text-xs">
        {selected.size > 0
          ? `Showing only ${[...selected].join(', ')}.`
          : 'Showing every region. Pick one or more to narrow down.'}
      </p>
    </section>
  );
}

function Highlights({ dataset, search, update }: CompareViewProps) {
  const hl = search.hl ?? [];
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Highlight</h2>
        {hl.length > 0 ? (
          <button
            type="button"
            className="text-muted hover:text-app text-xs"
            onClick={() => update({ hl: undefined })}
          >
            Clear
          </button>
        ) : null}
      </div>
      {hl.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {hl.map((id) => {
            const i = dataset.entityIndex.get(id);
            if (i == null) return null;
            const e = dataset.entities[i];
            return (
              <Badge key={id} tone="accent">
                <Flag entity={e} type={dataset.type.id} size={14} />
                <Link
                  to="/places/$type/$slug"
                  params={{ type: dataset.type.id, slug: e.slug }}
                  className="hover:underline"
                >
                  {e.name}
                </Link>
                <button
                  type="button"
                  aria-label={`Remove ${e.name}`}
                  onClick={() => {
                    const next = hl.filter((x) => x !== id);
                    update({ hl: next.length > 0 ? next : undefined });
                  }}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      ) : (
        <p className="text-muted mb-2 text-xs">
          Mark places to follow them across every view (or click a dot).
        </p>
      )}
      <EntityPicker
        dataset={dataset}
        exclude={hl}
        onSelect={(id) => update({ hl: [...hl, id] })}
      />
    </section>
  );
}

export type { CompareSearch };
