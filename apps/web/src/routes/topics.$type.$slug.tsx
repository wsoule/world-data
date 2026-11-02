import { createFileRoute, notFound } from '@tanstack/react-router';

import { QuickAnswers } from '~/components/QuickAnswers';
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
}

/** A finite number from a search value ("12" or 12), else undefined. */
function numberParam(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export const Route = createFileRoute('/topics/$type/$slug')({
  validateSearch: (raw: Record<string, unknown>): TopicSearch => ({
    m: numberParam(raw.m),
    year: raw.year === LATEST ? LATEST : numberParam(raw.year),
  }),
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
      ? {}
      : pageHead({
          ...loaderData.seo,
          path: `/topics/${params.type}/${params.slug}`,
        }),
  component: TopicRoute,
});

function TopicRoute() {
  const { seo } = Route.useLoaderData();
  return (
    <>
      <TopicPage />
      <QuickAnswers items={seo.faq} />
    </>
  );
}
