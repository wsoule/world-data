import { defineChart } from '@tanstack/charts';
import { geoShape } from '@tanstack/charts/geo';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react';
import { tooltip } from '@tanstack/charts/tooltip';
import { geoAlbersUsa, geoEqualEarth } from 'd3-geo';
import { scaleQuantile, scaleSequential } from 'd3-scale';
import {
  interpolateBlues,
  interpolatePuOr,
  interpolateRdYlGn,
  interpolateYlGn,
  interpolateYlOrRd,
} from 'd3-scale-chromatic';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { useMemo } from 'react';

import { type GeoKind, type PlaceFeature, useGeo } from './geo/useGeo';
import { Spinner } from '~/components/feedback';
import type { Dataset } from '~/data/dataset';
import type { Polarity } from '~/data/types';
import { chartColors, useTheme } from '~/lib/theme';

export type ColorScheme =
  | 'auto'
  | 'blues'
  | 'good-high'
  | 'good-low'
  | 'score'
  | 'diverging';

export interface ChoroplethProps {
  dataset: Dataset;
  /** Values aligned to dataset.entities (NaN / null = missing) */
  values: ArrayLike<number | null>;
  /** Formats a value for tooltip and legend */
  format: (v: number) => string;
  /** Name of the value for tooltip/aria */
  label: string;
  /** Orient colours: 1 → higher is good (green), -1 → higher is bad (red), 0 → neutral blue */
  polarity?: Polarity;
  scheme?: ColorScheme;
  /** 'quantile' bins (robust to skew, default) or continuous */
  scale?: 'quantile' | 'continuous';
  /** Entity ids to outline */
  highlight?: readonly string[];
  onSelect?: (entityIndex: number) => void;
  height?: number;
  className?: string;
}

const GEO_FOR: Record<string, GeoKind | null> = {
  country: 'world',
  state: 'us-states',
  county: 'us-counties',
  city: 'us-states',
  'world-city': 'world',
};

function interpolatorFor(scheme: ColorScheme, polarity: Polarity) {
  const s =
    scheme === 'auto'
      ? polarity === 1
        ? 'good-high'
        : polarity === -1
          ? 'good-low'
          : 'blues'
      : scheme;
  switch (s) {
    case 'good-high':
      return (t: number) => interpolateYlGn(0.12 + 0.88 * t);
    case 'good-low':
      return (t: number) => interpolateYlOrRd(0.12 + 0.88 * t);
    case 'score':
      return (t: number) => interpolateRdYlGn(0.05 + 0.9 * t);
    case 'diverging':
      return (t: number) => interpolatePuOr(1 - t);
    default:
      return (t: number) => interpolateBlues(0.15 + 0.85 * t);
  }
}

interface ColorModel {
  color: (v: number) => string;
  bins: { color: string; from: number; to: number }[];
}

function buildColor(
  vals: number[],
  scheme: ColorScheme,
  polarity: Polarity,
  scale: 'quantile' | 'continuous'
): ColorModel | null {
  if (vals.length === 0) return null;
  const interp = interpolatorFor(scheme, polarity);
  const sorted = [...vals].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const distinct = new Set(sorted).size;
  if (scale === 'continuous' || distinct <= 7) {
    const s = scaleSequential(interp).domain([
      min,
      max === min ? min + 1 : max,
    ]);
    const steps = Math.min(7, Math.max(2, distinct));
    const bins = Array.from({ length: steps }, (_, i) => {
      const from = min + ((max - min) * i) / steps;
      const to = min + ((max - min) * (i + 1)) / steps;
      return { color: s((from + to) / 2), from, to };
    });
    return { color: (v) => s(v), bins };
  }
  const k = 7;
  const range = Array.from({ length: k }, (_, i) => interp(i / (k - 1)));
  const q = scaleQuantile<string>().domain(sorted).range(range);
  const th = q.quantiles();
  const bins = range.map((color, i) => ({
    color,
    from: i === 0 ? min : th[i - 1],
    to: i === k - 1 ? max : th[i],
  }));
  return { color: (v) => q(v), bins };
}

type PointFeature = Feature<Point, { name: string }> & {
  key: string;
  idx: number;
};

