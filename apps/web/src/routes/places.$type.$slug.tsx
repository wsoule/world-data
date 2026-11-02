import { createFileRoute, notFound } from '@tanstack/react-router';

import { QuickAnswers } from '~/components/QuickAnswers';
import { loadDataset } from '~/data/dataset';
import { isEntityType } from '~/data/types';
import { PlaceProfilePage } from '~/features/places/PlaceProfilePage';
import { pageHead } from '~/lib/seo';
import { placeSummary } from '~/seo/content';

export const Route = createFileRoute('/places/$type/$slug')({
  loader: async ({ context, params }) => {
    if (!isEntityType(params.type)) throw notFound();
    const ds = await loadDataset(context.queryClient, params.type);
    const idx = ds.entityBySlug.get(params.slug);
    if (idx == null) throw notFound();
    // Only this small summary is embedded in the HTML for hydration.
    return { seo: placeSummary(ds, idx) };
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
  const { seo } = Route.useLoaderData();
  return (
    <>
      <PlaceProfilePage />
      <QuickAnswers items={seo.faq} />
    </>
  );
}
