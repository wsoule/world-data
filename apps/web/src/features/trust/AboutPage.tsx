import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { LICENSE_URL, PIPELINE_URL, REPO_URL, WPR_URL } from './links';
import {
  OutLink,
  PROSE_LINK,
  TrustLayout,
  TrustSection,
  type TrustSectionInfo,
} from './TrustLayout';
import { manifestQuery } from '~/data/api';
import { formatInt } from '~/lib/format';
import { SITE } from '~/site';

const SECTIONS = {
  what: { id: 'what-you-can-do', title: 'What you can do here' },
  independent: { id: 'independent', title: 'Independent and unaffiliated' },
  built: { id: 'how-it-is-built', title: 'How it is built' },
  contact: { id: 'get-in-touch', title: 'Get in touch' },
} satisfies Record<string, TrustSectionInfo>;

/** /about: what Rankodex is, that it is independent of its sources, and how it is built. */
export function AboutPage() {
  const { data: manifest } = useSuspenseQuery(manifestQuery);
  const places = manifest.types.reduce((n, t) => n + t.entities, 0);
  const statistics = manifest.types.reduce((n, t) => n + t.numericMetrics, 0);
  const counts = new Map(manifest.types.map((t) => [t.id, t.entities]));
  const count = (id: (typeof manifest.types)[number]['id']) =>
    formatInt(counts.get(id) ?? 0);

  return (
    <TrustLayout
      id="about"
      sections={Object.values(SECTIONS)}
      lede={
        <p>
          {SITE.name} is a free site for exploring data about the world:{' '}
          {formatInt(statistics)} statistics about {formatInt(places)} places,
          in {formatInt(manifest.categories.length)} categories from economics
          and health to crime and the environment. Every statistic can be
          ranked, compared with any other and combined into rankings of your
          own.
        </p>
      }
    >
      <TrustSection section={SECTIONS.what}>
        <p>
          The places are {count('country')} countries, {count('state')} US
          states (with the District of Columbia), {count('city')} US cities,{' '}
          {count('world-city')} world cities and {count('county')} US counties.
          For each of them you can:
        </p>
        <ul>
          <li>
            <strong>Read a ranking.</strong> Each topic page lists its places in
            a sortable table and, for numeric statistics, adds charts of the
            spread, earlier years where the source has them, and the other
            statistics that correlate with it. Browse them by{' '}
            <Link to="/categories" className={PROSE_LINK}>
              category
            </Link>
            .
          </li>
          <li>
            <strong>Overlay two statistics.</strong>{' '}
            <Link
              to="/compare"
              search={{ type: 'state', view: 'scatter', m: [] }}
              className={PROSE_LINK}
            >
              Compare
            </Link>{' '}
            plots one statistic against another, one dot per place, with a trend
            line, the correlation and its p-value. The same workbench shows
            maps, tables, a correlation matrix and rank lines.
          </li>
          <li>
            <strong>Build a combined ranking.</strong>{' '}
            <Link
              to="/compare"
              search={{ type: 'state', view: 'ranking', m: [] }}
              className={PROSE_LINK}
            >
              Rankings
            </Link>{' '}
            weigh several statistics into one score, with a weight and a better
            direction for each that you can change.
          </li>
          <li>
            <strong>Put places side by side.</strong>{' '}
            <Link
              to="/vs"
              search={{ type: 'state', e: [] }}
              className={PROSE_LINK}
            >
              Head to head
            </Link>{' '}
            compares two to four places on every statistic they share, and each{' '}
            <Link
              to="/places/$type"
              params={{ type: 'country' }}
              className={PROSE_LINK}
            >
              place profile
            </Link>{' '}
            lists that place’s strengths and weak spots.
          </li>
          <li>
            <strong>Read the data stories.</strong>{' '}
            <Link to="/articles" className={PROSE_LINK}>
              Stories
            </Link>{' '}
            are short articles about how statistics relate across places,
            written around numbers computed from the dataset.
          </li>
        </ul>
        <p>
          Every comparison lives in its URL, so any view can be shared as a
          link. The{' '}
          <Link to="/glossary" className={PROSE_LINK}>
            glossary
          </Link>{' '}
          explains the terms, and the{' '}
          <Link to="/methodology" className={PROSE_LINK}>
            methodology
          </Link>{' '}
          explains how each figure is computed.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.independent}>
        <p>
          {SITE.name} is an independent project. It is not affiliated with,
          endorsed by or sponsored by{' '}
          <OutLink href={WPR_URL}>World Population Review</OutLink>, or by any
          government agency or other organisation whose data it shows.
        </p>
        <p>
          Most topics reproduce World Population Review’s rankings and figures,
          which in turn cite the primary sources behind each list; a smaller set
          is built directly from agency files such as the Census Bureau’s
          American Community Survey and the World Bank’s World Development
          Indicators.{' '}
          <Link to="/sources" className={PROSE_LINK}>
            Sources and licensing
          </Link>{' '}
          lists what comes from where, and every topic page credits its own
          sources.
        </p>
        <p>
          The site has no accounts and shows no advertising; the{' '}
          <Link to="/privacy" className={PROSE_LINK}>
            privacy page
          </Link>{' '}
          says what it does and does not keep.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.built}>
        <p>
          {SITE.name} is open source. The code, the{' '}
          <OutLink href={PIPELINE_URL}>data pipeline</OutLink> and the published
          dataset are all in one public repository,{' '}
          <OutLink href={REPO_URL}>wsoule/world-data on GitHub</OutLink>, so
          anyone can check how a number was produced or rebuild the site.
        </p>
        <ul>
          <li>
            The pipeline downloads the source pages and agency files, keeps
            their numbers, titles and source citations, and writes one dataset
            of places and statistics. The{' '}
            <Link to="/methodology" className={PROSE_LINK}>
              methodology
            </Link>{' '}
            describes each step.
          </li>
          <li>
            Ranks, percentiles, correlations and combined scores come from a
            small statistics package in the same repository, so every view
            computes them the same way.
          </li>
          <li>
            Topic, place, category and story pages are rendered to static HTML
            when the site is built, so their text and tables load without
            JavaScript. The interactive views (compare, head to head and search)
            run in your browser.
          </li>
        </ul>
        <p>
          The source code is published under the{' '}
          <OutLink href={LICENSE_URL}>Apache License 2.0</OutLink>.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.contact}>
        <p>
          Found a wrong number or a broken page, or want a statistic added?{' '}
          <Link to="/contact" className={PROSE_LINK}>
            Contact and corrections
          </Link>{' '}
          explains how to report it and how fixes are made.
        </p>
      </TrustSection>
    </TrustLayout>
  );
}
