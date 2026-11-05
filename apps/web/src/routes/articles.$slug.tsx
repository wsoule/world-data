import { createFileRoute, notFound } from '@tanstack/react-router';

import { notFoundHead } from '~/components/feedback';
import { storiesIndexQuery, storyQuery } from '~/data/api';
import { ArticlePage } from '~/features/articles/ArticlePage';
import { storyText } from '~/features/articles/prose';
import { breadcrumbs, pageHead, publisherRef } from '~/lib/seo';
import { newestDate } from '~/seo/indexing';
import { absoluteUrl, SITE } from '~/site';

export const Route = createFileRoute('/articles/$slug')({
  loader: async ({ context, params }) => {
    const [story] = await Promise.all([
      context.queryClient.ensureQueryData(storyQuery(params.slug)).catch(() => {
        throw notFound();
      }),
      context.queryClient.ensureQueryData(storiesIndexQuery),
    ]);
    const text = storyText(story);
    // Only this small summary is embedded in the HTML for hydration.
    return {
      seo: {
        title: story.title,
        description: `${text.takeaway} ${text.strength}`,
        dek: text.dek,
        date: newestDate([story.date]),
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
          // The date of the story's newest data (scripts/build-stories.ts), the date the article
          // shows and the sitemap's lastmod; never the build date, which would claim every story
          // changed on every deploy.
          ...(loaderData.seo.date == null
            ? {}
            : {
                datePublished: loaderData.seo.date,
                dateModified: loaderData.seo.date,
              }),
          mainEntityOfPage: absoluteUrl(path),
          author: publisherRef(),
          publisher: publisherRef(),
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
