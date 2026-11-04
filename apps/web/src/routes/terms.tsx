import { createFileRoute } from '@tanstack/react-router';

import { trustHead } from '~/features/trust/head';
import { TermsPage } from '~/features/trust/TermsPage';

export const Route = createFileRoute('/terms')({
  head: () => trustHead('terms'),
  component: TermsPage,
});
