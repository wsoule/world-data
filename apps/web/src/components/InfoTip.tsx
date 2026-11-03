import { Link } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { cx } from '~/components/ui';
import { GLOSSARY, type GlossaryId } from '~/lib/glossary';

/** Popover width in px; kept in sync with the w-72 class below. */
const WIDTH = 288;
/** Gap between the button and the popover, and the minimum distance from the viewport edge. */
const GAP = 6;

/**
 * Small ⓘ button that explains a term in place, with a link to its full /glossary entry.
 *
 * The definition is a native popover (popover="auto"), so it renders in the browser's top layer:
 * no sticky bar or overflow-hidden card can cover or clip it, and the browser closes it on
 * Escape, on a click outside, and when another tip opens. Unlike a title attribute it works on
 * touch screens. The text is in the server-rendered HTML; only its position is set on open,
 * below the button (or above it when there is no room), clamped to the viewport. The popover is a
 * <span> so a tip can sit inside a <p>, heading or <dt>.
 */
export function InfoTip({
  term,
  className,
}: {
  term: GlossaryId;
  className?: string;
}) {
  const entry = GLOSSARY[term];
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const pop = popRef.current;
    if (pop == null) return;
    // Before it shows (height still unknown): below the button, centred and clamped sideways.
    const placeBelow = (e: Event) => {
      const b = buttonRef.current?.getBoundingClientRect();
      if (b == null || (e as ToggleEvent).newState !== 'open') return;
      const left = Math.min(
        b.left + b.width / 2 - WIDTH / 2,
        window.innerWidth - WIDTH - GAP
      );
      pop.style.left = `${Math.max(GAP, left)}px`;
      pop.style.top = `${b.bottom + GAP}px`;
    };
    // Once shown: flip above the button when it would run off the bottom of the viewport.
    const flipIfNeeded = () => {
      const b = buttonRef.current?.getBoundingClientRect();
      if (b == null) return;
      if (b.bottom + GAP + pop.offsetHeight > window.innerHeight - GAP)
        pop.style.top = `${Math.max(GAP, b.top - GAP - pop.offsetHeight)}px`;
    };
    // A fixed-position popover would drift away from its button on scroll, so close it instead.
    const close = () => pop.hidePopover();
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === 'open') {
        flipIfNeeded();
        window.addEventListener('scroll', close, { capture: true, once: true });
        window.addEventListener('resize', close, { once: true });
      } else {
        window.removeEventListener('scroll', close, { capture: true });
        window.removeEventListener('resize', close);
      }
    };
    pop.addEventListener('beforetoggle', placeBelow);
    pop.addEventListener('toggle', onToggle);
    return () => {
      pop.removeEventListener('beforetoggle', placeBelow);
      pop.removeEventListener('toggle', onToggle);
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        popoverTarget={id}
        aria-label={`What is ${entry.term}?`}
        className={cx(
          'text-muted hover:text-accent-600 dark:hover:text-accent-300 focus-visible:outline-accent-500 inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full align-[-0.15em] focus-visible:outline-2',
          className
        )}
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      <span
        ref={popRef}
        id={id}
        popover="auto"
        role="note"
        aria-label={entry.term}
        className="border-app bg-surface text-app fixed inset-auto m-0 w-72 max-w-[calc(100vw-12px)] rounded-xl border p-3 text-left text-sm font-normal tracking-normal normal-case shadow-lg"
      >
        <span className="block font-semibold">{entry.term}</span>
        <span className="text-muted mt-1 block leading-relaxed">
          {entry.short}
        </span>
        <Link
          to="/glossary"
          hash={entry.id}
          className="text-accent-600 dark:text-accent-300 mt-2 inline-block text-xs font-medium hover:underline"
        >
          More in the glossary →
        </Link>
      </span>
    </>
  );
}
