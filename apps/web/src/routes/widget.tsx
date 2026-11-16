import { createFileRoute } from '@tanstack/react-router';

import { Spinner } from '~/components/feedback';
import { isEntityType } from '~/data/types';
import type { WidgetSearch } from '~/features/widget/embed';
import { WidgetView } from '~/features/widget/WidgetView';
import { pageHead } from '~/lib/seo';
import { absoluteUrl, SITE } from '~/site';

/** A finite number from a search param, or undefined. */
function numberParam(raw: unknown): number | undefined {
  const n = Number(raw);
  return raw != null && raw !== '' && Number.isFinite(n) ? n : undefined;
}

export const Route = createFileRoute('/widget')({
  // One client-rendered page for every embed: the topic comes from the query string, which
  // static prerendering cannot know. The root layout drops the site chrome on this path.
  ssr: false,
  validateSearch: (raw: Record<string, unknown>): WidgetSearch => ({
    t: isEntityType(raw.t) ? raw.t : undefined,
    // Slugs are lowercase words and hyphens; anything else never reaches a data URL.
    s:
      typeof raw.s === 'string' && /^[a-z0-9-]{1,120}$/.test(raw.s)
        ? raw.s
        : undefined,
    m: numberParam(raw.m),
    n: numberParam(raw.n),
  }),
  head: () =>
    pageHead({
      title: 'Embedded ranking',
      description: `A ${SITE.name} ranking embedded on another site.`,
      path: '/widget',
      noindex: true,
    }),
  pendingComponent: () => (
    <div className="flex min-h-40 items-center justify-center">
      <Spinner />
    </div>
  ),
  errorComponent: () => (
    <div className="text-muted p-4 text-sm">
      This ranking could not be loaded.{' '}
      <a
        href={absoluteUrl('/')}
        target="_blank"
        rel="noopener"
        className="underline"
      >
        {SITE.name}
      </a>
    </div>
  ),
  component: WidgetRoute,
});

function WidgetRoute() {
  return <WidgetView search={Route.useSearch()} />;
}
