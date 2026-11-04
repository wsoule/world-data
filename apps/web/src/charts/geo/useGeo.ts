import { queryOptions, useQuery } from '@tanstack/react-query';
import { geoAlbersUsa } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

import { ISO_NUMERIC_TO_A3, NAME_TO_A3 } from './isoNumeric';
import { importFresh } from '~/lib/staleChunks';

export type GeoKind = 'world' | 'us-states' | 'us-counties';

/**
 * Whether a geography's features come already projected to the plane: the US maps use us-atlas'
 * "albers" files, drawn through geoAlbersUsa at build time, so the browser only scales them
 * (geoIdentity) instead of clipping and resampling every county on the sphere, which was most
 * of the work of drawing a county map. The world map is still projected in the browser.
 */
export const isProjected = (kind: GeoKind): boolean => kind !== 'world';

/**
 * The projection us-atlas' albers files were drawn with (a 975×610 viewport), for placing
 * longitude/latitude points such as city dots on those shapes.
 */
export const usAtlasAlbers = geoAlbersUsa().scale(1300).translate([487.5, 305]);

export interface PlaceFeature extends Feature<Geometry, { name: string }> {
  /** Join key matching Entity.id (ISO3 for countries) or Entity.fips (states / counties) */
  joinKey: string | null;
  /** Unique key for rendering */
  key: string;
  /** Coordinates are already on the plane (see `isProjected`), not longitude/latitude */
  projected: boolean;
}

async function load(kind: GeoKind): Promise<PlaceFeature[]> {
  if (kind === 'world') {
    const topo = (
      await importFresh(() => import('world-atlas/countries-50m.json'))
    ).default as unknown as Topology<{
      countries: GeometryCollection<{ name: string }>;
    }>;
    const fc = feature(topo, topo.objects.countries) as FeatureCollection<
      Geometry,
      { name: string }
    >;
    return fc.features.map((f, i) => {
      const id = f.id != null ? String(f.id) : null;
      const joinKey =
        (id == null ? undefined : ISO_NUMERIC_TO_A3[id]) ??
        NAME_TO_A3[f.properties.name] ??
        null;
      return Object.assign(f, {
        joinKey,
        key: `${id ?? 'x'}-${i}`,
        projected: false,
      });
    });
  }
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
