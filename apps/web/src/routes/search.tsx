import { createFileRoute } from '@tanstack/react-router';

import { SearchPage } from '~/features/search/SearchPage';
import { pageHead } from '~/lib/seo';

export interface SearchPageSearch {
  q?: string;
}

export const Route = createFileRoute('/search')({
  // Results depend on ?q, so the page renders in the browser only.
  ssr: false,
  validateSearch: (raw: Record<string, unknown>): SearchPageSearch => ({
    q: typeof raw.q === 'string' && raw.q !== '' ? raw.q : undefined,
  }),
  head: () =>
    pageHead({
      title: 'Search',
      description: 'Search every place, statistic and topic.',
      path: '/search',
      noindex: true,
    }),
  component: SearchPage,
});
