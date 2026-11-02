import { createFileRoute } from '@tanstack/react-router';

import { topicsIndexQuery } from '~/data/api';
import { HomePage } from '~/features/home/HomePage';

export const Route = createFileRoute('/')({
  // Warm the cache only: returning the index would embed it in the HTML.
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(topicsIndexQuery);
  },
  component: HomePage,
});