/**
 * Map of one value per place: filled regions for countries / states / counties, sized dots for cities.
 * Built on TanStack Charts' geoShape mark.
 */
export function Choropleth({
  dataset,
  values,
  format,
  label,
  polarity = 0,
  scheme = 'auto',
  scale = 'quantile',
  highlight,
  onSelect,
  height = 420,
  className,
}: ChoroplethProps) {
  const type = dataset.type.id;
  const kind = GEO_FOR[type];
  const geo = useGeo(kind);
  const theme = useTheme();
  const colors = chartColors(theme);
  const isPoints = type === 'city' || type === 'world-city';

  const model = useMemo(() => {
    const vals: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v != null && Number.isFinite(v)) vals.push(v);
    }
    return buildColor(vals, scheme, polarity, scale);
  }, [values, scheme, polarity, scale]);

  /** joinKey -> entity index */
  const join = useMemo(() => {
    const m = new Map<string, number>();
    dataset.entities.forEach((e, i) => {
      const key =
        type === 'country'
          ? e.id
          : type === 'state'
            ? e.fips
            : type === 'county'
              ? e.id
              : null;
      if (key) m.set(key, i);
    });
    return m;
  }, [dataset, type]);

  const valueOf = useMemo(
    () => (i: number | undefined) => {
      if (i == null) return null;
      const v = values[i];
      return v != null && Number.isFinite(v) ? v : null;
    },
    [values]
  );
  const hl = useMemo(() => new Set(highlight ?? []), [highlight]);

  if (!kind) return null;
  if (geo.isError)
    return (
      <div className="text-bad p-6 text-sm">Could not load map geometry.</div>
    );
  if (geo.data == null) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <Spinner label="Loading map…" />
      </div>
    );
  }

  const common = {
    dataset,
    kind,
    features: geo.data,
    valueOf,
    model,
    colors,
    hl,
    label,
    format,
    height,
    onSelect,
  };
  return (
    <div className={className}>
      {isPoints ? (
        <PointChart {...common} />
      ) : (
        <RegionChart {...common} join={join} />
      )}
      {model != null ? (
        <MapLegend bins={model.bins} format={format} missing={colors.missing} />
      ) : null}
    </div>
  );
}

interface ChartPartProps {
  dataset: Dataset;
  kind: GeoKind;
  features: PlaceFeature[];
  valueOf: (i: number | undefined) => number | null;
  model: ColorModel | null;
  colors: ReturnType<typeof chartColors>;
  hl: Set<string>;
  label: string;
  format: (v: number) => string;
  height: number;
  onSelect?: (entityIndex: number) => void;
}

function projectionFor(kind: GeoKind, fitTo: FeatureCollection) {
  return kind === 'world'
    ? { type: geoEqualEarth, fit: 'sphere' as const, inset: 4 }
    : { type: geoAlbersUsa, fit: fitTo, inset: 4 };
}

function RegionChart({
  dataset,
  kind,
  features,
  valueOf,
  model,
  colors,
  hl,
  label,
  format,
  height,
  onSelect,
  join,
}: ChartPartProps & { join: Map<string, number> }) {
  const definition = useMemo(() => {
    const drawable = features.filter((f) => f.properties.name !== 'Antarctica');
    const collection: FeatureCollection = {
      type: 'FeatureCollection',
      features: drawable,
    };
    const projection = projectionFor(kind, collection);
    const entityIdOf = (f: PlaceFeature): string => {
      const i = f.joinKey ? join.get(f.joinKey) : undefined;
      return i != null ? dataset.entities[i].id : '';
    };
    const highlighted = drawable.filter((f) => hl.has(entityIdOf(f)));
    return defineChart({
      marks: [
        geoShape(drawable, {
          key: (f) => f.key,
          projection,
          fill: (f) => {
            const v = valueOf(f.joinKey ? join.get(f.joinKey) : undefined);
            return v != null && model != null ? model.color(v) : colors.missing;
          },
          stroke: colors.border,
          strokeWidth: kind === 'us-counties' ? 0.15 : 0.5,
        }),
        decorative(
          geoShape(highlighted, {
            key: (f) => `hl-${f.key}`,
            projection,
            fill: 'none',
            stroke: colors.highlight,
            strokeWidth: 2,
          })
        ),
      ],
      scales: { x: null, y: null },
      margin: 0,
      tooltip: {
        use: tooltip,
        content: (points) => {
          const f = points[0]?.datum;
          if (f == null) return { rows: [] };
          const i = f.joinKey ? join.get(f.joinKey) : undefined;
          const v = valueOf(i);
          return {
            title: i != null ? dataset.entities[i].name : f.properties.name,
            rows: [{ label, value: v == null ? 'No data' : format(v) }],
          };
        },
      },
    });
  }, [
    features,
    kind,
    valueOf,
    model,
    colors,
    hl,
    join,
    dataset,
    label,
    format,
  ]);

  return (
    <Chart
      definition={definition}
      height={height}
      ariaLabel={`Map of ${label} by ${dataset.type.singular.toLowerCase()}`}
      onSelect={(point) => {
        if (point == null || onSelect == null || point.datum.joinKey == null)
          return;
        const i = join.get(point.datum.joinKey);
        if (i != null) onSelect(i);
      }}
    />
  );
}

