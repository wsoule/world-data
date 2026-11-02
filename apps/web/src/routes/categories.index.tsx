import { createFileRoute } from '@tanstack/react-router';

import { topicsIndexQuery } from '~/data/api';
import { CategoriesPage } from '~/features/categories/CategoriesPage';
import { breadcrumbs, pageHead } from '~/lib/seo';
import { SITE } from '~/site';

export const Route = createFileRoute('/categories/')({
  // Warm the cache only: returning the index would embed it in the HTML.
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(topicsIndexQuery);
  },
  head: () =>
    pageHead({
      title: 'Statistics by category',
      description: `Browse thousands of statistics about countries, US states, cities and counties in 20 categories, from economics and education to health, crime and the environment.`,
      path: '/categories',
      jsonLd: [
        breadcrumbs([
          { name: SITE.name, path: '/' },
          { name: 'Categories', path: '/categories' },
        ]),
      ],
    }),
  component: CategoriesPage,
});
