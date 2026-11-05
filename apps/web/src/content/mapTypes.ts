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
  /** One sentence on what the map shows */
  blurb: string;
  /** Topic page to open, its title and how many statistics it has */
  topic: string | null;
  topicTitle: string | null;
  topicMetrics: number;
  /** Band boundaries (one fewer than the number of bands) */
  edges: number[];
  min: number;
  max: number;
  /** Entity id → band index */
  bands: Record<string, number>;
}

/** One statistic the home page's combined map can include. */
export interface CombinedMetric {
  id: number;
  /** Short chip label, e.g. "Cost of living" */
  label: string;
  /** Which end counts as better: 1 higher, -1 lower */
  pol: 1 | -1;
}

/**
 * The home page's build-your-own map: each state's percentile on each metric (100 = best given
 * its direction, null without data), averaged over the metrics a visitor switches on.
 */
export interface CombinedMap {
  metrics: CombinedMetric[];
  /** Metric ids switched on at first */
  defaults: number[];
  /** State id → percentile per metric, in `metrics` order */
  places: Record<string, (number | null)[]>;
  names: Record<string, string>;
}

/** A topic in the home page's "Popular topics" list (POPULAR_TOPICS in features/home/presets.ts). */
export interface PopularTopic {
  type: EntityType;
  slug: string;
  title: string;
  /** Places it ranks */
  n: number;
  /** Statistics it has */
  metrics: number;
}

export interface HomeMapsFile {
  maps: HomeMap[];
  combined: CombinedMap | null;
  /** The popular topics, so the home page need not load the index of every topic */
  popular: PopularTopic[];
}
