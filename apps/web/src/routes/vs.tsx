import { createFileRoute } from '@tanstack/react-router';

import { loadDataset } from '~/data/dataset';
import { type EntityType, isEntityType } from '~/data/types';
import { VersusPage } from '~/features/vs/VersusPage';
import { pageHead } from '~/lib/seo';

export interface VersusSearch {
  type: EntityType;
  /** entity ids being compared */
  e: string[];
  /** optional category filter */
  cat?: string;
}

export const Route = createFileRoute('/vs')({
  // Driven by URL search params, so it renders in the browser only.
  ssr: false,
  validateSearch: (raw: Record<string, unknown>): VersusSearch => ({
    type: isEntityType(raw.type) ? raw.type : 'state',
    e: Array.isArray(raw.e)
      ? raw.e.map(String)
      : typeof raw.e === 'string' && raw.e !== ''
        ? raw.e.split(',')
        : [],
    cat: typeof raw.cat === 'string' && raw.cat !== '' ? raw.cat : undefined,
  }),
  loaderDeps: ({ search }) => ({ type: search.type }),
  loader: ({ context, deps }) =>
    loadDataset(context.queryClient, deps.type).then(() => null),
  head: () =>
    pageHead({
      title: 'Head-to-head place comparison',
      description:
        'Put two to four countries, states, cities or counties side by side and see who wins on every shared statistic.',
      path: '/vs',
    }),
  component: VersusPage,
});
