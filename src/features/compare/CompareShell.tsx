import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowDownWideNarrow, ArrowUpWideNarrow, BarChart3, Grid3x3, Map as MapIcon, Spline, Table2, Trophy, X } from 'lucide-react'
import { useCallback, useMemo, type ReactNode } from 'react'
import { EntityPicker } from '~/components/EntityPicker'
import { Flag } from '~/components/Flag'
import { MetricPicker } from '~/components/MetricPicker'
import { TypeTabs } from '~/components/TypeTabs'
import { Badge, PageHeader, cx } from '~/components/ui'
import { useDataset } from '~/data/dataset'
import type { EntityType } from '~/data/types'
import { useTitle } from '~/lib/useTitle'
import { effectiveDirection, effectiveWeight, filteredEntities, type CompareSearch, type CompareView, type CompareViewProps } from './state'
import { MapView } from './views/MapView'
import { MatrixView } from './views/MatrixView'
import { ParallelView } from './views/ParallelView'
import { RankingView } from './views/RankingView'
import { ScatterView } from './views/ScatterView'
import { TableView } from './views/TableView'

const route = getRouteApi('/compare')

const VIEWS: { id: CompareView; label: string; icon: typeof BarChart3; hint: string; component: (p: CompareViewProps) => ReactNode }[] = [
  { id: 'scatter', label: 'Overlay', icon: BarChart3, hint: 'Plot two metrics against each other', component: ScatterView },
  { id: 'ranking', label: 'Combined ranking', icon: Trophy, hint: 'Layer metrics into one score to see who ranks #1', component: RankingView },
  { id: 'matrix', label: 'Correlations', icon: Grid3x3, hint: 'Which metrics move together, and what stands out', component: MatrixView },
  { id: 'parallel', label: 'Rank lines', icon: Spline, hint: 'Follow each place across every metric', component: ParallelView },
  { id: 'table', label: 'Table', icon: Table2, hint: 'Every selected metric side by side', component: TableView },
  { id: 'map', label: 'Map', icon: MapIcon, hint: 'See a metric or the combined score geographically', component: MapView },
]

export function CompareShell() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const dataset = useDataset(search.type)
  useTitle('Compare')

  const update = useCallback<CompareViewProps['update']>(
    (patch) => {
      void navigate({ search: (prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }), replace: true, resetScroll: false })
    },
    [navigate],
  )

  const metrics = useMemo(() => search.m.map((id) => dataset.metric(id)).filter((m) => m != null), [search.m, dataset])
  const entityIdx = useMemo(() => filteredEntities(dataset, search), [dataset, search])
  const direction = useCallback((id: number) => effectiveDirection(search, dataset.metric(id)), [search, dataset])
  const weight = useCallback((id: number) => effectiveWeight(search, id), [search])
  const addMetric = useCallback((id: number) => update((s) => ({ m: s.m.includes(id) ? s.m : [...s.m, id] })), [update])
  const removeMetric = useCallback(
    (id: number) =>
      update((s) => {
        const w = { ...(s.w ?? {}) }
        const d = { ...(s.d ?? {}) }
        delete w[String(id)]
        delete d[String(id)]
        return { m: s.m.filter((x) => x !== id), x: s.x === id ? undefined : s.x, y: s.y === id ? undefined : s.y, r: s.r === id ? undefined : s.r, c: s.c === id ? undefined : s.c, f: s.f === id ? undefined : s.f, w, d }
      }),
    [update],
  )

  const props: CompareViewProps = { dataset, search, metrics, entityIdx, direction, weight, update, addMetric, removeMetric }
  const active = VIEWS.find((v) => v.id === search.view) ?? VIEWS[0]
  const View = active.component

  const switchType = (type: EntityType) => {
    void navigate({ search: { type, view: search.view, m: [] } })
  }

  return (
    <div>
      <PageHeader
        eyebrow="Compare"
        title="Overlay, combine and rank"
        subtitle="Pick any metrics, then switch views to plot them together, build a combined score, or find what correlates."
        actions={<TypeTabs value={search.type} onChange={switchType} compact />}
      />
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Basket {...props} />
          <GroupFilter {...props} />
          <Highlights {...props} />
        </aside>
        <div className="min-w-0">
          <div role="tablist" aria-label="Comparison view" className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-app bg-surface-2 p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                role="tab"
                type="button"
                aria-selected={v.id === active.id}
                title={v.hint}
                onClick={() => update({ view: v.id })}
                className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', v.id === active.id ? 'bg-surface text-app shadow-sm' : 'text-muted hover:text-app')}
              >
                <v.icon className="size-4" aria-hidden />
                {v.label}
              </button>
            ))}
          </div>
          <p className="mb-4 text-sm text-muted">{active.hint}</p>
          <View {...props} />
        </div>
      </div>
    </div>
  )
}

