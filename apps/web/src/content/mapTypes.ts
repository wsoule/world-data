// Shapes of the pre-drawn home maps in public/data/maps (written by scripts/build-home-maps.ts).

import type { EntityType, Metric } from '../data/types';

/** One geography projected to SVG paths, keyed by the id our entities use. */
export interface MapShapes {
  geo: 'us-states' | 'us-counties' | 'world';
  width: number;
  height: number;
  paths: Record<string, string>;
}

/** One home map: which metric, its colour band per place and the band edges for the legend. */
export interface HomeMap {
  id: string;
  title: string;
  type: EntityType;
  geo: MapShapes['geo'];
  /** Sequential bands, or the party margin (Republican minus Democratic) red to blue */
  scale: 'seq' | 'party';
  metric: Pick<Metric, 'id' | 'label' | 'fmt' | 'unit' | 'year'>;
  /** Topic page to open */
  topic: string | null;
  /** Band boundaries (one fewer than the number of bands) */
  edges: number[];
  min: number;
  max: number;
  /** Entity id → band index */
  bands: Record<string, number>;
}
