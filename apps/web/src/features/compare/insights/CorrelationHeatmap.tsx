import {
  cell,
  type ChartAxisSide,
  type ChartBuildContext,
  defineChart,
  text,
} from '@tanstack/charts';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { tooltip } from '@tanstack/charts/tooltip';
import { describeCorrelation } from '@world-data/stats';
import { useMemo } from 'react';

import { correlationColorScale } from './corrColor';
import {
  type CorrelationMethod,
  formatP,
  formatR,
  type PairStats,
  pick,
} from './correlation';
import { shortLabel } from './shared';
import { chartColors, useTheme } from '~/lib/theme';

export interface HeatLabel {
  id: number;
  label: string;
}

/** One square of the matrix: row metric `a` (y) against column metric `b` (x). */
interface HeatCell {
  key: string;
  row: string;
  col: string;
  a: number;
  b: number;
  r: number;
  /** null on the diagonal */
  pair: PairStats | null;
}

const ROW_HEIGHT = 46;
/** Column numbers sit above the matrix, like a table header. */
const AXIS_TOP: ChartAxisSide = 'top';

/**
 * Correlation matrix of the basket as a TanStack Charts heatmap: one `cell` per metric pair on
 * band scales, coloured by r on a fixed −1…+1 diverging scale, with r printed in each cell when
 * the cells are wide enough. Hover shows Pearson r, Spearman ρ, n and p; clicking (or Enter on a
 * focused cell) calls `onSelect(x, y)` with the column and row metric ids.
 */
export function CorrelationHeatmap({
  labels,
  pairs,
  method,
  onSelect,
}: {
  labels: readonly HeatLabel[];
  pairs: readonly PairStats[];
  method: CorrelationMethod;
  onSelect: (x: number, y: number) => void;
}) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const k = labels.length;

  const definition = useMemo(() => {
    const byPair = new Map<string, PairStats>();
    for (const p of pairs) {
      byPair.set(`${p.a}:${p.b}`, p);
      byPair.set(`${p.b}:${p.a}`, p);
    }
    const ids = labels.map((l) => String(l.id));
    const position = new Map<string, number>(ids.map((id, i) => [id, i]));
    const labelOf = new Map<number, string>(labels.map((l) => [l.id, l.label]));

    const cells: HeatCell[] = [];
    for (const rowL of labels) {
      for (const colL of labels) {
        const pair =
          rowL.id === colL.id
            ? null
            : (byPair.get(`${rowL.id}:${colL.id}`) ?? null);
        cells.push({
          key: `${rowL.id}:${colL.id}`,
          row: String(rowL.id),
          col: String(colL.id),
          a: rowL.id,
          b: colL.id,
          r: pair == null ? NaN : pick(pair, method).r,
          pair,
        });
      }
    }
    const diagonal = cells.filter((c) => c.pair == null);
    const valid = cells.filter((c) => c.pair != null && Number.isFinite(c.r));
    const missing = cells.filter(
      (c) => c.pair != null && !Number.isFinite(c.r)
    );
    const strong = valid.filter((c) => Math.abs(c.r) >= 0.5);
    const weak = valid.filter((c) => Math.abs(c.r) < 0.5);
    const colorScale = correlationColorScale(theme);
    const band = () => scaleBand<string>().domain(ids).padding(0);

    return defineChart(
      ({ width }: ChartBuildContext) => {
        const narrow = width < 560;
        const labelChars = narrow ? 13 : 28;
        // Rough plot width after the row labels, to decide whether r fits inside each cell.
        const cellWidth = (width - (narrow ? 120 : 230)) / Math.max(1, k);
        const showText = cellWidth >= 34;
        const textMarks = showText
          ? [
              decorative(
                text(strong, {
                  x: 'col',
                  y: 'row',
                  text: (d) => formatR(d.r),
                  fontSize: narrow ? 11 : 12.5,
                  fontWeight: 700,
                })
              ),
              decorative(
                text(weak, {
                  x: 'col',
                  y: 'row',
                  text: (d) => formatR(d.r),
                  fontSize: narrow ? 11 : 12,
                  fontWeight: 500,
                })
              ),
            ]
          : [];
        return {
          marks: [
            decorative(
              cell(diagonal, {
                x: 'col',
                y: 'row',
                key: 'key',
                fill: colors.grid,
                fillOpacity: 0.45,
                inset: 2,
                radius: 5,
              })
            ),
            cell(missing, {
              x: 'col',
              y: 'row',
              key: 'key',
              fill: colors.missing,
              inset: 2,
              radius: 5,
            }),
            cell(valid, {
              x: 'col',
              y: 'row',
              key: 'key',
              color: 'r',
              inset: 2,
              radius: 5,
              states: [
                {
                  when: { focus: 'primary' },
                  style: { stroke: colors.text, strokeWidth: 2 },
                },
              ],
            }),
            ...textMarks,
          ],
          scales: {
            x: {
              scale: band,
              side: AXIS_TOP,
              axis: {
                line: false,
                ticks: {
                  size: 0,
                  format: (v: string) => String((position.get(v) ?? 0) + 1),
                },
                tickLabels: { thin: false },
              },
            },
            y: {
              scale: band,
              axis: {
                line: false,
                ticks: {
                  size: 0,
                  format: (v: string) => {
                    const i = position.get(v) ?? 0;
                    return `${i + 1}  ${shortLabel(labels[i]?.label ?? '', labelChars)}`;
                  },
                },
                tickLabels: { thin: false },
              },
            },
          },
          color: { scale: colorScale },
        };
      },
      {
        // Only a cell under the pointer counts: the diagonal and the gaps between cells must not
        // fall back to a neighbouring pair.
        maxFocusDistance: 1,
        tooltip: {
          use: tooltip,
          sticky: false,
          content: (points) => {
            const d = points[0]?.datum;
            if (d?.pair == null) return { rows: [] };
            const title = `${labelOf.get(d.a) ?? ''} × ${labelOf.get(d.b) ?? ''}`;
            const chosen = pick(d.pair, method);
            if (!Number.isFinite(chosen.r))
              return {
                title,
                rows: [
                  {
                    label: 'Places with both',
                    value: String(chosen.n),
                  },
                  { label: 'Correlation', value: 'Not enough overlap' },
                ],
              };
            return {
              title,
              rows: [
                {
                  label: 'Pearson r',
                  value: formatR(d.pair.pearson.r),
                  active: method === 'pearson',
                },
                {
                  label: 'Spearman ρ',
                  value: formatR(d.pair.spearman.r),
                  active: method === 'spearman',
                },
                { label: 'Places with both', value: String(chosen.n) },
                { label: 'Significance', value: formatP(chosen.p) },
                { label: 'Reading', value: describeCorrelation(chosen) },
                { label: '', value: 'Click to plot this pair' },
              ],
            };
          },
        },
      }
    );
  }, [labels, pairs, method, theme, colors, k]);

  return (
    <div style={{ maxWidth: 280 + k * 120 }}>
      <Chart
        definition={definition}
        height={k * ROW_HEIGHT + 30}
        style={{ color: colors.text }}
        ariaLabel={`Correlation matrix of ${k} metrics using ${method === 'pearson' ? 'Pearson r' : 'Spearman rho'}`}
        ariaDescription="Each cell shows how strongly the row and column metrics move together, from −1 (opposite) to +1 (together). Use the arrow keys to move between cells and Enter to plot a pair."
        onSelect={(p) => {
          const d = p?.datum;
          if (d?.pair != null) onSelect(d.b, d.a);
        }}
      />
    </div>
  );
}

