import { getRouteApi, Link } from '@tanstack/react-router';
import { ArrowRight, Loader2, Search, Trophy, X } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import {
  Highlighted,
  resultFacts,
  ResultIcon,
  TargetLink,
  TYPE_SHORT,
} from './results';
import {
  groupResults,
  KIND_LABELS,
  type RankedResult,
  SEARCH_KINDS,
  type SearchIndex,
  type SearchKind,
} from './searchIndex';
import { SUGGESTIONS, TRY_QUERIES } from './suggestions';
import { useSearchIndex } from './useSearchIndex';
import { EmptyState } from '~/components/feedback';
import { Badge, cx, PageHeader } from '~/components/ui';
import { ENTITY_TYPES, type EntityType } from '~/data/types';
import { useTitle } from '~/lib/useTitle';

const route = getRouteApi('/search');

const PAGE = 40;
/** Results per group in the "All" view before "Show all …". */
const ALL_CAP = 6;

const TYPE_FILTER_LABELS: Record<EntityType, string> = {
  country: 'Countries',
  state: 'US states',
  city: 'US cities',
  'world-city': 'World cities',
  county: 'Counties',
};

type KindFilter = SearchKind | 'all';
type TypeFilter = EntityType | 'all';

/** All matches for a query; `version` keys the memo so results refresh as the index grows. */
function searchAll(index: SearchIndex, version: number, query: string) {
  return version >= 0 && query !== '' ? index.search(query) : [];
}

/**
 * Counts per kind (honouring the type filter) and per type (honouring the kind filter), so each
 * filter chip shows how many results selecting it would leave.
 */
function countResults(
  results: readonly RankedResult[],
  kind: KindFilter,
  type: TypeFilter
) {
  const byKind: Record<SearchKind, number> = {
    place: 0,
    metric: 0,
    topic: 0,
    category: 0,
  };
  const byType = new Map<EntityType, number>();
  let all = 0;
  let allTypes = 0;
  for (const r of results) {
    const d = r.doc;
    if (type === 'all' || d.type === type) {
      byKind[d.kind]++;
      all++;
    }
    if (kind === 'all' || d.kind === kind) {
      allTypes++;
      if (d.type != null) byType.set(d.type, (byType.get(d.type) ?? 0) + 1);
    }
  }
  return { byKind, byType, all, allTypes };
}

