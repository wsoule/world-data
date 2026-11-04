import { createFileRoute } from '@tanstack/react-router';

import { ContactPage } from '~/features/trust/ContactPage';
import { trustHead } from '~/features/trust/head';

export const Route = createFileRoute('/contact')({
  head: () => trustHead('contact'),
  component: ContactPage,
});
