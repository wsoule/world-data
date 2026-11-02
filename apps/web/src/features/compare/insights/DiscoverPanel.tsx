import { Link } from '@tanstack/react-router';
import { ChartScatter, Check, Plus, Telescope } from 'lucide-react';
import { useState } from 'react';

import type { CompareViewProps } from '../state';
import { type CorrelationColorScale, correlationColorScale } from './corrColor';
import { formatP, formatR } from './correlation';
import { discoverRelated, type RelatedMetric } from './discover';
import { placeNoun, similarLabels } from './shared';
import { useKeyed } from './useBasket';
import { PolarityIcon } from '~/components/MetricPicker';
import { Card, cx, Select } from '~/components/ui';
import type { Metric } from '~/data/types';
import { formatInt } from '~/lib/format';
import { useTheme } from '~/lib/theme';

/** Correlations closer than this to ±1 with a similar label are treated as republished copies. */
const COPY_R = 0.97;

/**
 * "Discover related metrics": pick a basket metric and scan every numeric metric of the dataset
 * for the strongest positive and negative Pearson correlations (see discoverRelated for the
 * overlap rule). The scan is timed and the timing shown, since it must stay interactive.
 */
export function DiscoverPanel(props: CompareViewProps) {
  const { dataset, metrics, search, entityIdx, update, addMetric } = props;
  const [picked, setPicked] = useState<number | null>(null);
  const theme = useTheme();
  const target = metrics.find((m) => m.id === picked) ?? metrics[0];
  const filtered = entityIdx.length !== dataset.entities.length;
  const noun = placeNoun(dataset.type.id);

  const scan = useKeyed(
    `${dataset.type.id};${target.id};${filtered ? (search.g ?? []).join('|') : '*'}`,
    () => {
      const started = performance.now();
      const candidates = dataset.metrics
        .filter(
          (m) => m.kind === 'num' && m.meta !== true && m.id !== target.id
        )
        .map((m) => ({ id: m.id, values: dataset.numeric(m.id) }));
      const result = discoverRelated(dataset.numeric(target.id), candidates, {
        rows: filtered ? entityIdx : null,
        hide: (id, r) =>
          Math.abs(r) >= COPY_R &&
          similarLabels(dataset.metric(id)?.label ?? '', target.label),
      });
      return { ...result, ms: performance.now() - started };
    }
  );
  const colorScale = correlationColorScale(theme);
  const inBasket = new Set(search.m);

  const plot = (id: number) =>
    update((s) => ({
      m: s.m.includes(id) ? s.m : [...s.m, id],
      view: 'scatter',
      x: target.id,
      y: id,
    }));

  const listProps = { colorScale, inBasket, onAdd: addMetric, onPlot: plot };

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-1.5">
          <Telescope className="text-accent-600 dark:text-accent-300 size-4" />
          Discover related metrics
        </span>
      }
      subtitle={`Every numeric ${dataset.type.singular.toLowerCase()} metric, ranked by how closely it tracks the one you pick.`}
      actions={
        metrics.length > 1 ? (
          <Select
            ariaLabel="Metric to find relationships for"
            value={target.id}
            onChange={setPicked}
            options={metrics.map((m) => ({ value: m.id, label: m.label }))}
            className="max-w-[16rem]"
          />
        ) : null
      }
    >
      <p className="text-muted mb-4 text-xs" aria-live="polite">
        Scanned {formatInt(scan.scanned)} metrics against{' '}
        <strong className="text-app font-medium">{target.label}</strong> in{' '}
        <span className="tabular">{Math.max(1, Math.round(scan.ms))} ms</span>
        {' · '}
        {formatInt(scan.eligible)} share enough {noun.many} to compare
        {scan.hidden > 0
          ? ` · ${scan.hidden} near-identical ${scan.hidden === 1 ? 'copy' : 'copies'} of this metric hidden`
          : ''}
        .
      </p>
      {scan.positive.length === 0 && scan.negative.length === 0 ? (
        <p className="text-muted text-sm">
          No other metric covers enough of the same {noun.many} as{' '}
          {target.label} to compare.
        </p>
      ) : (
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          <RelatedList
            {...props}
            {...listProps}
            title={`Rises with ${target.label}`}
            items={scan.positive}
          />
          <RelatedList
            {...props}
            {...listProps}
            title={`Falls as ${target.label} rises`}
            items={scan.negative}
          />
        </div>
      )}
      <p className="text-muted mt-4 text-[11px] leading-relaxed">
        A metric is compared when it shares values with the selected one for at
        least 10 {noun.many} and 60% of the smaller of the two metrics’
        coverage. Small n means a fragile result.
      </p>
    </Card>
  );
}

