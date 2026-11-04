import { Link } from '@tanstack/react-router';

import { HISTORY_URL, ISSUES_URL, REPO_URL } from './links';
import {
  OutLink,
  PROSE_LINK,
  TrustLayout,
  TrustSection,
  type TrustSectionInfo,
} from './TrustLayout';
import { SITE } from '~/site';

const SECTIONS = {
  reach: { id: 'how-to-reach', title: 'How to get in touch' },
  report: { id: 'report-an-error', title: 'Reporting an error' },
  corrections: { id: 'corrections', title: 'How corrections are handled' },
  ideas: { id: 'suggestions', title: 'Suggestions and contributions' },
} satisfies Record<string, TrustSectionInfo>;

/** /contact: where to report errors and ideas (GitHub issues), what to include, and how fixes are made. */
export function ContactPage() {
  return (
    <TrustLayout
      id="contact"
      sections={Object.values(SECTIONS)}
      lede={
        <p>
          {SITE.name} takes error reports, questions and suggestions through the
          issue tracker of its public repository on GitHub.
        </p>
      }
    >
      <TrustSection section={SECTIONS.reach}>
        <p>
          Open an issue at{' '}
          <OutLink href={ISSUES_URL}>
            github.com/wsoule/world-data/issues
          </OutLink>
          . Search the open issues first, in case someone has already reported
          the same thing; adding a comment there helps too.
        </p>
        <p>
          Opening an issue needs a free GitHub account, and issues are public,
          so do not include personal information you would not want published.
          There is no email address or contact form.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.report}>
        <p>A report that can be checked quickly includes:</p>
        <ul>
          <li>the address (URL) of the page, copied from your browser;</li>
          <li>
            the place and the statistic, and the year if the page shows one;
          </li>
          <li>the value {SITE.name} shows and the value you expected;</li>
          <li>
            a link to where the right figure is published, such as the original
            page or the agency’s release, if you have one;
          </li>
          <li>
            for display problems, your browser and device, and a screenshot if
            you can.
          </li>
        </ul>
        <p>
          Each topic page credits its sources under its title, which is the best
          place to start checking a figure. The{' '}
          <Link to="/sources" className={PROSE_LINK}>
            sources page
          </Link>{' '}
          lists them all.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.corrections}>
        <p>
          A report is checked against the source the page credits. What happens
          next depends on where the error is:
        </p>
        <ul>
          <li>
            <strong>{SITE.name} misread its source</strong>, for example a wrong
            unit, a misplaced row, a mislabelled column or a better direction
            the wrong way round: the fix goes into the data pipeline or the
            site’s code, so it applies to every page that uses the figure, not
            only the one reported.
          </li>
          <li>
            <strong>The source itself is wrong or out of date</strong>:{' '}
            {SITE.name} does not edit individual values by hand, so the figure
            stays as the source publishes it until the source corrects it. The
            issue records the problem, and the source’s own correction channel
            is the place to fix it.
          </li>
          <li>
            <strong>A wording or calculation problem</strong>, such as a
            misleading sentence or a statistic computed the wrong way, is fixed
            in the code.
          </li>
        </ul>
        <p>
          Every change is made in the{' '}
          <OutLink href={REPO_URL}>public repository</OutLink>, so the fix, the
          commit that made it and its date are visible in the{' '}
          <OutLink href={HISTORY_URL}>history</OutLink>. The live site is
          rebuilt from that repository, and a correction appears once the next
          build is deployed.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.ideas}>
        <p>
          Ideas for new statistics, sources, places or features are welcome as
          issues too. The code is open source, so you can also propose a change
          directly as a pull request; the{' '}
          <Link to="/methodology" className={PROSE_LINK}>
            methodology
          </Link>{' '}
          describes how the data is built.
        </p>
      </TrustSection>
    </TrustLayout>
  );
}
