import { createFileRoute } from '@tanstack/react-router';

import { topicsIndexQuery } from '~/data/api';
import { trustHead } from '~/features/trust/head';
import { SourcesPage } from '~/features/trust/SourcesPage';

export const Route = createFileRoute('/sources')({
  // Warm the cache only: returning the index would embed it in the HTML.
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(topicsIndexQuery);
  },
  head: () => trustHead('sources'),
  component: SourcesPage,
});
