import { createFileRoute, notFound } from '@tanstack/react-router';

import { loadDataset } from '~/data/dataset';
import { isEntityType } from '~/data/types';
import { PlacesPage } from '~/features/places/PlacesPage';
import { parsePlacesSearch, type PlacesSearch } from '~/features/places/search';
import { typeNoun } from '~/lib/format';
import { breadcrumbs, pageHead } from '~/lib/seo';
import { SITE } from '~/site';

export const Route = createFileRoute('/places/$type/')({
  validateSearch: (raw: Record<string, unknown>): PlacesSearch =>
    parsePlacesSearch(raw),
  loader: async ({ context, params }) => {
    if (!isEntityType(params.type)) throw notFound();
    const ds = await loadDataset(context.queryClient, params.type);
    return {
      label: ds.type.label,
      count: ds.entities.length,
      metrics: ds.type.numericMetrics,
    };
  },
  head: ({ loaderData, params }) =>
    loaderData == null
      ? {}
      : pageHead({
          title: `${loaderData.label}: every place ranked`,
          description: `All ${loaderData.count.toLocaleString('en-US')} ${typeNoun(loaderData.label)} with population and density, each with a report card ranking it on up to ${loaderData.metrics.toLocaleString('en-US')} statistics.`,
          path: `/places/${params.type}`,
          jsonLd: [
            breadcrumbs([
              { name: SITE.name, path: '/' },
              { name: loaderData.label, path: `/places/${params.type}` },
            ]),
          ],
        }),
  component: PlacesPage,
});