function RelatedList({
  dataset,
  title,
  items,
  colorScale,
  inBasket,
  onAdd,
  onPlot,
}: CompareViewProps & {
  title: string;
  items: readonly RelatedMetric[];
  colorScale: CorrelationColorScale;
  inBasket: ReadonlySet<number>;
  onAdd: (id: number) => void;
  onPlot: (id: number) => void;
}) {
  return (
    <section className="min-w-0">
      <h3 className="text-muted mb-1 truncate text-xs font-semibold tracking-wide uppercase">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-muted py-2 text-sm">No clear matches.</p>
      ) : (
        <ul className="divide-y divide-(--border)">
          {items.map((item) => {
            const m = dataset.metric(item.id);
            if (m == null) return null;
            return (
              <RelatedRow
                key={item.id}
                metric={m}
                item={item}
                context={dataset.metricContext(item.id)}
                type={dataset.type.id}
                color={colorScale(item.r)}
                added={inBasket.has(item.id)}
                onAdd={() => onAdd(item.id)}
                onPlot={() => onPlot(item.id)}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RelatedRow({
  metric,
  item,
  context,
  type,
  color,
  added,
  onAdd,
  onPlot,
}: {
  metric: Metric;
  item: RelatedMetric;
  context: string | null;
  type: CompareViewProps['dataset']['type']['id'];
  color: string;
  added: boolean;
  onAdd: () => void;
  onPlot: () => void;
}) {
  const slug = metric.topics[0];
  const label =
    slug != null ? (
      <Link
        to="/topics/$type/$slug"
        params={{ type, slug }}
        search={{ m: metric.id }}
        className="hover:text-accent-700 dark:hover:text-accent-300 hover:underline"
      >
        {metric.label}
      </Link>
    ) : (
      metric.label
    );
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm leading-snug font-medium">
          {label}{' '}
          <PolarityIcon pol={metric.pol} className="inline align-[-2px]" />
        </div>
        <div
          className="text-muted truncate text-xs"
          title={context ?? undefined}
        >
          {context != null ? `${context} · ` : ''}
          <span
            className={cx(
              'tabular',
              item.n < 20 && 'text-amber-600 dark:text-amber-400'
            )}
            title={formatP(item.p)}
          >
            n = {formatInt(item.n)}
          </span>
        </div>
      </div>
      <div
        className="flex w-16 shrink-0 flex-col items-end gap-1"
        title={`Pearson r = ${formatR(item.r, 3)} (${formatP(item.p)})`}
      >
        <span className="tabular text-sm font-semibold">{formatR(item.r)}</span>
        <span className="bg-surface-2 h-1.5 w-full overflow-hidden rounded-full">
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.round(Math.abs(item.r) * 100)}%`,
              background: color,
            }}
          />
        </span>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={onAdd}
          disabled={added}
          aria-label={
            added
              ? `${metric.label} is already in the comparison`
              : `Add ${metric.label} to the comparison`
          }
          title={added ? 'Already in the comparison' : 'Add to comparison'}
          className="border-app hover:bg-surface-2 grid size-7 place-items-center rounded-md border disabled:cursor-default disabled:opacity-60"
        >
          {added ? (
            <Check className="text-good size-3.5" />
          ) : (
            <Plus className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onPlot}
          aria-label={`Plot ${metric.label} against the selected metric`}
          title="Plot against the selected metric"
          className="border-app hover:bg-surface-2 grid size-7 place-items-center rounded-md border"
        >
          <ChartScatter className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