function PointChart({
  dataset,
  kind,
  features,
  valueOf,
  model,
  colors,
  hl,
  label,
  format,
  height,
  onSelect,
}: ChartPartProps) {
  const definition = useMemo(() => {
    const base = features.filter(
      (f) =>
        f.properties.name !== 'Antarctica' &&
        (kind !== 'us-states' ||
          !['72', '78', '66', '60', '69'].includes(f.joinKey ?? ''))
    );
    const collection: FeatureCollection = {
      type: 'FeatureCollection',
      features: base,
    };
    const projection = projectionFor(kind, collection);
    const pts: PointFeature[] = [];
    dataset.entities.forEach((e, i) => {
      if (e.lat == null || e.lng == null) return;
      if (valueOf(i) == null) return;
      pts.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
        properties: { name: e.name },
        key: e.id,
        idx: i,
      });
    });
    return defineChart({
      marks: [
        decorative(
          geoShape(base, {
            key: (f) => f.key,
            projection,
            fill: colors.missing,
            stroke: colors.border,
            strokeWidth: 0.5,
          })
        ),
        geoShape(pts, {
          key: (f) => f.key,
          projection,
          r: (f) => (hl.has(dataset.entities[f.idx].id) ? 9 : 4),
          fill: (f) => {
            const v = valueOf(f.idx);
            return v != null && model != null ? model.color(v) : colors.missing;
          },
          stroke: (f) =>
            hl.has(dataset.entities[f.idx].id)
              ? colors.highlight
              : colors.border,
          strokeWidth: 0.8,
        }),
      ],
      scales: { x: null, y: null },
      margin: 0,
      tooltip: {
        use: tooltip,
        content: (points) => {
          const f = points[0]?.datum;
          if (f == null) return { rows: [] };
          const v = valueOf(f.idx);
          return {
            title: dataset.entities[f.idx].name,
            rows: [{ label, value: v == null ? 'No data' : format(v) }],
          };
        },
      },
    });
  }, [features, kind, valueOf, model, colors, hl, dataset, label, format]);

  return (
    <Chart
      definition={definition}
      height={height}
      ariaLabel={`Map of ${label} by ${dataset.type.singular.toLowerCase()}`}
      onSelect={(point) => {
        if (point != null && onSelect != null) onSelect(point.datum.idx);
      }}
    />
  );
}

function MapLegend({
  bins,
  format,
  missing,
}: {
  bins: ColorModel['bins'];
  format: (v: number) => string;
  missing: string;
}) {
  return (
    <div
      className="text-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
      aria-hidden
    >
      <div className="flex items-stretch overflow-hidden rounded">
        {bins.map((b, i) => (
          <div
            key={i}
            className="h-3 w-8"
            style={{ background: b.color }}
            title={`${format(b.from)} – ${format(b.to)}`}
          />
        ))}
      </div>
      <span className="tabular">
        {format(bins[0].from) === format(bins[bins.length - 1].to)
          ? format(bins[0].from)
          : `${format(bins[0].from)} → ${format(bins[bins.length - 1].to)}`}
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block h-3 w-3 rounded-sm"
          style={{ background: missing }}
        />{' '}
        No data
      </span>
    </div>
  );
}
