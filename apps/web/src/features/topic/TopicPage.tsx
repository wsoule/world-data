import { useQueryClient, useSuspenseQueries } from '@tanstack/react-query';
import {
  getRouteApi,
  useHydrated,
  useRouterState,
} from '@tanstack/react-router';
import { summarize } from '@world-data/stats';
import { FileQuestion } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { CategoricalTopic } from './CategoricalTopic';
import {
  CorrelationsCard,
  correlationsTitle,
  CorrelationsView,
} from './CorrelationsCard';
import {
  type StoredCorrelations,
  storedCorrelationsDataset,
} from './correlationsData';
import { FocusBar } from './FocusBar';
import { isYearValued, leadMetric, topicListOrder } from './headline';
import {
  displayTables,
  focusableMetrics,
  hasUndated,
  numericColumn,
  rankEntries,
  resolveYear,
  seriesYears,
  yearParam,
} from './model';
import { MoversCard } from './MoversCard';
import { NearViewport } from './NearViewport';
import { topicPageQuery } from './pageData';
import { RelatedTopics } from './related/RelatedTopics';
import { TopicStories } from './related/TopicStories';
import { SuggestedTopics } from './SuggestedTopics';
import { TopicHeader } from './TopicHeader';
import { TopicTables } from './TopicTable';
import {
  DistributionCard,
  type Formats,
  RankingCard,
  TrendCard,
} from './TopicVisuals';
import { useNarrow } from './useNarrow';
import { Choropleth } from '~/charts/Choropleth';
import { EmptyState, NotFound, Spinner } from '~/components/feedback';
import { QuickAnswers } from '~/components/QuickAnswers';
import { Card } from '~/components/ui';
import {
  adjustContext,
  type AdjustmentId,
  adjustTopicFile,
  availableAdjustments,
  canAdjust,
  withAdjustment,
} from '~/data/adjustments';
import { entitiesQuery, manifestQuery, topicQuery } from '~/data/api';
import {
  type Dataset,
  isDatasetLoaded,
  type TopicTitle,
  useDataset,
} from '~/data/dataset';
import { isRankColumn, rankOrder, rankOrderNote } from '~/data/rankOrder';
import { topicDataset } from '~/data/topicPage';
import {
  type EntityType,
  isEntityType,
  type Metric,
  type TopicFile,
  type TopicTable,
} from '~/data/types';
import { usePrefetchStories } from '~/features/articles/StoryLinks';
import { mayHaveStories } from '~/features/articles/storyPicks';
import { datasetFacts } from '~/features/places/datasetFacts';
import { finiteExtent } from '~/lib/axis';
import { labelFormat } from '~/lib/format';
import type { TopicSearch } from '~/routes/topics.$type.$slug';
import { topicAnswers, type TopicAnswers } from '~/seo/topic-content';

const route = getRouteApi('/topics/$type/$slug');

/** Topic page: one source page (e.g. "Median Household Income by State") explored in depth. */
export function TopicPage() {
  const { type, slug } = route.useParams();
  if (!isEntityType(type)) return <NotFound />;
  return <TopicView key={`${type}/${slug}`} type={type} slug={slug} />;
}

