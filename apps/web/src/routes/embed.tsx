import { createFileRoute } from '@tanstack/react-router';

import { EmbedPage } from '~/features/trust/EmbedPage';
import { trustHead } from '~/features/trust/head';

export const Route = createFileRoute('/embed')({
  head: () => trustHead('embed'),
  component: EmbedPage,
});
