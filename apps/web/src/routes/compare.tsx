import { createFileRoute } from '@tanstack/react-router';

import { loadDataset } from '~/data/dataset';
import { CompareShell } from '~/features/compare/CompareShell';
import { validateCompareSearch } from '~/features/compare/state';

export const Route = createFileRoute('/compare')({
  validateSearch: validateCompareSearch,
  loaderDeps: ({ search }) => ({ type: search.type }),
  loader: ({ context, deps }) =>
    loadDataset(context.queryClient, deps.type).then(() => null),
  component: CompareShell,
});
