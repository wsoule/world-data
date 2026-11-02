import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDownWideNarrow, ArrowUpWideNarrow, ChevronDown, Plus, Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Dataset } from '~/data/dataset'
import type { Metric } from '~/data/types'
import { searchItems } from '~/lib/textSearch'
import { cx } from './ui'

export interface MetricPickerProps {
  dataset: Dataset
  /** Selected metric (single-select mode); shown in the trigger */
  value?: number | null
  onSelect: (id: number) => void
  /** Metric ids to hide (already chosen) */
  exclude?: readonly number[]
  /** Restrict to numeric metrics (default) or also allow categorical ones */
  kinds?: readonly Metric['kind'][]
  placeholder?: string
  /** Custom trigger content; defaults to the selected label or an "Add metric" button */
  trigger?: ReactNode
  className?: string
  /** Allow clearing the value (single-select mode) */
  onClear?: () => void
  /** Accessible label for the trigger */
  ariaLabel?: string
  align?: 'left' | 'right'
}

export function PolarityIcon({ pol, className }: { pol: Metric['pol']; className?: string }) {
  if (pol === 1) return <span title="Higher is better"><ArrowUpWideNarrow className={cx('size-3.5 text-good', className)} aria-label="Higher is better" /></span>
  if (pol === -1) return <span title="Lower is better"><ArrowDownWideNarrow className={cx('size-3.5 text-bad', className)} aria-label="Lower is better" /></span>
  return null
}

/** Searchable, virtualized picker over every metric of a dataset. */
export function MetricPicker({ dataset, value, onSelect, exclude, kinds = ['num'], placeholder, trigger, className, onClear, ariaLabel, align = 'left' }: MetricPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = value != null ? dataset.metric(value) : undefined

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      {trigger ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} className="contents">
          {trigger}
        </button>
      ) : value !== undefined ? (
        <div className="flex items-stretch">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={ariaLabel}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-app bg-surface px-2.5 py-1.5 text-left text-sm hover:bg-surface-2"
          >
            <span className={cx('min-w-0 flex-1 truncate', !selected && 'text-muted')} title={selected ? dataset.metricFullLabel(selected.id) : undefined}>
              {selected ? selected.label : (placeholder ?? 'Choose a metric…')}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted" />
          </button>
          {selected && onClear ? (
            <button type="button" aria-label="Clear" onClick={onClear} className="ml-1 rounded-lg px-1.5 text-muted hover:bg-surface-2">
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-app px-3 py-1.5 text-sm text-muted hover:border-accent-400 hover:text-app"
        >
          <Plus className="size-4" /> {placeholder ?? 'Add metric'}
        </button>
      )}
      {open ? (
        <MetricSearchPanel
          dataset={dataset}
          kinds={kinds}
          exclude={exclude}
          align={align}
          onPick={(id) => {
            onSelect(id)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}

function MetricSearchPanel({ dataset, kinds, exclude, onPick, onClose, align }: { dataset: Dataset; kinds: readonly Metric['kind'][]; exclude?: readonly number[]; onPick: (id: number) => void; onClose: () => void; align: 'left' | 'right' }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('')
  const [showSparse, setShowSparse] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  useEffect(() => inputRef.current?.focus(), [])

  const total = dataset.entities.length
  const sparseCut = Math.max(3, Math.floor(total * 0.25))

  const pool = useMemo(() => {
    const ex = new Set(exclude ?? [])
    return dataset.metrics
      .filter((m) => kinds.includes(m.kind) && !m.meta && !ex.has(m.id) && dataset.hasValues(m.id))
      .sort((a, b) => b.n - a.n)
  }, [dataset, kinds, exclude])

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of pool) for (const c of m.cats) counts.set(c, (counts.get(c) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [pool])

  const results = useMemo(() => {
    const filtered = pool.filter((m) => (!category || m.cats.includes(category)) && (showSparse || m.n >= sparseCut || query.trim().length > 0))
    return searchItems(filtered, query, (m) => [
      { text: m.label, weight: 3 },
      { text: dataset.metricContext(m.id) ?? '', weight: 2 },
      { text: `${m.key} ${m.cats.join(' ')} ${m.unit ?? ''}`, weight: 1 },
    ])
  }, [pool, query, category, showSparse, sparseCut, dataset])

  useEffect(() => setActive(0), [query, category, showSparse])

  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 52,
    overscan: 8,
  })

  useEffect(() => {
    if (results.length) virtualizer.scrollToIndex(active, { align: 'auto' })
  }, [active, results.length, virtualizer])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(results.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const m = results[active]
      if (m) onPick(m.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className={cx('absolute z-50 mt-1 w-[min(92vw,30rem)] overflow-hidden rounded-xl border border-app bg-surface shadow-xl', align === 'right' ? 'right-0' : 'left-0')} onKeyDown={onKey}>
      <div className="flex items-center gap-2 border-b border-app px-3 py-2">
        <Search className="size-4 text-muted" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${pool.length.toLocaleString()} ${dataset.type.label.toLowerCase()} metrics…`}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-app px-3 py-2 text-xs">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-md border border-app bg-surface px-1.5 py-1" aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map(([c, n]) => (
            <option key={c} value={c}>
              {c.replace(/-/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase())} ({n})
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1 text-muted">
          <input type="checkbox" checked={showSparse} onChange={(e) => setShowSparse(e.target.checked)} />
          Include sparse (&lt;{sparseCut} {dataset.type.label.toLowerCase()})
        </label>
        <span className="ml-auto text-muted">{results.length.toLocaleString()} found</span>
      </div>
      <div ref={listRef} id={listId} role="listbox" className="max-h-80 overflow-y-auto">
        {results.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">No metrics match “{query}”.</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const m = results[vi.index]
              const ctx = dataset.metricContext(m.id)
              return (
                <button
                  key={m.id}
                  id={`${listId}-${m.id}`}
                  type="button"
                  role="option"
                  aria-selected={vi.index === active}
                  onMouseEnter={() => setActive(vi.index)}
                  onClick={() => onPick(m.id)}
                  className={cx('absolute top-0 left-0 flex w-full items-start gap-2 px-3 py-2 text-left', vi.index === active && 'bg-accent-50 dark:bg-accent-900/30')}
                  style={{ transform: `translateY(${vi.start}px)`, height: vi.size }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{m.label}</span>
                      <PolarityIcon pol={m.pol} />
                    </div>
                    <div className="truncate text-xs text-muted">
                      {ctx ?? m.cats.join(', ')}
                      {m.year ? ` · ${m.year}` : ''}
                    </div>
                  </div>
                  <span className="tabular shrink-0 text-xs text-muted" title={`${m.n} of ${total} ${dataset.type.label.toLowerCase()} have data`}>
                    {m.n}/{total}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
