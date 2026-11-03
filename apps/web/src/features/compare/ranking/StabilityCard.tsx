import { useState } from 'react';

import type { CompareViewProps } from '../state';
import type { Scenario } from './model';
import { PlaceLink } from './PlaceLink';
import type { RankingModel } from './useRanking';
import { Badge, Card } from '~/components/ui';
import { ordinal } from '~/lib/format';

const COLLAPSED = 8;

/** "How stable is #1?": leave-one-out and equal-weight scenarios as a verdict plus a small table. */
export function StabilityCard({
  props,
  model,
}: {
  props: CompareViewProps;
  model: RankingModel;
}) {
  const { dataset } = props;
  const { sens, base, entityIdx, labels } = model;
  const [expanded, setExpanded] = useState(false);
  const leader = base.order[0];
  if (leader == null || sens.scenarios.length === 0) return null;

  const leaderName = dataset.entities[entityIdx[leader]].name;
  const label = (s: Scenario) =>
    s.kind === 'equal'
      ? 'Equal weights'
      : `Without ${s.metricId != null ? (labels.get(s.metricId) ?? `#${s.metricId}`) : '?'}`;
  // Equal weights first, then drops from most to least disruptive.
  const sorted = [...sens.scenarios].sort((a, b) =>
    a.kind !== b.kind ? (a.kind === 'equal' ? -1 : 1) : b.shift - a.shift
  );
  const shown = expanded ? sorted : sorted.slice(0, COLLAPSED);
  const total = sens.scenarios.length;
  const flips = sorted.filter((s) => s.changed);
  const firstFlip = flips.find((s) => s.kind === 'drop') ?? flips[0];
  const top = Math.min(10, base.order.length);

  return (
    <Card
      title="How stable is #1?"
      subtitle={`Re-ranks with each metric dropped once${sens.scenarios.some((s) => s.kind === 'equal') ? ', and with equal weights' : ''}.`}
    >
      <div className="space-y-1 text-sm">
        <p>
          {flips.length === 0 ? (
            <>
              <span className="text-good font-semibold">Rock solid.</span>{' '}
              {leaderName} stays #1 in all {total} scenarios.
            </>
          ) : (
            <>
              <span
                className={
                  flips.length > total / 2
                    ? 'text-bad font-semibold'
                    : 'font-semibold text-amber-600 dark:text-amber-400'
                }
              >
                {flips.length > total / 2 ? 'Fragile.' : 'Mostly stable.'}
              </span>{' '}
              {leaderName} keeps #1 in {sens.stableCount} of {total} scenarios
              {firstFlip != null && firstFlip.leader >= 0
                ? `; ${label(firstFlip).replace(/^W/, 'w')}, ${dataset.entities[entityIdx[firstFlip.leader]].name} takes the top spot.`
                : '.'}
            </>
          )}
        </p>
        {sens.mostInfluential != null && sens.mostInfluential.shift > 0 ? (
          <p className="text-muted">
            Matters most:{' '}
            <span className="text-app font-medium">
              {label(sens.mostInfluential).replace(/^Without /, '')}
            </span>{' '}
            — dropping it moves the top {top} by{' '}
            {sens.mostInfluential.shift.toFixed(1)} places on average.
          </p>
        ) : null}
      </div>
      <div className="-mx-4 mt-4 -mb-4 overflow-x-auto">
        <table className="w-full text-left text-sm sm:min-w-[30rem]">
          <thead>
            <tr className="text-muted border-app border-t text-xs font-medium">
              <th scope="col" className="py-2 pr-3 pl-4">
                Scenario
              </th>
              <th scope="col" className="py-2 pr-3">
                #1
              </th>
              <th scope="col" className="py-2 pr-4 text-right sm:pr-3">
                {leaderName}
              </th>
              <th
                scope="col"
                className="hidden py-2 pr-4 text-right sm:table-cell"
                title={`Average change in rank of the current top ${top}`}
              >
                Top {top} shift
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr
                key={s.kind === 'equal' ? 'equal' : s.metricId}
                className="border-app border-t"
              >
                <td
                  className="max-w-[9rem] truncate py-2 pr-3 pl-4 sm:max-w-[16rem]"
                  title={label(s)}
                >
                  {label(s)}
                </td>
                <td className="py-2 pr-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {s.leader >= 0 ? (
                      <PlaceLink
                        dataset={dataset}
                        index={entityIdx[s.leader]}
                        flagSize={14}
                        className="max-w-[7rem] sm:max-w-[11rem]"
                      />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                    {s.changed ? <Badge tone="bad">New #1</Badge> : null}
                    {s.leaderTies > 1 ? (
                      <Badge>tie ×{s.leaderTies}</Badge>
                    ) : null}
                  </div>
                </td>
                <td className="tabular py-2 pr-4 text-right sm:pr-3">
                  {Number.isNaN(s.leaderRank) ? (
                    <span className="text-muted">excluded</span>
                  ) : (
                    <span className={s.leaderRank === 1 ? 'text-good' : ''}>
                      {ordinal(s.leaderRank)}
                    </span>
                  )}
                </td>
                <td className="tabular hidden py-2 pr-4 text-right sm:table-cell">
                  {s.shift.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length > COLLAPSED ? (
          <div className="border-app border-t px-4 py-2.5">
            <button
              type="button"
              className="text-accent-700 dark:text-accent-300 text-sm font-medium hover:underline"
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? 'Show fewer' : `Show all ${sorted.length} scenarios`}
            </button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
