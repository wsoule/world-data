import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  ChevronDown,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cx } from './ui';
import type { Dataset } from '~/data/dataset';
import { rankOrder, rankOrderNote } from '~/data/rankOrder';
import type { Metric } from '~/data/types';
import { searchItems } from '~/lib/textSearch';

export interface MetricPickerProps {
  dataset: Dataset;
  /** Selected metric (single-select mode); shown in the trigger */
  value?: number | null;
  onSelect: (id: number) => void;
  /** Metric ids to hide (already chosen) */
  exclude?: readonly number[];
  /** Restrict to numeric metrics (default) or also allow categorical ones */
  kinds?: readonly Metric['kind'][];
  placeholder?: string;
  /** Custom trigger content; defaults to the selected label or an "Add metric" button */
  trigger?: ReactNode;
  className?: string;
  /** Allow clearing the value (single-select mode) */
  onClear?: () => void;
  /** Accessible label for the trigger */
  ariaLabel?: string;
  align?: 'left' | 'right';
}

export function PolarityIcon({
  pol,
  fmt,
  className,
}: {
  pol: Metric['pol'];
  /** The metric's format; rank columns add which end rank 1 is to the tooltip. */
  fmt?: Metric['fmt'];
  className?: string;
}) {
  const order = fmt === undefined ? null : rankOrder({ fmt, pol });
  const note = order == null ? '' : ` (${rankOrderNote(order)})`;
  if (pol === 1)
    return (
      <span title={`Higher is better${note}`}>
        <ArrowUpWideNarrow
          className={cx('size-3.5 text-good', className)}
          aria-label={`Higher is better${note}`}
        />
      </span>
    );
  if (pol === -1)
    return (
      <span title={`Lower is better${note}`}>
        <ArrowDownWideNarrow
          className={cx('size-3.5 text-bad', className)}
          aria-label={`Lower is better${note}`}
        />
      </span>
    );
  return null;
}

/** Searchable, virtualized picker over every metric of a dataset. */
export function MetricPicker({
  dataset,
  value,
  onSelect,
  exclude,
  kinds = ['num'],
  placeholder,
  trigger,
  className,
  onClear,
  ariaLabel,
  align = 'left',
}: MetricPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = value != null ? dataset.metric(value) : undefined;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        rootRef.current != null &&
        !rootRef.current.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      {trigger != null ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="contents"
        >
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
            className="border-app bg-surface hover:bg-surface-2 flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm"
          >
            <span
              className={cx(
                'min-w-0 flex-1 truncate',
                selected == null && 'text-muted'
              )}
              title={
                selected != null
                  ? dataset.metricFullLabel(selected.id)
                  : undefined
              }
            >
              {selected != null
                ? selected.label
                : (placeholder ?? 'Choose a metric…')}
            </span>
            <ChevronDown className="text-muted size-4 shrink-0" />
          </button>
          {selected != null && onClear != null ? (
            <button
              type="button"
              aria-label="Clear"
              onClick={onClear}
              className="text-muted hover:bg-surface-2 ml-1 rounded-lg px-1.5"
            >
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
          className="border-app text-muted hover:border-accent-400 hover:text-app inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-sm"
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
            onSelect(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function MetricSearchPanel({
  dataset,
  kinds,
  exclude,
  onPick,
  onClose,
  align,
}: {
  dataset: Dataset;
  kinds: readonly Metric['kind'][];
  exclude?: readonly number[];
  onPick: (id: number) => void;
  onClose: () => void;
  align: 'left' | 'right';
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('');
  const [showSparse, setShowSparse] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => inputRef.current?.focus(), []);

  const total = dataset.entities.length;
  const sparseCut = Math.max(3, Math.floor(total * 0.25));

  const pool = useMemo(() => {
    const ex = new Set(exclude ?? []);
    return dataset.metrics
      .filter(
        (m) =>
          kinds.includes(m.kind) &&
          m.meta !== true &&
          !ex.has(m.id) &&
          dataset.hasValues(m.id)
      )
      .sort((a, b) => b.n - a.n);
  }, [dataset, kinds, exclude]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of pool)
      for (const c of m.cats) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pool]);

  const results = useMemo(() => {
    const filtered = pool.filter(
      (m) =>
        (category === '' || m.cats.includes(category)) &&
        (showSparse || m.n >= sparseCut || query.trim().length > 0)
    );
    return searchItems(filtered, query, (m) => [
      { text: m.label, weight: 3 },
      { text: dataset.metricContext(m.id) ?? '', weight: 2 },
      { text: `${m.key} ${m.cats.join(' ')} ${m.unit ?? ''}`, weight: 1 },
    ]);
  }, [pool, query, category, showSparse, sparseCut, dataset]);

  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 52,
    overscan: 8,
  });

  useEffect(() => {
    if (results.length > 0)
      virtualizer.scrollToIndex(active, { align: 'auto' });
  }, [active, results.length, virtualizer]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = results[active];
      if (m != null) onPick(m.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className={cx(
        'absolute z-50 mt-1 w-[min(92vw,30rem)] overflow-hidden rounded-xl border border-app bg-surface shadow-xl',
        align === 'right' ? 'right-0' : 'left-0'
      )}
      onKeyDown={onKey}
    >
      <div className="border-app flex items-center gap-2 border-b px-3 py-2">
        <Search className="text-muted size-4" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder={`Search ${pool.length.toLocaleString()} ${dataset.type.label.toLowerCase()} metrics…`}
          className="placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={
            active < results.length
              ? `${listId}-${results[active].id}`
              : undefined
          }
        />
      </div>
      <div className="border-app flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setActive(0);
          }}
          className="border-app bg-surface rounded-md border px-1.5 py-1"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map(([c, n]) => (
            <option key={c} value={c}>
              {c.replace(/-/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase())} (
              {n})
            </option>
          ))}
        </select>
        <label className="text-muted inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={showSparse}
            onChange={(e) => {
              setShowSparse(e.target.checked);
              setActive(0);
            }}
          />
          Include sparse (&lt;{sparseCut} {dataset.type.label.toLowerCase()})
        </label>
        <span className="text-muted ml-auto">
          {results.length.toLocaleString()} found
        </span>
      </div>
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        className="max-h-80 overflow-y-auto"
      >
        {results.length === 0 ? (
          <div className="text-muted p-6 text-center text-sm">
            No metrics match “{query}”.
          </div>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const m = results[vi.index];
              const ctx = dataset.metricContext(m.id);
              return (
                <button
                  key={m.id}
                  id={`${listId}-${m.id}`}
                  type="button"
                  role="option"
                  aria-selected={vi.index === active}
                  onMouseEnter={() => setActive(vi.index)}
                  onClick={() => onPick(m.id)}
                  className={cx(
                    'absolute top-0 left-0 flex w-full items-start gap-2 px-3 py-2 text-left',
                    vi.index === active && 'bg-accent-50 dark:bg-accent-900/30'
                  )}
                  style={{
                    transform: `translateY(${vi.start}px)`,
                    height: vi.size,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{m.label}</span>
                      <PolarityIcon pol={m.pol} fmt={m.fmt} />
                    </div>
                    <div className="text-muted truncate text-xs">
                      {ctx ?? m.cats.join(', ')}
                      {m.year != null ? ` · ${m.year}` : ''}
                    </div>
                  </div>
                  <span
                    className="tabular text-muted shrink-0 text-xs"
                    title={`${m.n} of ${total} ${dataset.type.label.toLowerCase()} have data`}
                  >
                    {m.n}/{total}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