function TopicView({ type, slug }: { type: EntityType; slug: string }) {
  const queryClient = useQueryClient();
  // The topic file, the page's data slice and the type's entities load together (the head
  // preloads them).
  const [
    { data: topic },
    { data: page },
    { data: manifest },
    { data: entities },
  ] = useSuspenseQueries({
    queries: [
      topicQuery(type, slug),
      topicPageQuery(queryClient, type, slug),
      manifestQuery,
      entitiesQuery(type),
    ],
  });
  // The story links near the end need the stories index: fetch it alongside the rest.
  usePrefetchStories(mayHaveStories(topic.metrics));
  const { seo } = route.useLoaderData();
  // Everything above the correlations card reads this small Dataset: the topic's statistics and
  // the columns adjustments divide by, not the whole place type (see data/topicPage.ts).
  const base = topicDataset(manifest, type, entities, topic, page);
  // Prerendered HTML is built without search params, so the first (hydrating)
  // render uses the defaults and ?m / ?year apply right after hydration.
  const hydrated = useHydrated();
  const urlSearch = route.useSearch();
  // A link from a place profile or a correlation names the metric to open on in its history
  // state (`topicFocus`), so the link itself is the bare topic URL crawlers may follow.
  const stateFocus = useRouterState({
    select: (s) => s.location.state.topicFocus,
  });
  const search: TopicSearch = !hydrated
    ? {}
    : urlSearch.m == null && stateFocus != null
      ? { ...urlSearch, m: stateFocus }
      : urlSearch;
  const navigate = route.useNavigate();

  // Adjustments (?adj) offered for this topic's statistics: cost of living for wages, share of
  // income for household costs, per person for totals. `dataset` and `shown` carry the chosen
  // one, so every chart, table and sentence below reads adjusted values and labels.
  const sizeDriven = useMemo(() => datasetFacts(base).sizeDriven, [base]);
  const adjustCtx = useMemo(
    () => adjustContext(base, sizeDriven),
    [base, sizeDriven]
  );
  const adjustOptions = useMemo(
    () =>
      availableAdjustments(
        topic.metrics.flatMap((id) => {
          const m = base.metric(id);
          return m == null ? [] : [m];
        }),
        adjustCtx
      ),
    [topic, base, adjustCtx]
  );
  const adj =
    search.adj != null && adjustOptions.includes(search.adj)
      ? search.adj
      : undefined;
  const dataset = useMemo(
    () => withAdjustment(base, adj, sizeDriven),
    [base, adj, sizeDriven]
  );
  const shown = useMemo(
    () =>
      adjustTopicFile(
        topic,
        adj,
        (id) => base.metric(id),
        adjustCtx,
        base.entities.length
      ),
    [topic, adj, base, adjustCtx]
  );

  const tables = useMemo(
    () => displayTables(topic, (id) => dataset.metric(id) != null),
    [topic, dataset]
  );
  const focusables = useMemo(
    () => focusableMetrics(tables, (id) => dataset.metric(id)),
    [tables, dataset]
  );
  // The page opens on the lead metric, the one the build-time summary and FAQ describe.
  const lead = useMemo(() => {
    const id = leadMetric(topic, dataset)?.id;
    return focusables.find((m) => m.id === id) ?? focusables[0] ?? null;
  }, [topic, dataset, focusables]);
  const focus = focusables.find((m) => m.id === search.m) ?? lead;
  // Once open, the focus from history state moves into the URL (?m, left out for the lead
  // metric) like any other choice, so later year or table changes keep it.
  useEffect(() => {
    if (!hydrated || stateFocus == null || urlSearch.m != null) return;
    void navigate({
      search: (prev) => ({
        ...prev,
        m: focus == null || focus.id === lead?.id ? undefined : focus.id,
      }),
      state: (prev) => ({ ...prev, topicFocus: undefined }),
      replace: true,
      resetScroll: false,
    });
  }, [hydrated, stateFocus, urlSearch.m, focus, lead, navigate]);
  const years = useMemo(
    () => (focus == null ? [] : seriesYears(topic, focus.id)),
    [topic, focus]
  );
  const undated = focus != null && hasUndated(topic, focus.id);
  const defaultYear =
    focus == null ? null : resolveYear(years, undefined, focus.year, undated);
  const year =
    focus == null ? null : resolveYear(years, search.year, focus.year, undated);
  // The default view shows the loader's text, which is also the page's FAQPage
  // JSON-LD; any other metric, year or adjustment gets the same sentences recomputed.
  const answers = useMemo<TopicAnswers>(
    () =>
      focus == null ||
      (focus.id === lead?.id && year === defaultYear && adj == null)
        ? seo
        : topicAnswers(shown, dataset, focus, year),
    [seo, shown, dataset, focus, lead, year, defaultYear, adj]
  );
  const setAdjust = useCallback(
    (id: AdjustmentId | undefined) =>
      void navigate({
        search: (prev) => ({ ...prev, adj: id, col: undefined }),
        resetScroll: false,
      }),
    [navigate]
  );
  const [selected, setSelected] = useState<number | null>(null);

  // Metric and year switches are discrete steps, so each gets a history entry
  // that Back undoes. A new metric also resets the data table to its tab and order.
  const setFocus = useCallback(
    (id: number) => {
      if (id === focus?.id) return;
      void navigate({
        search: (prev) => ({
          ...prev,
          m: id === lead?.id ? undefined : id,
          year: undefined,
          tab: undefined,
          tsort: undefined,
        }),
        resetScroll: false,
      });
    },
    [navigate, lead, focus]
  );
  // The metric's default year (or undated series) stays out of the URL.
  const setYear = useCallback(
    (choice: number | null) => {
      if (choice === year) return;
      void navigate({
        search: (prev) => ({ ...prev, year: yearParam(choice, defaultYear) }),
        resetScroll: false,
      });
    },
    [navigate, defaultYear, year]
  );
  // Clicking the same place again clears the selection.
  const toggleSelected = useCallback(
    (i: number) => setSelected((cur) => (cur === i ? null : i)),
    []
  );

  const hasData = tables.length > 0;
  return (
    <div className="space-y-6">
      <TopicHeader
        topic={topic}
        dataset={dataset}
        summary={answers.summary}
        topics={page.topics}
      />
      {!hasData ? (
        <EmptyState
          title="No data on this page"
          icon={<FileQuestion className="text-muted size-6" aria-hidden />}
        >
          The source page has no table we could read. Try the original page
          linked above.
        </EmptyState>
      ) : focus != null ? (
        <NumericTopic
          topic={shown}
          adjust={{
            options: adjustOptions,
            value: adj,
            set: setAdjust,
            note:
              adj != null &&
              focus != null &&
              !canAdjust(adj, base.metric(focus.id) ?? focus, adjustCtx)
                ? 'This statistic is shown as reported; the adjustment applies to others on this page.'
                : null,
          }}
          dataset={dataset}
          tables={tables}
          focusables={focusables}
          focus={focus}
          years={years}
          year={year}
          undated={undated}
          selected={selected}
          onSelect={toggleSelected}
          onClearSelected={() => setSelected(null)}
          onFocus={setFocus}
          onYear={setYear}
          correlations={
            adj == null &&
            page.correlations != null &&
            page.correlations.focus === focus.id &&
            page.correlations.year === year
              ? page.correlations
              : null
          }
          topicTitles={page.topics}
        />
      ) : (
        <CategoricalTopic
          topic={topic}
          dataset={dataset}
          tables={tables}
          selected={selected}
          onSelect={toggleSelected}
        />
      )}
      <TopicStories topic={topic} focusId={focus?.id ?? null} />
      <QuickAnswers items={answers.faq} className="mt-8" />
      <RelatedTopics topic={topic} items={page.related} />
      <SuggestedTopics topic={topic} items={page.suggested} />
    </div>
  );
}

