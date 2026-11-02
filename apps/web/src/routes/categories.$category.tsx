import { createFileRoute, notFound } from '@tanstack/react-router';

import { manifestQuery, topicsIndexQuery } from '~/data/api';
import { type EntityType, isEntityType } from '~/data/types';
import { CategoryPage } from '~/features/categories/CategoryPage';
import { breadcrumbs, pageHead } from '~/lib/seo';
import { SITE } from '~/site';

export interface CategorySearch {
  type?: EntityType;
}

export const Route = createFileRoute('/categories/$category')({
  validateSearch: (raw: Record<string, unknown>): CategorySearch => ({
    type: isEntityType(raw.type) ? raw.type : undefined,
  }),
  loader: async ({ context, params }) => {
    const [manifest] = await Promise.all([
      context.queryClient.ensureQueryData(manifestQuery),
      context.queryClient.ensureQueryData(topicsIndexQuery),
    ]);
    const category = manifest.categories.find((c) => c.id === params.category);
    if (category == null) throw notFound();
    return { label: category.label, topics: category.topics };
  },
  head: ({ loaderData, params }) =>
    loaderData == null
      ? {}
      : pageHead({
          title: `${loaderData.label} statistics by country, state and city`,
          description: `${loaderData.topics.toLocaleString('en-US')} ${loaderData.label.toLowerCase()} topics ranking countries, US states, cities and counties. Open any topic to rank, map, overlay and compare.`,
          path: `/categories/${params.category}`,
          jsonLd: [
            breadcrumbs([
              { name: SITE.name, path: '/' },
              { name: 'Categories', path: '/categories' },
              {
                name: loaderData.label,
                path: `/categories/${params.category}`,
              },
            ]),
          ],
        }),
  component: CategoryPage,
});
