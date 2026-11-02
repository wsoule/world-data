import { cx } from './ui';
import type { QA } from '~/seo/content';

/**
 * Visible question-and-answer block. The same items are emitted as FAQPage
 * structured data, so search engines and AI answer engines can quote them.
 * It brings no outer margin: the page's stack spaces it, and `className` can
 * add more.
 */
export function QuickAnswers({
  items,
  title = 'Quick answers',
  className,
}: {
  items: readonly QA[];
  title?: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="quick-answers"
      className={cx('card p-5', className)}
    >
      <h2 id="quick-answers" className="text-base font-semibold">
        {title}
      </h2>
      <dl className="mt-3 grid gap-4 md:grid-cols-2">
        {items.map((q) => (
          <div key={q.question}>
            <dt className="text-sm font-medium">{q.question}</dt>
            <dd className="text-muted mt-1 text-sm leading-relaxed">
              {q.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
