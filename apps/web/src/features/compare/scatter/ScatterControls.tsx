import { ArrowLeftRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { groupLabel } from '../presets';
import type { CompareSearch, CompareViewProps } from '../state';
import { InfoTip } from '~/components/InfoTip';
import { MetricPicker } from '~/components/MetricPicker';
import { cx, Select } from '~/components/ui';
import type { Metric } from '~/data/types';

export interface ScatterControlsProps {
  dataset: CompareViewProps['dataset'];
  search: CompareSearch;
  metrics: Metric[];
  xId: number;
  yId: number;
  canLogX: boolean;
  canLogY: boolean;
  /** Offer the "better is right/up" flip only for lower-is-better metrics */
  canFlipX: boolean;
  canFlipY: boolean;
  flipX: boolean;
  flipY: boolean;
  onAxis: (axis: 'x' | 'y', id: number) => void;
  onSwap: () => void;
  onSize: (id: number | undefined) => void;
  onColor: (c: CompareSearch['c']) => void;
  onLog: (axis: 'x' | 'y') => void;
  onFlip: (axis: 'x' | 'y') => void;
}

/** Encoding controls for the overlay: axes, swap, size, colour, log and flip toggles. */
export function ScatterControls({
  dataset,
  search,
  metrics,
  xId,
  yId,
  canLogX,
  canLogY,
  canFlipX,
  canFlipY,
  flipX,
  flipY,
  onAxis,
  onSwap,
  onSize,
  onColor,
  onLog,
  onFlip,
}: ScatterControlsProps) {
  const log = search.log ?? [];
  const colorValue =
    search.c === 'group'
      ? 'group'
      : search.c != null
        ? `m:${search.c}`
        : 'none';
  const colorMetrics = [...metrics];
  const extra =
    typeof search.c === 'number' ? dataset.metric(search.c) : undefined;
  if (extra != null && !colorMetrics.some((m) => m.id === extra.id))
    colorMetrics.push(extra);
  const colorOptions = [
    { value: 'none', label: 'Single colour' },
    ...(dataset.groups.length > 1
      ? [
          {
            value: 'group',
            label: `By ${groupLabel(dataset.type.id).toLowerCase()}`,
          },
        ]
      : []),
    ...colorMetrics.map((m) => ({ value: `m:${m.id}`, label: m.label })),
  ];

  return (
    <div className="card space-y-3 p-3 sm:p-4">
      <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Field label="Horizontal axis (X)">
          <MetricPicker
            dataset={dataset}
            value={xId}
            onSelect={(id) => onAxis('x', id)}
            ariaLabel="Horizontal axis metric"
          />
        </Field>
        <button
          type="button"
          onClick={onSwap}
          aria-label="Swap axes"
          title="Swap axes"
          className="border-app bg-surface hover:bg-surface-2 text-muted hover:text-app mx-auto grid size-9 place-items-center rounded-lg border sm:mb-0"
        >
          <ArrowLeftRight className="size-4 rotate-90 sm:rotate-0" />
        </button>
        <Field label="Vertical axis (Y)">
          <MetricPicker
            dataset={dataset}
            value={yId}
            onSelect={(id) => onAxis('y', id)}
            ariaLabel="Vertical axis metric"
            align="right"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <Field label="Dot size" className="w-full sm:w-56">
          <MetricPicker
            dataset={dataset}
            value={search.r ?? null}
            placeholder="Same size"
            onSelect={(id) => onSize(id)}
            onClear={() => onSize(undefined)}
            ariaLabel="Dot size metric"
          />
        </Field>
        <Field label="Colour" className="w-full sm:w-52">
          <Select
            ariaLabel="Colour points by"
            className="w-full"
            value={colorValue}
            options={colorOptions}
            onChange={(v) =>
              onColor(
                v === 'none'
                  ? undefined
                  : v === 'group'
                    ? 'group'
                    : Number(v.slice(2))
              )
            }
          />
        </Field>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Axis options"
        >
          <Toggle
            pressed={log.includes('x') && canLogX}
            disabled={!canLogX}
            onClick={() => onLog('x')}
            title={
              canLogX
                ? 'Logarithmic horizontal axis: equal steps are equal ratios'
                : 'Log scale needs every value above zero'
            }
          >
            Log X
          </Toggle>
          <Toggle
            pressed={log.includes('y') && canLogY}
            disabled={!canLogY}
            onClick={() => onLog('y')}
            title={
              canLogY
                ? 'Logarithmic vertical axis: equal steps are equal ratios'
                : 'Log scale needs every value above zero'
            }
          >
            Log Y
          </Toggle>
          <InfoTip term="log-scale" className="self-center" />
          {canFlipX ? (
            <Toggle
              pressed={flipX}
              onClick={() => onFlip('x')}
              title="Reverse the horizontal axis so the better (lower) values are on the right"
            >
              Better → right
            </Toggle>
          ) : null}
          {canFlipY ? (
            <Toggle
              pressed={flipY}
              onClick={() => onFlip('y')}
              title="Reverse the vertical axis so the better (lower) values are at the top"
            >
              Better ↑ up
            </Toggle>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="text-muted mb-1 text-xs font-medium">{label}</div>
      {children}
    </div>
  );
}

function Toggle({
  pressed,
  disabled,
  onClick,
  title,
  children,
}: {
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cx(
        'rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        pressed
          ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-900/40 dark:text-accent-200'
          : 'border-app bg-surface text-muted hover:text-app'
      )}
    >
      {children}
    </button>
  );
}
