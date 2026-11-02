import { createFileRoute } from '@tanstack/react-router';

import { topicsIndexQuery } from '~/data/api';
import { CategoriesPage } from '~/features/categories/CategoriesPage';

export const Route = createFileRoute('/categories/')({
  // Warm the cache only: returning the index would embed it in the HTML.
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(topicsIndexQuery);
  },
  component: CategoriesPage,
});
