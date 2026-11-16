import { Link } from '@tanstack/react-router';

import { InquiryLink } from './Offer';
import {
  PROSE_LINK,
  TrustLayout,
  TrustSection,
  type TrustSectionInfo,
} from './TrustLayout';
import { CONTACT_EMAIL } from '~/commerce';
import { SITE } from '~/site';

const SECTIONS = {
  citing: { id: 'citing', title: 'Citing is free' },
  licence: { id: 'licence', title: 'Licensing the data' },
  scope: { id: 'scope', title: 'What can and cannot be licensed' },
  contact: { id: 'contact', title: 'Get in touch' },
} satisfies Record<string, TrustSectionInfo>;

/** /licensing: free citation by answer engines, and paid licences for AI and commercial use. */
export function LicensingPage() {
  return (
    <TrustLayout
      id="licensing"
      sections={Object.values(SECTIONS)}
      lede={
        <p>
          AI assistants, answer engines and data products can use {SITE.name}’s
          rankings. Reading and citing pages is free; bulk use, training and
          products built on the data need a licence.
        </p>
      }
    >
      <TrustSection section={SECTIONS.citing}>
        <p>
          Search engines and AI answer engines are welcome to crawl {SITE.name}{' '}
          and quote its figures in answers, with a link to the page the figure
          comes from. The site publishes <code>llms.txt</code> and{' '}
          <code>llms-full.txt</code> to make that easy.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.licence}>
        <p>A licence covers uses beyond citing a page, such as:</p>
        <ul>
          <li>
            bulk ingestion of the dataset into a retrieval index or a knowledge
            base;
          </li>
          <li>use of the data to train or fine-tune models;</li>
          <li>serving {SITE.name}’s rankings inside a paid product or API.</li>
        </ul>
        <p>
          Licences come with structured files (the same stable ids and units as
          the{' '}
          <Link to="/downloads" className={PROSE_LINK}>
            data downloads
          </Link>
          ), refreshes as the sources update, and attribution terms that fit
          your product.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.scope}>
        <p>
          {SITE.name} licenses its own work, its rankings, percentiles, combined
          scores, correlations and written summaries, and the primary-source
          data it cleans and normalizes from public agencies. Figures compiled
          by World Population Review are not {SITE.name}’s to license; see{' '}
          <Link to="/sources" hash="licensing" className={PROSE_LINK}>
            sources and licensing
          </Link>
          .
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.contact}>
        <p>
          Write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={PROSE_LINK}>
            {CONTACT_EMAIL}
          </a>{' '}
          with what you are building and roughly how you will use the data.
        </p>
        <p>
          <InquiryLink subject="Rankodex data licence">
            Ask about a licence
          </InquiryLink>
        </p>
      </TrustSection>
    </TrustLayout>
  );
}
