import { createFileRoute } from '@tanstack/react-router';

import { AboutPage } from '~/features/trust/AboutPage';
import { trustHead } from '~/features/trust/head';

export const Route = createFileRoute('/about')({
  head: () => trustHead('about'),
  component: AboutPage,
});