/** HTML legend for the diverging correlation colours. */
export function CorrelationLegend({ symbol }: { symbol: string }) {
  const theme = useTheme();
  const scale = useMemo(() => correlationColorScale(theme), [theme]);
  const stops = Array.from({ length: 21 }, (_, i) => -1 + i * 0.1);
  return (
    <div className="text-muted w-64 max-w-full text-[11px]">
      <div
        className="h-2.5 rounded-full"
        aria-hidden
        style={{
          background: `linear-gradient(to right, ${stops.map((s) => scale(s)).join(', ')})`,
        }}
      />
      <div className="tabular mt-1 grid grid-cols-3" aria-hidden>
        <span>−1 opposite</span>
        <span className="text-center">0 none</span>
        <span className="text-right">+1 together</span>
      </div>
      <span className="sr-only">
        Colour scale from {symbol} = −1 (red, move opposite) through 0 (neutral)
        to +1 (blue, move together).
      </span>
    </div>
  );
}

/** Numbered key of the matrix rows, for narrow screens where row labels are truncated. */
export function HeatmapKey({ labels }: { labels: readonly HeatLabel[] }) {
  return (
    <ol className="text-muted mt-3 grid gap-x-4 gap-y-0.5 text-xs sm:hidden">
      {labels.map((l, i) => (
        <li key={l.id} className="flex gap-1.5">
          <span className="tabular text-app w-4 shrink-0 text-right font-medium">
            {i + 1}
          </span>
          <span className="min-w-0">{l.label}</span>
        </li>
      ))}
    </ol>
  );
}
