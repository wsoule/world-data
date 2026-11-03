import { createFileRoute } from '@tanstack/react-router';

import { storiesIndexQuery } from '~/data/api';
import { ArticlesIndexPage } from '~/features/articles/ArticlesIndexPage';
import { breadcrumbs, pageHead } from '~/lib/seo';
import { SITE } from '~/site';

export const Route = createFileRoute('/articles/')({
  // Warm the cache only: the index renders from it without embedding it in the HTML.
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(storiesIndexQuery);
  },
  head: () =>
    pageHead({
      title: 'Data stories: what goes with what',
      description:
        'Charts and plain-English answers on how education, income, health, prices, crime and politics relate across US states, counties, cities and countries.',
      path: '/articles',
      jsonLd: [
        breadcrumbs([
          { name: SITE.name, path: '/' },
          { name: 'Articles', path: '/articles' },
        ]),
      ],
    }),
  component: ArticlesIndexPage,
});
