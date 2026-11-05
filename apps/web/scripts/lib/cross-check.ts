// Checks single cells against the rest of the data. A column that measures the same thing as
// another (its twin) should agree with it place by place; where nearly every place agrees, the
// few that do not are usually a bad cell in one of the two (Mississippi's median household
// income $34,203 against the Census's $56,447). And two places cannot have identical values in
// every year of a long series: one row was copied onto the other (Georgia's average
// temperatures are Florida's, all 47 years). These checks only report; a bad cell is dropped
// by an explicit METRIC_FIXES dropCells entry, checked against the source.

import type { YearSeries } from './year-scale';

/**
 * Pairs of metrics of one type that measure the same thing, from different pages or sources,
 * as [type, metric id, twin id].
 */
export const TWINS: readonly (readonly [string, number, number])[] = [
  ['state', 24419, 900603], // median household income, housing shortage page ~ Census ACS
  ['state', 20903, 15354], // mean annual precipitation, wettest ~ driest states page
  ['state', 20731, 20663], // average dew point, least ~ most humid states page
  ['state', 22393, 15260], // total land area, forested ~ farmland page
  ['country', 23787, 22691], // internet users, Data Reportal ~ countries without internet
  ['country', 19990, 19715], // unintentional gun death rate, two pages
  ['country', 24435, 18564], // maternal mortality, two pages
  ['country', 23123, 900102], // GDP per person at PPP ~ World Bank
  ['country', 14415, 24902], // vision loss, all ~ women
  ['country', 14415, 24903], // vision loss, all ~ men
  ['country', 11381, 12688], // single phase voltage, plug types ~ mains electricity page
  ['country', 11381, 23598], // single phase ~ residential voltage page
];

/** Cells of two twins that disagree, when the rest of the twins agree. */
export interface TwinReport {
  shared: number;
  /** Share of shared places whose values are within 7% of each other. */
  agree: number;
  /** Places more than 25% apart: [place id, value, twin's value]. */
  cells: [string, number, number][];
}

/**
 * Compares two twins' values place by place. When at least `minShared` places have both and at
 * least 80% of them agree within 7%, returns the places more than 25% apart (relative to the
 * larger magnitude); null when the twins do not agree well enough to judge single cells.
 */
export function twinOutliers(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
  minShared = 10
): TwinReport | null {
  const rel: [string, number, number, number][] = [];
  for (const [place, x] of a) {
    const y = b.get(place);
    if (y == null) continue;
    const scale = Math.max(Math.abs(x), Math.abs(y));
    rel.push([place, x, y, scale === 0 ? 0 : Math.abs(x - y) / scale]);
  }
  if (rel.length < minShared) return null;
  const agree = rel.filter((r) => r[3] <= 0.07).length / rel.length;
  if (agree < 0.8) return null;
  return {
    shared: rel.length,
    agree,
    cells: rel.filter((r) => r[3] > 0.25).map(([p, x, y]) => [p, x, y]),
  };
}

/**
 * Groups of places whose rows are identical in every one of at least `minYears` years (and
 * show at least `minDistinct` different values, so a constant series does not count): one row
 * was copied onto the others.
 */
export function copiedRows(
  series: YearSeries,
  minYears = 5,
  minDistinct = 3
): string[][] {
  const rows = new Map<string, [number | '_', number | string][]>();
  for (const [year, store] of series) {
    if (year === '_') continue;
    for (const [place, v] of store) {
      const row = rows.get(place) ?? [];
      row.push([year, v]);
      rows.set(place, row);
    }
  }
  const groups = new Map<string, string[]>();
  for (const [place, row] of rows) {
    if (row.length < minYears) continue;
    if (new Set(row.map((c) => c[1])).size < minDistinct) continue;
    const key = JSON.stringify(
      [...row].sort((x, y) => Number(x[0]) - Number(y[0]))
    );
    const group = groups.get(key) ?? [];
    group.push(place);
    groups.set(key, group);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}
