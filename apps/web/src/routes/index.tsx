import { createFileRoute } from '@tanstack/react-router';

import {
  homeMapsQuery,
  mapShapesQuery,
  preloadData,
  storiesIndexQuery,
} from '~/data/api';
import { HomePage } from '~/features/home/HomePage';
import { pageHead } from '~/lib/seo';
import { SITE } from '~/site';

export const Route = createFileRoute('/')({
  // Warm the cache only: returning the index would embed it in the HTML.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(storiesIndexQuery),
      context.queryClient.ensureQueryData(homeMapsQuery),
      context.queryClient.ensureQueryData(mapShapesQuery('us-states')),
      context.queryClient.ensureQueryData(mapShapesQuery('world')),
    ]);
  },
  head: () => {
    const head = pageHead({
      title: SITE.tagline,
      description: SITE.description,
      // pageHead() adds the site's full Organization and WebSite nodes here.
      path: '/',
    });
    // The files the page fetches to hydrate start downloading with the scripts, as on topic
    // pages (the county shapes load after hydration and are left out).
    return {
      ...head,
      links: [
        ...head.links,
        ...preloadData([
          'manifest.json',
          'stories/index.json',
          'maps/home.json',
          'maps/shapes-us-states.json',
          'maps/shapes-world.json',
        ]),
      ],
    };
  },
  component: HomePage,
});
