import { createFileRoute } from '@tanstack/react-router';

import { storiesIndexQuery, topicsIndexQuery } from '~/data/api';
import { HomePage } from '~/features/home/HomePage';
import { pageHead, publisher } from '~/lib/seo';
import { SITE } from '~/site';

export const Route = createFileRoute('/')({
  // Warm the cache only: returning the index would embed it in the HTML.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(topicsIndexQuery),
      context.queryClient.ensureQueryData(storiesIndexQuery),
    ]);
  },
  head: () =>
    pageHead({
      title: SITE.tagline,
      description: SITE.description,
      path: '/',
      jsonLd: [publisher()],
    }),
  component: HomePage,
});