export function SearchPage() {
  const { q } = route.useSearch();
  const navigate = route.useNavigate();
  const [text, setText] = useState(q ?? '');
  const [syncedQ, setSyncedQ] = useState(q);
  const [kind, setKind] = useState<KindFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  const { index, version, loading, loaded, total, error } = useSearchIndex();
  const query = useDeferredValue(text.trim());
  const urlTimer = useRef<number | undefined>(undefined);
  useTitle(query !== '' ? `Search: ${query}` : 'Search');

  // Take the URL's query when it changes from elsewhere (palette "See all", back button). Typing
  // writes the URL only after a pause, so this does not fight the keyboard.
  if (q !== syncedQ) {
    setSyncedQ(q);
    setText(q ?? '');
  }

  useEffect(() => () => window.clearTimeout(urlTimer.current), []);

  /** Updates the box immediately and the URL (`?q=`) now or after a short typing pause. */
  const setQuery = (value: string, when: 'now' | 'debounced' = 'now') => {
    setText(value);
    setLimit(PAGE);
    window.clearTimeout(urlTimer.current);
    // Written untrimmed so the round trip through the URL never eats a space being typed.
    const write = () => {
      void navigate({
        search: { q: value.trim() !== '' ? value : undefined },
        replace: true,
      });
    };
    if (when === 'now') write();
    else urlTimer.current = window.setTimeout(write, 300);
  };

  const results = useMemo(
    () => searchAll(index, version, query),
    [index, version, query]
  );
  const counts = useMemo(
    () => countResults(results, kind, type),
    [results, kind, type]
  );
  const filtered = useMemo(
    () =>
      results.filter(
        (r) =>
          (kind === 'all' || r.doc.kind === kind) &&
          (type === 'all' || r.doc.type === type)
      ),
    [results, kind, type]
  );
  const groups = useMemo(
    () => (kind === 'all' ? groupResults(filtered, ALL_CAP) : []),
    [filtered, kind]
  );
  const suggestion = useMemo(
    () =>
      query !== '' && results.length === 0 && !loading
        ? index.suggest(query)
        : null,
    [query, results.length, loading, index]
  );

  const chooseKind = (k: KindFilter) => {
    setKind(k);
    setLimit(PAGE);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Search"
        title={
          query !== '' ? (
            <>
              Results for{' '}
              <span className="text-accent-600 dark:text-accent-300">
                “{query}”
              </span>
            </>
          ) : (
            'Search everything'
          )
        }
        subtitle="Places, metrics, topics and categories across countries, US states, cities and counties."
      />

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(text);
        }}
        className="border-app bg-surface focus-within:border-accent-400 focus-within:ring-accent-500/20 mb-5 flex items-center gap-3 rounded-2xl border px-4 shadow-sm focus-within:ring-4"
      >
        <Search className="text-muted size-5 shrink-0" aria-hidden />
        <input
          type="search"
          value={text}
          onChange={(e) => setQuery(e.target.value, 'debounced')}
          placeholder="Try “median income”, “Japan” or “crime”"
          aria-label="Search places, metrics and topics"
          className="placeholder:text-muted min-w-0 flex-1 bg-transparent py-3.5 text-base outline-none [&::-webkit-search-cancel-button]:hidden"
          autoComplete="off"
          spellCheck={false}
          autoFocus={q == null}
        />
        {loading ? (
          <span
            className="text-muted flex items-center gap-1.5 text-xs"
            role="status"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span className="hidden sm:inline">
              Indexing {loaded}/{total}
            </span>
          </span>
        ) : null}
        {text !== '' ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-muted hover:text-app hover:bg-surface-2 rounded-md p-1"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </form>

      {error != null ? (
        <p className="text-bad mb-4 text-sm">
          Some search data failed to load: {error}
        </p>
      ) : null}

      {query === '' ? (
        <EmptySearch onTry={setQuery} />
      ) : loading && results.length === 0 ? (
        <div
          className="text-muted flex items-center justify-center gap-2 py-16 text-sm"
          role="status"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden /> Indexing
          places, metrics and topics…
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          title={`No results for “${query}”`}
          icon={<Search className="text-muted size-6" />}
        >
          {suggestion != null ? (
            <p>
              Did you mean{' '}
              <button
                type="button"
                onClick={() => setQuery(suggestion)}
                className="text-accent-600 dark:text-accent-300 font-medium hover:underline"
              >
                {suggestion}
              </button>
              ?
            </p>
          ) : (
            <p>
              Check the spelling, or try a broader word such as “income” or
              “health”.
            </p>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-3">
            <div
              role="tablist"
              aria-label="Result kind"
              className="border-app flex gap-1 overflow-x-auto border-b"
            >
              {(['all', ...SEARCH_KINDS] as const).map((k) => {
                const n = k === 'all' ? counts.all : counts.byKind[k];
                const selected = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    disabled={n === 0 && !selected}
                    onClick={() => chooseKind(k)}
                    className={cx(
                      '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40',
                      selected
                        ? 'border-accent-600 text-app dark:border-accent-400'
                        : 'text-muted hover:text-app border-transparent'
                    )}
                  >
                    {k === 'all' ? 'All' : KIND_LABELS[k].many}
                    <span className="tabular bg-surface-2 text-muted rounded-full px-1.5 text-xs">
                      {n.toLocaleString('en-US')}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Place type"
            >
              <TypeChip
                label="All types"
                count={counts.allTypes}
                selected={type === 'all'}
                onClick={() => {
                  setType('all');
                  setLimit(PAGE);
                }}
              />
              {ENTITY_TYPES.map((t) => (
                <TypeChip
                  key={t}
                  label={TYPE_FILTER_LABELS[t]}
                  count={counts.byType.get(t) ?? 0}
                  selected={type === t}
                  onClick={() => {
                    setType(type === t ? 'all' : t);
                    setLimit(PAGE);
                  }}
                />
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="Nothing matches these filters">
              <button
                type="button"
                className="text-accent-600 dark:text-accent-300 font-medium hover:underline"
                onClick={() => {
                  setKind('all');
                  setType('all');
                }}
              >
                Clear filters
              </button>
            </EmptyState>
          ) : kind === 'all' ? (
            <div className="space-y-5">
              {groups.map((g) => (
                <section
                  key={g.kind}
                  aria-labelledby={`group-${g.kind}`}
                  className="card overflow-hidden"
                >
                  <header className="border-app flex items-center justify-between gap-3 border-b px-4 py-2.5">
                    <h2
                      id={`group-${g.kind}`}
                      className="text-sm font-semibold"
                    >
                      {KIND_LABELS[g.kind].many}{' '}
                      <span className="tabular text-muted font-normal">
                        {g.total.toLocaleString('en-US')}
                      </span>
                    </h2>
                    {g.total > g.results.length ? (
                      <button
                        type="button"
                        onClick={() => chooseKind(g.kind)}
                        className="text-accent-600 dark:text-accent-300 inline-flex items-center gap-1 text-xs font-medium hover:underline"
                      >
                        Show all {g.total.toLocaleString('en-US')}
                        <ArrowRight className="size-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </header>
                  <ul className="divide-y divide-[var(--border)]">
                    {g.results.map((r) => (
                      <ResultItem key={r.doc.id} result={r} query={query} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <section
              className="card overflow-hidden"
              aria-label={`${KIND_LABELS[kind].many} results`}
            >
              <ul className="divide-y divide-[var(--border)]">
                {filtered.slice(0, limit).map((r) => (
                  <ResultItem key={r.doc.id} result={r} query={query} />
                ))}
              </ul>
              {filtered.length > limit ? (
                <div className="border-app border-t p-3 text-center">
                  <button
                    type="button"
                    onClick={() => setLimit((l) => l + PAGE * 2)}
                    className="border-app hover:bg-surface-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
                  >
                    Show more (
                    {(filtered.length - limit).toLocaleString('en-US')} left)
                  </button>
                </div>
              ) : null}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TypeChip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={count === 0 && !selected}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40',
        selected
          ? 'border-accent-300 bg-accent-50 text-accent-800 dark:border-accent-700 dark:bg-accent-900/40 dark:text-accent-100'
          : 'border-app text-muted hover:text-app hover:bg-surface-2'
      )}
    >
      {label}
      <span className="tabular opacity-70">
        {count.toLocaleString('en-US')}
      </span>
    </button>
  );
}

function ResultItem({
  result,
  query,
}: {
  result: RankedResult;
  query: string;
}) {
  const { doc } = result;
  const facts = resultFacts(doc);
  const metricTarget = doc.target.kind === 'metric' ? doc.target : null;
  return (
    <li className="hover:bg-surface-2/60 group relative flex items-center gap-3 px-4 py-3">
      <ResultIcon item={doc} />
      <div className="min-w-0 flex-1">
        <TargetLink
          target={doc.target}
          className="block font-medium after:absolute after:inset-0 focus-visible:outline-none sm:truncate"
        >
          <Highlighted text={doc.title} query={query} terms={result.terms} />
        </TargetLink>
        <div className="text-muted truncate text-xs">
          {doc.type != null ? (
            <span className="sm:hidden">{TYPE_SHORT[doc.type]} · </span>
          ) : null}
          {doc.subtitle !== '' ? (
            <Highlighted text={doc.subtitle} query={query} />
          ) : null}
          {facts.length > 0 ? (
            <span className="tabular">
              {doc.subtitle !== '' ? ' · ' : ''}
              {facts.join(' · ')}
            </span>
          ) : null}
        </div>
      </div>
      {doc.type != null ? (
        <span className="hidden shrink-0 sm:block">
          <Badge>{TYPE_SHORT[doc.type]}</Badge>
        </span>
      ) : null}
      {metricTarget != null ? (
        <Link
          to="/compare"
          search={{
            type: metricTarget.type,
            view: 'ranking',
            m: [metricTarget.id],
          }}
          className="border-app text-muted hover:text-app hover:border-accent-300 bg-surface relative z-10 inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium"
          title={`Rank every ${doc.type != null ? TYPE_SHORT[doc.type].toLowerCase() : 'place'} by ${doc.title}`}
          aria-label={`Rank by ${doc.title}`}
        >
          <Trophy className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Rank</span>
        </Link>
      ) : null}
    </li>
  );
}

function EmptySearch({ onTry }: { onTry: (q: string) => void }) {
  return (
    <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Try searching for</h2>
        <div className="flex flex-wrap gap-2">
          {TRY_QUERIES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTry(t)}
              className="border-app hover:border-accent-300 hover:bg-surface-2 rounded-full border px-3 py-1 text-sm"
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-muted mt-4 text-xs leading-relaxed">
          Search understands state codes (“TX”), country names and nicknames
          (“UK”, “Holland”), abbreviations (“GDP”), everyday words (“cheap”,
          “safe”) and small typos.
        </p>
      </section>
      <section className="card overflow-hidden">
        <h2 className="border-app border-b px-4 py-2.5 text-sm font-semibold">
          Popular
        </h2>
        <ul className="divide-y divide-[var(--border)]">
          {SUGGESTIONS.map((s) => (
            <li
              key={s.id}
              className="hover:bg-surface-2/60 relative flex items-center gap-3 px-4 py-2.5"
            >
              <ResultIcon item={s} size="sm" />
              <TargetLink
                target={s.target}
                className="min-w-0 flex-1 truncate text-sm font-medium after:absolute after:inset-0"
              >
                {s.title}
              </TargetLink>
              {s.type != null ? <Badge>{TYPE_SHORT[s.type]}</Badge> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
