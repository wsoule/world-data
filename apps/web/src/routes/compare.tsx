import { createFileRoute } from '@tanstack/react-router';

import { loadDataset } from '~/data/dataset';
import { CompareShell } from '~/features/compare/CompareShell';
import { validateCompareSearch } from '~/features/compare/state';

export const Route = createFileRoute('/compare')({
  // The workbench is driven entirely by URL search params, which static
  // prerendering cannot know, so it renders in the browser only.
  ssr: false,
  validateSearch: validateCompareSearch,
  loaderDeps: ({ search }) => ({ type: search.type }),
  loader: ({ context, deps }) =>
    loadDataset(context.queryClient, deps.type).then(() => null),
  component: CompareShell,
});
