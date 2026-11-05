import { createFileRoute } from '@tanstack/react-router';

import {
  homeMapsQuery,
  mapShapesQuery,
  storiesIndexQuery,
  topicsIndexQuery,
} from '~/data/api';
import { HomePage } from '~/features/home/HomePage';
import { pageHead } from '~/lib/seo';
import { SITE } from '~/site';

export const Route = createFileRoute('/')({
  // Warm the cache only: returning the index would embed it in the HTML.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(topicsIndexQuery),
      context.queryClient.ensureQueryData(storiesIndexQuery),
      context.queryClient.ensureQueryData(homeMapsQuery),
      context.queryClient.ensureQueryData(mapShapesQuery('us-states')),
      context.queryClient.ensureQueryData(mapShapesQuery('world')),
    ]);
  },
  head: () =>
    pageHead({
      title: SITE.tagline,
      description: SITE.description,
      // pageHead() adds the site's full Organization and WebSite nodes here.
      path: '/',
    }),
  component: HomePage,
});