/** The adjustment choice offered on a topic page. */
export interface AdjustControl {
  options: readonly AdjustmentId[];
  value: AdjustmentId | undefined;
  set: (id: AdjustmentId | undefined) => void;
  note: string | null;
}

interface NumericTopicProps {
  topic: TopicFile;
  adjust: AdjustControl;
  dataset: Dataset;
  tables: TopicTable[];
  focusables: Metric[];
  focus: Metric;
  /** Dated years of the focus metric, oldest first */
  years: number[];
  /** Year shown, or null for the undated series */
  year: number | null;
  /** The focus metric has an undated series (offered as "Latest") */
  undated: boolean;
  selected: number | null;
  onSelect: (i: number) => void;
  onClearSelected: () => void;
  onFocus: (id: number) => void;
  onYear: (year: number | null) => void;
  /** The correlations card's stored rows when they are for the view shown, else null */
  correlations: StoredCorrelations | null;
  /** Topic titles of the page's slice, for the stored card's labels */
  topicTitles: readonly TopicTitle[];
}

/**
 * How the map's colours read for a metric's polarity (matches the Choropleth schemes, whose
 * legend always runs from worst on the left to best on the right). Rank columns say which end
 * rank 1 is, since "higher is better" alone reads oddly next to "1st".
 */
