import { createFileRoute, notFound } from '@tanstack/react-router';

import { manifestQuery, topicsIndexQuery } from '~/data/api';
import { type EntityType, isEntityType } from '~/data/types';
import { CategoryPage } from '~/features/categories/CategoryPage';

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
    if (!manifest.categories.some((c) => c.id === params.category))
      throw notFound();
  },
  component: CategoryPage,
});
