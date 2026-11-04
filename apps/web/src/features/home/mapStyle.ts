// Shared by the home maps: the sequential colour scale and the id of each pre-drawn shape.

import type { MapShapes } from '~/content/mapTypes';

/** Light to dark indigo: seven equal-count bands of a statistic. */
export const SEQ = [
  '#e0e7ff',
  '#c7d2fe',
  '#a5b4fc',
  '#818cf8',
  '#6366f1',
  '#4f46e5',
  '#3730a3',
];

/** DOM id of a geography's shape, defined once on the page and reused by every map. */
export const shapeId = (geo: MapShapes['geo'], id: string) =>
  `map-${geo}-${id}`;
