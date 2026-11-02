import { createFileRoute, notFound } from '@tanstack/react-router';

import { loadDataset } from '~/data/dataset';
import { isEntityType } from '~/data/types';
import { PlaceProfilePage } from '~/features/places/PlaceProfilePage';
import { pageHead } from '~/lib/seo';
import { placeSummary } from '~/seo/content';
import { loadRelatedPlaces } from '~/seo/place-content';

export const Route = createFileRoute('/places/$type/$slug')({
  loader: async ({ context, params }) => {
    if (!isEntityType(params.type)) throw notFound();
    const ds = await loadDataset(context.queryClient, params.type);
    const idx = ds.entityBySlug.get(params.slug);
    if (idx == null) throw notFound();
    // Only the summary and the related place links are embedded in the HTML for hydration.
    const related = await loadRelatedPlaces(
      context.queryClient,
      params.type,
      ds.entities[idx]
    );
    return { seo: placeSummary(ds, idx), related };
  },
  head: ({ loaderData, params }) =>
    loaderData == null
      ? {}
      : pageHead({
          ...loaderData.seo,
          path: `/places/${params.type}/${params.slug}`,
        }),
  component: PlaceRoute,
});

function PlaceRoute() {
  const { seo, related } = Route.useLoaderData();
  return (
    <PlaceProfilePage summary={seo.summary} faq={seo.faq} related={related} />
  );
}
