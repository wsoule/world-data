// The site's "about" pages (about, methodology, sources, contact, privacy, terms) in one list,
// so the route heads, the footer, the links between these pages and the prerender/sitemap list
// (scripts/static-pages.ts) all name the same paths and titles.

export type TrustPageId =
  | 'about'
  | 'methodology'
  | 'sources'
  | 'contact'
  | 'privacy'
  | 'terms';

export interface TrustPageInfo {
  id: TrustPageId;
  /** Site path of the page and its route ("/about") */
  path: `/${TrustPageId}`;
  /** <title> and Open Graph title, without the site name */
  title: string;
  /** The page's visible <h1> */
  heading: string;
  /** Short label for the footer, breadcrumbs and links between these pages */
  label: string;
  /** Meta description: 120–160 characters, answer-first */
  description: string;
  /** schema.org type of the page: AboutPage and ContactPage where one fits */
  schemaType: 'AboutPage' | 'ContactPage' | 'WebPage';
}

/** Every trust page, in footer order. */
export const TRUST_PAGES: readonly TrustPageInfo[] = [
  {
    id: 'about',
    path: '/about',
    title: 'About Rankodex',
    heading: 'About Rankodex',
    label: 'About',
    description:
      'Rankodex is an independent, open-source site for ranking, comparing and overlaying statistics about countries, US states, cities and counties.',
    schemaType: 'AboutPage',
  },
  {
    id: 'methodology',
    path: '/methodology',
    title: 'Methodology: how the rankings are built',
    heading: 'How Rankodex builds its rankings',
    label: 'Methodology',
    description:
      'How Rankodex compiles and cleans its data, picks default years and better directions, and computes ranks, percentiles, combined scores and correlations.',
    schemaType: 'WebPage',
  },
  {
    id: 'sources',
    path: '/sources',
    title: 'Data sources and licensing',
    heading: 'Sources and licensing',
    label: 'Sources and licensing',
    description:
      'Where Rankodex’s numbers come from: World Population Review for most rankings, plus data from the Census Bureau, BEA, BLS, CDC, EPA, FBI, NOAA and World Bank.',
    schemaType: 'WebPage',
  },
  {
    id: 'contact',
    path: '/contact',
    title: 'Contact and corrections',
    heading: 'Contact and corrections',
    label: 'Contact and corrections',
    description:
      'Report a wrong number, a broken page or an idea for Rankodex through GitHub issues: what to include, and how corrections are checked and published.',
    schemaType: 'ContactPage',
  },
  {
    id: 'privacy',
    path: '/privacy',
    title: 'Privacy',
    heading: 'Privacy',
    label: 'Privacy',
    description:
      'Rankodex has no accounts, cookies, analytics or ad trackers. What your browser keeps on your device, and what the hosting providers process when you visit.',
    schemaType: 'WebPage',
  },
  {
    id: 'terms',
    path: '/terms',
    title: 'Terms of use',
    heading: 'Terms of use',
    label: 'Terms',
    description:
      'Rankodex is provided as is, without warranty, and its statistics may lag their sources. How to credit Rankodex when you reuse its rankings, charts or code.',
    schemaType: 'WebPage',
  },
];

/** Trust page details by id. */
export const TRUST_PAGE: Record<TrustPageId, TrustPageInfo> =
  Object.fromEntries(TRUST_PAGES.map((p) => [p.id, p])) as Record<
    TrustPageId,
    TrustPageInfo
  >;
