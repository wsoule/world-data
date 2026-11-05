import { createFileRoute, notFound } from '@tanstack/react-router';

import { notFoundHead } from '~/components/feedback';
import { manifestQuery, topicsIndexQuery } from '~/data/api';
import { noindexTopicsQuery } from '~/data/noindexTopics';
import { type EntityType, isEntityType } from '~/data/types';
import { CategoryPage } from '~/features/categories/CategoryPage';
import { breadcrumbs, pageHead } from '~/lib/seo';
import { SITE } from '~/site';

export interface CategorySearch {
  type?: EntityType;
}

declare module '@tanstack/react-router' {
  interface HistoryState {
    /**
     * Place type a category hub opens on when a link names it in history state instead of
     * `?type=`, so the link itself is the bare hub URL (robots.txt keeps crawlers off
     * /categories/<id>?…). Older links with `?type=` still work.
     */
    categoryType?: EntityType;
  }
}

export const Route = createFileRoute('/categories/$category')({
  validateSearch: (raw: Record<string, unknown>): CategorySearch => ({
    type: isEntityType(raw.type) ? raw.type : undefined,
  }),
  loader: async ({ context, params }) => {
    const [manifest] = await Promise.all([
      context.queryClient.ensureQueryData(manifestQuery),
      context.queryClient.ensureQueryData(topicsIndexQuery),
      // Which topics are noindex, so the hub can lead with the indexable ones.
      context.queryClient.ensureQueryData(noindexTopicsQuery),
    ]);
    const category = manifest.categories.find((c) => c.id === params.category);
    if (category == null) throw notFound();
    return { label: category.label, topics: category.topics };
  },
  head: ({ loaderData, params }) =>
    loaderData == null
      ? notFoundHead()
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
