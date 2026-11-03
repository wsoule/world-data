import { interpolateLab } from 'd3-interpolate';
import { scaleLinear } from 'd3-scale';

import type { Standing } from './profileModel';
import { cx } from '~/components/ui';
import type { RankOrder } from '~/data/rankOrder';
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
 *
 * `rank` counts from the best place. On a worst-first rank column (`order`, see
 * `rankOrder`) the column's own numbers count from the worst, so a bare "50th of 50" next to
 * its value "1st" would read backwards; there the text names the end outright: "best of 50",
 * "3rd best of 50" in the better half, "worst of 50", "2nd worst of 50" in the worse half.
 * `tied` defaults to 1 for callers that only know the competition rank.
 */
export function rankText(
  s: Pick<Standing, 'rank' | 'n'> & { tied?: number },
  order: RankOrder | null = null
): string {
  const tied = s.tied ?? 1;
  const tie = tied > 1 ? 'tied ' : '';
  const of = `of ${formatInt(s.n)}`;
  if (order === 'worst-first') {
    // Competition rank counted from the worst end: the tie's lowest position.
    const fromWorst = s.n - (s.rank + tied - 1) + 1;
    const side = s.rank <= fromWorst ? 'best' : 'worst';
    const pos = side === 'best' ? s.rank : fromWorst;
    return `${tie}${pos === 1 ? '' : `${ordinal(pos)} `}${side} ${of}`;
  }
  if (tied > 1 && s.rank > 1 && s.rank + tied - 1 >= s.n)
    return `tied last ${of}`;
  return `${tie}${ordinal(s.rank)} ${of}`;
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
