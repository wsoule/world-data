import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';

import type { CompareViewProps } from '../state';
import { Choropleth } from '~/charts/Choropleth';
import { RankBars } from '~/charts/RankBars';
import { EmptyState } from '~/components/feedback';
import { Card } from '~/components/ui';
import { formatValue } from '~/lib/format';

// Baseline map view (to be extended by the compare feature).
export function MapView({
  dataset,
  search,
  metrics,
  entityIdx,
}: CompareViewProps) {
  const navigate = useNavigate();
  const metric = metrics.find((m) => m.id === search.f) ?? metrics[0];
  const values = useMemo(() => {
    if (metric == null) return [];
    const col = dataset.numeric(metric.id);
    const keep = new Set(entityIdx);
    return Array.from(col, (v, i) => (keep.has(i) ? v : NaN));
  }, [dataset, metric, entityIdx]);
  if (metric == null) return <EmptyState title="Add a metric to map it" />;
  const format = (v: number) => formatValue(metric, v, { compact: true });
  const top = entityIdx
    .filter((i) => !Number.isNaN(values[i]))
    .sort((a, b) => values[b] - values[a])
    .slice(0, 10)
    .map((i) => ({
      key: dataset.entities[i].id,
      label: dataset.entities[i].name,
      value: values[i],
    }));
  return (
    <div className="space-y-4">
      <Card
        title={metric.label}
        subtitle={dataset.metricContext(metric.id) ?? undefined}
      >
        <Choropleth
          dataset={dataset}
          values={values}
          format={format}
          label={metric.label}
          polarity={metric.pol}
          highlight={search.hl}
          onSelect={(i) =>
            void navigate({
              to: '/places/$type/$slug',
              params: { type: dataset.type.id, slug: dataset.entities[i].slug },
            })
          }
        />
      </Card>
      <Card title="Top 10">
        <RankBars rows={top} format={format} label={metric.label} />
      </Card>
    </div>
  );
}
