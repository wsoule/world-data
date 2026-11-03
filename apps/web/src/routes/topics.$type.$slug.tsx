import { createFileRoute, notFound } from '@tanstack/react-router';

import { notFoundHead } from '~/components/feedback';
import { manifestQuery, topicQuery } from '~/data/api';
import { loadDataset } from '~/data/dataset';
import { isEntityType } from '~/data/types';
import { LATEST, type YearRequest } from '~/features/topic/model';
import { TopicPage } from '~/features/topic/TopicPage';
import { pageHead } from '~/lib/seo';
import { topicSummary } from '~/seo/content';

export interface TopicSearch {
  /** Focused metric id */
  m?: number;
  /** Year for the focused metric, or "latest" for its undated series */
  year?: YearRequest;
  /** Data table: index of the open table tab */
  tab?: number;
  /** Data table: place-name filter */
  tq?: string;
  /** Data table: sorted column id, "-" prefixed when descending */
  tsort?: string;
  /** Show wages and incomes adjusted for each place's cost of living */
  col?: true;
}

/** A finite number from a search value ("12" or 12), else undefined. */
function numberParam(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** A non-empty string from a search value (the router parses "123" as a number), else undefined. */
function textParam(raw: unknown): string | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return typeof raw === 'string' && raw !== '' ? raw : undefined;
}

export const Route = createFileRoute('/topics/$type/$slug')({
  validateSearch: (raw: Record<string, unknown>): TopicSearch => ({
    m: numberParam(raw.m),
    year: raw.year === LATEST ? LATEST : numberParam(raw.year),
    tab: numberParam(raw.tab),
    tq: textParam(raw.tq),
    tsort: textParam(raw.tsort),
    col: raw.col === true || raw.col === 'true' ? true : undefined,
  }),
  // The summary depends only on the path, so search changes (metric, year,
  // table filter) never rerun the loader.
  staleTime: Infinity,
  loader: async ({ context, params }) => {
    if (!isEntityType(params.type)) throw notFound();
    const [ds, topic, manifest] = await Promise.all([
      loadDataset(context.queryClient, params.type),
      context.queryClient
        .ensureQueryData(topicQuery(params.type, params.slug))
        .catch(() => {
          throw notFound();
        }),
      context.queryClient.ensureQueryData(manifestQuery),
    ]);
    // Only this small summary is embedded in the HTML for hydration.
    return { seo: topicSummary(topic, ds, manifest.categories) };
  },
  head: ({ loaderData, params }) =>
    loaderData == null
      ? notFoundHead()
      : pageHead({
          ...loaderData.seo,
          path: `/topics/${params.type}/${params.slug}`,
        }),
  component: TopicPage,
});
