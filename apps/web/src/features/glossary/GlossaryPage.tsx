import { PageHeader } from '~/components/ui';
import { GLOSSARY, GLOSSARY_SECTIONS } from '~/lib/glossary';

/**
 * Every definition from lib/glossary.ts, grouped by section, each under an anchor of its id so
 * InfoTip's "More in the glossary" link lands on it. The linked entry is highlighted via :target.
 */
export function GlossaryPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Glossary"
        title="What the numbers mean"
        subtitle="Plain-language definitions of the terms used across rankings, comparisons and statistics. Look for the ⓘ next to a term anywhere on the site."
      />
      <nav
        aria-label="Glossary terms"
        className="mb-8 flex flex-wrap gap-1.5 text-sm"
      >
        {GLOSSARY_SECTIONS.flatMap((s) => s.ids).map((id) => (
          <a
            key={id}
            href={`#${id}`}
            className="border-app bg-surface hover:border-accent-300 hover:text-accent-700 dark:hover:text-accent-200 rounded-full border px-2.5 py-0.5 text-xs"
          >
            {GLOSSARY[id].term}
          </a>
        ))}
      </nav>
      <div className="space-y-10">
        {GLOSSARY_SECTIONS.map((section) => (
          <section key={section.title} aria-label={section.title}>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">
              {section.title}
            </h2>
            <dl className="space-y-3">
              {section.ids.map((id) => {
                const e = GLOSSARY[id];
                return (
                  <div
                    key={id}
                    id={id}
                    className="card target:border-accent-400 target:ring-accent-300/60 scroll-mt-32 p-4 target:ring-2 md:scroll-mt-24"
                  >
                    <dt className="font-semibold">{e.term}</dt>
                    <dd className="mt-1 space-y-2 text-sm leading-relaxed">
                      <p>{e.short}</p>
                      <p className="text-muted">{e.long}</p>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