function mapLegendHint(metric: Pick<Metric, 'fmt' | 'pol'>): string {
  const order = rankOrder(metric);
  if (metric.pol === 1)
    return `Darker green is better (${order != null ? `${rankOrderNote(order)}, so a higher rank number is better` : 'higher is better'}).`;
  if (metric.pol === -1)
    return `Green is better, red is worse (${order != null ? rankOrderNote(order) : 'lower is better'}).`;
  return 'Darker means higher.';
}

/** Places needed before the distribution card (and the trend's median line) is shown. */
const MIN_DISTRIBUTION = 5;

/** Everything shown for a topic with at least one numeric metric. */
function NumericTopic({
  topic,
  adjust,
  dataset,
  tables,
  focusables,
  focus,
  years,
  year,
  undated,
  selected,
  onSelect,
  onClearSelected,
  onFocus,
  onYear,
  correlations,
  topicTitles,
}: NumericTopicProps) {
  const narrow = useNarrow();
  const values = useMemo(
    () => numericColumn(topic, focus.id, year, dataset.entities.length),
    [topic, focus, year, dataset]
  );
  // Rank columns list rank 1 first (a worst-first list opens on its worst place); other
  // metrics list best first, unless the title asks for an end ("Coldest" lists lowest first).
  const order = useMemo(
    () =>
      topicListOrder(
        topic,
        focus,
        leadMetric(topic, dataset),
        isYearValued(focus, values)
      ),
    [topic, focus, dataset, values]
  );
  const direction = order.direction;
  const ranked = useMemo(
    () => rankEntries(values, direction),
    [values, direction]
  );
  const stats = useMemo(() => summarize(values), [values]);
  // One label form for the map legend, the bars and the stat hints of the year shown.
  const formats = useMemo<Formats>(
    () => ({ format: labelFormat(focus, finiteExtent(values)) }),
    [focus, values]
  );
  const isRank = isRankColumn(focus);
  const selectedEntry =
    selected != null
      ? (ranked.find((e) => e.index === selected) ?? null)
      : null;
  const highlight = useMemo(
    () => (selected != null ? [dataset.entities[selected].id] : []),
    [selected, dataset]
  );
  // The undated series reads as "latest" next to dated ones, and needs no label when alone.
  const yearLabel =
    year != null ? String(year) : years.length > 0 ? 'latest' : null;

  // Second row: distribution (not for ranks, which are uniform by construction), then the
  // trend when there are 3+ years, or the biggest movers when there are just two (always
  // for ranks, where movement is the story).
  const second: ReactNode[] = [];
  const trend = years.length >= 3;
  const movers = years.length >= 2 && (isRank || !trend);
  // A distribution of fewer than five places says nothing the ranking does not.
  const distribution = !isRank && ranked.length >= MIN_DISTRIBUTION;
  const columns = (distribution ? 1 : 0) + (trend ? 1 : 0) + (movers ? 1 : 0);
  if (distribution)
    second.push(
      <DistributionCard
        key="distribution"
        dataset={dataset}
        focus={focus}
        values={values}
        stats={stats}
        ranked={ranked}
        formats={formats}
        wide={columns === 1}
        selected={selected}
        onSelect={onSelect}
      />
    );
  if (trend)
    second.push(
      <TrendCard
        key="trend"
        topic={topic}
        dataset={dataset}
        focus={focus}
        years={years}
        year={year}
        ranked={ranked}
        withMedian={!isRank && ranked.length >= MIN_DISTRIBUTION}
        selected={selected}
      />
    );
  if (movers)
    second.push(
      <MoversCard
        key="movers"
        topic={topic}
        dataset={dataset}
        focus={focus}
        years={years}
        // The undated series has no previous year: show the change into the latest dated one.
        year={year ?? years[years.length - 1]}
        selected={selected}
        onSelect={onSelect}
      />
    );

  return (
    <>
      <FocusBar
        dataset={dataset}
        tables={tables}
        metrics={focusables}
        focus={focus}
        years={years}
        year={year}
        undated={undated}
        coverage={ranked.length}
        selected={selected}
        selectedRank={selectedEntry}
        onFocus={onFocus}
        onYear={onYear}
        onClearSelected={onClearSelected}
        adjust={adjust}
      />

      {ranked.length === 0 ? (
        <EmptyState title="No values for this metric">
          Pick another metric
          {years.length + (undated ? 1 : 0) > 1 ? ' or year' : ''} above.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Card
              title={`${focus.label}${yearLabel != null ? `, ${yearLabel}` : ''}`}
              subtitle={`${mapLegendHint(focus)} Click a place to highlight it.`}
            >
              <Choropleth
                dataset={dataset}
                values={values}
                format={formats.format}
                label={focus.label}
                polarity={focus.pol}
                highlight={highlight}
                onSelect={onSelect}
                height={narrow ? 240 : 400}
              />
            </Card>
            <RankingCard
              dataset={dataset}
              focus={focus}
              ranked={ranked}
              order={order}
              formats={formats}
              selected={selected}
              onSelect={onSelect}
            />
          </div>

          {second.length > 0 ? (
            <div
              className={
                second.length > 1 ? 'grid gap-6 lg:grid-cols-2' : 'grid gap-6'
              }
            >
              {second}
            </div>
          ) : null}
        </>
      )}

      <TopicTables
        dataset={dataset}
        topic={topic}
        tables={tables}
        focusId={focus.id}
        year={year}
        selected={selected}
        onSelect={onSelect}
      />

      {correlations != null ? (
        // The view the page opens on: the rows the page's slice stores, the same as the server
        // HTML, so the card hydrates without the whole place type's data.
        <CorrelationsView
          dataset={storedCorrelationsDataset(
            dataset,
            correlations,
            topicTitles
          )}
          focus={focus}
          yearLabel={yearLabel}
          result={correlations.result}
        />
      ) : (
        <Correlations
          // A new metric, year or adjustment replaces the block (see NearViewport).
          key={`${focus.id}:${year ?? 'latest'}:${adjust.value ?? ''}`}
          type={dataset.type.id}
          adj={adjust.value}
          focus={focus}
          values={values}
          yearLabel={yearLabel}
          exclude={topic.metrics}
        />
      )}
    </>
  );
}

