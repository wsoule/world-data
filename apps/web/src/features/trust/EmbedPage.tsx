import { Link } from '@tanstack/react-router';

import { OfferCard } from './Offer';
import {
  PROSE_LINK,
  TrustLayout,
  TrustSection,
  type TrustSectionInfo,
} from './TrustLayout';
import { embedSnippet } from '~/features/widget/embed';
import { SITE } from '~/site';

const SECTIONS = {
  how: { id: 'how-to-embed', title: 'How to embed a ranking' },
  options: { id: 'options', title: 'Choosing what it shows' },
  credit: { id: 'credit', title: 'The credit link' },
  whiteLabel: { id: 'white-label', title: 'White-label embeds' },
} satisfies Record<string, TrustSectionInfo>;

/** /embed: how to put a ranking on another site, the free credit-linked embed, and white-label. */
export function EmbedPage() {
  return (
    <TrustLayout
      id="embed"
      sections={Object.values(SECTIONS)}
      lede={
        <p>
          Any {SITE.name} ranking can go into an article, a lesson or a
          dashboard as a live chart. It is free, and it stays up to date as the
          data is refreshed.
        </p>
      }
    >
      <TrustSection section={SECTIONS.how}>
        <p>
          Open a topic page, find <strong>Embed this ranking</strong> under the
          chart and copy the code. It is one line of HTML that works in
          WordPress, Ghost, Squarespace, Substack’s HTML blocks and any page
          that accepts an iframe:
        </p>
        <pre className="bg-surface-2 overflow-x-auto rounded-md p-3 text-xs">
          <code>
            {embedSnippet('state', 'median-household-income-by-state')}
          </code>
        </pre>
      </TrustSection>

      <TrustSection section={SECTIONS.options}>
        <p>
          The embed shows the topic’s lead statistic, top ten first. The code
          from a topic page keeps the statistic you were looking at. Change{' '}
          <code>n</code> in the address to show more places (up to 50), and the
          height to fit.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.credit}>
        <p>
          Free embeds carry a small “{SITE.name}” credit that links to the full
          ranking, with its map, years and sources. Please keep it: it is how
          readers check a figure, and it is the only condition of the free
          embed. See the{' '}
          <Link to="/terms" hash="reuse" className={PROSE_LINK}>
            terms
          </Link>{' '}
          for reusing {SITE.name}’s work in other forms.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.whiteLabel}>
        <div className="grid gap-4 sm:grid-cols-2">
          <OfferCard
            offer="embed"
            title="White-label embeds"
            cta="Get white-label embeds"
          >
            <ul>
              <li>No {SITE.name} credit line</li>
              <li>Your colours and fonts</li>
              <li>Map, ranking and comparison charts</li>
              <li>For publishers and commercial sites</li>
            </ul>
          </OfferCard>
        </div>
      </TrustSection>
    </TrustLayout>
  );
}
