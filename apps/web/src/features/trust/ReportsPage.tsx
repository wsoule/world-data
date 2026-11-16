import { Link } from '@tanstack/react-router';

import { OfferCard } from './Offer';
import {
  PROSE_LINK,
  TrustLayout,
  TrustSection,
  type TrustSectionInfo,
} from './TrustLayout';
import { SITE } from '~/site';

const SECTIONS = {
  diy: { id: 'build-your-own', title: 'Build one yourself, free' },
  custom: { id: 'custom', title: 'Commission a report' },
  examples: { id: 'examples', title: 'What people ask for' },
  process: { id: 'process', title: 'How it works' },
} satisfies Record<string, TrustSectionInfo>;

/** /reports: the free composite builder, and paid custom reports and indexes. */
export function ReportsPage() {
  return (
    <TrustLayout
      id="reports"
      sections={Object.values(SECTIONS)}
      lede={
        <p>
          {SITE.name} can rank places on any mix of its thousands of statistics.
          Build a combined ranking yourself for free, or have one built and
          written up for you.
        </p>
      }
    >
      <TrustSection section={SECTIONS.diy}>
        <p>
          The{' '}
          <Link
            to="/compare"
            search={{ type: 'state', view: 'ranking', m: [] }}
            className={PROSE_LINK}
          >
            compare tool
          </Link>{' '}
          builds a combined ranking from any statistics you pick: set each one’s
          weight and better direction, filter by region, and export the result
          as CSV. The{' '}
          <Link to="/methodology" className={PROSE_LINK}>
            methodology
          </Link>{' '}
          explains how the scores are computed.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.custom}>
        <div className="grid gap-4 sm:grid-cols-2">
          <OfferCard
            offer="report"
            title="Custom report or index"
            cta="Start a report"
          >
            <ul>
              <li>An index built to your criteria and weights</li>
              <li>Ranked tables, maps and charts</li>
              <li>A written summary of what drives the results</li>
              <li>The data behind it as CSV, licensed for your use</li>
            </ul>
          </OfferCard>
        </div>
      </TrustSection>

      <TrustSection section={SECTIONS.examples}>
        <ul>
          <li>
            <strong>Site selection</strong>: which states or counties fit a new
            office, warehouse or store, on cost, workforce, taxes and risk.
          </li>
          <li>
            <strong>Newsrooms</strong>: a ranking for a story, with checked
            figures, charts ready to publish and a methodology note.
          </li>
          <li>
            <strong>Schools and researchers</strong>: a clean panel of
            statistics across places and years for a class or a study.
          </li>
          <li>
            <strong>Relocation and HR</strong>: livability scores for the places
            employees are choosing between.
          </li>
        </ul>
      </TrustSection>

      <TrustSection section={SECTIONS.process}>
        <ol>
          <li>Tell us what the ranking is for and which places it covers.</li>
          <li>
            We propose the statistics, weights and sources, and agree the scope.
          </li>
          <li>
            You get the report, its charts and its data, usually within a week.
          </li>
        </ol>
      </TrustSection>
    </TrustLayout>
  );
}
