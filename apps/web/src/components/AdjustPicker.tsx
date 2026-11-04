import { InfoTip } from './InfoTip';
import { cx } from './ui';
import type { AdjustmentId } from '~/data/adjustments';
import type { GlossaryId } from '~/lib/glossary';

const LABEL: Record<AdjustmentId, string> = {
  col: 'For cost of living',
  income: 'As share of income',
  pc: 'Per person',
};
const TERM: Record<AdjustmentId, GlossaryId> = {
  col: 'cost-of-living',
  income: 'share-of-income',
  pc: 'per-person',
};

/**
 * "Adjust": a choice between the numbers as reported and the adjustments that apply here
 * (cost of living for wages, share of income for household costs, per person for totals).
 * Renders nothing when no adjustment applies.
 */
export function AdjustPicker({
  options,
  value,
  onChange,
  note,
  className,
}: {
  options: readonly AdjustmentId[];
  value: AdjustmentId | undefined;
  onChange: (id: AdjustmentId | undefined) => void;
  /** A line under the choice, e.g. which statistics it changes */
  note?: string | null;
  className?: string;
}) {
  if (options.length === 0) return null;
  const choices: (AdjustmentId | undefined)[] = [undefined, ...options];
  return (
    <div className={cx('text-xs', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted font-medium">Adjust</span>
        <div
          role="radiogroup"
          aria-label="Adjust the numbers"
          className="border-app bg-surface-2 inline-flex flex-wrap gap-0.5 rounded-lg border p-0.5"
        >
          {choices.map((id) => {
            const on = value === id;
            return (
              <button
                key={id ?? 'none'}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(id)}
                className={cx(
                  'rounded-md px-2 py-1 font-medium',
                  on
                    ? 'bg-surface text-app shadow-sm'
                    : 'text-muted hover:text-app'
                )}
              >
                {id == null ? 'As reported' : LABEL[id]}
              </button>
            );
          })}
        </div>
        {value != null ? <InfoTip term={TERM[value]} /> : null}
      </div>
      {note != null && note !== '' ? (
        <p className="text-muted mt-1">{note}</p>
      ) : null}
    </div>
  );
}
