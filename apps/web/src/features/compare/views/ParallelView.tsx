import { Spline } from 'lucide-react';
import { useMemo, useState } from 'react';

import { buildRankModel, pickVisible } from '../insights/rankLines';
import { type RankLinePlace, RankLinesChart } from '../insights/RankLinesChart';
import { placeNoun } from '../insights/shared';
import { useBasket, useHighlightPositions } from '../insights/useBasket';
import type { CompareViewProps } from '../state';
import { EmptyState } from '~/components/feedback';
import { Card, Segmented } from '~/components/ui';
import { formatInt } from '~/lib/format';
import { GROUP_PALETTE } from '~/lib/theme';

export type RankScale = 'rank' | 'pct';

const SCALES = [
  { value: 'rank', label: 'Ranks', title: 'Rank 1 = best on each metric' },
  {
    value: 'pct',
    label: 'Percentiles',
    title: 'Percentile 100 = best; comparable across metrics with gaps',
  },
] as const;

/** Places beyond which context lines are thinned unless "show all" is on. */
const MAX_ALL = 60;

/**
 * Rank lines: one line per place across the basket metrics, ranked 1…N (direction-aware) or as
 * percentiles. Highlighted places and the five best by average rank are drawn bold and labelled;
 * the rest are faint context. Clicking a line toggles its highlight.
 */
export function ParallelView(props: CompareViewProps) {
  const { dataset, search, update, metrics } = props;
  const [scale, setScale] = useState<RankScale>('rank');
  const [showAll, setShowAll] = useState(false);
  const basket = useBasket(props);
  const highlighted = useHighlightPositions(props, basket);
  const model = useMemo(
    () => buildRankModel(basket.columns, basket.directions),
    [basket]
  );
  const placeCount = basket.rows.length;
  const visible = useMemo(
    () =>
      pickVisible(model, placeCount, { highlighted, showAll, maxAll: MAX_ALL }),
    [model, placeCount, highlighted, showAll]
  );
  const places = useMemo<RankLinePlace[]>(() => {
    const hl = new Set(highlighted);
    const toPlace = (p: number, k: number | null): RankLinePlace => {
      const e = dataset.entities[basket.rows[p]];
      return {
        position: p,
        id: e.id,
        name: e.name,
        color: k == null ? null : GROUP_PALETTE[k % GROUP_PALETTE.length],
        highlighted: hl.has(p),
        average: model.average[p],
      };
    };
    return [
      ...visible.emphasized.map((p, k) => toPlace(p, k)),
      ...visible.background.map((p) => toPlace(p, null)),
    ];
  }, [visible, highlighted, dataset, basket, model]);

  const noun = placeNoun(dataset.type.id);
  if (metrics.length < 2) {
    return (
      <EmptyState
        title="Rank lines need at least two metrics"
        icon={<Spline className="text-muted size-6" aria-hidden />}
      >
        Add metrics on the left to follow each {noun.one} across them, for
        example income, education and life expectancy.
      </EmptyState>
    );
  }

  const toggle = (id: string) =>
    update((s) => {
      const hl = s.hl ?? [];
      const next = hl.includes(id) ? hl.filter((x) => x !== id) : [...hl, id];
      return { hl: next.length > 0 ? next : undefined };
    });

  return (
    <Card
      title={`Where each ${noun.one} ranks on every metric`}
      subtitle={`Bold: highlighted ${noun.many} and the top 5 by average rank. Click any line to highlight it.`}
      actions={
        <Segmented
          ariaLabel="Vertical scale"
          size="sm"
          value={scale}
          onChange={setScale}
          options={SCALES}
        />
      }
    >
      <RankLinesChart
        basket={basket}
        model={model}
        places={places}
        scale={scale}
        dataset={dataset}
        onToggle={toggle}
        search={search}
      />
      {placeCount > MAX_ALL ? (
        <div className="text-muted mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>
            {visible.limited
              ? `Context lines show the 10 best and 10 worst of ${formatInt(placeCount)} ${noun.many}.`
              : `Showing all ${formatInt(placeCount)} ${noun.many}.`}
          </span>
          <label className="text-app inline-flex cursor-pointer items-center gap-1.5 font-medium">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="accent-accent-600 size-3.5"
            />
            Show all {formatInt(placeCount)}
          </label>
        </div>
      ) : null}
    </Card>
  );
}
