import { queryOptions, useQuery } from '@tanstack/react-query';
import { geoAlbersUsa, geoEqualEarth } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

import {
  decodeRing,
  WORLD_PLANE_PATH,
  type WorldPlaneFile,
} from './worldPlane';
import { getJson } from '~/data/api';
import { importFresh } from '~/lib/staleChunks';

export type GeoKind = 'world' | 'us-states' | 'us-counties';

/**
 * Every geography's features come already projected to the plane, so the browser only scales
 * them (geoIdentity) instead of clipping and resampling every shape on the sphere, which was
 * most of the work of drawing a map: the US maps use us-atlas' "albers" files, drawn through
 * geoAlbersUsa, and the world map the countries the data build projects through geoEqualEarth
 * (worldPlane.ts).
 */
export const isProjected = (_kind: GeoKind): boolean => true;

/**
 * The projection us-atlas' albers files were drawn with (a 975×610 viewport), for placing
 * longitude/latitude points such as city dots on those shapes.
 */
export const usAtlasAlbers = geoAlbersUsa().scale(1300).translate([487.5, 305]);

/** How a projected geography's coordinates relate to the map and to longitude/latitude. */
export interface GeoPlane {
  /** What the map fits to its plot area; null fits the drawn shapes themselves */
  frame: Feature | null;
  /** Places a longitude/latitude point on the shapes, null where the projection has none */
  point: (lng: number, lat: number) => [number, number] | null;
}

const US_PLANE: GeoPlane = {
  frame: null,
  point: (lng, lat) => usAtlasAlbers([lng, lat]),
};

/** The plane of each loaded feature list (the world's comes with its file). */
const planes = new WeakMap<readonly PlaceFeature[], GeoPlane>();

/**
 * The plane `features` (as useGeo returned them) are drawn on. The world map fits the bounds of
 * the projected sphere, as it fitted the globe before, rather than its countries' bounds.
 */
export function geoPlaneOf(features: readonly PlaceFeature[]): GeoPlane {
  return planes.get(features) ?? US_PLANE;
}

/** The world's features and plane from the projected file. */
function worldFeatures(file: WorldPlaneFile): PlaceFeature[] {
  const features = file.features.map((f, i): PlaceFeature => ({
    type: 'Feature',
    id: f.id ?? undefined,
    properties: { name: f.name },
    geometry: {
      type: 'MultiPolygon',
      coordinates: f.p.map((rings) => rings.map(decodeRing)),
    },
    joinKey: f.id,
    key: `${f.id ?? 'x'}-${i}`,
    projected: true,
  }));
  const [[x0, y0], [x1, y1]] = file.frame;
  const projection = geoEqualEarth()
    .scale(file.scale)
    .translate(file.translate);
  planes.set(features, {
    frame: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [x0, y0],
            [x1, y0],
            [x1, y1],
            [x0, y1],
            [x0, y0],
          ],
        ],
      },
    },
    point: (lng, lat) => {
      const at = projection([lng, lat]);
      return at == null ? null : [at[0], at[1]];
    },
  });
  return features;
}

export interface PlaceFeature extends Feature<Geometry, { name: string }> {
  /** Join key matching Entity.id (ISO3 for countries) or Entity.fips (states / counties) */
  joinKey: string | null;
  /** Unique key for rendering */
  key: string;
  /** Coordinates are already on the plane (see `isProjected`), not longitude/latitude */
  projected: boolean;
}

async function load(kind: GeoKind): Promise<PlaceFeature[]> {
  if (kind === 'world')
    return worldFeatures(await getJson<WorldPlaneFile>(WORLD_PLANE_PATH));
  if (kind === 'us-states') {
    const topo = (
      await importFresh(() => import('us-atlas/states-albers-10m.json'))
    ).default as unknown as Topology<{
      states: GeometryCollection<{ name: string }>;
    }>;
    const fc = feature(topo, topo.objects.states) as FeatureCollection<
      Geometry,
      { name: string }
    >;
    return fc.features.map((f, i) =>
      Object.assign(f, {
        joinKey: f.id != null ? String(f.id).padStart(2, '0') : null,
        key: `${f.id ?? 'x'}-${i}`,
        projected: true,
      })
    );
  }
  const topo = (
    await importFresh(() => import('us-atlas/counties-albers-10m.json'))
  ).default as unknown as Topology<{
    counties: GeometryCollection<{ name: string }>;
  }>;
  const fc = feature(topo, topo.objects.counties) as FeatureCollection<
    Geometry,
    { name: string }
  >;
  return fc.features.map((f, i) =>
    Object.assign(f, {
      joinKey: f.id != null ? String(f.id).padStart(5, '0') : null,
      key: `${f.id ?? 'x'}-${i}`,
      projected: true,
    })
  );
}

export const geoQuery = (kind: GeoKind) =>
  queryOptions({
    queryKey: ['geo', kind],
    queryFn: () => load(kind),
    staleTime: Infinity,
    gcTime: Infinity,
  });

/**
 * One geography's features. Nothing downloads until `load` is true (the map is near the
 * viewport, see useNearViewport); geometry already loaded for another map is returned either
 * way, since a disabled query still reads the cache.
 */
export function useGeo(kind: GeoKind | null, load = true) {
  return useQuery({
    ...geoQuery(kind ?? 'world'),
    enabled: kind != null && load,
  });
}
