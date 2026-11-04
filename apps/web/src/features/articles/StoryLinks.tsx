import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Newspaper } from 'lucide-react';
import type { ReactNode } from 'react';

import { strengthWord } from './prose';
import { Card } from '~/components/ui';
import type { StorySummary } from '~/content/storyTypes';
import { storiesIndexQuery } from '~/data/api';
import type { EntityType } from '~/data/types';

const PLACES: Record<EntityType, string> = {
  state: 'US states',
  county: 'US counties',
  city: 'US cities',
  country: 'countries',
  'world-city': 'world cities',
};

/**
 * Starts loading the stories index early, from the top of a page that lists story links further
 * down, so the browser fetches it alongside the page's other data instead of after them. Like
 * react-query's usePrefetchQuery, but skipped when `when` is false (a page with no story).
 */
export function usePrefetchStories(when = true): void {
  const queryClient = useQueryClient();
  if (when && queryClient.getQueryState(storiesIndexQuery.queryKey) == null)
    void queryClient.prefetchQuery(storiesIndexQuery);
}

/** "Strong link across 51 US states": how a story's two statistics move together, in words. */
export function storyStrength(
  story: Pick<StorySummary, 'r' | 'n' | 'type'>
): string {
  const w = strengthWord(story.r);
  const head =
    w == null
      ? 'No clear link'
      : `${w.charAt(0).toUpperCase()}${w.slice(1)} link`;
  return `${head} across ${story.n.toLocaleString('en-US')} ${PLACES[story.type]}`;
}

/**
 * A card listing data stories as links, each with a short line under its title (by default how
 * strong the link is). Used on topic pages ("Data stories using this statistic") and place pages.
 */
export function StoryLinkCard({
  title,
  subtitle,
  stories,
  detail = storyStrength,
  className,
}: {
  title: string;
  subtitle?: string;
  stories: readonly StorySummary[];
  detail?: (story: StorySummary) => ReactNode;
  className?: string;
}) {
  return (
    <Card title={title} subtitle={subtitle} className={className}>
      <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {stories.map((s) => (
          <li key={s.slug} className="flex min-w-0 gap-2.5">
            <Newspaper
              className="text-accent-600 dark:text-accent-300 mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <div className="min-w-0">
              <Link
                to="/articles/$slug"
                params={{ slug: s.slug }}
                className="hover:text-accent-700 dark:hover:text-accent-300 block text-sm leading-snug font-medium text-balance hover:underline"
              >
                {s.title}
              </Link>
              <div className="text-muted mt-0.5 text-xs">{detail(s)}</div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
