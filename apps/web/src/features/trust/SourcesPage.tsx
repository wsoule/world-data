import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import {
  LICENSE_URL,
  PIPELINE_SOURCES_URL,
  WPR_TERMS_URL,
  WPR_URL,
} from './links';
import { DIRECT_SOURCES, type DirectSource, topicOrigins } from './sources';
import {
  OutLink,
  PROSE_LINK,
  TrustLayout,
  TrustSection,
  type TrustSectionInfo,
} from './TrustLayout';
import { topicsIndexQuery } from '~/data/api';
import type { TopicSummary } from '~/data/types';
import { formatInt } from '~/lib/format';
import { SITE } from '~/site';

const SECTIONS = {
  wpr: { id: 'world-population-review', title: 'World Population Review' },
  direct: {
    id: 'direct-sources',
    title: 'Data taken directly from its publishers',
  },
  credits: { id: 'credits', title: 'How pages credit their sources' },
  licensing: { id: 'licensing', title: 'Licensing and reuse' },
} satisfies Record<string, TrustSectionInfo>;

/**
 * /sources: which topics come from World Population Review and which from agency files, the
 * direct sources with what each provides, how pages credit sources, and what reuse terms apply.
 * Topic counts and titles come from the published topic index, so they follow every rebuild.
 */
export function SourcesPage() {
  const { data: index } = useSuspenseQuery(topicsIndexQuery);
  const origins = topicOrigins(index);
  const byKey = new Map(index.map((t) => [`${t.type}/${t.slug}`, t]));

  return (
    <TrustLayout
      id="sources"
      sections={Object.values(SECTIONS)}
      lede={
        <p>
          {SITE.name} publishes {formatInt(origins.total)} topics.{' '}
          {formatInt(origins.compiled)} of them come from World Population
          Review, and {formatInt(origins.direct)} are built directly from files
          published by government agencies and one open dataset. This page lists
          them and says what you may and may not assume about reusing them.
        </p>
      }
    >
      <TrustSection section={SECTIONS.wpr}>
        <p>
          <OutLink href={WPR_URL}>World Population Review</OutLink> is the
          compiled source for most of the site. Its rankings, and many of the
          figures in them, are reproduced from World Population Review’s pages,
          which in turn cite the primary sources behind each list.
        </p>
        <p>
          {SITE.name} keeps the numbers, the column and page titles, those
          source citations and the date each page was last updated. It does not
          copy World Population Review’s articles, and it is not affiliated with
          World Population Review.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.direct}>
        <p>
          These sources are downloaded from their publishers by the{' '}
          <OutLink href={PIPELINE_SOURCES_URL}>data pipeline</OutLink> and
          turned into topics of their own. Their rows only attach to places the
          site already has, so they never add places.
        </p>
        <div className="grid gap-3">
          {DIRECT_SOURCES.map((s) => (
            <DirectSourceCard key={s.id} source={s} topics={byKey} />
          ))}
        </div>
      </TrustSection>

      <TrustSection section={SECTIONS.credits}>
        <ul>
          <li>
            <strong>Topic pages</strong> name their sources under the title:
            topics from World Population Review link the page they come from
            (“Original page”), and the “Sources” list gives the primary sources
            that page cites, when it cites any, or the dataset a topic was built
            from. The date the source last updated the figures is shown when the
            source gives one.
          </li>
          <li>
            <strong>Comparisons, rankings and place profiles</strong> combine
            statistics from many topics. The compare workbench and place
            profiles link each statistic to its topic page, which carries its
            credits.
          </li>
          <li>
            <strong>Adjusted figures</strong>, such as cost of living or share
            of income, are computed by {SITE.name} from the sources above; the{' '}
            <Link to="/methodology" hash="adjustments" className={PROSE_LINK}>
              methodology
            </Link>{' '}
            explains each one.
          </li>
        </ul>
      </TrustSection>

      <TrustSection section={SECTIONS.licensing}>
        <p>
          {SITE.name} does not grant any licence to third-party data. Figures
          reproduced from World Population Review, and the primary data behind
          them, remain subject to their owners’ terms, including{' '}
          <OutLink href={WPR_TERMS_URL}>
            World Population Review’s terms of use
          </OutLink>
          . Each agency publishes its own terms for its data; check them on the
          publisher’s site before reusing a dataset.
        </p>
        <p>
          The site’s source code is open source under the{' '}
          <OutLink href={LICENSE_URL}>Apache License 2.0</OutLink>. That licence
          covers the code; it does not extend to the third-party data the site
          shows or the dataset files built from it.
        </p>
        <p>
          For crediting {SITE.name}’s own work, such as its combined rankings,
          correlations and charts, see the{' '}
          <Link to="/terms" hash="reuse" className={PROSE_LINK}>
            terms of use
          </Link>
          .
        </p>
      </TrustSection>
    </TrustLayout>
  );
}

/** One direct source: publisher, dataset link, what it provides and the topics built from it. */
function DirectSourceCard({
  source,
  topics,
}: {
  source: DirectSource;
  topics: ReadonlyMap<string, TopicSummary>;
}) {
  const built = source.topics.flatMap((ref) => {
    const t = topics.get(`${ref.type}/${ref.slug}`);
    return t == null ? [] : [t];
  });
  return (
    <div className="card p-4">
      <div className="text-muted text-xs font-medium">{source.publisher}</div>
      <h3 className="mt-0.5 font-semibold">
        <OutLink href={source.url}>{source.dataset}</OutLink>
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed">{source.provides}</p>
      {source.alsoUsedFor != null ? (
        <p className="text-muted mt-1.5 text-sm leading-relaxed">
          Also used for: {source.alsoUsedFor}
        </p>
      ) : null}
      {source.note != null ? (
        <p className="text-muted mt-1.5 text-sm leading-relaxed">
          {source.note}
        </p>
      ) : null}
      {built.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted text-xs">
            {built.length === 1 ? 'Topic:' : 'Topics:'}
          </span>
          {built.map((t) => (
            <Link
              key={`${t.type}/${t.slug}`}
              to="/topics/$type/$slug"
              params={{ type: t.type, slug: t.slug }}
              className="border-app bg-surface hover:border-accent-300 hover:text-accent-700 dark:hover:text-accent-200 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs"
            >
              {t.title}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
