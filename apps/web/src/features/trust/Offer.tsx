import { ArrowRight, Mail } from 'lucide-react';
import type { ReactNode } from 'react';

import { CHECKOUT, contactHref, type OfferId } from '~/commerce';

/**
 * One paid offer on the business pages: a title, what it includes, and a button. The button
 * opens the offer's Stripe Payment Link when the build sets one (see commerce.ts), and otherwise
 * an email inquiry, so the page always has a working next step.
 */
export function OfferCard({
  offer,
  title,
  children,
  cta,
}: {
  offer: OfferId;
  title: string;
  children: ReactNode;
  /** Button text when checkout is available ("Buy the dataset") */
  cta: string;
}) {
  const checkout = CHECKOUT[offer];
  return (
    <div className="card flex flex-col gap-3 p-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="text-muted space-y-2 text-sm leading-relaxed [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
      <div className="mt-auto pt-1">
        {checkout != null ? (
          <a
            href={checkout}
            target="_blank"
            rel="noreferrer"
            className="bg-accent-600 hover:bg-accent-700 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white"
          >
            {cta}
            <ArrowRight className="size-3.5" aria-hidden />
          </a>
        ) : (
          <InquiryLink subject={title} />
        )}
      </div>
    </div>
  );
}

/** An email link to the inquiry address, styled as a secondary button. */
export function InquiryLink({
  subject,
  children = 'Ask about this',
}: {
  subject: string;
  children?: ReactNode;
}) {
  return (
    <a
      href={contactHref(subject)}
      className="border-app hover:border-accent-300 hover:text-accent-700 dark:hover:text-accent-200 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
    >
      <Mail className="size-3.5" aria-hidden />
      {children}
    </a>
  );
}
