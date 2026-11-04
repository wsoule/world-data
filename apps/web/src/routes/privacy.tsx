import { createFileRoute } from '@tanstack/react-router';

import { trustHead } from '~/features/trust/head';
import { PrivacyPage } from '~/features/trust/PrivacyPage';

export const Route = createFileRoute('/privacy')({
  head: () => trustHead('privacy'),
  component: PrivacyPage,
});
