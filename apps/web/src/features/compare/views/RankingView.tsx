import { SlidersHorizontal } from 'lucide-react';
import { useCallback } from 'react';

import { BundleGrid } from '../ranking/BundlePicker';
import { ContributionChart } from '../ranking/ContributionChart';
import { downloadCsv, rankingCsv } from '../ranking/csv';
import { SurpriseCard, WhyFirstCard } from '../ranking/Insights';
import { Leaderboard } from '../ranking/Leaderboard';
import { PercentileGrid } from '../ranking/PercentileGrid';
import { RankingControls } from '../ranking/RankingControls';
import { StabilityCard } from '../ranking/StabilityCard';
import { type RankingModel, useRanking } from '../ranking/useRanking';
import { midSentence } from '../ranking/words';
import type { CompareViewProps } from '../state';
import { EmptyState } from '~/components/feedback';
import type { Dataset } from '~/data/dataset';

/**
 * Combined ranking: layer the basket's metrics into one weighted score to see who ranks #1, why,
 * and how much that depends on any single metric. With fewer than two metrics it offers bundles.
 */
export function RankingView(props: CompareViewProps) {
  if (props.metrics.length < 2) return <BundleGrid {...props} />;
  return <RankingWorkbench {...props} />;
}

// Shape the model as the CSV exporter's plain rows.
function exportRanking(dataset: Dataset, model: RankingModel) {
  const { base, inputs, stats, metrics, entityIdx, labels, method } = model;
  const csv = rankingCsv({
    placeLabel: dataset.type.singular,
    scoreLabel: method === 'zscore' ? 'Score (z)' : 'Score (0-100)',
    metricColumns: metrics.map((m, k) => {
      const label = labels.get(m.id) ?? m.label;
      const how = `${inputs[k].direction === 1 ? 'higher' : 'lower'} is better, weight ${inputs[k].weight}`;
      return {
        value: `${label} (${how})`,
        percentile: `${label} percentile`,
      };
    }),
    rows: base.order.map((i) => {
      const e = dataset.entities[entityIdx[i]];
      return {
        rank: base.composite.rank[i],
        name: e.name,
        id: e.id,
        group: e.group,
        score: base.composite.score[i],
        coverage: base.composite.coverage[i],
        metrics: inputs.map((inp, k): [number, number] => [
          inp.values[i],
          stats[k].pct[i],
        ]),
      };
    }),
  });
  downloadCsv(`world-data-ranking-${dataset.type.id}-${method}.csv`, csv);
}

function RankingWorkbench(props: CompareViewProps) {
  const model = useRanking(props);
  const { dataset } = props;
  const onExport = useCallback(
    () => exportRanking(dataset, model),
    [dataset, model]
  );
  const placeWord = midSentence(dataset.type.label);

  let body;
  if (model.base.active === 0) {
    body = (
      <EmptyState
        title="Every weight is set to 0"
        icon={<SlidersHorizontal className="text-muted size-6" aria-hidden />}
      >
        Raise at least one metric’s weight to build a combined score.
      </EmptyState>
    );
  } else if (model.base.order.length === 0) {
    body = (
      <EmptyState
        title={`No ${placeWord} have enough data`}
        icon={<SlidersHorizontal className="text-muted size-6" aria-hidden />}
      >
        None of these {placeWord} has data for{' '}
        {Math.round(model.minCoverage * 100)}% of the total weight. Lower the
        minimum data coverage or drop sparse metrics.
      </EmptyState>
    );
  } else {
    body = (
      <>
        <div className="grid gap-4 xl:grid-cols-2">
          <WhyFirstCard props={props} model={model} />
          <SurpriseCard props={props} model={model} />
        </div>
        <Leaderboard props={props} model={model} />
        <ContributionChart props={props} model={model} />
        <PercentileGrid props={props} model={model} />
        <StabilityCard props={props} model={model} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <RankingControls props={props} model={model} onExport={onExport} />
      {body}
    </div>
  );
}
