import { Link } from '@tanstack/react-router';

import {
  CLOUDFLARE_PRIVACY_URL,
  HISTORY_URL,
  ISSUES_URL,
  RAILWAY_PRIVACY_URL,
} from './links';
import { STORED_ITEMS, THIRD_PARTY_HOSTS } from './privacy';
import {
  OutLink,
  PROSE_LINK,
  TrustLayout,
  TrustSection,
  type TrustSectionInfo,
} from './TrustLayout';
import { ANALYTICS_TOKEN, SITE } from '~/site';

const FLAG_HOSTS = THIRD_PARTY_HOSTS.filter((h) => h.analytics !== true);

const SECTIONS = {
  short: { id: 'in-short', title: 'In short' },
  browser: { id: 'your-browser', title: 'What stays in your browser' },
  hosting: { id: 'hosting', title: 'What the hosting providers see' },
  analytics: { id: 'analytics', title: 'Visit counts' },
  flags: { id: 'flag-images', title: 'Flag images' },
  links: { id: 'links', title: 'Links to other sites' },
  changes: { id: 'changes', title: 'Changes and questions' },
} satisfies Record<string, TrustSectionInfo>;

/**
 * /privacy: no accounts, cookies or ad trackers; the browser-storage keys and outside hosts the
 * code uses (from privacy.ts, checked against the code by a test); what the host and CDN
 * process; and, when the build turns them on, the cookieless Cloudflare visit counts.
 */
export function PrivacyPage() {
  return (
    <TrustLayout
      id="privacy"
      sections={Object.values(SECTIONS).filter(
        (s) => s !== SECTIONS.analytics || ANALYTICS_TOKEN != null
      )}
      lede={
        <p>
          {SITE.name} is a static site: pages and data files, with nothing to
          sign up for. It does not collect personal information, and this page
          explains the little that is stored and by whom.
        </p>
      }
    >
      <TrustSection section={SECTIONS.short}>
        <ul>
          <li>
            There are no accounts or sign-ins. Search runs in your browser, so
            what you type in the search box is not sent anywhere.
          </li>
          <li>The site sets no cookies.</li>
          {ANALYTICS_TOKEN != null ? (
            <li>
              There are no advertising or tracking scripts. One small script
              counts visits without cookies or identifying you, described below.
              Everything else comes from {SITE.name}’s own address, apart from
              flag images.
            </li>
          ) : (
            <li>
              There are no analytics, advertising or tracking scripts. Pages,
              scripts, styles and data files all come from {SITE.name}’s own
              address; the one exception is flag images, described below.
            </li>
          )}
          <li>
            Your choices in a comparison (places, statistics, weights) live in
            the page address, so they are only shared when you share the link.
          </li>
        </ul>
      </TrustSection>

      <TrustSection section={SECTIONS.browser}>
        <p>
          A few settings are kept in your browser’s own storage so the site
          remembers them on your device. They are never sent anywhere: the site
          has no server-side code that could receive them.
        </p>
        <dl className="card divide-y divide-[var(--border)]">
          {STORED_ITEMS.map((item) => (
            <div key={item.key} className="px-3 py-2.5">
              <dt className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <code className="font-mono text-xs break-all">
                  {item.key}
                  {item.prefix === true ? '…' : ''}
                </code>
                <span className="text-muted text-xs">
                  {item.storage === 'localStorage'
                    ? 'local storage'
                    : 'session storage'}
                </span>
              </dt>
              <dd className="mt-1 text-sm">{item.purpose}</dd>
            </div>
          ))}
        </dl>
        <p>
          The page router also keeps scroll positions in session storage, so the
          Back button returns you to the same spot; session storage is cleared
          when you close the tab. You can remove everything at any time by
          clearing this site’s data in your browser’s settings; the site works
          the same without it.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.hosting}>
        <p>
          The site is hosted on{' '}
          <OutLink href={RAILWAY_PRIVACY_URL}>Railway</OutLink>, and{' '}
          <OutLink href={CLOUDFLARE_PRIVACY_URL}>Cloudflare</OutLink> sits in
          front of it to deliver and protect it. Like any website, these
          providers process standard request information to do so: your IP
          address, the address of the page or file requested, the time, and what
          your browser sends with every request, such as its name and version.
          They handle it under their own privacy policies, linked here.
        </p>
        <p>
          Cloudflare may also ask your browser to report connection errors to it
          (Network Error Logging). {SITE.name}’s own web server configuration,
          published with the code, does not write access logs.
        </p>
      </TrustSection>

      {ANALYTICS_TOKEN != null ? (
        <TrustSection section={SECTIONS.analytics}>
          <p>
            To see which pages are useful and how people find them, the site
            loads{' '}
            <OutLink href="https://www.cloudflare.com/web-analytics/">
              Cloudflare Web Analytics
            </OutLink>{' '}
            from <code className="text-sm">static.cloudflareinsights.com</code>.
            It sets no cookies, keeps nothing in your browser and does not
            follow you across sites. It reports the page you viewed, the site
            that linked you here, your browser and device type, your country and
            how fast the page loaded. {SITE.name} sees only totals, never
            individual visitors.
          </p>
        </TrustSection>
      ) : null}

      <TrustSection section={SECTIONS.flags}>
        {FLAG_HOSTS.map((h) => (
          <p key={h.host}>
            Pages that list places show small flag images, which your browser
            loads from <code className="text-sm">{h.host}</code>, an outside
            image service. Like any web server, it receives your IP address and
            the image requested, and at most {SITE.name}’s address as the page
            that asked for it, not which page you were on. No other image is
            loaded from another site.
          </p>
        ))}
      </TrustSection>

      <TrustSection section={SECTIONS.links}>
        <p>
          Pages link to World Population Review, government agencies, GitHub and
          other sites. Those sites have their own privacy policies. When you
          follow a link, your browser tells the other site at most that you came
          from {SITE.name}’s address, not which page you were on.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.changes}>
        <p>
          Changes to this page are recorded in the repository’s public{' '}
          <OutLink href={HISTORY_URL}>history</OutLink>. Questions about privacy
          can be raised as an <OutLink href={ISSUES_URL}>issue</OutLink>; see{' '}
          <Link to="/contact" className={PROSE_LINK}>
            contact
          </Link>{' '}
          for how.
        </p>
      </TrustSection>
    </TrustLayout>
  );
}
