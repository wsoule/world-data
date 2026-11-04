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
import {
  hasRankColumn,
  STANDING_NOTE,
  standingColumns,
} from '../insights/standing';
import { useBasket } from '../insights/useBasket';
import type { CompareViewProps } from '../state';
import { EmptyState } from '~/components/feedback';
import { InfoTip } from '~/components/InfoTip';
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
 * Rank columns are read by standing throughout (see `standingColumns`): a better rank counts as
 * higher, so a list where richer places rank better correlates positively with income.
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
  // Best-first ranks negated, so every coefficient below reads a better rank as higher.
  const standing = useMemo(
    () => standingColumns(basket.metrics, basket.columns, basket.directions),
    [basket]
  );
  const pairs = useMemo(
    () => correlationPairs(standing.columns, basket.ids),
    [standing, basket]
  );
  const findings = useMemo(
    () =>
      buildFindings({
        metrics: basket.metrics.map((m, k) => ({
          id: m.id,
          direction: standing.directions[k],
          neutral: basket.neutral[k],
          values: standing.columns[k],
        })),
        pairs,
        method,
      }),
    [basket, standing, pairs, method]
  );
  const labels = useMemo(
    () =>
      basket.metrics.map((m, k) => ({
        id: m.id,
        label: m.label,
        flipped: standing.flipped[k],
      })),
    [basket, standing]
  );
  const ranks = hasRankColumn(basket.metrics);
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
        title={
          <span className="inline-flex items-center gap-1">
            How the metrics move together <InfoTip term="correlation" />
          </span>
        }
        subtitle={`${methodNote(method, ranks)} · each cell uses the ${noun.many} with both values (n = ${nRange}) · click a cell to plot the pair`}
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
          ranks={ranks}
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
          flipped={standing.flipped}
          method={method}
        />
      </Card>
    </>
  );
}

/**
 * What the matrix correlates, for its subtitle: "Pearson r on the raw values", or with a rank
 * column in the basket "Pearson r · ranks read by standing (a better rank counts as higher)".
 */
function methodNote(method: CorrelationMethod, ranks: boolean): string {
  if (method === 'pearson')
    return ranks
      ? `Pearson r · ${STANDING_NOTE}`
      : 'Pearson r on the raw values';
  return ranks
    ? `Spearman ρ on rank order · ${STANDING_NOTE}`
    : 'Spearman ρ on rank order';
}
