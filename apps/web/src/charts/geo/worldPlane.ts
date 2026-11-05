// The world map's country shapes, projected once at build time (scripts/build-home-maps.ts) so
// the browser only scales them. Projecting world-atlas' 50m countries on the sphere took a
// 230 KB gzip script and a long task of about 0.7 s on a mid-range phone; the projected file is
// about 23 KB gzip and is drawn with geoIdentity, as the US maps are.

/** Where the projected shapes are published, relative to /data. */
export const WORLD_PLANE_PATH = 'maps/world-equalearth.json';

/**
 * public/data/maps/world-equalearth.json: world-atlas countries-50m through geoEqualEarth with
 * the sphere fitted to `frame` (d3's clipping and resampling included), coordinates rounded to
 * whole units (the frame is 800 units wide, under a pixel on the largest world map, about 830 px).
 */
export interface WorldPlaneFile {
  /** The geoEqualEarth scale and translate the shapes were projected with */
  scale: number;
  translate: [number, number];
  /** Bounds of the projected sphere: what the map fits to its plot area, as it fitted the globe */
  frame: [[number, number], [number, number]];
  features: WorldPlaneFeature[];
}

export interface WorldPlaneFeature {
  /** ISO 3166-1 alpha-3, the key countries join on, or null for a shape without one */
  id: string | null;
  name: string;
  /**
   * Polygons, each a list of rings as the projection streamed them; a ring is a flat list of
   * coordinate deltas [x0, y0, x1 - x0, y1 - y0, …], without the closing point
   */
  p: number[][][];
}

/** Delta-encodes one ring of whole-unit points [x0, y0, x1, y1, …]. */
export function encodeRing(points: readonly number[]): number[] {
  const out: number[] = [];
  let px = 0;
  let py = 0;
  for (let i = 0; i + 1 < points.length; i += 2) {
    out.push(points[i] - px, points[i + 1] - py);
    px = points[i];
    py = points[i + 1];
  }
  return out;
}

/** Decodes a delta-encoded ring into GeoJSON positions, closed (the first point repeated). */
export function decodeRing(deltas: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < deltas.length; i += 2) {
    x += deltas[i];
    y += deltas[i + 1];
    out.push([x, y]);
  }
  const first = out[0];
  if (first != null) out.push([first[0], first[1]]);
  return out;
}
