import { scaleLinear } from '@tanstack/charts/scales/linear';

import type { Metric } from '~/data/types';
import { isScaleUnit, tickFormatter } from '~/lib/format';

/**
 * Smallest and largest finite value, or null when there is none. Charts use it to build
 * explicit axis domains so the tick formatter and the drawn axis agree.
 */
export function finiteExtent(
  values: Iterable<number | null>
): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? [lo, hi] : null;
}

/**
 * Domain for a linear axis of dots or lines: the data extent padded by `pad` × span so edge
 * dots are not clipped, then rounded outward to nice tick steps. A metric with no negative
 * values never shows negative ticks (no "-2M" people or "-$50,000" GDP): the padding stops at
 * 0, and when values sit at or just above 0 the axis only gets a sliver below it, too small to
 * hold a tick, so those dots are not cut in half by the plot edge. All-negative data mirrors
 * this at the top.
 */
export function linearAxisDomain(
  lo: number,
  hi: number,
  pad: number
): [number, number] {
  const span = hi - lo > 0 ? hi - lo : Math.abs(hi) * 0.1 + 1;
  let d0 = lo - span * pad;
  let d1 = hi + span * pad;
  if (lo >= 0 && d0 < 0) d0 = 0;
  if (hi <= 0 && d1 > 0) d1 = 0;
  const niced = scaleLinear().domain([d0, d1]).nice(6).domain();
  const out: [number, number] = [niced[0], niced[1]];
  const sliver = (out[1] - out[0]) * 0.02;
  if (out[0] === 0 && lo >= 0 && lo < sliver) out[0] = -sliver;
  if (out[1] === 0 && hi <= 0 && hi > -sliver) out[1] = sliver;
  return out;
}

/**
 * Domain for a bar axis: bars grow from zero, so the domain always includes 0 exactly (no
 * padding or sliver past it) and is rounded outward to nice steps for about `count` ticks.
 */
export function barAxisDomain(
  lo: number,
  hi: number,
  count = 4
): [number, number] {
  const d0 = Math.min(0, lo);
  const d1 = Math.max(0, hi);
  const niced = scaleLinear()
    .domain([d0, d1 > d0 ? d1 : d0 + 1])
    .nice(count)
    .domain();
  return [niced[0], niced[1]];
}

/** Display formats whose numbers can be shortened to "50K" / "$1.2M" on an axis. */
const COMPACTABLE = new Set<string | null>([
  null,
  'abbreviateNumber',
  'abbreviateNumber1k',
  'floatNumberSmart',
  'numberWithCommas',
  'numberWithCommasRound',
  'numberWithCommasZeroes',
  'km2MiRound',
  'floatNumberTenths',
  'floatNumber',
  'moneyWithCurrency',
  'moneyWithCurrencyAbbrev',
  'moneyWithCurrencyDollars',
  'moneyWithCurrencyCents',
  'moneyWithCurrency3',
  'moneyWithCurrencyEuros',
]);

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Tick formatter for one axis, consistent across all of its ticks. When the axis reaches
 * 10,000 or more, every tick uses the short form ("$50K", "$100K", "$150K") instead of mixing
 * "$50,000" with "$100K"; otherwise the metric's own format is used, without the ".0" on whole
 * numbers ("5,000.0" → "5,000"). Ranks, years, percentages and temperatures keep their format,
 * and units that already state a scale ("thousands", "kt") are never shortened again. Pass the
 * axis's final (niced) domain so the choice matches the ticks drawn.
 */
export function axisTickFormat(
  metric: Pick<Metric, 'fmt' | 'unit' | 'kind'>,
  domain: readonly [number, number]
): (v: number) => string {
  const base = tickFormatter(metric);
  const scaled = metric.unit != null && isScaleUnit(metric.unit.trim());
  const big = Math.max(Math.abs(domain[0]), Math.abs(domain[1])) >= 1e4;
  if (big && !scaled && COMPACTABLE.has(metric.fmt)) {
    const symbol =
      metric.fmt === 'moneyWithCurrencyEuros'
        ? '€'
        : metric.fmt?.startsWith('money') === true
          ? '$'
          : '';
    return (v) => {
      const s = `${symbol}${compact.format(Math.abs(v))}`;
      return v < 0 ? `-${s}` : s;
    };
  }
  return (v) => {
    const s = base(v);
    return Number.isInteger(v) ? s.replace(/\.0+(?!\d)/, '') : s;
  };
}
