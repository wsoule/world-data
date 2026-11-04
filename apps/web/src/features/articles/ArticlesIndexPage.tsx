import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { shortLabel, strengthWord } from './prose';
import { StoryThumb } from './StoryChart';
import { PageHeader } from '~/components/ui';
import type { StorySummary } from '~/content/storyTypes';
import { storiesIndexQuery } from '~/data/api';

const TYPE_ORDER: StorySummary['type'][] = [
  'state',
  'county',
  'city',
  'country',
];
const TYPE_TITLE: Record<StorySummary['type'], string> = {
  state: 'US states',
  county: 'US counties',
  city: 'US cities',
  country: 'Countries',
  'world-city': 'World cities',
};

const rText = (r: number) => r.toFixed(2).replace('-', '−');

/** Every data story: the hand-written ones as cards with charts, then the strongest pairs by place type. */
export function ArticlesIndexPage() {
  const { data: stories } = useSuspenseQuery(storiesIndexQuery);
  const flagship = stories.filter((s) => s.kind === 'flagship');
  const pairs = stories.filter((s) => s.kind === 'pair');
  return (
    <div>
      <PageHeader
        title="Data stories"
        subtitle="What goes with what across states, counties, cities and countries, each with the chart and the numbers behind it."
      />
      <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {flagship.map((s) => (
          <li key={s.slug}>
            <StoryCard story={s} />
          </li>
        ))}
      </ul>

      <section className="mt-16">
        <h2 className="text-xl font-semibold tracking-tight">
          Strongest connections in the data
        </h2>
        <p className="text-muted mt-1 max-w-2xl text-sm">
          Pairs of statistics from different sources that move together most
          closely. A correlation near 1 or −1 is a tight link; it is not proof
          that one causes the other.
        </p>
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          {TYPE_ORDER.map((type) => {
            const items = pairs.filter((s) => s.type === type);
            if (items.length === 0) return null;
            return (
              <section key={type}>
                <h3 className="text-muted mb-2 text-sm font-medium">
                  {TYPE_TITLE[type]}
                </h3>
                <ul className="divide-app divide-y text-[15px]">
                  {items.map((s) => (
                    <li
                      key={s.slug}
                      className="flex items-baseline justify-between gap-3 py-2"
                    >
                      <Link
                        to="/articles/$slug"
                        params={{ slug: s.slug }}
                        className="hover:text-accent-700 dark:hover:text-accent-300 min-w-0"
                      >
                        {shortLabel(s.yLabel)} and {shortLabel(s.xLabel)}
                      </Link>
                      <span className="tabular text-muted shrink-0 text-xs">
                        {rText(s.r)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** A story card: its chart, title, teaser and how strong the link is. Used here and on the home page. */
export function StoryCard({ story }: { story: StorySummary }) {
  const w = strengthWord(story.r);
  return (
    <Link
      to="/articles/$slug"
      params={{ slug: story.slug }}
      className="group block"
    >
      <StoryThumb
        story={story}
        className="border-app bg-surface group-hover:border-accent-300 dark:group-hover:border-accent-700 h-auto w-full rounded-xl border p-2 transition-colors"
      />
      <h3 className="group-hover:text-accent-700 dark:group-hover:text-accent-300 mt-3 text-base leading-snug font-semibold text-balance">
        {story.title}
      </h3>
      <p className="text-muted mt-1 text-sm leading-relaxed">{story.dek}</p>
      <p className="text-muted mt-2 text-xs">
        {w == null
          ? 'No clear link'
          : `${w.charAt(0).toUpperCase()}${w.slice(1)} link`}
        , {story.n.toLocaleString('en-US')} places
      </p>
    </Link>
  );
}
