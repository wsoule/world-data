import { createFileRoute, notFound } from '@tanstack/react-router';

import { notFoundHead } from '~/components/feedback';
import { preloadData } from '~/data/api';
import { isEntityType } from '~/data/types';
import { pairPagePath, pairPageQuery } from '~/features/vs/pairData';
import { PairPage } from '~/features/vs/PairPage';
import { pageHead } from '~/lib/seo';

// A prerendered matchup page, unlike the client-rendered /vs tool (features/vs/pairs.ts).
// `vs_` keeps it out of the /vs route's layout.
export const Route = createFileRoute('/vs_/$type/$pair')({
  loader: async ({ context, params }) => {
    if (!isEntityType(params.type)) throw notFound();
    const qc = context.queryClient;
    return qc
      .ensureQueryData(pairPageQuery(qc, params.type, params.pair))
      .catch(() => {
        throw notFound();
      });
  },
  head: ({ loaderData, params }) => {
    if (loaderData == null) return notFoundHead();
    const head = pageHead({
      title: loaderData.seo.title,
      description: loaderData.seo.description,
      path: `/vs/${params.type}/${params.pair}`,
      noindex: loaderData.seo.noindex,
      jsonLd: loaderData.seo.jsonLd,
    });
    return import.meta.env.DEV || !isEntityType(params.type)
      ? head
      : {
          ...head,
          links: [
            ...head.links,
            ...preloadData([pairPagePath(params.type, params.pair)]),
          ],
        };
  },
  component: PairRoute,
});

function PairRoute() {
  return <PairPage data={Route.useLoaderData()} />;
}
