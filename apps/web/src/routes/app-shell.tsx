import { createFileRoute } from '@tanstack/react-router';

import { PageSpinner } from '~/components/feedback';

// Render target for the static SPA shell (written to /_shell.html at build
// time). Static hosts serve that file for every path without a prerendered
// page, and the router then renders the real route in the browser.
export const Route = createFileRoute('/app-shell')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: PageSpinner,
});
