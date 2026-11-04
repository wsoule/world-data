import { Link } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

import { TRUST_PAGE, TRUST_PAGES, type TrustPageId } from './pages';
import { SITE } from '~/site';

/** Link styling shared by the prose of the trust pages. */
export const PROSE_LINK =
  'text-accent-700 dark:text-accent-300 underline decoration-accent-300/60 underline-offset-2 hover:decoration-current dark:decoration-accent-400/50';

export interface TrustSectionInfo {
  /** Anchor id of the section */
  id: string;
  title: string;
}

/**
 * The shell of every trust page: a breadcrumb back to the home page, the heading and lede, an
 * "On this page" list of section anchors, the sections themselves, and links to the other trust
 * pages so a reader can move between About, Methodology, Sources and the policies.
 */
export function TrustLayout({
  id,
  lede,
  sections,
  children,
}: {
  id: TrustPageId;
  lede: ReactNode;
  sections: readonly TrustSectionInfo[];
  children: ReactNode;
}) {
  const page = TRUST_PAGE[id];
  return (
    <article className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="text-muted mb-4 text-sm">
        <Link to="/" className="hover:text-app">
          {SITE.name}
        </Link>
        <span aria-hidden> / </span>
        <span aria-current="page">{page.label}</span>
      </nav>
      <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">
        {page.heading}
      </h1>
      <div className="text-muted mt-3 text-lg leading-relaxed text-pretty">
        {lede}
      </div>
      {sections.length > 1 ? (
        <nav
          aria-label="On this page"
          className="border-app mt-6 border-y py-3 text-sm"
        >
          <h2 className="text-muted mb-2 text-xs font-semibold">
            On this page
          </h2>
          <ol className="flex flex-wrap gap-1.5">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="border-app bg-surface hover:border-accent-300 hover:text-accent-700 dark:hover:text-accent-200 inline-block rounded-full border px-2.5 py-0.5 text-xs"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="mt-8 space-y-10">{children}</div>
      <MoreAboutRankodex current={id} />
    </article>
  );
}

/** One titled section of a trust page, under an anchor the "On this page" list links to. */
export function TrustSection({
  section,
  children,
}: {
  section: TrustSectionInfo;
  children: ReactNode;
}) {
  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-title`}
      className="scroll-mt-32 md:scroll-mt-24"
    >
      <h2
        id={`${section.id}-title`}
        className="mb-3 text-xl font-semibold tracking-tight"
      >
        {section.title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-pretty [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** An external link in trust-page prose; opens in a new tab like the site's other outbound links. */
export function OutLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={PROSE_LINK}>
      {children}
      <ExternalLink
        className="ml-0.5 inline size-3 align-baseline opacity-70"
        aria-hidden
      />
    </a>
  );
}

/** Links to the other trust pages, shown at the end of each one. */
function MoreAboutRankodex({ current }: { current: TrustPageId }) {
  return (
    <nav
      aria-label={`More about ${SITE.name}`}
      className="border-app mt-12 border-t pt-6"
    >
      <h2 className="text-lg font-semibold">More about {SITE.name}</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {TRUST_PAGES.filter((p) => p.id !== current).map((p) => (
          <li key={p.id}>
            <Link
              to={p.path}
              className="card hover:border-accent-300 block h-full p-3"
            >
              <span className="font-medium">{p.label}</span>
              <span className="text-muted mt-1 block text-xs leading-relaxed">
                {p.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
