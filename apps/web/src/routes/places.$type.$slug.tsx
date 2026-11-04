import { createFileRoute, notFound } from '@tanstack/react-router';

import { notFoundHead } from '~/components/feedback';
import { preloadData, storiesIndexQuery } from '~/data/api';
import { isEntityType } from '~/data/types';
import { placePagePath, placePageQuery } from '~/features/places/pageData';
import { PlaceProfilePage } from '~/features/places/PlaceProfilePage';
import { pageHead } from '~/lib/seo';

export const Route = createFileRoute('/places/$type/$slug')({
  loader: async ({ context, params }) => {
    const { type, slug } = params;
    if (!isEntityType(type)) throw notFound();
    const qc = context.queryClient;
    // The place's own data (features/places/pageData.ts), never its type's full data. It
    // carries the summary and the related place links, which are embedded in the HTML.
    const [page] = await Promise.all([
      qc.ensureQueryData(placePageQuery(qc, type, slug)).catch(() => {
        throw notFound();
      }),
      // Loaded here so the "Data stories" links render inline in the prerendered HTML.
      qc.ensureQueryData(storiesIndexQuery),
    ]);
    return { seo: page.seo, related: page.related };
  },
  head: ({ loaderData, params }) => {
    if (loaderData == null) return notFoundHead();
    const head = pageHead({
      ...loaderData.seo,
      path: `/places/${params.type}/${params.slug}`,
    });
    // The files the profile fetches to hydrate start downloading with the scripts.
    return {
      ...head,
      links: [
        ...head.links,
        ...(isEntityType(params.type)
          ? preloadData([
              // The dev server builds it in the browser instead (pageData.ts).
              ...(import.meta.env.DEV
                ? []
                : [placePagePath(params.type, params.slug)]),
              `${params.type}/entities.json`,
              'manifest.json',
            ])
          : []),
      ],
    };
  },
  component: PlaceRoute,
});

function PlaceRoute() {
  const { seo, related } = Route.useLoaderData();
  return (
    <PlaceProfilePage summary={seo.summary} faq={seo.faq} related={related} />
  );
}
