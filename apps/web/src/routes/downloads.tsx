import { createFileRoute } from '@tanstack/react-router';

import { DownloadsPage } from '~/features/trust/DownloadsPage';
import { trustHead } from '~/features/trust/head';

export const Route = createFileRoute('/downloads')({
  head: () => trustHead('downloads'),
  component: DownloadsPage,
});
