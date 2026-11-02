import { Grid3x3, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  type CorrelationMethod,
  correlationPairs,
  pick,
} from '../insights/correlation';
import {
  CorrelationHeatmap,
  CorrelationLegend,
  HeatmapKey,
} from '../insights/CorrelationHeatmap';
import { DiscoverPanel } from '../insights/DiscoverPanel';
import { buildFindings } from '../insights/findings';
import { FindingsList } from '../insights/FindingsList';
import { placeNoun } from '../insights/shared';
import { useBasket } from '../insights/useBasket';
import type { CompareViewProps } from '../state';
import { EmptyState } from '~/components/feedback';
import { Card, Segmented } from '~/components/ui';
import { formatInt } from '~/lib/format';

const METHODS = [
  {
    value: 'pearson',
    label: 'Pearson r',
    title: 'Linear relationship between the raw values',
  },
  {
    value: 'spearman',
    label: 'Spearman ρ',
    title: 'Relationship between the rank orders (robust to outliers and skew)',
  },
] as const;

/**
 * Correlations view: a heatmap of every pair of basket metrics, a ranked list of plain-English
 * findings drawn from it, and a scanner that finds related metrics across the whole dataset.
 */
export function MatrixView(props: CompareViewProps) {
  if (props.metrics.length === 0) {
    return (
      <EmptyState
        title="Add metrics to look for relationships"
        icon={<Grid3x3 className="text-muted size-6" aria-hidden />}
      >
        Pick two or more metrics on the left to see which move together. With
        one metric you can already discover related ones across the whole
        dataset.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-6">
      {props.metrics.length >= 2 ? (
        <CorrelationsSection {...props} />
      ) : (
        <EmptyState
          title="Add one more metric for a correlation matrix"
          icon={<Grid3x3 className="text-muted size-6" aria-hidden />}
        >
          Correlations need at least two metrics. Use the suggestions below to
          add one that relates to {props.metrics[0].label}.
        </EmptyState>
      )}
      <DiscoverPanel {...props} />
    </div>
  );
}

function CorrelationsSection(props: CompareViewProps) {
  const { dataset, search, update } = props;
  const [method, setMethod] = useState<CorrelationMethod>('pearson');
  const basket = useBasket(props);
  const pairs = useMemo(
    () => correlationPairs(basket.columns, basket.ids),
    [basket]
  );
  const findings = useMemo(
    () =>
      buildFindings({
        metrics: basket.metrics.map((m, k) => ({
          id: m.id,
          direction: basket.directions[k],
          values: basket.columns[k],
        })),
        pairs,
        method,
      }),
    [basket, pairs, method]
  );
  const labels = useMemo(
    () => basket.metrics.map((m) => ({ id: m.id, label: m.label })),
    [basket]
  );
  const noun = placeNoun(dataset.type.id);
  const ns = pairs
    .map((p) => pick(p, method).n)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const nRange =
    ns.length === 0
      ? '0'
      : ns[0] === ns[ns.length - 1]
        ? formatInt(ns[0])
        : `${formatInt(ns[0])}–${formatInt(ns[ns.length - 1])}`;
  const symbol = method === 'pearson' ? 'r' : 'ρ';

  return (
    <>
      <Card
        title="How the metrics move together"
        subtitle={`${method === 'pearson' ? 'Pearson r on the raw values' : 'Spearman ρ on rank order'} · each cell uses the ${noun.many} with both values (n = ${nRange}) · click a cell to plot the pair`}
        actions={
          <Segmented
            ariaLabel="Correlation method"
            size="sm"
            value={method}
            onChange={setMethod}
            options={METHODS}
          />
        }
      >
        <CorrelationHeatmap
          labels={labels}
          pairs={pairs}
          method={method}
          onSelect={(x, y) => update({ view: 'scatter', x, y })}
        />
        <HeatmapKey labels={labels} />
        <div className="mt-3">
          <CorrelationLegend symbol={symbol} />
        </div>
      </Card>
      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="text-accent-600 dark:text-accent-300 size-4" />
            Findings
          </span>
        }
        subtitle={`What stands out across ${formatInt(basket.rows.length)} ${noun.many}, most notable first`}
      >
        <FindingsList
          dataset={dataset}
          search={search}
          basket={basket}
          findings={findings}
          method={method}
        />
      </Card>
    </>
  );
}
