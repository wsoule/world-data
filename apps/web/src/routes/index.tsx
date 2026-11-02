import { createFileRoute } from '@tanstack/react-router';

import { topicsIndexQuery } from '~/data/api';
import { HomePage } from '~/features/home/HomePage';

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(topicsIndexQuery),
  component: HomePage,
});
