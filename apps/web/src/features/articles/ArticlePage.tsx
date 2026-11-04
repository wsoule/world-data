import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';

import { shortLabel, storyText } from './prose';
import { StoryChart, StoryThumb } from './StoryChart';
import { InfoTip } from '~/components/InfoTip';
import type { StoryData, StoryPoint } from '~/content/storyTypes';
import { storiesIndexQuery, storyQuery } from '~/data/api';
import { siteHref } from '~/features/search/goals';
import { formatValue } from '~/lib/format';

const route = getRouteApi('/articles/$slug');

const TYPE_PLURAL: Record<StoryData['type'], string> = {
  state: 'US states',
  county: 'US counties',
  city: 'US cities',
  country: 'Countries',
  'world-city': 'World cities',
};

/** A data story: the answer first, then the chart, the explanation, the extremes and links. */
export function ArticlePage() {
  const { slug } = route.useParams();
  const { data: story } = useSuspenseQuery(storyQuery(slug));
  const { data: index } = useSuspenseQuery(storiesIndexQuery);
  const text = storyText(story);
  const related = index
    .filter(
      (s) =>
        s.slug !== story.slug &&
        (s.type === story.type || s.cats.some((c) => story.cats.includes(c)))
    )
    .sort(
      (a, b) => Number(b.kind === 'flagship') - Number(a.kind === 'flagship')
    )
    .slice(0, 4);
  const explore = siteHref('/compare', {
    type: story.type,
    view: 'scatter',
    m: [story.x.id, story.y.id],
    x: story.x.id,
    y: story.y.id,
    c: story.color?.id,
    log: story.logX ? ['x'] : undefined,
  });

  return (
    <article className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="text-muted mb-4 text-sm">
        <Link to="/articles" className="hover:text-app">
          Articles
        </Link>{' '}
        / {TYPE_PLURAL[story.type]}
      </nav>
      <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">
        {story.title}
      </h1>
      {story.dek !== '' ? (
        <p className="text-muted mt-3 text-lg leading-relaxed text-pretty">
          {story.dek}
        </p>
      ) : null}

      <section aria-label="The short answer" className="mt-8">
        <p className="text-xl leading-snug font-semibold text-pretty md:text-2xl">
          {text.takeaway}
        </p>
        <p className="text-muted mt-2 inline-flex items-center gap-1.5 text-sm">
          {text.strength}
          <InfoTip term="correlation" />
        </p>
      </section>

      <figure className="mt-6">
        <StoryChart story={story} />
        <figcaption className="text-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>
            Each dot is one place. The dashed line is the trend; circled places
            are named in the text.
          </span>
          {story.color != null
            ? story.groups.slice(0, 2).map((g) => (
                <span key={g.name} className="inline-flex items-center gap-1">
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{
                      background:
                        g.name === 'Republican'
                          ? '#dc2626'
                          : g.name === 'Democratic'
                            ? '#2563eb'
                            : 'var(--accent)',
                    }}
                    aria-hidden
                  />
                  {g.name} won
                </span>
              ))
            : null}
        </figcaption>
      </figure>

      <div className="mt-8 space-y-4 text-[17px] leading-relaxed">
        {text.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <Extremes
          title={`Highest ${shortLabel(story.y.label)}`}
          story={story}
          rows={story.top}
        />
        <Extremes
          title={`Lowest ${shortLabel(story.y.label)}`}
          story={story}
          rows={story.bottom}
        />
      </div>

      <section className="border-app mt-10 border-t pt-6">
        <h2 className="text-lg font-semibold">Explore it yourself</h2>
        <ul className="mt-3 space-y-2 text-[15px]">
          <li>
            <a
              href={explore}
              className="text-accent-700 dark:text-accent-300 font-medium hover:underline"
            >
              Open this comparison in the interactive chart
            </a>{' '}
            <span className="text-muted">
              to highlight places, change the metrics or colour by party.
            </span>
          </li>
          {[story.x, story.y].map((m) =>
            m.topic != null ? (
              <li key={m.id}>
                <Link
                  to="/topics/$type/$slug"
                  params={{ type: story.type, slug: m.topic }}
                  className="text-accent-700 dark:text-accent-300 hover:underline"
                >
                  Full ranking and sources for {shortLabel(m.label)}
                </Link>
              </li>
            ) : null
          )}
        </ul>
      </section>

      {related.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">More connections</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {related.map((s) => (
              <li key={s.slug}>
                <Link
                  to="/articles/$slug"
                  params={{ slug: s.slug }}
                  className="group block"
                >
                  {s.thumb.length > 0 ? (
                    <StoryThumb
                      story={s}
                      className="border-app bg-surface mb-2 h-auto w-full rounded-lg border p-1.5"
                    />
                  ) : null}
                  <span className="group-hover:text-accent-700 dark:group-hover:text-accent-300 font-medium">
                    {s.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function Extremes({
  title,
  story,
  rows,
}: {
  title: string;
  story: StoryData;
  rows: StoryPoint[];
}) {
  const ym = { fmt: story.y.fmt, unit: story.y.unit, kind: 'num' as const };
  const xm = { fmt: story.x.fmt, unit: story.x.unit, kind: 'num' as const };
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <table className="w-full text-sm">
        <thead className="text-muted text-left text-xs">
          <tr>
            <th className="py-1 font-normal">Place</th>
            <th className="py-1 text-right font-normal">
              {shortLabel(story.y.label)}
            </th>
            <th className="py-1 text-right font-normal">
              {shortLabel(story.x.label)}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-app border-t">
              <td className="py-1.5">
                <Link
                  to="/places/$type/$slug"
                  params={{ type: story.type, slug: r.slug }}
                  className="hover:underline"
                >
                  {r.name}
                </Link>
              </td>
              <td className="tabular py-1.5 text-right">
                {formatValue(ym, r.y)}
              </td>
              <td className="tabular text-muted py-1.5 text-right">
                {formatValue(xm, r.x)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
