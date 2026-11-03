import { Fragment, useMemo, useState } from 'react';

import type { CompareViewProps } from '../state';
import { percentileScale, percentileStops } from './colors';
import { formatScore } from './model';
import { PlaceLink } from './PlaceLink';
import type { RankingModel } from './useRanking';
import { midSentence } from './words';
import { InfoTip } from '~/components/InfoTip';
import { Card, cx } from '~/components/ui';
import { rankOrder } from '~/data/rankOrder';
import { rankText } from '~/features/places/percentile';
import { formatValue, ordinal } from '~/lib/format';
import { chartColors, useTheme } from '~/lib/theme';

const TOP = 10;
/** Rows added per "show more" step, so thousands of counties never render at once. */
const PAGE = 250;
/** Above this many active metrics, chips become thin colour bars without numbers. */
const NUMBERED_CHIPS = 12;

/** Leaderboard: rank, place, score, coverage and per-metric percentile chips. */
export function Leaderboard({
  props,
  model,
}: {
  props: CompareViewProps;
  model: RankingModel;
}) {
  const { dataset, search } = props;
  const { base, stats, inputs, metrics, entityIdx, method, labels } = model;
  const theme = useTheme();
  const scale = useMemo(() => percentileScale(theme), [theme]);
  const stops = percentileStops(theme);
  const missing = chartColors(theme).missing;
  const [limit, setLimit] = useState(TOP);

  const { score, rank, coverage } = base.composite;
  const total = base.order.length;
  const active = useMemo(
    () => inputs.flatMap((inp, k) => (inp.weight > 0 ? [k] : [])),
    [inputs]
  );
  const numbered = active.length <= NUMBERED_CHIPS;
  const hl = useMemo(() => new Set(search.hl ?? []), [search.hl]);

  // Ranks shared by more than one place, so ties can be marked "=3".
  const tied = useMemo(() => {
    const seen = new Map<number, number>();
    for (const i of base.order) seen.set(rank[i], (seen.get(rank[i]) ?? 0) + 1);
    return new Set([...seen].filter(([, c]) => c > 1).map(([r]) => r));
  }, [base.order, rank]);

  // Score bar scale: 0–100 for bounded methods, observed range for z-scores.
  const [lo, hi] = useMemo(() => {
    if (method !== 'zscore') return [0, 100];
    let min = Infinity;
    let max = -Infinity;
    for (const i of base.order) {
      min = Math.min(min, score[i]);
      max = Math.max(max, score[i]);
    }
    return Number.isFinite(min) ? [min, max] : [0, 1];
  }, [method, base.order, score]);

  const shown = base.order.slice(0, Math.min(limit, total));
  const shownSet = new Set(shown);
  const pinned = base.order.filter(
    (i) => !shownSet.has(i) && hl.has(dataset.entities[entityIdx[i]].id)
  );

  // Percentile chips for one place (shown in their own column, or under the name on phones).
  const chips = (i: number) => (
    <div className={cx('flex flex-wrap', numbered ? 'gap-1' : 'gap-px')}>
      {active.map((k) => {
        const p = stats[k].pct[i];
        const has = !Number.isNaN(p);
        const m = metrics[k];
        const title = has
          ? `${labels.get(m.id) ?? m.label}: ${formatValue(m, inputs[k].values[i])} · ${rankText({ rank: stats[k].rank[i], n: stats[k].n }, rankOrder(m, inputs[k].direction))} · percentile ${Math.round(p)}`
          : `${labels.get(m.id) ?? m.label}: no data`;
        return (
          <span
            key={m.id}
            title={title}
            aria-label={title}
            role="img"
            className={cx(
              'tabular inline-grid place-items-center rounded text-[10px] font-semibold',
              numbered ? 'h-5 w-7' : 'h-5 w-1.5'
            )}
            style={{
              background: has ? scale(p) : missing,
              color: stops.text,
            }}
          >
            {numbered ? (has ? Math.round(p) : '–') : null}
          </span>
        );
      })}
    </div>
  );

  const row = (i: number) => {
    const e = entityIdx[i];
    const entity = dataset.entities[e];
    const isHl = hl.has(entity.id);
    const r = rank[i];
    const width =
      hi > lo ? Math.max(3, ((score[i] - lo) / (hi - lo)) * 100) : 100;
    return (
      <tr
        key={i}
        className={cx(
          'border-app border-t',
          isHl && 'bg-accent-50/70 dark:bg-accent-900/25'
        )}
      >
        <td className="tabular text-muted w-12 py-2 pr-2 pl-3 text-right text-sm">
          {tied.has(r) ? (
            <span title={`Tied for ${ordinal(r)}`}>
              <span aria-hidden>=</span>
              <span className="sr-only">tied </span>
            </span>
          ) : null}
          <span className={cx(r <= 3 && 'text-app font-semibold')}>{r}</span>
        </td>
        <td className="max-w-[14rem] py-2 pr-3">
          <PlaceLink
            dataset={dataset}
            index={e}
            className={cx(
              'max-w-full text-sm',
              isHl ? 'font-semibold' : 'font-medium'
            )}
          />
          <div className="mt-1 sm:hidden">{chips(i)}</div>
        </td>
        <td className="py-2 pr-3">
          <div className="flex items-center gap-2">
            <span className="tabular w-12 text-right text-sm font-semibold">
              {formatScore(score[i], method)}
            </span>
            <span
              className="bg-surface-2 hidden h-1.5 w-16 overflow-hidden rounded-full sm:block"
              aria-hidden
            >
              <span
                className="bg-accent-500 dark:bg-accent-400 block h-full rounded-full"
                style={{ width: `${width}%` }}
              />
            </span>
          </div>
        </td>
        <td className="tabular text-muted hidden py-2 pr-3 text-xs whitespace-nowrap sm:table-cell">
          {coverage[i]}/{active.length}
        </td>
        <td className="hidden py-2 pr-3 sm:table-cell">{chips(i)}</td>
      </tr>
    );
  };

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-1">
          Leaderboard <InfoTip term="combined-score" />
        </span>
      }
      subtitle={
        method === 'zscore'
          ? 'Score = weighted mean z-score (0 = average). Chips: percentile per metric, 100 = best.'
          : 'Score = weighted mean on a 0–100 scale. Chips: percentile per metric, 100 = best.'
      }
      className="overflow-hidden"
    >
      <div className="-mx-4 -my-4 overflow-x-auto">
        <table className="w-full border-collapse text-left sm:min-w-[34rem]">
          <caption className="sr-only">
            Combined ranking of {midSentence(dataset.type.label)}
          </caption>
          <thead>
            <tr className="text-muted text-xs font-medium">
              <th scope="col" className="py-2 pr-2 pl-3 text-right">
                #
              </th>
              <th scope="col" className="py-2 pr-3">
                {dataset.type.singular}
              </th>
              <th scope="col" className="py-2 pr-3">
                Score
              </th>
              <th scope="col" className="hidden py-2 pr-3 sm:table-cell">
                Data
              </th>
              <th scope="col" className="hidden py-2 pr-3 sm:table-cell">
                Percentile by metric
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map(row)}
            {pinned.length > 0 ? (
              <Fragment>
                <tr className="border-app border-t">
                  <td
                    colSpan={5}
                    className="text-muted bg-surface-2 py-1 pl-3 text-xs font-medium"
                  >
                    Highlighted
                  </td>
                </tr>
                {pinned.map(row)}
              </Fragment>
            ) : null}
          </tbody>
        </table>
      </div>
      {total > TOP ? (
        <div className="border-app -mx-4 mt-4 -mb-4 flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-sm">
          <span className="text-muted">
            Showing {Math.min(limit, total)} of {total}
          </span>
          <div className="flex gap-3">
            {limit > TOP ? (
              <button
                type="button"
                className="text-muted hover:text-app font-medium"
                onClick={() => setLimit(TOP)}
              >
                Top {TOP} only
              </button>
            ) : null}
            {limit < total ? (
              <button
                type="button"
                className="text-accent-700 dark:text-accent-300 font-medium hover:underline"
                onClick={() =>
                  setLimit((l) => (total - l <= PAGE ? total : l + PAGE))
                }
              >
                {total - limit <= PAGE
                  ? `Show all ${total}`
                  : `Show ${PAGE} more`}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
