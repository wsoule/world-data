import { createFileRoute } from '@tanstack/react-router';

import { trustHead } from '~/features/trust/head';
import { LicensingPage } from '~/features/trust/LicensingPage';

export const Route = createFileRoute('/licensing')({
  head: () => trustHead('licensing'),
  component: LicensingPage,
});
