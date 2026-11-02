import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  Clock,
  CornerDownLeft,
  Loader2,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { modKeyLabel, usePlatformLabel } from './platform';
import { clearRecent, pushRecent, readRecent, type RecentItem } from './recent';
import {
  Highlighted,
  resultFacts,
  ResultIcon,
  type ResultLike,
  TargetLink,
  TYPE_SHORT,
  useOpenTarget,
} from './results';
import {
  groupResults,
  KIND_LABELS,
  type SearchIndex,
  type SearchKind,
} from './searchIndex';
import {
  closeSearch,
  getSearchSeed,
  openSearch,
  toggleSearch,
  useSearchOpen,
} from './store';
import { SUGGESTIONS, TRY_QUERIES } from './suggestions';
import { useSearchIndex } from './useSearchIndex';
import { Badge, cx } from '~/components/ui';
import { SITE } from '~/site';

/** Per-group caps in the palette; the /search page shows everything. */
const PALETTE_CAPS: Record<SearchKind, number> = {
  place: 4,
  metric: 6,
  topic: 4,
  category: 3,
};

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * Global search dialog. Mounted once in the root layout; opens with ⌘K / Ctrl+K, "/" (outside text
 * fields) or `openSearch()`. The index downloads on first open.
 */
export function SearchPalette() {
  const open = useSearchOpen();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleSearch();
      } else if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditable(e.target)
      ) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return open ? <PaletteDialog /> : null;
}

/** Grouped palette results; `version` keys the memo so results refresh as the index grows. */
function paletteGroups(index: SearchIndex, version: number, query: string) {
  return version >= 0 ? groupResults(index.search(query), PALETTE_CAPS) : [];
}

/** DOM id of a result option, for aria-activedescendant. */
function optionId(listId: string, key: string): string {
  return `${listId}-${key.replace(/[^\w-]/g, '_')}`;
}

type Row =
  | { key: string; item: ResultLike; terms: readonly string[] }
  | { key: string; seeAll: string };

interface Section {
  id: string;
  label: string;
  icon?: typeof Clock;
  total?: number;
  action?: { label: string; run: () => void };
  rows: Row[];
}

