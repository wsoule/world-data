import { createFileRoute, notFound } from '@tanstack/react-router';

import { QuickAnswers } from '~/components/QuickAnswers';
import { manifestQuery, topicQuery } from '~/data/api';
import { loadDataset } from '~/data/dataset';
import { isEntityType } from '~/data/types';
import { TopicPage } from '~/features/topic/TopicPage';
import { pageHead } from '~/lib/seo';
import { topicSummary } from '~/seo/content';

export interface TopicSearch {
  /** Focused metric id */
  m?: number;
  /** Year for the focused metric */
  year?: number;
}

export const Route = createFileRoute('/topics/$type/$slug')({
  validateSearch: (raw: Record<string, unknown>): TopicSearch => ({
    m:
      Number.isFinite(Number(raw.m)) && raw.m !== undefined && raw.m !== ''
        ? Number(raw.m)
        : undefined,
    year:
      Number.isFinite(Number(raw.year)) &&
      raw.year !== undefined &&
      raw.year !== ''
        ? Number(raw.year)
        : undefined,
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
