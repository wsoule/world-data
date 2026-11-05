// Facts the privacy page states about the code: what the site keeps in the visitor's browser
// and which other hosts a page loads files from. Each entry names the source file responsible;
// test/trust-pages.test.ts fails when the code starts using browser storage, or loading an image
// or script from another host, somewhere these lists do not describe.

/** A host other than the site's own that pages load files from. */
export interface ThirdPartyHost {
  host: string;
  /** What is loaded from it */
  what: string;
  /** Source file under apps/web/src that builds the URL */
  file: string;
  /** Loaded only when the build turns analytics on (VITE_CF_ANALYTICS_TOKEN) */
  analytics?: true;
}

/** Every outside host the site's pages load files from (not plain links). */
export const THIRD_PARTY_HOSTS: readonly ThirdPartyHost[] = [
  { host: 'flagcdn.com', what: 'flag images', file: 'components/Flag.tsx' },
  {
    host: 'static.cloudflareinsights.com',
    what: 'the Cloudflare Web Analytics script',
    file: 'components/AnalyticsBeacon.tsx',
    analytics: true,
  },
];

export interface StoredItem {
  /** Storage key, or its prefix when the key ends with a variable part */
  key: string;
  /** True when `key` is a prefix ("rankodex:chunk-reload:" followed by a module URL) */
  prefix?: boolean;
  storage: 'localStorage' | 'sessionStorage';
  /** What is stored and why, in plain words */
  purpose: string;
  /** Source file under apps/web/src that uses the key */
  file: string;
}

/** Every key the site's own code stores in the browser. */
export const STORED_ITEMS: readonly StoredItem[] = [
  {
    key: 'theme',
    storage: 'localStorage',
    purpose:
      '“light” or “dark”, once you use the theme button, so the next visit opens in the same theme.',
    file: 'lib/theme.ts',
  },
  {
    key: 'rankodex:recent-searches',
    storage: 'localStorage',
    purpose:
      'Up to 6 search results you opened (a place, topic, statistic or category), so the empty search box can offer them again.',
    file: 'features/search/recent.ts',
  },
  {
    key: 'rankodex:search-goal',
    storage: 'localStorage',
    purpose:
      'Which of the search box’s goals you last picked (moving, research, travel or curiosity), so it offers the same starting points next time.',
    file: 'features/search/goals.ts',
  },
  {
    key: 'rankodex:chunk-reload:',
    prefix: true,
    storage: 'sessionStorage',
    purpose:
      'A marker that the page already reloaded once to fetch a part of the site that changed in a new release, so it never reloads in a loop. It lasts until the tab is closed.',
    file: 'lib/staleChunks.ts',
  },
];