interface CorrelationsProps {
  type: EntityType;
  adj: AdjustmentId | undefined;
  focus: Metric;
  values: Float64Array;
  yearLabel: string | null;
  exclude: readonly number[];
}

/**
 * The correlations card, which tests the focus metric against every other statistic of the place
 * type and so needs the whole type's data. It is server rendered like the rest of the page, but
 * the browser downloads that data only when the card comes near the viewport, so the page above
 * it hydrates from its small slice alone.
 */
function Correlations(props: CorrelationsProps) {
  const queryClient = useQueryClient();
  return (
    <NearViewport
      ready={isDatasetLoaded(queryClient, props.type)}
      margin={200}
      fallback={
        <Card title={correlationsTitle(props.focus, props.yearLabel)}>
          <div className="flex min-h-24 items-center justify-center">
            <Spinner label="Loading correlations…" />
          </div>
        </Card>
      }
    >
      <FullCorrelations {...props} />
    </NearViewport>
  );
}

/** The card itself, on the whole place type's data with the page's adjustment applied. */
function FullCorrelations({ type, adj, ...card }: CorrelationsProps) {
  const full = useDataset(type);
  const dataset = useMemo(
    () =>
      adj == null
        ? full
        : withAdjustment(full, adj, datasetFacts(full).sizeDriven),
    [full, adj]
  );
  return <CorrelationsCard dataset={dataset} {...card} />;
}
