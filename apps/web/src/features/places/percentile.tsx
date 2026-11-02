import { interpolateLab } from 'd3-interpolate';
import { scaleLinear } from 'd3-scale';

import type { Standing } from './profileModel';
import { cx } from '~/components/ui';
import { formatInt, ordinal } from '~/lib/format';
import type { Theme } from '~/lib/theme';

/** Bar colours for percentiles: worst, middling and best, plus a hue-free one for neutral metrics. */
function stops(theme: Theme) {
  return theme === 'dark'
    ? { bad: '#f87171', mid: '#fbbf24', good: '#34d399', neutral: '#64748b' }
    : { bad: '#dc2626', mid: '#f59e0b', good: '#059669', neutral: '#94a3b8' };
}

/**
 * d3 colour scale for a direction-aware percentile (0 = worst, 1 = best) on a red → amber →
 * green ramp, readable on both themes. Charts pass it as their colour scale; HTML uses
 * `percentileColor`. `spread` sets how far from the median the ramp saturates: averages of
 * many percentiles cluster near 0.5, so charts of averages use a narrower spread.
 */
export function percentileScale(theme: Theme, spread = 0.5) {
  const s = stops(theme);
  return scaleLinear<string>()
    .domain([0.5 - spread, 0.5, 0.5 + spread])
    .range([s.bad, s.mid, s.good])
    .interpolate(interpolateLab)
    .clamp(true);
}

export function percentileColor(
  theme: Theme,
  spread = 0.5
): (pct: number) => string {
  const scale = percentileScale(theme, spread);
  return (pct) => scale(pct);
}

export function neutralColor(theme: Theme): string {
  return stops(theme).neutral;
}

/**
 * "3rd of 50", with "tied" when others share the value. A tie that runs to the bottom of the
 * ranking reads "tied last of 51": its competition rank (the top of the tie, say 32nd) would
 * place it mid-table although nobody ranks below it.
 */
export function rankText(s: Pick<Standing, 'rank' | 'n' | 'tied'>): string {
  if (s.tied > 1 && s.rank > 1 && s.rank + s.tied - 1 >= s.n)
    return `tied last of ${formatInt(s.n)}`;
  return `${s.tied > 1 ? 'tied ' : ''}${ordinal(s.rank)} of ${formatInt(s.n)}`;
}

/** Percentile as a whole number out of 100. */
export const pctText = (pct: number) => String(Math.round(pct * 100));

/**
 * Thin horizontal bar showing a percentile. Directional metrics are coloured from red (worst) to
 * green (best); neutral ones use a hue-free grey because higher is neither good nor bad.
 */
export function PercentileBar({
  pct,
  polar,
  theme,
  className,
  showValue = true,
}: {
  pct: number;
  polar: boolean;
  theme: Theme;
  className?: string;
  showValue?: boolean;
}) {
  const color = polar ? percentileColor(theme)(pct) : neutralColor(theme);
  const label = polar
    ? `Percentile ${pctText(pct)} of 100 (100 = best)`
    : `Higher than ${pctText(pct)}% of places`;
  return (
    <div
      className={cx('flex items-center gap-2', className)}
      role="img"
      aria-label={label}
      title={label}
    >
      <div className="bg-surface-2 h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(3, pct * 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
      {showValue ? (
        <span className="tabular text-muted w-6 shrink-0 text-right text-xs">
          {pctText(pct)}
        </span>
      ) : null}
    </div>
  );
}
