import { defineChart } from '@tanstack/charts';
import { geoShape } from '@tanstack/charts/geo';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react';
import { tooltip } from '@tanstack/charts/tooltip';
import {
  geoIdentity,
  type GeoIdentityTransform,
  geoPath,
  type GeoProjection,
} from 'd3-geo';
import { scaleQuantile, scaleSequential } from 'd3-scale';
import {
  interpolateBlues,
  interpolatePuOr,
  interpolateRdYlGn,
  interpolateYlGn,
} from 'd3-scale-chromatic';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  type GeoKind,
  geoPlaneOf,
  type PlaceFeature,
  useGeo,
} from './geo/useGeo';
import { useNearViewport } from './useNearViewport';
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
  /**
   * Orient colours so green is better: 1 → higher is greener, -1 → lower is greener (high
   * values red), 0 → neutral blue. The legend reads worst → best whenever there is a better side.
   */
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

/** The scheme actually drawn: 'auto' picks green-is-better ramps by polarity, blue when neutral. */
function resolveScheme(
  scheme: ColorScheme,
  polarity: Polarity
): Exclude<ColorScheme, 'auto'> {
  if (scheme !== 'auto') return scheme;
  return polarity === 1 ? 'good-high' : polarity === -1 ? 'good-low' : 'blues';
}

/**
 * Whether the scheme's better side is the low values: then the legend lists the highest values
 * first, so every legend with a better side reads worst (left) to best (right).
 */
function lowIsBetter(scheme: ColorScheme, polarity: Polarity): boolean {
  const s = resolveScheme(scheme, polarity);
  return s === 'good-low' || (s === 'score' && polarity === -1);
}

/** Red (worst) to green (best) over t from the lowest to the highest value. */
const redToGreen = (t: number) => interpolateRdYlGn(0.05 + 0.9 * t);
/** Green (best) to red (worst): RdYlGn reversed, for metrics where lower is better. */
const greenToRed = (t: number) => interpolateRdYlGn(0.95 - 0.9 * t);

/**
 * Colour ramp over t from the lowest (0) to the highest (1) value. Every ramp with a better side
 * puts green on it: 'good-high' darkens to green at high values, 'good-low' runs green to red,
 * and 'score' is red to green, reversed when lower is better (polarity -1).
 */
