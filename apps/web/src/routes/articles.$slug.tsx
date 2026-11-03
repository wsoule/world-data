import { createFileRoute, notFound } from '@tanstack/react-router';

import { notFoundHead } from '~/components/feedback';
import { manifestQuery, storiesIndexQuery, storyQuery } from '~/data/api';
import { ArticlePage } from '~/features/articles/ArticlePage';
import { storyText } from '~/features/articles/prose';
import { breadcrumbs, pageHead } from '~/lib/seo';
import { absoluteUrl, SITE } from '~/site';

export const Route = createFileRoute('/articles/$slug')({
  loader: async ({ context, params }) => {
    const [story, , manifest] = await Promise.all([
      context.queryClient.ensureQueryData(storyQuery(params.slug)).catch(() => {
        throw notFound();
      }),
      context.queryClient.ensureQueryData(storiesIndexQuery),
      context.queryClient.ensureQueryData(manifestQuery),
    ]);
    const text = storyText(story);
    // Only this small summary is embedded in the HTML for hydration.
    return {
      seo: {
        title: story.title,
        description: `${text.takeaway} ${text.strength}`,
        dek: text.dek,
        modified: manifest.generatedAt,
      },
    };
  },
  head: ({ loaderData, params }) => {
    if (loaderData == null) return notFoundHead();
    const path = `/articles/${params.slug}`;
    return pageHead({
      title: loaderData.seo.title,
      description: loaderData.seo.description,
      path,
      ogType: 'article',
      jsonLd: [
        {
          '@type': 'Article',
          headline: loaderData.seo.title,
          description: loaderData.seo.dek,
          dateModified: loaderData.seo.modified,
          mainEntityOfPage: absoluteUrl(path),
          author: { '@type': 'Organization', name: SITE.name },
          publisher: { '@type': 'Organization', name: SITE.name },
        },
        breadcrumbs([
          { name: SITE.name, path: '/' },
          { name: 'Articles', path: '/articles' },
          { name: loaderData.seo.title, path },
        ]),
      ],
    });
  },
  component: ArticlePage,
});
