import { useSuspenseQuery } from '@tanstack/react-query';
import {
  Building2,
  Globe2,
  Landmark,
  Map as MapIcon,
  MapPinned,
} from 'lucide-react';

import { cx } from './ui';
import { manifestQuery } from '~/data/api';
import type { EntityType } from '~/data/types';

export const TYPE_ICONS: Record<EntityType, typeof Globe2> = {
  country: Globe2,
  state: MapIcon,
  city: Building2,
  'world-city': Landmark,
  county: MapPinned,
};

/** Switch between entity types (countries, states, …). Shows only types present in the manifest. */
export function TypeTabs({
  value,
  onChange,
  className,
  compact,
}: {
  value: EntityType;
  onChange: (t: EntityType) => void;
  className?: string;
  compact?: boolean;
}) {
  const { data: manifest } = useSuspenseQuery(manifestQuery);
  return (
    <div
      role="tablist"
      aria-label="Place type"
      className={cx(
        'inline-flex flex-wrap gap-1 rounded-xl border border-app bg-surface-2 p-1',
        className
      )}
    >
      {manifest.types.map((t) => {
        const Icon = TYPE_ICONS[t.id];
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-surface text-app shadow-sm'
                : 'text-muted hover:text-app'
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t.label}
            {compact !== true ? (
              <span className="tabular text-muted text-xs">
                {t.numericMetrics.toLocaleString()}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
