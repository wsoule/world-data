import { useMemo } from 'react';

import { ValueCountsChart } from './charts/ValueCountsChart';
import {
  isChartableCategory,
  rawColumn,
  tableYear,
  type ValueCount,
  valueCounts,
} from './model';
import { TopicTables } from './TopicTable';
import { Card } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import type { Metric, TopicFile, TopicTable } from '~/data/types';
import { formatInt } from '~/lib/format';

/** Categorical metrics charted at most on an all-categorical topic. */
const CATEGORY_CHARTS = 6;

/**
 * A topic with no numeric metric (e.g. "14 Eyes Countries"): a value-count chart for each
 * categorical column worth charting, then the data table.
 */
export function CategoricalTopic({
  topic,
  dataset,
  tables,
  selected,
  onSelect,
}: {
  topic: TopicFile;
  dataset: Dataset;
  tables: TopicTable[];
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const charts = useMemo(() => {
    const out: { metric: Metric; counts: ValueCount[] }[] = [];
    for (const t of tables)
      for (const id of t.metrics) {
        const m = dataset.metric(id);
        if (m == null || m.kind !== 'cat' || m.meta === true) continue;
        const counts = valueCounts(
          rawColumn(
            topic,
            id,
            tableYear(topic, m, undefined),
            dataset.entities.length
          )
        );
        if (isChartableCategory(counts)) out.push({ metric: m, counts });
      }
    return out.slice(0, CATEGORY_CHARTS);
  }, [tables, dataset, topic]);

  const grid =
    charts.length === 1
      ? 'grid gap-6'
      : charts.length % 3 === 0 || charts.length === 5
        ? 'grid gap-6 md:grid-cols-2 lg:grid-cols-3'
        : 'grid gap-6 md:grid-cols-2';
  return (
    <>
      {charts.length > 0 ? (
        <div className={grid}>
          {charts.map(({ metric, counts }) => {
            const total = counts.reduce((s, c) => s + c.count, 0);
            return (
              <Card
                key={metric.id}
                title={metric.label}
                subtitle={`${formatInt(counts.length)} ${counts.length === 1 ? 'value' : 'values'} across ${formatInt(total)} ${total === 1 ? 'entry' : 'entries'}`}
              >
                <ValueCountsChart
                  dataset={dataset}
                  counts={counts}
                  label={metric.label}
                />
              </Card>
            );
          })}
        </div>
      ) : null}
      <TopicTables
        dataset={dataset}
        topic={topic}
        tables={tables}
        focusId={null}
        selected={selected}
        onSelect={onSelect}
      />
    </>
  );
}
