import { ANALYTICS_TOKEN } from '~/site';

/**
 * Cloudflare Web Analytics: a cookieless beacon that counts page views and referrers (including
 * route changes inside the app), loaded only when the build sets VITE_CF_ANALYTICS_TOKEN. The
 * token is a public site id, the same on the server and in the browser, so it renders identically
 * in both.
 */
export function AnalyticsBeacon() {
  if (ANALYTICS_TOKEN == null) return null;
  return (
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token: ANALYTICS_TOKEN, spa: true })}
    />
  );
}
