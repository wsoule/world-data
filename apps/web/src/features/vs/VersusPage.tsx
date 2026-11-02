import { getRouteApi, Link } from '@tanstack/react-router';
import { ArrowRight, Scale, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { MAX_PLACES, placePalette } from './palette';
import { VersusChart } from './VersusChart';
import {
  biggestDifferences,
  type CategoryLead,
  categoryLeads,
  type Scoreboard,
  scoreboard,
  sharedMetrics,
} from './versusModel';
import { VersusTable } from './VersusTable';
import { EntityPicker } from '~/components/EntityPicker';
import { EmptyState } from '~/components/feedback';
import { Flag } from '~/components/Flag';
import { TypeTabs } from '~/components/TypeTabs';
import { Card, cx, PageHeader } from '~/components/ui';
import { type Dataset, useDataset } from '~/data/dataset';
import type { Entity, EntityType } from '~/data/types';
import { datasetFacts, placeNoun } from '~/features/places/datasetFacts';
import { useCategoryLabels } from '~/features/places/hooks';
import { pctText } from '~/features/places/percentile';
import { formatInt, plural } from '~/lib/format';
import { useTheme } from '~/lib/theme';
import { useTitle } from '~/lib/useTitle';
import type { VersusSearch } from '~/routes/vs';

const route = getRouteApi('/vs');

const TYPE_LABEL: Record<EntityType, string> = {
  country: 'Countries',
  state: 'US states',
  city: 'US cities',
  'world-city': 'World cities',
  county: 'US counties',
};

interface Suggestion {
  type: EntityType;
  ids: string[];
  label: string;
}

/** Starting points shown until two places are picked; the current type's come first. */
const SUGGESTIONS: Suggestion[] = [
  { type: 'state', ids: ['CA', 'TX'], label: 'California vs Texas' },
  { type: 'state', ids: ['NY', 'FL'], label: 'New York vs Florida' },
  { type: 'state', ids: ['MA', 'MS'], label: 'Massachusetts vs Mississippi' },
  {
    type: 'state',
    ids: ['WA', 'OR', 'ID'],
    label: 'Washington vs Oregon vs Idaho',
  },
  { type: 'country', ids: ['USA', 'CHN'], label: 'USA vs China' },
  {
    type: 'country',
    ids: ['DEU', 'JPN', 'GBR'],
    label: 'Germany vs Japan vs UK',
  },
  { type: 'country', ids: ['IND', 'CHN'], label: 'India vs China' },
  {
    type: 'country',
    ids: ['NOR', 'SWE', 'DNK', 'FIN'],
    label: 'The Nordics',
  },
  {
    type: 'city',
    ids: ['new-york/new-york', 'california/los-angeles'],
    label: 'New York vs Los Angeles',
  },
  {
    type: 'city',
    ids: ['illinois/chicago', 'texas/houston'],
    label: 'Chicago vs Houston',
  },
  {
    type: 'world-city',
    ids: ['japan/tokyo', 'united-kingdom/london', 'france/paris'],
    label: 'Tokyo vs London vs Paris',
  },
  {
    type: 'county',
    ids: ['06037', '17031'],
    label: 'Los Angeles County vs Cook County',
  },
];

export function VersusPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const dataset = useDataset(search.type);

  const update = useCallback(
    (patch: Partial<VersusSearch>) =>
      void navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: true,
        resetScroll: false,
      }),
    [navigate]
  );

  // Known, distinct ids only, at most four, in URL order.
  const places = useMemo(() => {
    const out: Entity[] = [];
    for (const id of search.e) {
      const i = dataset.entityIndex.get(id);
      if (i == null || out.some((e) => e.id === id)) continue;
      out.push(dataset.entities[i]);
      if (out.length === MAX_PLACES) break;
    }
    return out;
  }, [search.e, dataset]);

  useTitle(
    places.length >= 2 ? places.map((p) => p.name).join(' vs ') : 'Head to head'
  );

  const ids = places.map((p) => p.id);
  const setPlaces = (next: string[]) =>
    update({ e: next, cat: places.length < 2 ? undefined : search.cat });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Head to head"
        title={
          places.length >= 2
            ? places.map((p) => p.name).join(' vs ')
            : `Compare ${placeNoun(dataset)} head to head`
        }
        subtitle="Pick two to four places to see who wins on every metric they share."
        actions={
          <TypeTabs
            value={search.type}
            compact
            onChange={(type) =>
              void navigate({ search: { type, e: [], cat: undefined } })
            }
          />
        }
      />
      <PlacePicker
        dataset={dataset}
        places={places}
        onRemove={(id) => setPlaces(ids.filter((x) => x !== id))}
        onAdd={(id) => setPlaces([...ids, id])}
      />
      {places.length < 2 ? (
        <Suggestions type={search.type} />
      ) : (
        <Comparison
          key={ids.join(',')}
          dataset={dataset}
          places={places}
          category={search.cat}
          onCategory={(cat) => update({ cat })}
        />
      )}
    </div>
  );
}

