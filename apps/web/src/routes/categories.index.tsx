import { createFileRoute } from '@tanstack/react-router';

import { topicsIndexQuery } from '~/data/api';
import { CategoriesPage } from '~/features/categories/CategoriesPage';

export const Route = createFileRoute('/categories/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(topicsIndexQuery),
  component: CategoriesPage,
});
