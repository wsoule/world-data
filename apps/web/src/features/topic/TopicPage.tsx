import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, useHydrated } from '@tanstack/react-router';
import { summarize } from '@world-data/stats';
import { FileQuestion } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { CategoricalTopic } from './CategoricalTopic';
import { CorrelationsCard } from './CorrelationsCard';
import { FocusBar } from './FocusBar';
import {
  directionOf,
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
import { EmptyState, NotFound } from '~/components/feedback';
import { QuickAnswers } from '~/components/QuickAnswers';
import { Card } from '~/components/ui';
import { topicQuery } from '~/data/api';
import { type Dataset, useDataset } from '~/data/dataset';
import {
  type EntityType,
  isEntityType,
  type Metric,
  type TopicFile,
  type TopicTable,
} from '~/data/types';
import { axisBounds, axisTickFormat, finiteExtent } from '~/lib/axis';
import { formatValue } from '~/lib/format';
import type { TopicSearch } from '~/routes/topics.$type.$slug';
import { leadMetric } from '~/seo/content';
import { topicAnswers, type TopicAnswers } from '~/seo/topic-content';

const route = getRouteApi('/topics/$type/$slug');

/** Topic page: one source page (e.g. "Median Household Income by State") explored in depth. */
export function TopicPage() {
  const { type, slug } = route.useParams();
  if (!isEntityType(type)) return <NotFound />;
  return <TopicView key={`${type}/${slug}`} type={type} slug={slug} />;
}

function TopicView({ type, slug }: { type: EntityType; slug: string }) {
  const { data: topic } = useSuspenseQuery(topicQuery(type, slug));
  const dataset = useDataset(type);
  const { seo } = route.useLoaderData();
  // Prerendered HTML is built without search params, so the first (hydrating)
  // render uses the defaults and ?m / ?year apply right after hydration.
  const hydrated = useHydrated();
  const urlSearch = route.useSearch();
  const search: TopicSearch = hydrated ? urlSearch : {};
  const navigate = route.useNavigate();

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
  // JSON-LD; any other metric or year gets the same sentences recomputed.
  const answers = useMemo<TopicAnswers>(
    () =>
      focus == null || (focus.id === lead?.id && year === defaultYear)
        ? seo
        : topicAnswers(topic, dataset, focus, year),
    [seo, topic, dataset, focus, lead, year, defaultYear]
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
      <TopicHeader topic={topic} dataset={dataset} summary={answers.summary} />
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
          topic={topic}
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
      <QuickAnswers items={answers.faq} />
    </div>
  );
}

interface NumericTopicProps {
  topic: TopicFile;
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
}

/** How the map's colours read for a metric's polarity (matches the Choropleth schemes). */
function mapLegendHint(metric: Metric): string {
  if (metric.pol === 1) return 'Darker green is better (higher is better).';
  if (metric.pol === -1) return 'Darker red is worse (lower is better).';
  return 'Darker means higher.';
}

/** Places needed before the distribution card (and the trend's median line) is shown. */
const MIN_DISTRIBUTION = 5;

/**
 * Smallest and largest value a metric takes in any year of the topic. The topic charts share
 * one tick formatter, chosen for this range, so every axis on the page (ranking, distribution
 * and trend, whatever the year) labels its ticks in the same short form.
 */
function seriesExtent(topic: TopicFile, metricId: number): [number, number] {
  const series = topic.series[String(metricId)] ?? {};
  const all: number[] = [];
  for (const [, values] of Object.values(series))
    for (const v of values) if (typeof v === 'number') all.push(v);
  return finiteExtent(all) ?? [0, 1];
}

/** Everything shown for a topic with at least one numeric metric. */
function NumericTopic({
  topic,
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
}: NumericTopicProps) {
  const narrow = useNarrow();
  const values = useMemo(
    () => numericColumn(topic, focus.id, year, dataset.entities.length),
    [topic, focus, year, dataset]
  );
  const direction = directionOf(focus);
  const ranked = useMemo(
    () => rankEntries(values, direction),
    [values, direction]
  );
  const stats = useMemo(() => summarize(values), [values]);
  const formats = useMemo<Formats>(() => {
    const [lo, hi] = seriesExtent(topic, focus.id);
    return {
      format: (v: number) => formatValue(focus, v, { compact: true }),
      tickFormat: axisTickFormat(focus, axisBounds(lo, hi)),
    };
  }, [topic, focus]);
  const isRank = focus.fmt === 'ranking';
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
        formats={formats}
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

      <CorrelationsCard
        dataset={dataset}
        focus={focus}
        values={values}
        yearLabel={yearLabel}
        exclude={topic.metrics}
      />
    </>
  );
}
