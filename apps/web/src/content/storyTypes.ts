// Shapes of the computed data stories in public/data/stories (written by scripts/build-stories.ts,
// read by the articles pages and the home page).

import type { EntityType, Metric } from '../data/types';

/** What an article needs to know about one of its two metrics. */
export interface StoryMetric {
  id: number;
  label: string;
  fmt: Metric['fmt'];
  unit: Metric['unit'];
  pol: Metric['pol'];
  /** Year of the values used (null for undated series) */
  year: number | null;
  /** Primary topic slug, for linking to its ranking page */
  topic: string | null;
}

/** One place on the chart: name, entity slug, values and (when coloured) its category. */
export interface StoryPoint {
  name: string;
  slug: string;
  x: number;
  y: number;
  c?: string;
}

/** Average position of each colour category, e.g. Republican- and Democratic-won states. */
export interface StoryGroup {
  name: string;
  n: number;
  meanX: number;
  meanY: number;
}

export interface StoryData {
  slug: string;
  /** Hand-written flagship story, or an automatic article on a strong pair */
  kind: 'flagship' | 'pair';
  type: EntityType;
  title: string;
  dek: string;
  cats: string[];
  featured: boolean;
  x: StoryMetric;
  y: StoryMetric;
  color: { id: number; label: string } | null;
  logX: boolean;
  n: number;
  /** Pearson r (on log x when logX) */
  r: number;
  /** Spearman rank correlation */
  rho: number;
  p: number;
  /** Least-squares line y = intercept + slope · x (x logged when logX) */
  slope: number;
  intercept: number;
  medianX: number;
  medianY: number;
  /** Every place as [x, y, category] (names are kept only for the lists below) */
  points: [number, number, string | null][];
  /** Highest and lowest on y */
  top: StoryPoint[];
  bottom: StoryPoint[];
  /** Furthest above and below the trend line */
  above: StoryPoint[];
  below: StoryPoint[];
  groups: StoryGroup[];
  /**
   * Date of the newest data the story uses (YYYY-MM-DD): its metrics' update dates, else their
   * topics' fetch dates. Never the build date; missing in data built before it was recorded.
   */
  date?: string | null;
}

/** A story as listed on the index and home page, with a small thumbnail of its chart. */
export interface StorySummary {
  slug: string;
  kind: StoryData['kind'];
  type: EntityType;
  title: string;
  dek: string;
  cats: string[];
  featured: boolean;
  r: number;
  n: number;
  xLabel: string;
  yLabel: string;
  /** Metric ids and encodings, to open the same chart in the interactive overlay */
  xId: number;
  yId: number;
  colorId: number | null;
  logX: boolean;
  /** Up to 120 points scaled to 0–1 (x logged when the story is), with category; empty for pair articles */
  thumb: [number, number, string | null][];
  /** Regression line endpoints in thumbnail coordinates */
  line: [number, number, number, number] | null;
  /** `StoryData.date` */
  date?: string | null;
}
