import { createFileRoute } from '@tanstack/react-router';

import { GlossaryPage } from '~/features/glossary/GlossaryPage';
import { breadcrumbs, pageHead } from '~/lib/seo';
import { SITE } from '~/site';

export const Route = createFileRoute('/glossary')({
  head: () =>
    pageHead({
      title: 'Glossary: what the numbers mean',
      description:
        'Plain-language definitions of percentiles, ranks, data coverage, combined scores, correlation, p-values and the other terms used in Rankodex rankings and comparisons.',
      path: '/glossary',
      jsonLd: [
        breadcrumbs([
          { name: SITE.name, path: '/' },
          { name: 'Glossary', path: '/glossary' },
        ]),
      ],
    }),
  component: GlossaryPage,
});
