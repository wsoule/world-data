import { createFileRoute, notFound } from '@tanstack/react-router';

import { notFoundHead } from '~/components/feedback';
import { preloadData, storiesIndexQuery } from '~/data/api';
import { isEntityType } from '~/data/types';
import {
  placeCatalogPath,
  placePagePath,
  placePageQuery,
} from '~/features/places/pageData';
import { PlaceProfilePage } from '~/features/places/PlaceProfilePage';
import { pairsQuery } from '~/features/vs/pairData';
import { partnersOf } from '~/features/vs/pairs';
import { pageHead } from '~/lib/seo';

export const Route = createFileRoute('/places/$type/$slug')({
  loader: async ({ context, params }) => {
    const { type, slug } = params;
    if (!isEntityType(type)) throw notFound();
    const qc = context.queryClient;
    // The place's own data (features/places/pageData.ts), never its type's full data. It
    // carries the summary and the related place links, which are embedded in the HTML.
    const [page, pairs] = await Promise.all([
      qc.ensureQueryData(placePageQuery(qc, type, slug)).catch(() => {
        throw notFound();
      }),
      // The matchup pages this place has, linked from the profile.
      qc.ensureQueryData(pairsQuery),
      // Loaded here so the "Data stories" links render inline in the prerendered HTML.
      qc.ensureQueryData(storiesIndexQuery),
    ]);
    return {
      seo: page.seo,
      related: page.related,
      matchups: partnersOf(pairs, type, slug),
    };
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
                : [
                    placePagePath(params.type, params.slug),
                    placeCatalogPath(params.type),
                  ]),
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
  const { seo, related, matchups } = Route.useLoaderData();
  return (
    <PlaceProfilePage
      summary={seo.summary}
      faq={seo.faq}
      related={related}
      matchups={matchups}
    />
  );
}