function interpolatorFor(scheme: ColorScheme, polarity: Polarity) {
  switch (resolveScheme(scheme, polarity)) {
    case 'good-high':
      return (t: number) => interpolateYlGn(0.12 + 0.88 * t);
    case 'good-low':
      return greenToRed;
    case 'score':
      return polarity === -1 ? greenToRed : redToGreen;
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
  // The geometry (up to 250 KB gzip) downloads once the map is about to scroll into view, so
  // a map further down a page never holds up what is above it.
  const placeholder = useRef<HTMLDivElement>(null);
  const geo = useGeo(kind, useNearViewport(placeholder));
  const theme = useTheme();
  const colors = chartColors(theme);
  const isPoints = type === 'city' || type === 'world-city';
  // Parents often rebuild these on every render with the same contents;
  // keeping their identity stops the map from re-projecting every shape.
  const stable = useStableValues(values);
  const highlightKey = (highlight ?? []).join('\u0000');
  // Tooltips read the latest format and label at hover time, so a parent
  // passing a new inline format function does not rebuild the map.
  const latest = useRef({ format, label });
  useEffect(() => {
    latest.current = { format, label };
  });

  const model = useMemo(() => {
    const vals: number[] = [];
    for (let i = 0; i < stable.length; i++) {
      const v = stable[i];
      if (v != null && Number.isFinite(v)) vals.push(v);
    }
    return buildColor(vals, scheme, polarity, scale);
  }, [stable, scheme, polarity, scale]);

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
      const v = stable[i];
      return v != null && Number.isFinite(v) ? v : null;
    },
    [stable]
  );
  const hl = useMemo(
    () => new Set(highlightKey === '' ? [] : highlightKey.split('\u0000')),
    [highlightKey]
  );

  if (!kind) return null;
  if (geo.isError)
    return (
      <div className="text-bad p-6 text-sm">Could not load map geometry.</div>
    );
  if (geo.data == null) {
    return (
      <div
        ref={placeholder}
        className="flex items-center justify-center"
        style={{ height }}
      >
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
    latest,
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
        <MapLegend
          bins={model.bins}
          format={format}
          missing={colors.missing}
          reverse={lowIsBetter(scheme, polarity)}
        />
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
  /** Current format and label, read by tooltips at hover time. */
  latest: { current: { format: (v: number) => string; label: string } };
  height: number;
  onSelect?: (entityIndex: number) => void;
}

/**
 * Returns the previous array while the new one has the same elements, so a
 * parent that recomputes an identical values array does not invalidate the
 * memoized map definition. Comparing a few thousand numbers costs far less
 * than re-projecting a few thousand shapes.
 */
function useStableValues<T>(next: ArrayLike<T>): ArrayLike<T> {
  const [stable, setStable] = useState(next);
  const changed = stable !== next && !sameElements(stable, next);
  if (changed) setStable(next);
  return changed ? next : stable;
}

/** Reads a ref when called. Tooltip callbacks use it on hover, never during render. */
function readRef<T>(ref: { readonly current: T }): T {
  return ref.current;
}

function sameElements<T>(a: ArrayLike<T>, b: ArrayLike<T>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/**
 * Fitted projections per geometry collection and plot extent. Fitting walks
 * every feature (all 3,000 counties), and the map would otherwise refit on
 * every render, once per mark.
 */
const fittedProjections = new WeakMap<
  object,
  Map<string, GeoProjection | GeoIdentityTransform>
>();

/**
 * Projection fitted to the plot area. Every geography's shapes come already projected (see
 * `isProjected`), so it is a scale and offset (geoIdentity) that fits `fitTo` into the area:
 * the drawn US features, or for the world the projected sphere (`geoPlaneOf().frame`), so the
 * world map frames the globe as it did when the browser projected it.
 */
function projectionFor(kind: GeoKind, fitTo: Feature | FeatureCollection) {
  return ({
    chart,
  }: {
    chart: { x: number; y: number; width: number; height: number };
  }): GeoProjection | GeoIdentityTransform => {
    const key = `${kind}:${chart.x},${chart.y},${chart.width},${chart.height}`;
    let byExtent = fittedProjections.get(fitTo);
    if (byExtent == null) {
      byExtent = new Map();
      fittedProjections.set(fitTo, byExtent);
    }
    const cached = byExtent.get(key);
    if (cached != null) return cached;
    const inset = Math.min(
      4,
      Math.max(0, (Math.min(chart.width, chart.height) - 1) / 2)
    );
    const extent: [[number, number], [number, number]] = [
      [chart.x + inset, chart.y + inset],
      [chart.x + chart.width - inset, chart.y + chart.height - inset],
    ];
    const projection = geoIdentity().fitExtent(extent, fitTo);
    byExtent.set(key, projection);
    return projection;
  };
}

/**
 * Centroid per feature on the plane its shapes are drawn on, computed once: geoShape otherwise
 * recomputes the centroid of every shape on every render to place its hover point.
 */
const centroids = new WeakMap<object, readonly [number, number]>();
const planar = geoPath();
function centroidOf(f: Feature): readonly [number, number] {
  let c = centroids.get(f);
  if (c == null) {
    c = planar.centroid(f);
    centroids.set(f, c);
  }
  return c;
}

/** Map features without Antarctica (and, for dot maps on US states, the territories), as a stable collection. */
function useDrawable(
  features: PlaceFeature[],
  kind: GeoKind,
  dropTerritories: boolean
): { drawable: PlaceFeature[]; collection: FeatureCollection } {
  return useMemo(() => {
    const drawable = features.filter(
      (f) =>
        f.properties.name !== 'Antarctica' &&
        (!dropTerritories ||
          kind !== 'us-states' ||
          !['72', '78', '66', '60', '69'].includes(f.joinKey ?? ''))
    );
    return {
      drawable,
      collection: { type: 'FeatureCollection', features: drawable },
    };
  }, [features, kind, dropTerritories]);
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
  latest,
  height,
  onSelect,
  join,
}: ChartPartProps & { join: Map<string, number> }) {
  const { drawable, collection } = useDrawable(features, kind, false);
  const plane = geoPlaneOf(features);
  const definition = useMemo(() => {
    const projection = projectionFor(kind, plane.frame ?? collection);
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
          anchor: centroidOf,
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
            anchor: centroidOf,
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
          const { format, label: name } = readRef(latest);
          return {
            title: i != null ? dataset.entities[i].name : f.properties.name,
            rows: [{ label: name, value: v == null ? 'No data' : format(v) }],
          };
        },
      },
    });
  }, [
    drawable,
    collection,
    kind,
    valueOf,
    model,
    colors,
    hl,
    join,
    dataset,
    latest,
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
  latest,
  height,
  onSelect,
}: ChartPartProps) {
  const { drawable: base, collection } = useDrawable(features, kind, true);
  const plane = geoPlaneOf(features);
  const definition = useMemo(() => {
    const projection = projectionFor(kind, plane.frame ?? collection);
    const pts: PointFeature[] = [];
    dataset.entities.forEach((e, i) => {
      if (e.lat == null || e.lng == null) return;
      if (valueOf(i) == null) return;
      // A dot goes where the shapes' projection puts it (on US maps, nowhere outside the
      // lower 48, Alaska and Hawaii).
      const at = plane.point(e.lng, e.lat);
      if (at == null) return;
      pts.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [at[0], at[1]] },
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
            anchor: centroidOf,
            fill: colors.missing,
            stroke: colors.border,
            strokeWidth: 0.5,
          })
        ),
        geoShape(pts, {
          key: (f) => f.key,
          projection,
          anchor: (f) => f.geometry.coordinates as [number, number],
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
          const { format, label: name } = readRef(latest);
          return {
            title: dataset.entities[f.idx].name,
            rows: [{ label: name, value: v == null ? 'No data' : format(v) }],
          };
        },
      },
    });
  }, [base, collection, kind, valueOf, model, colors, hl, dataset, latest]);

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

/**
 * Colour key under the map: the bins as swatches and the value range they span. Bins arrive
 * ordered from the lowest value; `reverse` lists them from the highest instead, so a
 * lower-is-better legend still reads worst (red, left) to best (green, right).
 */
function MapLegend({
  bins,
  format,
  missing,
  reverse,
}: {
  bins: ColorModel['bins'];
  format: (v: number) => string;
  missing: string;
  reverse: boolean;
}) {
  const shown = reverse ? [...bins].reverse() : bins;
  const first = reverse ? bins[bins.length - 1].to : bins[0].from;
  const last = reverse ? bins[0].from : bins[bins.length - 1].to;
  return (
    <div
      className="text-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
      aria-hidden
    >
      <div className="flex items-stretch overflow-hidden rounded">
        {shown.map((b, i) => (
          <div
            key={i}
            className="h-3 w-8"
            style={{ background: b.color }}
            title={`${format(b.from)} – ${format(b.to)}`}
          />
        ))}
      </div>
      <span className="tabular">
        {format(first) === format(last)
          ? format(first)
          : `${format(first)} → ${format(last)}`}
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
