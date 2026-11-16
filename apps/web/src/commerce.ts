// Paid offers and partner links, all set at build time. The site is static (no backend), so
// buying happens on Stripe Payment Links and partner sites. Every URL comes from a VITE_*
// variable, and an unset or malformed one hides its button or partner instead of shipping a
// broken link. Values are the same on the server and in the browser, so pages that show them
// render identically in both.

/** Where licensing, report and white-label inquiries go. */
export const CONTACT_EMAIL = 'hello@rankodex.com';

/** A mailto: link to CONTACT_EMAIL with a subject line. */
export function contactHref(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/**
 * A Stripe Payment Link from a build variable, or null when it is unset or not a Payment Link
 * (https://buy.stripe.com/…), so a typo never ships a checkout button that goes somewhere else.
 */
export function stripeLink(raw: string | undefined): string | null {
  const url = raw?.trim() ?? '';
  return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_-]+$/.test(url) ? url : null;
}

/**
 * A partner (affiliate) link from a build variable, or null when it is unset or not an absolute
 * https URL.
 */
export function partnerLink(raw: string | undefined): string | null {
  const value = raw?.trim() ?? '';
  if (value === '') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.includes('.')
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export type OfferId = 'dataset' | 'api' | 'embed' | 'report';

/** Checkout links for the paid offers; null ones fall back to an email inquiry. */
export const CHECKOUT: Record<OfferId, string | null> = {
  dataset: stripeLink(import.meta.env.VITE_STRIPE_DATASET_URL),
  api: stripeLink(import.meta.env.VITE_STRIPE_API_URL),
  embed: stripeLink(import.meta.env.VITE_STRIPE_EMBED_URL),
  report: stripeLink(import.meta.env.VITE_STRIPE_REPORT_URL),
};

export interface Partner {
  id: 'movers' | 'homes' | 'insurance';
  /** Button text */
  label: string;
  /** One line under the label */
  blurb: string;
  url: string;
}

/** Relocation partners whose URL is set, in display order. */
export function relocationPartners(env: {
  movers?: string;
  homes?: string;
  insurance?: string;
}): Partner[] {
  const all: Array<Omit<Partner, 'url'> & { url: string | null }> = [
    {
      id: 'homes',
      label: 'Browse homes for sale',
      blurb: 'Listings and prices in the area',
      url: partnerLink(env.homes),
    },
    {
      id: 'movers',
      label: 'Get moving quotes',
      blurb: 'Compare long-distance movers',
      url: partnerLink(env.movers),
    },
    {
      id: 'insurance',
      label: 'Compare insurance rates',
      blurb: 'Home, renters and auto quotes',
      url: partnerLink(env.insurance),
    },
  ];
  return all.flatMap((p) => (p.url == null ? [] : [{ ...p, url: p.url }]));
}

/** The relocation partners this build links to (empty when none are configured). */
export const RELOCATION_PARTNERS: readonly Partner[] = relocationPartners({
  movers: import.meta.env.VITE_AFFILIATE_MOVERS_URL,
  homes: import.meta.env.VITE_AFFILIATE_HOMES_URL,
  insurance: import.meta.env.VITE_AFFILIATE_INSURANCE_URL,
});
