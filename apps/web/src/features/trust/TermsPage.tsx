import { Link } from '@tanstack/react-router';

import { HISTORY_URL, LICENSE_URL } from './links';
import {
  OutLink,
  PROSE_LINK,
  TrustLayout,
  TrustSection,
  type TrustSectionInfo,
} from './TrustLayout';
import { SITE, SITE_URL } from '~/site';

const SECTIONS = {
  information: { id: 'information', title: 'Information, not advice' },
  warranty: { id: 'no-warranty', title: 'No warranty' },
  lag: { id: 'lag', title: 'Statistics can lag their sources' },
  reuse: { id: 'reuse', title: `Reusing ${SITE.name}’s own work` },
  thirdParty: { id: 'third-party-data', title: 'Third-party data' },
  links: { id: 'links', title: 'Links to other sites' },
  changes: { id: 'changes', title: 'Changes to these terms' },
} satisfies Record<string, TrustSectionInfo>;

/** /terms: as-is information without warranty, lag, attribution for reuse, third-party data. */
export function TermsPage() {
  return (
    <TrustLayout
      id="terms"
      sections={Object.values(SECTIONS)}
      lede={
        <p>
          These terms apply when you use {SITE.name} or reuse what it publishes.
          In short: the information is provided as is, check the original source
          before relying on a figure, and credit {SITE.name} and its sources
          when you reuse its work.
        </p>
      }
    >
      <TrustSection section={SECTIONS.information}>
        <p>
          {SITE.name} publishes statistics, rankings and comparisons for general
          information. Nothing on the site is professional advice, whether
          legal, financial or medical, or advice about where it is safe to live
          or travel. Before you rely on a figure for a decision, check it with
          the original source, which each topic page names.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.warranty}>
        <p>
          The site and everything on it are provided as is, without warranty of
          any kind: {SITE.name} does not promise that any figure, ranking,
          calculation or text is accurate, complete or current, or that the site
          will be available. To the extent the law allows, {SITE.name} is not
          liable for any loss that comes from using the site or relying on its
          content.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.lag}>
        <p>
          Figures are copied from their sources when the dataset is rebuilt,
          which happens without a fixed schedule, so a source may have published
          newer or revised numbers since. Sources publish different years on
          different schedules, so two statistics side by side may describe
          different years. Some choices, such as which direction counts as
          better, are judgement calls that the{' '}
          <Link to="/methodology" className={PROSE_LINK}>
            methodology
          </Link>{' '}
          explains and that you can change in comparisons.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.reuse}>
        <p>
          {SITE.name}’s own work is what it computes and writes: combined
          rankings, percentiles, correlations, adjusted figures, charts, maps
          and the text of its pages and stories. If you reuse it, please:
        </p>
        <ul>
          <li>
            credit {SITE.name} and link to the page you used, for example
            “Source: {SITE.name}, {SITE_URL.replace(/^https?:\/\//, '')}”, or
            the exact topic or comparison link;
          </li>
          <li>
            also credit the underlying sources the page names, since the figures
            behind {SITE.name}’s work are theirs;
          </li>
          <li>
            say when you changed or recomputed something, so readers do not
            mistake your version for the original.
          </li>
        </ul>
        <p>
          The site’s source code is published under the{' '}
          <OutLink href={LICENSE_URL}>Apache License 2.0</OutLink>; reusing the
          code follows that licence’s conditions.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.thirdParty}>
        <p>
          Data from World Population Review, government agencies and other
          sources belongs to them and stays under their terms. {SITE.name}{' '}
          cannot grant any rights to it. See{' '}
          <Link to="/sources" className={PROSE_LINK}>
            sources and licensing
          </Link>{' '}
          for what comes from where.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.links}>
        <p>
          Links to other sites are provided for reference. {SITE.name} does not
          control those sites and is not responsible for their content or
          availability.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.changes}>
        <p>
          These terms may change as the site does. Every change is recorded in
          the repository’s public <OutLink href={HISTORY_URL}>history</OutLink>,
          and questions are welcome through the{' '}
          <Link to="/contact" className={PROSE_LINK}>
            contact page
          </Link>
          .
        </p>
      </TrustSection>
    </TrustLayout>
  );
}
