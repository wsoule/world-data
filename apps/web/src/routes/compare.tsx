import { createFileRoute } from '@tanstack/react-router';

import { PageSkeleton } from '~/components/feedback';
import { loadDataset } from '~/data/dataset';
import { CompareShell } from '~/features/compare/CompareShell';
import { validateCompareSearch } from '~/features/compare/state';
import { pageHead } from '~/lib/seo';

const DESCRIPTION =
  'Plot any two statistics against each other, build a combined ranking from many metrics and find what correlates, for countries, US states, cities and counties.';

export const Route = createFileRoute('/compare')({
  // The workbench is driven entirely by URL search params, which static
  // prerendering cannot know, so it renders in the browser only.
  ssr: false,
  // The static shell and the first render while the type's data loads.
  pendingComponent: CompareSkeleton,
  validateSearch: validateCompareSearch,
  loaderDeps: ({ search }) => ({ type: search.type }),
  loader: ({ context, deps }) =>
    loadDataset(context.queryClient, deps.type).then(() => null),
  head: () =>
    pageHead({
      title: 'Compare and overlay statistics',
      description: DESCRIPTION,
      path: '/compare',
      // A client-rendered shell: its static HTML is only "Loading…".
      noindex: true,
    }),
  component: CompareShell,
});

function CompareSkeleton() {
  return (
    <PageSkeleton
      title="Overlay, combine and rank"
      description={DESCRIPTION}
      controls={2}
    />
  );
}
