import {
  ChevronDown,
  GraduationCap,
  HeartPulse,
  Landmark,
  Layers,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { CompareViewProps } from '../state';
import { type Bundle, type BundleId, bundlesFor } from './bundles';
import { midSentence } from './words';
import { EmptyState } from '~/components/feedback';
import { cx } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import { plural } from '~/lib/format';

/** Separator whose no-break space keeps the dot on the previous name's line. */
const SEP = `${String.fromCharCode(0xa0)}· `;

const ICONS: Record<BundleId, LucideIcon> = {
  quality: Sparkles,
  economy: Landmark,
  health: HeartPulse,
  safety: ShieldCheck,
  education: GraduationCap,
  everything: Layers,
};

/** Bundles for a dataset, built once per dataset and cached. */
export function useBundles(dataset: Dataset): Bundle[] {
  return useMemo(
    () =>
      bundlesFor(dataset, () => ({
        metrics: dataset.metrics,
        entityCount: dataset.entities.length,
        numeric: (id) => dataset.numeric(id),
      })),
    [dataset]
  );
}

/** Replace the basket with a bundle (weights and direction overrides start fresh). */
export function applyBundle(update: CompareViewProps['update'], b: Bundle) {
  update({ m: b.metricIds, w: undefined, d: undefined, f: undefined });
}

function coverageNote(b: Bundle, dataset: Dataset) {
  return `each covers ≥ ${Math.round(b.minCoverage * 100)}% of ${midSentence(dataset.type.label)}`;
}

/** Empty state: big bundle cards shown while the basket has fewer than two metrics. */
export function BundleGrid({
  dataset,
  metrics,
  update,
}: Pick<CompareViewProps, 'dataset' | 'metrics' | 'update'>) {
  const bundles = useBundles(dataset);
  const plural_ = midSentence(dataset.type.label);
  if (bundles.length === 0) {
    return (
      <EmptyState
        title="Add at least two metrics"
        icon={<Layers className="text-muted size-6" aria-hidden />}
      >
        {dataset.type.label} have too few well-covered metrics for ready-made
        bundles. Add metrics from the panel on the left to build your own
        ranking.
      </EmptyState>
    );
  }
  return (
    <section aria-labelledby="bundle-heading" className="space-y-4">
      <div>
        <h2 id="bundle-heading" className="text-lg font-semibold">
          Who ranks #1? Start with a bundle
        </h2>
        <p className="text-muted mt-1 text-sm">
          {metrics.length === 1
            ? `You have one metric. Add another from the panel, or rank ${plural_} on a ready-made bundle.`
            : `Layer several metrics into one score. Pick a bundle to rank ${plural_} on, then tune weights and directions.`}
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {bundles.map((b) => {
          const Icon = ICONS[b.id];
          const everything = b.id === 'everything';
          const names = b.metricIds
            .slice(0, 4)
            .map((id) => dataset.metric(id)?.label ?? `Metric ${id}`);
          return (
            <li
              key={b.id}
              className={cx(everything && 'sm:col-span-2 xl:col-span-1')}
            >
              <button
                type="button"
                onClick={() => applyBundle(update, b)}
                className={cx(
                  'group bg-surface flex h-full w-full flex-col gap-2 rounded-2xl border p-4 text-left shadow-sm transition-colors',
                  'focus-visible:outline-accent-500 focus-visible:outline-2 focus-visible:outline-offset-2',
                  everything
                    ? 'border-accent-300 hover:border-accent-500 dark:border-accent-700'
                    : 'border-app hover:border-accent-400'
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cx(
                      'grid size-8 shrink-0 place-items-center rounded-lg',
                      everything
                        ? 'bg-accent-600 text-white'
                        : 'bg-accent-50 text-accent-700 dark:bg-accent-900/50 dark:text-accent-200'
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{b.label}</span>
                    <span className="text-muted block text-xs">
                      {everything
                        ? `${plural(b.metricIds.length, 'metric')} of ${b.qualifying} qualifying`
                        : plural(b.metricIds.length, 'metric')}
                    </span>
                  </span>
                </span>
                <span className="text-muted text-sm">{b.description}</span>
                <span className="text-muted mt-auto text-xs leading-relaxed">
                  {names.join(SEP)}
                  {b.metricIds.length > names.length
                    ? `${SEP}+${b.metricIds.length - names.length} more`
                    : ''}
                </span>
                <span className="text-muted text-[11px]">
                  Metrics {coverageNote(b, dataset)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Toolbar dropdown that swaps the basket for a bundle. Keyboard: arrows, Home/End, Escape. */
export function BundleMenu({
  dataset,
  update,
}: Pick<CompareViewProps, 'dataset' | 'update'>) {
  const bundles = useBundles(dataset);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onDown = (e: PointerEvent) => {
      if (
        rootRef.current != null &&
        e.target instanceof Node &&
        !rootRef.current.contains(e.target)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  if (bundles.length === 0) return null;

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter((x) => x != null);
    const i = items.findIndex((x) => x === document.activeElement);
    const focus = (k: number) =>
      items[(k + items.length) % items.length]?.focus();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focus(i + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focus(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focus(items.length - 1);
    } else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="border-app bg-surface hover:bg-surface-2 focus-visible:outline-accent-500 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Layers className="size-3.5" aria-hidden />
        Bundles
        <ChevronDown className="size-3.5" aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Metric bundles"
          onKeyDown={onKeyDown}
          className="border-app bg-surface absolute right-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border p-1 shadow-lg"
        >
          {bundles.map((b, i) => {
            const Icon = ICONS[b.id];
            return (
              <button
                key={b.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  applyBundle(update, b);
                  close();
                }}
                className="hover:bg-surface-2 focus:bg-surface-2 flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none"
              >
                <Icon
                  className="text-accent-600 dark:text-accent-300 mt-0.5 size-4 shrink-0"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {b.label}{' '}
                    <span className="text-muted font-normal">
                      · {b.metricIds.length}
                      {b.id === 'everything' ? ` of ${b.qualifying}` : ''}
                    </span>
                  </span>
                  <span className="text-muted block text-xs">
                    {b.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
