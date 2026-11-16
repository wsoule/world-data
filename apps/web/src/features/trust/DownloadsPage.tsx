import { Link } from '@tanstack/react-router';

import { InquiryLink, OfferCard } from './Offer';
import {
  PROSE_LINK,
  TrustLayout,
  TrustSection,
  type TrustSectionInfo,
} from './TrustLayout';
import { CONTACT_EMAIL } from '~/commerce';
import { SITE, SITE_URL } from '~/site';

const SECTIONS = {
  free: { id: 'free-downloads', title: 'Free CSV downloads' },
  api: { id: 'api', title: 'The JSON API' },
  paid: { id: 'plans', title: 'Bulk data and commercial access' },
  scope: { id: 'whats-included', title: 'What the paid data covers' },
} satisfies Record<string, TrustSectionInfo>;

const EXAMPLE_CSV = `${SITE_URL}/data/state/topics/median-household-income-by-state.csv`;

/** /downloads: free per-topic CSVs, the static JSON API, and the paid bulk dataset and API plan. */
export function DownloadsPage() {
  return (
    <TrustLayout
      id="downloads"
      sections={Object.values(SECTIONS)}
      lede={
        <p>
          Every table on {SITE.name} can be downloaded. Single tables are free
          to use with a credit; bulk files with every year, and commercial use
          of the API, are paid.
        </p>
      }
    >
      <TrustSection section={SECTIONS.free}>
        <p>
          Each topic’s table, one row per place and one column per statistic at
          its default year, is a CSV file at the topic’s address under{' '}
          <code>/data</code>:
        </p>
        <p>
          <code className="break-all">{EXAMPLE_CSV}</code>
        </p>
        <p>
          The{' '}
          <Link
            to="/compare"
            search={{ type: 'state', view: 'table', m: [] }}
            className={PROSE_LINK}
          >
            compare tool
          </Link>{' '}
          also exports any combination of statistics, and any combined ranking
          you build, as CSV. Free downloads are for personal, educational and
          editorial use with a visible credit to {SITE.name} and the source each
          topic names.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.api}>
        <p>
          The site reads its data from static JSON files, and so can you. Every
          place uses a stable id: ISO 3166 alpha-3 for countries, USPS codes for
          states, 5-digit FIPS for counties and slugs for cities.
        </p>
        <ul>
          <li>
            <code>/data/manifest.json</code>: place types, counts and categories
          </li>
          <li>
            <code>/data/&lt;type&gt;/entities.json</code>: places, with ids and
            groups
          </li>
          <li>
            <code>/data/&lt;type&gt;/metrics.json</code>: every statistic, its
            unit, better direction and coverage
          </li>
          <li>
            <code>/data/&lt;type&gt;/topics/&lt;slug&gt;.json</code>: one topic
            with every year of every column
          </li>
        </ul>
        <p>
          Light non-commercial use with a credit is free. Apps, products and
          anything that calls the files at volume need the commercial plan
          below, which comes with a stable versioned endpoint and change
          notices.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.paid}>
        <div className="grid gap-4 sm:grid-cols-2">
          <OfferCard offer="dataset" title="Bulk dataset" cta="Buy the dataset">
            <ul>
              <li>
                Every primary-source statistic, every year, every place type
              </li>
              <li>CSV and JSON, with the stable place ids above</li>
              <li>{SITE.name}’s combined rankings and percentiles</li>
              <li>A commercial licence for the files</li>
            </ul>
          </OfferCard>
          <OfferCard
            offer="api"
            title="Commercial API access"
            cta="Start API access"
          >
            <ul>
              <li>Versioned JSON endpoints you can build a product on</li>
              <li>Notice before any breaking change</li>
              <li>Monthly data refreshes</li>
              <li>Commercial use in apps and services</li>
            </ul>
          </OfferCard>
        </div>
        <p>
          Questions, invoices or a custom extract: write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={PROSE_LINK}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.scope}>
        <p>
          The paid files and plans cover what {SITE.name} can license: data from
          public primary sources (the Census Bureau, BEA, BLS, CDC, EPA, FBI,
          NOAA and the World Bank, listed on the{' '}
          <Link to="/sources" className={PROSE_LINK}>
            sources page
          </Link>
          ) as {SITE.name} cleans and normalizes it, plus {SITE.name}’s own
          rankings, percentiles and combined scores. Figures compiled by World
          Population Review are not included: they remain under{' '}
          <Link to="/sources" hash="licensing" className={PROSE_LINK}>
            their owner’s terms
          </Link>
          .
        </p>
        <p>
          <InquiryLink subject="Rankodex data: what is included?">
            Ask what a topic includes
          </InquiryLink>
        </p>
      </TrustSection>
    </TrustLayout>
  );
}