function PaletteDialog() {
  const [query, setQuery] = useState(getSearchSeed);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>(readRecent);
  const modKey = usePlatformLabel(modKeyLabel, 'Ctrl');
  const { index, version, loading, loaded, total, error } = useSearchIndex();
  const openTarget = useOpenTarget();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const titleId = useId();
  // Not deferred: Enter must act on exactly what was typed, and search takes a few milliseconds.
  const trimmed = query.trim();

  // Focus the input, lock page scroll, and give focus back to the opener on close.
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const input = inputRef.current;
    if (input != null) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected === true) previous.focus();
    };
  }, []);

  const sections = useMemo<Section[]>(() => {
    if (trimmed === '') {
      const out: Section[] = [];
      if (recent.length > 0)
        out.push({
          id: 'recent',
          label: 'Recent',
          icon: Clock,
          action: {
            label: 'Clear',
            run: () => {
              clearRecent();
              setRecent([]);
            },
          },
          rows: recent.map((r) => ({
            key: `recent-${r.id}`,
            item: r,
            terms: [],
          })),
        });
      const seen = new Set(recent.map((r) => r.id));
      out.push({
        id: 'suggested',
        label: 'Popular',
        icon: Sparkles,
        rows: SUGGESTIONS.filter((s) => !seen.has(s.id)).map((s) => ({
          key: `suggested-${s.id}`,
          item: s,
          terms: [],
        })),
      });
      return out;
    }
    const groups = paletteGroups(index, version, trimmed);
    const out: Section[] = groups.map((g) => ({
      id: g.kind,
      label: KIND_LABELS[g.kind].many,
      total: g.total,
      rows: g.results.map((r) => ({
        key: r.doc.id,
        item: r.doc,
        terms: r.terms,
      })),
    }));
    if (out.length > 0)
      out.push({
        id: 'all',
        label: '',
        rows: [{ key: 'see-all', seeAll: trimmed }],
      });
    return out;
  }, [trimmed, recent, index, version]);

  const rows = useMemo(() => sections.flatMap((s) => s.rows), [sections]);
  const activeIndex = Math.min(active, Math.max(0, rows.length - 1));
  const activeRow = rows[activeIndex] as Row | undefined;
  const rowIndex = useMemo(
    () => new Map(rows.map((r, i) => [r.key, i])),
    [rows]
  );

  useEffect(() => {
    if (activeRow == null) return;
    document
      .getElementById(optionId(listId, activeRow.key))
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeRow, listId]);

  const suggestion = useMemo(
    () =>
      trimmed !== '' && rows.length === 0 && !loading
        ? index.suggest(trimmed)
        : null,
    [trimmed, rows.length, loading, index]
  );

  const remember = (item: ResultLike) => setRecent(pushRecent(item));

  const choose = (row: Row) => {
    if ('seeAll' in row) {
      closeSearch();
      void navigate({ to: '/search', search: { q: row.seeAll } });
      return;
    }
    remember(row.item);
    closeSearch();
    openTarget(row.item.target);
  };

  const seeAll = () => {
    if (query.trim() === '') return;
    closeSearch();
    void navigate({ to: '/search', search: { q: query.trim() } });
  };

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + rows.length) % rows.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && query.trim() !== '') seeAll();
      else if (activeRow != null) choose(activeRow);
      else seeAll();
    }
  };

  // Escape closes; Tab cycles inside the dialog (result rows are reached with the arrow keys).
  const onPanelKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
      return;
    }
    if (e.key !== 'Tab' || panelRef.current == null) return;
    const focusable = [
      ...panelRef.current.querySelectorAll<HTMLElement>(
        'input, button:not([disabled]), a[href]:not([tabindex="-1"])'
      ),
    ];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const showIndexing = loading && trimmed !== '' && rows.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-6 sm:pt-[10vh]">
      <div
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] dark:bg-black/60"
        aria-hidden
        onMouseDown={() => closeSearch()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onPanelKey}
        className="border-app bg-surface relative flex max-h-[min(40rem,calc(100dvh-1rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl sm:max-h-[min(40rem,80vh)]"
      >
        <h2 id={titleId} className="sr-only">
          Search {SITE.name}
        </h2>
        <div className="border-app flex items-center gap-3 border-b px-4">
          <Search className="text-muted size-5 shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Search places, metrics, topics…"
            className="placeholder:text-muted min-w-0 flex-1 bg-transparent py-4 text-base outline-none"
            role="combobox"
            aria-label="Search places, metrics and topics"
            aria-expanded={rows.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeRow != null ? optionId(listId, activeRow.key) : undefined
            }
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {loading ? (
            <span
              className="text-muted flex shrink-0 items-center gap-1.5 text-xs"
              role="status"
              title={`Indexed ${loaded} of ${total} sources`}
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span className="hidden sm:inline">Indexing…</span>
            </span>
          ) : null}
          {query !== '' ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActive(0);
                inputRef.current?.focus();
              }}
              className="text-muted hover:text-app hover:bg-surface-2 rounded-md p-1"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => closeSearch()}
            className="border-app text-muted hover:text-app hidden rounded-md border px-1.5 py-0.5 font-mono text-[11px] sm:block"
            aria-label="Close search"
          >
            Esc
          </button>
          <button
            type="button"
            onClick={() => closeSearch()}
            className="text-muted hover:text-app -mr-1 rounded-md p-1 sm:hidden"
            aria-label="Close search"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {error != null && rows.length === 0 ? (
            <p className="text-bad p-6 text-center text-sm">
              Search data failed to load ({error}). Close and reopen to retry.
            </p>
          ) : showIndexing ? (
            <div
              className="text-muted flex flex-col items-center gap-2 p-10 text-sm"
              role="status"
            >
              <Loader2 className="size-5 animate-spin" aria-hidden />
              Indexing places, metrics and topics… ({loaded}/{total})
            </div>
          ) : trimmed !== '' && rows.length === 0 ? (
            <div className="p-8 text-center text-sm">
              <p className="font-medium">No results for “{trimmed}”</p>
              {suggestion != null ? (
                <p className="text-muted mt-2">
                  Did you mean{' '}
                  <button
                    type="button"
                    className="text-accent-600 dark:text-accent-300 font-medium underline-offset-2 hover:underline"
                    onClick={() => {
                      setQuery(suggestion);
                      setActive(0);
                      inputRef.current?.focus();
                    }}
                  >
                    {suggestion}
                  </button>
                  ?
                </p>
              ) : (
                <p className="text-muted mt-2">
                  Try a place (“Japan”, “TX”), a statistic (“median income”) or
                  a theme (“crime”).
                </p>
              )}
            </div>
          ) : (
            <div
              id={listId}
              role="listbox"
              aria-label="Search results"
              className="py-2"
            >
              {sections.map((section) => (
                <div
                  key={section.id}
                  role="group"
                  aria-labelledby={
                    section.label !== ''
                      ? `${listId}-h-${section.id}`
                      : undefined
                  }
                  aria-label={section.label === '' ? 'More' : undefined}
                  className="px-2 pb-1"
                >
                  {section.label !== '' ? (
                    <div
                      className="text-muted flex items-center gap-1.5 px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase"
                      role="presentation"
                    >
                      {section.icon != null ? (
                        <section.icon className="size-3.5" aria-hidden />
                      ) : null}
                      <span id={`${listId}-h-${section.id}`}>
                        {section.label}
                      </span>
                      {section.total != null ? (
                        <span className="tabular font-normal normal-case">
                          {section.total.toLocaleString('en-US')}
                        </span>
                      ) : null}
                      {section.action != null ? (
                        <button
                          type="button"
                          onClick={() => {
                            section.action?.run();
                            inputRef.current?.focus();
                          }}
                          className="hover:text-app ml-auto font-medium normal-case"
                        >
                          {section.action.label}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {section.rows.map((row) => {
                    const i = rowIndex.get(row.key) ?? -1;
                    const isActive = i === activeIndex;
                    const id = optionId(listId, row.key);
                    if ('seeAll' in row)
                      return (
                        <Link
                          key={row.key}
                          id={id}
                          role="option"
                          aria-selected={isActive}
                          tabIndex={-1}
                          to="/search"
                          search={{ q: row.seeAll }}
                          onClick={() => closeSearch()}
                          onMouseMove={() => setActive(i)}
                          className={cx(
                            'border-app mt-1 flex items-center gap-3 rounded-xl border-t px-3 py-2.5 text-sm',
                            isActive
                              ? 'bg-accent-50 dark:bg-accent-900/30'
                              : 'text-muted'
                          )}
                        >
                          <Search className="size-4 shrink-0" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">
                            See all results for{' '}
                            <span className="text-app font-medium">
                              “{row.seeAll}”
                            </span>
                          </span>
                          <ArrowRight className="size-4 shrink-0" aria-hidden />
                        </Link>
                      );
                    return (
                      <ResultRow
                        key={row.key}
                        id={id}
                        item={row.item}
                        terms={row.terms}
                        query={trimmed}
                        active={isActive}
                        onHover={() => setActive(i)}
                        onPick={() => {
                          remember(row.item);
                          closeSearch();
                        }}
                      />
                    );
                  })}
                </div>
              ))}
              {trimmed === '' ? (
                <div className="px-4 pt-2 pb-3">
                  <div className="text-muted mb-2 text-[11px] font-semibold tracking-wide uppercase">
                    Try searching
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {TRY_QUERIES.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setQuery(q);
                          setActive(0);
                          inputRef.current?.focus();
                        }}
                        className="border-app hover:border-accent-300 hover:text-app text-muted rounded-full border px-2.5 py-1 text-xs"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="border-app text-muted bg-surface-2/60 flex items-center gap-4 border-t px-4 py-2 text-[11px]">
          <span className="hidden items-center gap-1 sm:inline-flex">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move
          </span>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <Kbd>↵</Kbd> to open
          </span>
          <span className="hidden items-center gap-1 md:inline-flex">
            <Kbd>{modKey}</Kbd>
            <Kbd>↵</Kbd> for all results
          </span>
          <span className="ml-auto truncate">
            {total > 0 && !loading
              ? `${index.size.toLocaleString('en-US')} places, metrics & topics`
              : `Indexed ${loaded}/${total}`}
          </span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="border-app bg-surface rounded border px-1 font-mono text-[10px] leading-4">
      {children}
    </kbd>
  );
}

function ResultRow({
  id,
  item,
  terms,
  query,
  active,
  onHover,
  onPick,
}: {
  id: string;
  item: ResultLike;
  terms: readonly string[];
  query: string;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const facts = 'normTitle' in item ? resultFacts(item) : [];
  return (
    <TargetLink
      target={item.target}
      id={id}
      role="option"
      ariaSelected={active}
      tabIndex={-1}
      onClick={onPick}
      onMouseMove={onHover}
      className={cx(
        'group flex items-center gap-3 rounded-xl px-2 py-2',
        active ? 'bg-accent-50 dark:bg-accent-900/30' : ''
      )}
    >
      <ResultIcon item={item} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          <Highlighted text={item.title} query={query} terms={terms} />
        </div>
        {item.subtitle !== '' || facts.length > 0 ? (
          <div className="text-muted truncate text-xs">
            {[item.subtitle, ...facts].filter((s) => s !== '').join(' · ')}
          </div>
        ) : null}
      </div>
      {item.type != null && item.kind !== 'category' ? (
        <Badge className="shrink-0">{TYPE_SHORT[item.type]}</Badge>
      ) : null}
      <CornerDownLeft
        className={cx(
          'text-muted size-4 shrink-0',
          active ? 'opacity-100' : 'opacity-0'
        )}
        aria-hidden
      />
    </TargetLink>
  );
}
