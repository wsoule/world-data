import { queryOptions, useQuery } from '@tanstack/react-query';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

import { ISO_NUMERIC_TO_A3, NAME_TO_A3 } from './isoNumeric';
import { importFresh } from '~/lib/staleChunks';

export type GeoKind = 'world' | 'us-states' | 'us-counties';

export interface PlaceFeature extends Feature<Geometry, { name: string }> {
  /** Join key matching Entity.id (ISO3 for countries) or Entity.fips (states / counties) */
  joinKey: string | null;
  /** Unique key for rendering */
  key: string;
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
      return Object.assign(f, { joinKey, key: `${id ?? 'x'}-${i}` });
    });
  }
  if (kind === 'us-states') {
    const topo = (await importFresh(() => import('us-atlas/states-10m.json')))
      .default as unknown as Topology<{
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
      })
    );
  }
  const topo = (await importFresh(() => import('us-atlas/counties-10m.json')))
    .default as unknown as Topology<{
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

export function useGeo(kind: GeoKind | null) {
  return useQuery({ ...geoQuery(kind ?? 'world'), enabled: kind != null });
}
