import { createFileRoute } from '@tanstack/react-router';

import { trustHead } from '~/features/trust/head';
import { MethodologyPage } from '~/features/trust/MethodologyPage';

export const Route = createFileRoute('/methodology')({
  head: () => trustHead('methodology'),
  component: MethodologyPage,
});
