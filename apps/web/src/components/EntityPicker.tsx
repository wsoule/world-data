import { Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Flag } from './Flag';
import { cx } from './ui';
import type { Dataset } from '~/data/dataset';
import { searchItems } from '~/lib/textSearch';

/** Search-as-you-type picker for places (countries, states, …). Calls onSelect with the entity id. */
export function EntityPicker({
  dataset,
  onSelect,
  exclude,
  placeholder,
  className,
  autoFocus,
}: {
  dataset: Dataset;
  onSelect: (id: string) => void;
  exclude?: readonly string[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const ex = new Set(exclude ?? []);
    const pool = dataset.entities.filter((e) => !ex.has(e.id));
    return searchItems(
      pool,
      query,
      (e) => [
        { text: e.name, weight: 3 },
        { text: `${e.id} ${e.sub ?? ''}`, weight: 2 },
        { text: e.group ?? '', weight: 1 },
      ],
      50
    );
  }, [dataset, query, exclude]);

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

  const pick = (id: string) => {
    onSelect(id);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      <div className="border-app bg-surface focus-within:border-accent-400 flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
        <Search className="text-muted size-4" aria-hidden />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && active < results.length) {
              e.preventDefault();
              pick(results[active].id);
            } else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={
            placeholder ?? `Add a ${dataset.type.singular.toLowerCase()}…`
          }
          className="placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
          role="combobox"
          aria-expanded={open}
          aria-label={
            placeholder ?? `Add a ${dataset.type.singular.toLowerCase()}`
          }
        />
        <Plus className="text-muted size-4" aria-hidden />
      </div>
      {open && results.length > 0 ? (
        <ul
          role="listbox"
          className="border-app bg-surface absolute z-50 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded-xl border py-1 shadow-xl"
        >
          {results.map((e, i) => (
            <li key={e.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(e.id)}
                className={cx(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                  i === active && 'bg-accent-50 dark:bg-accent-900/30'
                )}
              >
                <Flag entity={e} type={dataset.type.id} size={18} />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="text-muted text-xs">{e.group}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