/** Chips for the compared places (in their chart colours) plus a search box to add more. */
function PlacePicker({
  dataset,
  places,
  onRemove,
  onAdd,
}: {
  dataset: Dataset;
  places: readonly Entity[];
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
}) {
  const palette = placePalette(useTheme());
  const type = dataset.type.id;
  return (
    <div className="card flex flex-wrap items-center gap-2 p-3">
      {places.map((p, k) => (
        <span
          key={p.id}
          className="border-app bg-surface-2 inline-flex items-center gap-2 rounded-full border py-1 pr-1 pl-2.5 text-sm font-medium"
        >
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: palette[k] }}
            aria-hidden
          />
          <Flag entity={p} type={type} size={18} />
          <Link
            to="/places/$type/$slug"
            params={{ type, slug: p.slug }}
            className="hover:underline"
          >
            {p.name}
          </Link>
          <button
            type="button"
            onClick={() => onRemove(p.id)}
            aria-label={`Remove ${p.name}`}
            className="text-muted hover:bg-surface hover:text-app rounded-full p-1"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      {places.length < MAX_PLACES ? (
        <EntityPicker
          dataset={dataset}
          exclude={places.map((p) => p.id)}
          onSelect={onAdd}
          placeholder={
            places.length === 0
              ? `Add a ${dataset.type.singular.toLowerCase()}…`
              : `Add another ${dataset.type.singular.toLowerCase()}…`
          }
          className="min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto"
        />
      ) : (
        <span className="text-muted text-xs">Up to {MAX_PLACES} places</span>
      )}
    </div>
  );
}

function Suggestions({ type }: { type: EntityType }) {
  const ordered = [
    ...SUGGESTIONS.filter((s) => s.type === type),
    ...SUGGESTIONS.filter((s) => s.type !== type).slice(0, 4),
  ];
  return (
    <section aria-labelledby="suggestions-heading">
      <h2
        id="suggestions-heading"
        className="text-muted mb-3 text-sm font-medium"
      >
        Try a matchup
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((s) => (
          <Link
            key={`${s.type}:${s.ids.join(',')}`}
            to="/vs"
            search={{ type: s.type, e: s.ids }}
            className="card hover:border-accent-400 group flex items-center gap-3 p-4 transition-colors"
          >
            <span className="bg-accent-50 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200 grid size-9 shrink-0 place-items-center rounded-lg">
              <Scale className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {s.label}
              </span>
              <span className="text-muted block text-xs">
                {TYPE_LABEL[s.type]}
                {s.type === type ? '' : ' · switches place type'}
              </span>
            </span>
            <ArrowRight
              className="text-muted group-hover:text-accent-600 size-4 shrink-0"
              aria-hidden
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Everything below the picker once at least two places are chosen. */
function Comparison({
  dataset,
  places,
  category,
  onCategory,
}: {
  dataset: Dataset;
  places: readonly Entity[];
  category: string | undefined;
  onCategory: (category: string | undefined) => void;
}) {
  const theme = useTheme();
  const palette = placePalette(theme);
  const categoryLabel = useCategoryLabels();
  const [hideSize, setHideSize] = useState(true);
  const facts = datasetFacts(dataset);

  const indexes = useMemo(
    () => places.map((p) => dataset.entityIndex.get(p.id) ?? -1),
    [places, dataset]
  );
  const shared = useMemo(
    () =>
      sharedMetrics(
        dataset,
        indexes,
        hideSize ? facts.sizeDriven : new Set<number>()
      ),
    [dataset, indexes, hideSize, facts]
  );
  const score = useMemo(
    () => scoreboard(shared, places.length),
    [shared, places.length]
  );
  const leads = useMemo(
    () => categoryLeads(shared, places.length, { minN: facts.cut.minN }),
    [shared, places.length, facts]
  );
  // A category from the URL that these places do not share falls back to "all".
  const activeCategory =
    category != null && shared.some((s) => s.metric.cats.includes(category))
      ? category
      : undefined;
  const diffs = useMemo(
    () =>
      biggestDifferences(shared, {
        limit: 25,
        minN: facts.cut.minN,
        category: activeCategory,
      }),
    [shared, facts, activeCategory]
  );
  const averages = useMemo(
    () =>
      places.map((_, k) => {
        let sum = 0;
        let n = 0;
        for (const s of shared)
          if (s.polar) {
            sum += s.standings[k].pct;
            n++;
          }
        return n > 0 ? sum / n : Number.NaN;
      }),
    [shared, places]
  );

  if (shared.length === 0)
    return (
      <EmptyState title="No shared metrics">
        These places have no metric in common. Try places of a similar kind.
      </EmptyState>
    );

  return (
    <div className="space-y-6">
      <ScoreCard
        dataset={dataset}
        places={places}
        score={score}
        averages={averages}
        leads={leads}
        palette={palette}
        hideSize={hideSize}
        onHideSize={facts.sizeDriven.size > 0 ? setHideSize : undefined}
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card
          className="min-w-0"
          title="Biggest differences"
          subtitle={`The ${diffs.length} metrics where their percentiles differ most${activeCategory != null ? ` in ${categoryLabel(activeCategory)}` : ''}, among rankings of at least ${formatInt(facts.cut.minN)} ${placeNoun(dataset)}.`}
          actions={
            <select
              value={activeCategory ?? ''}
              onChange={(e) =>
                onCategory(e.target.value === '' ? undefined : e.target.value)
              }
              aria-label="Filter by category"
              className="border-app bg-surface rounded-lg border px-2 py-1.5 text-sm"
            >
              <option value="">All categories</option>
              {leads
                .map((l) => l.category)
                .sort((a, b) =>
                  categoryLabel(a).localeCompare(categoryLabel(b))
                )
                .map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
            </select>
          }
        >
          <Legend places={places} palette={palette} />
          {diffs.length > 0 ? (
            <VersusChart dataset={dataset} places={places} metrics={diffs} />
          ) : (
            <p className="text-muted py-8 text-center text-sm">
              No widely ranked directional metrics to chart here.
            </p>
          )}
        </Card>
        <CategoryLeads
          leads={leads}
          places={places}
          palette={palette}
          categoryLabel={categoryLabel}
          active={activeCategory}
          onSelect={(c) => onCategory(c === activeCategory ? undefined : c)}
        />
      </div>
      <VersusTable
        dataset={dataset}
        places={places}
        shared={shared}
        colors={palette}
        categoryLabel={categoryLabel}
        category={activeCategory}
      />
    </div>
  );
}

function Legend({
  places,
  palette,
}: {
  places: readonly Entity[];
  palette: readonly string[];
}) {
  return (
    <div
      className="text-muted mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"
      aria-hidden
    >
      {places.map((p, k) => (
        <span key={p.id} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: palette[k] }}
          />
          {p.name}
        </span>
      ))}
    </div>
  );
}

/**
 * Headline result: who wins more directional metrics, a bar splitting all of them by winner
 * (ties in grey), and per-place wins, average percentile and categories led.
 */
function ScoreCard({
  dataset,
  places,
  score,
  averages,
  leads,
  palette,
  hideSize,
  onHideSize,
}: {
  dataset: Dataset;
  places: readonly Entity[];
  score: Scoreboard;
  averages: readonly number[];
  leads: readonly CategoryLead[];
  palette: readonly string[];
  hideSize: boolean;
  onHideSize: ((hide: boolean) => void) | undefined;
}) {
  const type = dataset.type.id;
  const order = places
    .map((_, k) => k)
    .sort((a, b) => score.wins[b] - score.wins[a]);
  const top = order[0];
  const tiedTop = order.length > 1 && score.wins[order[1]] === score.wins[top];
  const headline =
    score.total === 0
      ? 'No directional metrics in common'
      : tiedTop
        ? `Dead heat: ${places[top].name} and ${places[order[1]].name} each win ${formatInt(score.wins[top])} of ${formatInt(score.total)}`
        : `${places[top].name} wins ${formatInt(score.wins[top])} of ${formatInt(score.total)} shared metrics`;
  const led = places.map((_, k) => leads.filter((l) => l.leader === k).length);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight md:text-xl">
            {headline}
          </h2>
          <p className="text-muted mt-0.5 text-sm">
            Counting metrics where one end is better and{' '}
            {places.length === 2 ? 'both' : `all ${places.length}`} places have
            a value
            {score.ties > 0 ? `; ${plural(score.ties, 'tie')}` : ''}.
          </p>
        </div>
        {onHideSize != null ? (
          <label
            className="text-muted inline-flex cursor-pointer items-center gap-2 text-xs"
            title="Totals such as “# of burglaries” mostly reflect how many people live in a place (Spearman ρ ≥ 0.75 with population)."
          >
            <input
              type="checkbox"
              checked={hideSize}
              onChange={(e) => onHideSize(e.target.checked)}
              className="accent-accent-600"
            />
            Leave out totals that track population
          </label>
        ) : null}
      </div>
      {score.total > 0 ? (
        <div
          className="bg-surface-2 mt-4 flex h-3 overflow-hidden rounded-full"
          role="img"
          aria-label={places
            .map((p, k) => `${p.name} ${score.wins[k]}`)
            .concat(score.ties > 0 ? [`ties ${score.ties}`] : [])
            .join(', ')}
        >
          {places.map((p, k) => (
            <div
              key={p.id}
              style={{
                width: `${(score.wins[k] / score.total) * 100}%`,
                backgroundColor: palette[k],
              }}
              title={`${p.name}: ${score.wins[k]}`}
            />
          ))}
          {score.ties > 0 ? (
            <div
              className="bg-slate-300 dark:bg-slate-600"
              style={{ width: `${(score.ties / score.total) * 100}%` }}
              title={`Ties: ${score.ties}`}
            />
          ) : null}
        </div>
      ) : null}
      <div
        className={cx(
          'mt-4 grid gap-3',
          places.length === 2
            ? 'sm:grid-cols-2'
            : places.length === 3
              ? 'sm:grid-cols-3'
              : 'sm:grid-cols-2 lg:grid-cols-4'
        )}
      >
        {places.map((p, k) => (
          <div
            key={p.id}
            className="border-app rounded-xl border p-3"
            style={{ borderTopColor: palette[k], borderTopWidth: 3 }}
          >
            <div className="flex items-center gap-2">
              <Flag entity={p} type={type} size={22} />
              <Link
                to="/places/$type/$slug"
                params={{ type, slug: p.slug }}
                className="hover:text-accent-600 dark:hover:text-accent-300 truncate font-medium"
              >
                {p.name}
              </Link>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <dt className="text-muted text-[11px]">Wins</dt>
                <dd className="tabular text-xl font-semibold">
                  {formatInt(score.wins[k])}
                </dd>
              </div>
              <div>
                <dt className="text-muted text-[11px]">Avg. percentile</dt>
                <dd className="tabular text-xl font-semibold">
                  {Number.isNaN(averages[k]) ? '—' : pctText(averages[k])}
                </dd>
              </div>
              <div>
                <dt className="text-muted text-[11px]">Categories led</dt>
                <dd className="tabular text-xl font-semibold">
                  {formatInt(led[k])}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Who leads each category on average percentile; selecting one filters the chart and table. */
function CategoryLeads({
  leads,
  places,
  palette,
  categoryLabel,
  active,
  onSelect,
}: {
  leads: readonly CategoryLead[];
  places: readonly Entity[];
  palette: readonly string[];
  categoryLabel: (id: string) => string;
  active: string | undefined;
  onSelect: (category: string) => void;
}) {
  return (
    <Card
      title="By category"
      subtitle="Average percentile on each category's metrics. Select one to filter."
    >
      {leads.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">
          No category has three or more shared, widely ranked metrics.
        </p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {leads.map((l) => (
            <li key={l.category}>
              <button
                type="button"
                aria-pressed={active === l.category}
                onClick={() => onSelect(l.category)}
                className={cx(
                  'w-full rounded-lg px-2 py-1.5 text-left transition-colors',
                  active === l.category
                    ? 'bg-accent-50 dark:bg-accent-900/40'
                    : 'hover:bg-surface-2'
                )}
              >
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">
                    {categoryLabel(l.category)}
                  </span>
                  <span className="text-muted shrink-0 text-xs">
                    {l.leader != null ? (
                      <span
                        className="font-medium"
                        style={{ color: palette[l.leader] }}
                      >
                        {places[l.leader].name}
                      </span>
                    ) : (
                      'Even'
                    )}
                    {` · ${l.count}`}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5" aria-hidden>
                  {l.means.map((m, k) => (
                    <div
                      key={places[k].id}
                      className="bg-surface-2 h-1.5 overflow-hidden rounded-full"
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(2, m * 100)}%`,
                          backgroundColor: palette[k],
                          opacity: l.leader === k ? 1 : 0.55,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
