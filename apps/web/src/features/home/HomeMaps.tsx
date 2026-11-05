import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useHydrated } from '@tanstack/react-router';
import { useMemo } from 'react';

import { CombinedMapCard } from './CombinedMap';
import { SEQ, shapeId } from './mapStyle';
import type { HomeMap, MapShapes } from '~/content/mapTypes';
import { homeMapsQuery, mapShapesQuery } from '~/data/api';
import { formatValue } from '~/lib/format';

/** Democratic blue to Republican red by margin: <−30, −30…−15, −15…−5, −5…0, 0…5, 5…15, 15…30, >30. */
const PARTY = [
  '#1d4ed8',
  '#3b82f6',
  '#93c5fd',
  '#dbeafe',
  '#fee2e2',
  '#fca5a5',
  '#ef4444',
  '#b91c1c',
];

/**
 * Each geography's shapes, defined once for the whole page; every map below reuses them with
 * <use>, so eight maps cost one copy of the paths.
 */
function ShapeDefs({ shapes }: { shapes: MapShapes }) {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        {Object.entries(shapes.paths).map(([id, d]) => (
          <path key={id} id={shapeId(shapes.geo, id)} d={d} />
        ))}
      </defs>
    </svg>
  );
}

/** One map: every shape filled by its band (grey without data). */
function MapSvg({ map, shapes }: { map: HomeMap; shapes: MapShapes }) {
  const palette = map.scale === 'party' ? PARTY : SEQ;
  const dense = map.geo === 'us-counties';
  return (
    <svg
      viewBox={`0 0 ${shapes.width} ${shapes.height}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Map of ${map.metric.label}`}
    >
      {Object.keys(shapes.paths).map((id) => {
        const band = map.bands[id];
        return (
          <use
            key={id}
            href={`#${shapeId(shapes.geo, id)}`}
            fill={band == null ? 'var(--surface-2)' : palette[band]}
            stroke={dense ? 'none' : 'var(--surface)'}
            strokeWidth={dense ? 0 : 0.6}
          />
        );
      })}
    </svg>
  );
}

/**
 * A county map: the counties of each colour band joined into one path, so a map is nine
 * <path>s instead of 3,100 <use>s of 3,100 shared shapes (about 9,000 elements for the two
 * county maps). Counties never overlap and are drawn without outlines, so the map looks the
 * same, without the faint seams anti-aliasing left between neighbours of one colour.
 */
function BandMapSvg({ map, shapes }: { map: HomeMap; shapes: MapShapes }) {
  const palette = map.scale === 'party' ? PARTY : SEQ;
  const groups = useMemo(() => {
    const byBand = new Map<number, string[]>();
    for (const [id, d] of Object.entries(shapes.paths)) {
      const band = map.bands[id] ?? -1;
      const list = byBand.get(band);
      if (list == null) byBand.set(band, [d]);
      else list.push(d);
    }
    return [...byBand.entries()]
      .sort(([a], [b]) => a - b)
      .map(([band, ds]) => ({ band, d: ds.join('') }));
  }, [map, shapes]);
  return (
    <svg
      viewBox={`0 0 ${shapes.width} ${shapes.height}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Map of ${map.metric.label}`}
    >
      {groups.map((g) => (
        <path
          key={g.band}
          d={g.d}
          fill={g.band < 0 ? 'var(--surface-2)' : palette[g.band]}
        />
      ))}
    </svg>
  );
}

/** Colour key under a map: the band colours with the lowest and highest values (or margins). */
function Legend({ map }: { map: HomeMap }) {
  const palette = map.scale === 'party' ? PARTY : SEQ;
  const m = {
    fmt: map.metric.fmt,
    unit: map.metric.unit,
    kind: 'num' as const,
  };
  const [lo, hi] =
    map.scale === 'party'
      ? ['Democratic +30', 'Republican +30']
      : [
          formatValue(m, map.min, { compact: true }),
          formatValue(m, map.max, { compact: true }),
        ];
  return (
    <div className="text-muted flex items-center gap-2 text-xs">
      <span className="tabular">{lo}</span>
      <span className="flex h-2 flex-1 overflow-hidden rounded-full">
        {palette.map((c) => (
          <span key={c} className="flex-1" style={{ background: c }} />
        ))}
      </span>
      <span className="tabular">{hi}</span>
    </div>
  );
}

function MapCard({
  map,
  shapes,
}: {
  map: HomeMap;
  shapes: MapShapes | undefined;
}) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="group-hover:text-accent-700 dark:group-hover:text-accent-300 font-semibold">
          {map.title}
        </h3>
        {map.metric.year != null ? (
          <span className="text-muted tabular text-xs">{map.metric.year}</span>
        ) : null}
      </div>
      <div className="mt-3">
        {shapes == null ? (
          // Counties load after the page; keep the map's space so nothing jumps.
          <div
            className="bg-surface-2 w-full animate-pulse rounded-lg"
            style={{ aspectRatio: '320 / 200' }}
            aria-hidden
          />
        ) : shapes.geo === 'us-counties' ? (
          <BandMapSvg map={map} shapes={shapes} />
        ) : (
          <MapSvg map={map} shapes={shapes} />
        )}
      </div>
      <div className="mt-3">
        <Legend map={map} />
      </div>
      <p className="text-muted mt-3 text-sm leading-relaxed">{map.blurb}</p>
      {map.topicTitle != null ? (
        <p className="text-accent-700 dark:text-accent-300 mt-2 text-xs font-medium">
          Open the full ranking
          {map.topicMetrics > 1
            ? `, with ${map.topicMetrics} statistics to switch between`
            : ''}
        </p>
      ) : null}
    </>
  );
  const className =
    'group border-app bg-surface hover:border-accent-300 dark:hover:border-accent-700 block rounded-xl border p-4 transition-colors';
  return map.topic != null ? (
    <Link
      to="/topics/$type/$slug"
      params={{ type: map.type, slug: map.topic }}
      className={className}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * The home page's maps: state and world maps render on the server from pre-drawn shapes; the
 * county shapes (about 120 KB) load after the page, so the first view stays light.
 */
export function HomeMaps() {
  const { data: file } = useSuspenseQuery(homeMapsQuery);
  const maps = file.maps;
  const { data: states } = useSuspenseQuery(mapShapesQuery('us-states'));
  const { data: world } = useSuspenseQuery(mapShapesQuery('world'));
  const hydrated = useHydrated();
  const { data: counties } = useQuery({
    ...mapShapesQuery('us-counties'),
    enabled: hydrated,
  });
  const shapesFor = (geo: MapShapes['geo']) =>
    geo === 'us-states' ? states : geo === 'world' ? world : counties;
  return (
    <>
      <ShapeDefs shapes={states} />
      <ShapeDefs shapes={world} />
      {file.combined != null ? (
        <CombinedMapCard combined={file.combined} shapes={states} />
      ) : null}
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {maps.map((m) => (
          <li key={m.id}>
            <MapCard map={m} shapes={shapesFor(m.geo)} />
          </li>
        ))}
      </ul>
    </>
  );
}
