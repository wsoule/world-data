import { createFileRoute } from '@tanstack/react-router';

import { trustHead } from '~/features/trust/head';
import { ReportsPage } from '~/features/trust/ReportsPage';

export const Route = createFileRoute('/reports')({
  head: () => trustHead('reports'),
  component: ReportsPage,
});
