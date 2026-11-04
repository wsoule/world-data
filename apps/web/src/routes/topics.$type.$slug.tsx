import { createFileRoute, notFound } from '@tanstack/react-router';

import { notFoundHead } from '~/components/feedback';
import { type AdjustmentId, adjustmentParam } from '~/data/adjustments';
import {
  entitiesQuery,
  manifestQuery,
  preloadData,
  storiesIndexQuery,
  topicQuery,
} from '~/data/api';
import { topicDataset } from '~/data/topicPage';
import { isEntityType } from '~/data/types';
import { LATEST, type YearRequest } from '~/features/topic/model';
import { topicPagePath, topicPageQuery } from '~/features/topic/pageData';
import { TopicPage } from '~/features/topic/TopicPage';
import { pageHead } from '~/lib/seo';
import { topicSummary } from '~/seo/content';
import { canonicalTopicSlug } from '~/seo/indexing';

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
  /** Adjustment: cost of living, share of income or per person (see data/adjustments.ts) */
  adj?: AdjustmentId;
  /** Older links' cost-of-living switch, read as adj=col */
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
    adj: adjustmentParam(raw),
    col: undefined,
  }),
  // The summary depends only on the path, so search changes (metric, year,
  // table filter) never rerun the loader.
  staleTime: Infinity,
  loader: async ({ context, params }) => {
    const { type, slug } = params;
    if (!isEntityType(type)) throw notFound();
    const qc = context.queryClient;
    const missing = () => {
      throw notFound();
    };
    const [page, topic, manifest, entities] = await Promise.all([
      // The page's share of the type's data (data/topicPage.ts), never the whole type.
      qc.ensureQueryData(topicPageQuery(qc, type, slug)).catch(missing),
      qc.ensureQueryData(topicQuery(type, slug)).catch(missing),
      qc.ensureQueryData(manifestQuery),
      qc.ensureQueryData(entitiesQuery(type)),
      // Loaded here so the "Data stories" links render inline in the prerendered HTML instead
      // of streaming in after it.
      qc.ensureQueryData(storiesIndexQuery),
    ]);
    const ds = topicDataset(manifest, type, entities, topic, page);
    // Only this small summary is embedded in the HTML for hydration.
    return { seo: topicSummary(topic, ds, manifest.categories) };
  },
  // A page that only retitles another names that one as canonical (TOPIC_ALIASES); a thin
  // page is noindex and keeps its own, so the two signals never conflict.
  head: ({ loaderData, params }) => {
    if (loaderData == null) return notFoundHead();
    const head = pageHead({
      ...loaderData.seo,
      path: `/topics/${params.type}/${
        loaderData.seo.noindex
          ? params.slug
          : canonicalTopicSlug(params.type, params.slug)
      }`,
    });
    // The files the page fetches to hydrate start downloading with the scripts.
    return {
      ...head,
      links: [
        ...head.links,
        ...(isEntityType(params.type)
          ? preloadData([
              `${params.type}/topics/${params.slug}.json`,
              // The dev server builds it in the browser instead (pageData.ts).
              ...(import.meta.env.DEV
                ? []
                : [topicPagePath(params.type, params.slug)]),
              `${params.type}/entities.json`,
              'manifest.json',
            ])
          : []),
      ],
    };
  },
  component: TopicPage,
});
