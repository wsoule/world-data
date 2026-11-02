import { createFileRoute } from '@tanstack/react-router';

import { loadDataset } from '~/data/dataset';
import { CompareShell } from '~/features/compare/CompareShell';
import { validateCompareSearch } from '~/features/compare/state';
import { pageHead } from '~/lib/seo';

export const Route = createFileRoute('/compare')({
  // The workbench is driven entirely by URL search params, which static
  // prerendering cannot know, so it renders in the browser only.
  ssr: false,
  validateSearch: validateCompareSearch,
  loaderDeps: ({ search }) => ({ type: search.type }),
  loader: ({ context, deps }) =>
    loadDataset(context.queryClient, deps.type).then(() => null),
  head: () =>
    pageHead({
      title: 'Compare and overlay statistics',
      description:
        'Plot any two statistics against each other, build a combined ranking from many metrics and find what correlates, for countries, US states, cities and counties.',
      path: '/compare',
    }),
  component: CompareShell,
});