function Basket({ dataset, search, metrics, direction, addMetric, removeMetric, update }: CompareViewProps) {
  const total = dataset.entities.length
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Metrics</h2>
        {metrics.length ? (
          <button type="button" className="text-xs text-muted hover:text-app" onClick={() => update({ m: [], x: undefined, y: undefined, r: undefined, c: undefined, w: undefined, d: undefined, f: undefined })}>
            Clear all
          </button>
        ) : null}
      </div>
      <ul className="mb-3 space-y-2">
        {metrics.map((m) => {
          const dir = direction(m.id)
          return (
            <li key={m.id} className="group flex items-start gap-2 rounded-lg border border-app p-2">
              <button
                type="button"
                title={dir === 1 ? 'Higher is better (click to flip)' : 'Lower is better (click to flip)'}
                aria-label={dir === 1 ? 'Higher is better, click to flip' : 'Lower is better, click to flip'}
                onClick={() => update((s) => ({ d: { ...(s.d ?? {}), [String(m.id)]: dir === 1 ? -1 : 1 } }))}
                className="mt-0.5 rounded p-0.5 hover:bg-surface-2"
              >
                {dir === 1 ? <ArrowUpWideNarrow className="size-4 text-good" /> : <ArrowDownWideNarrow className="size-4 text-bad" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-snug font-medium">{m.label}</div>
                <div className="truncate text-xs text-muted" title={dataset.metricContext(m.id) ?? undefined}>
                  {dataset.metricContext(m.id) ?? m.cats.join(', ')}
                  {m.year ? ` · ${m.year}` : ''} · {m.n}/{total}
                </div>
              </div>
              <button type="button" aria-label={`Remove ${m.label}`} onClick={() => removeMetric(m.id)} className="rounded p-0.5 text-muted opacity-60 group-hover:opacity-100 hover:bg-surface-2 hover:text-app">
                <X className="size-4" />
              </button>
            </li>
          )
        })}
      </ul>
      <MetricPicker dataset={dataset} onSelect={addMetric} exclude={search.m} placeholder="Add metric" />
      {metrics.length === 0 ? <p className="mt-3 text-xs text-muted">Search thousands of {dataset.type.label.toLowerCase()} metrics — try “income”, “education”, “crime” or “happiness”.</p> : null}
    </section>
  )
}

function GroupFilter({ dataset, search, update }: CompareViewProps) {
  if (dataset.groups.length < 2 || dataset.groups.length > 12) return null
  const selected = new Set(search.g ?? [])
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-semibold">Filter</h2>
      <div className="flex flex-wrap gap-1.5">
        {dataset.groups.map((g) => {
          const on = selected.has(g)
          return (
            <button
              key={g}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = new Set(selected)
                if (on) next.delete(g)
                else next.add(g)
                update({ g: next.size ? [...next] : undefined })
              }}
              className={cx('rounded-full border px-2.5 py-0.5 text-xs', on ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-900/40 dark:text-accent-200' : 'border-app text-muted hover:text-app')}
            >
              {g}
            </button>
          )
        })}
      </div>
      {selected.size ? <p className="mt-2 text-xs text-muted">Showing only {[...selected].join(', ')}.</p> : null}
    </section>
  )
}

function Highlights({ dataset, search, update }: CompareViewProps) {
  const hl = search.hl ?? []
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-semibold">Highlight</h2>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {hl.map((id) => {
          const i = dataset.entityIndex.get(id)
          if (i == null) return null
          const e = dataset.entities[i]
          return (
            <Badge key={id} tone="accent">
              <Flag entity={e} type={dataset.type.id} size={14} />
              <Link to="/places/$type/$slug" params={{ type: dataset.type.id, slug: e.slug }} className="hover:underline">
                {e.name}
              </Link>
              <button type="button" aria-label={`Remove ${e.name}`} onClick={() => update({ hl: hl.filter((x) => x !== id) })}>
                <X className="size-3" />
              </button>
            </Badge>
          )
        })}
      </div>
      <EntityPicker dataset={dataset} exclude={hl} onSelect={(id) => update({ hl: [...hl, id] })} />
    </section>
  )
}

export type { CompareSearch }
