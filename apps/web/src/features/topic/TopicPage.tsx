import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
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
  numericColumn,
  rankEntries,
  resolveYear,
  seriesYears,
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
import { formatValue, tickFormatter } from '~/lib/format';
import { useTitle } from '~/lib/useTitle';

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
  const search = route.useSearch();
  const navigate = route.useNavigate();
  useTitle(topic.title);

  const tables = useMemo(
    () => displayTables(topic, (id) => dataset.metric(id) != null),
    [topic, dataset]
  );
  const focusables = useMemo(
    () => focusableMetrics(tables, (id) => dataset.metric(id)),
    [tables, dataset]
  );
  const focus =
    focusables.find((m) => m.id === search.m) ?? focusables[0] ?? null;
  const [selected, setSelected] = useState<number | null>(null);

  const setFocus = useCallback(
    (id: number) =>
      void navigate({
        search: (prev) => ({ ...prev, m: id, year: undefined }),
        replace: true,
        resetScroll: false,
      }),
    [navigate]
  );
  const setYear = useCallback(
    (year: number) =>
      void navigate({
        search: (prev) => ({ ...prev, year }),
        replace: true,
        resetScroll: false,
      }),
    [navigate]
  );
  // Clicking the same place again clears the selection.
  const toggleSelected = useCallback(
    (i: number) => setSelected((cur) => (cur === i ? null : i)),
    []
  );

  const hasData = tables.length > 0;
  return (
    <div className="space-y-6">
      <TopicHeader topic={topic} dataset={dataset} />
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
          requestedYear={search.year}
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
    </div>
  );
}

interface NumericTopicProps {
  topic: TopicFile;
  dataset: Dataset;
  tables: TopicTable[];
  focusables: Metric[];
  focus: Metric;
  requestedYear: number | undefined;
  selected: number | null;
  onSelect: (i: number) => void;
  onClearSelected: () => void;
  onFocus: (id: number) => void;
  onYear: (year: number) => void;
}

/** How the map's colours read for a metric's polarity (matches the Choropleth schemes). */
function mapLegendHint(metric: Metric): string {
  if (metric.pol === 1) return 'Darker green is better (higher is better).';
  if (metric.pol === -1) return 'Darker red is worse (lower is better).';
  return 'Darker means higher.';
}

/** Places needed before the distribution card (and the trend's median line) is shown. */
const MIN_DISTRIBUTION = 5;

/** Drops trailing ".0" on whole-number ticks ("20.0" → "20", "5.00%" → "5%"). */
function wholeTicks(base: (v: number) => string): (v: number) => string {
  return (v) => {
    const s = base(v);
    return Number.isInteger(v) ? s.replace(/\.0+(?!\d)/, '') : s;
  };
}

/** Everything shown for a topic with at least one numeric metric. */
function NumericTopic({
  topic,
  dataset,
  tables,
  focusables,
  focus,
  requestedYear,
  selected,
  onSelect,
  onClearSelected,
  onFocus,
  onYear,
}: NumericTopicProps) {
  const narrow = useNarrow();
  const years = useMemo(() => seriesYears(topic, focus.id), [topic, focus]);
  const year = resolveYear(years, requestedYear, focus.year);
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
  const formats = useMemo<Formats>(
    () => ({
      format: (v: number) => formatValue(focus, v, { compact: true }),
      tickFormat: wholeTicks(tickFormatter(focus)),
    }),
    [focus]
  );
  const isRank = focus.fmt === 'ranking';
  const selectedEntry =
    selected != null
      ? (ranked.find((e) => e.index === selected) ?? null)
      : null;
  const highlight = useMemo(
    () => (selected != null ? [dataset.entities[selected].id] : []),
    [selected, dataset]
  );
  const yearLabel = year != null ? String(year) : null;

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
        year={year}
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
        coverage={ranked.length}
        selected={selected}
        selectedRank={selectedEntry}
        onFocus={onFocus}
        onYear={onYear}
        onClearSelected={onClearSelected}
      />

      {ranked.length === 0 ? (
        <EmptyState title="No values for this metric">
          Pick another metric{years.length > 1 ? ' or year' : ''} above.
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
