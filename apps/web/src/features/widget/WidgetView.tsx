import { useQueryClient, useSuspenseQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { widgetPlaces, type WidgetSearch } from './embed';
import { entitiesQuery, manifestQuery, topicQuery } from '~/data/api';
import { rankOrder } from '~/data/rankOrder';
import { topicDataset } from '~/data/topicPage';
import type { EntityType } from '~/data/types';
import { RankedBars } from '~/features/topic/charts/RankedBars';
import {
  isYearValued,
  leadMetric,
  topicListOrder,
} from '~/features/topic/headline';
import {
  displayTables,
  focusableMetrics,
  hasUndated,
  numericColumn,
  rankEntries,
  resolveYear,
  seriesYears,
} from '~/features/topic/model';
import { topicPageQuery } from '~/features/topic/pageData';
import { finiteExtent } from '~/lib/axis';
import { labelFormat } from '~/lib/format';
import { absoluteUrl, SITE } from '~/site';

/**
 * The embeddable ranking: a topic's title, the top places on its lead (or chosen) statistic as
 * bars, and a credit line linking to the full topic page. It runs inside other sites' iframes,
 * so it has no site header or footer and every link opens in a new tab.
 */
export function WidgetView({ search }: { search: WidgetSearch }) {
  if (search.t == null || search.s == null) {
    return <WidgetMessage text="This embed is missing its topic." />;
  }
  return <WidgetRanking type={search.t} slug={search.s} search={search} />;
}

function WidgetRanking({
  type,
  slug,
  search,
}: {
  type: EntityType;
  slug: string;
  search: WidgetSearch;
}) {
  const queryClient = useQueryClient();
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
  const dataset = useMemo(
    () => topicDataset(manifest, type, entities, topic, page),
    [manifest, type, entities, topic, page]
  );
  const focus = useMemo(() => {
    const tables = displayTables(topic, (id) => dataset.metric(id) != null);
    const metrics = focusableMetrics(tables, (id) => dataset.metric(id));
    // The same lead as the topic page: the build-time lead metric when it is one of the page's
    // own columns, else the first column; then the first numeric one if that is categorical.
    const leadId = leadMetric(topic, dataset)?.id;
    const lead = metrics.find((m) => m.id === leadId) ?? metrics[0];
    return (
      metrics.find((m) => m.id === search.m && m.kind === 'num') ??
      (lead?.kind === 'num' ? lead : undefined) ??
      metrics.find((m) => m.kind === 'num') ??
      null
    );
  }, [topic, dataset, search.m]);

  const view = useMemo(() => {
    if (focus == null) return null;
    const years = seriesYears(topic, focus.id);
    const year = resolveYear(
      years,
      undefined,
      focus.year,
      hasUndated(topic, focus.id)
    );
    const values = numericColumn(
      topic,
      focus.id,
      year,
      dataset.entities.length
    );
    const order = topicListOrder(
      topic,
      focus,
      leadMetric(topic, dataset),
      isYearValued(focus, values)
    );
    const ranked = rankEntries(values, order.direction);
    return {
      year,
      ranked,
      format: labelFormat(focus, finiteExtent(values)),
    };
  }, [topic, dataset, focus]);

  const pageUrl = absoluteUrl(`/topics/${type}/${slug}`);
  if (focus == null || view == null || view.ranked.length === 0) {
    return <WidgetMessage text="This ranking has no chartable values." />;
  }
  const places = widgetPlaces(search.n);
  const head = view.ranked.slice(0, places);
  return (
    <div className="bg-surface text-app flex min-h-screen flex-col gap-2 p-3">
      <div>
        <a
          href={pageUrl}
          target="_blank"
          rel="noopener"
          className="text-sm font-semibold hover:underline"
        >
          {topic.title}
        </a>
        <p className="text-muted text-xs">
          {focus.label}
          {view.year != null ? `, ${view.year}` : ''} · top {head.length} of{' '}
          {view.ranked.length}
        </p>
      </div>
      <RankedBars
        dataset={dataset}
        head={head}
        tail={[]}
        total={view.ranked.length}
        label={focus.label}
        metric={focus}
        format={view.format}
        invert={rankOrder(focus) != null}
        selected={null}
        onSelect={() => {}}
        rowHeight={22}
      />
      <p className="text-muted mt-auto text-right text-[11px]">
        Data:{' '}
        <a
          href={pageUrl}
          target="_blank"
          rel="noopener"
          className="font-medium underline underline-offset-2"
        >
          {SITE.name}
        </a>
      </p>
    </div>
  );
}

function WidgetMessage({ text }: { text: string }) {
  return (
    <div className="text-muted p-4 text-sm">
      {text}{' '}
      <a
        href={absoluteUrl('/')}
        target="_blank"
        rel="noopener"
        className="underline"
      >
        {SITE.name}
      </a>
    </div>
  );
}
