// The site's "about" pages (about, methodology, sources, contact, privacy, terms) and its
// business pages (data and API, embeds, reports, licensing) in one list,
// so the route heads, the footer, the links between these pages and the prerender/sitemap list
// (scripts/static-pages.ts) all name the same paths and titles.

export type TrustPageId =
  | 'about'
  | 'methodology'
  | 'sources'
  | 'contact'
  | 'privacy'
  | 'terms'
  | 'downloads'
  | 'embed'
  | 'reports'
  | 'licensing';

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
  /** Footer column: the site's own policies, or what can be bought or reused */
  group: 'about' | 'business';
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
    group: 'about',
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
    group: 'about',
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
    group: 'about',
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
    group: 'about',
  },
  {
    id: 'privacy',
    path: '/privacy',
    title: 'Privacy',
    heading: 'Privacy',
    label: 'Privacy',
    description:
      'Rankodex has no accounts, cookies or ad trackers. What your browser keeps on your device, and what the hosting providers process when you visit.',
    schemaType: 'WebPage',
    group: 'about',
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
    group: 'about',
  },
  {
    id: 'downloads',
    path: '/downloads',
    title: 'Data downloads and API access',
    heading: 'Data downloads and API access',
    label: 'Data and API',
    description:
      'Download any Rankodex table as CSV for free, or buy the bulk primary-source dataset and commercial API access with every year and place type.',
    schemaType: 'WebPage',
    group: 'business',
  },
  {
    id: 'embed',
    path: '/embed',
    title: 'Embed rankings on your site',
    heading: 'Embed Rankodex rankings',
    label: 'Embed a ranking',
    description:
      'Put any Rankodex ranking on your own site or article with one line of HTML. Free with a credit link; white-label embeds are available for publishers.',
    schemaType: 'WebPage',
    group: 'business',
  },
  {
    id: 'reports',
    path: '/reports',
    title: 'Custom reports and composite indexes',
    heading: 'Custom reports and indexes',
    label: 'Custom reports',
    description:
      'Commission a custom ranking, composite index or location report built from Rankodex statistics, for site selection, newsrooms, schools and research.',
    schemaType: 'WebPage',
    group: 'business',
  },
  {
    id: 'licensing',
    path: '/licensing',
    title: 'Data licensing for AI and commercial use',
    heading: 'Licensing for AI and commercial use',
    label: 'AI and commercial licensing',
    description:
      'License Rankodex’s own rankings, composite scores and normalized primary-source data for AI products, answer engines and commercial apps.',
    schemaType: 'WebPage',
    group: 'business',
  },
];

/** Trust page details by id. */
export const TRUST_PAGE: Record<TrustPageId, TrustPageInfo> =
  Object.fromEntries(TRUST_PAGES.map((p) => [p.id, p])) as Record<
    TrustPageId,
    TrustPageInfo
  >;
