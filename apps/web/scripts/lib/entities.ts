// Turns table rows into places (countries, states, cities, counties) with a
// stable id per entity type.

import type { EntityType } from '../../src/data/types';
import { decodeEntities } from './astro';
import { toNumberOrNull } from './clean';
import { STATE_REGIONS } from './reference';

export type Row = Record<string, unknown>;

/** A place as first seen in a row, before population/attributes are merged. */
export interface RowEntity {
  id: string;
  name: string;
  flag: string | null;
  group: string | null;
  sub?: string | null;
  lat?: number | null;
  lng?: number | null;
  fips?: string | null;
}

/** Repeated per-row attributes that become synthetic metrics. */
export interface BaseAttributes {
  density: number | null;
  growth: number | null;
  growth2020: number | null;
  area: number | null;
}

/** Name → id fallbacks, learned from rows that carry both, for rows that only have a name. */
export const nameIndex: Record<'country' | 'state', Map<string, string>> = {
  country: new Map(),
  state: new Map(),
};

const AGGREGATE_NAMES =
  /^(total|totals|world|global|average|avg|median|sum|overall|(united states|u\.s\.|us) (total|average)|national|all states|all countries|other|others)$/i;

const LABEL_FIELD: Record<EntityType, string> = {
  country: 'country',
  state: 'state',
  city: 'city',
  'world-city': 'worldCity',
  county: 'county',
};

/** Trimmed, entity-decoded string or null. */
function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = decodeEntities(v).trim();
  return s === '' ? null : s;
}

/** First element when the source stores a list (e.g. a transcontinental country). */
function first(v: unknown): string | null {
  return Array.isArray(v) ? str(v[0]) : str(v);
}

/** Numeric or string id (FIPS codes arrive as either) as text. */
const idText = (v: unknown): string | null =>
  typeof v === 'number' || typeof v === 'string' ? String(v) : null;

const lower = (s: string | null): string | null =>
  s == null ? null : s.toLowerCase();

/**
 * Identifies the place a row describes, or returns null for aggregate rows
 * ("Total", "United States" in a state table) and rows without identity.
 */
export function entityOf(type: EntityType, row: Row): RowEntity | null {
  if (row.isTotal === true || row.isAverage === true || row.isSummary === true)
    return null;
  const label = str(row[LABEL_FIELD[type]]) ?? str(row.name);
  if (label != null && AGGREGATE_NAMES.test(label)) return null;
  if (type === 'state') {
    if (label != null && /^united states$/i.test(label)) return null;
    if (row.code === 'US' || row.code === 'USA') return null;
  }
  switch (type) {
    case 'country': {
      const name = str(row.country);
      let id =
        typeof row.cca3 === 'string' && /^[A-Z]{3}$/.test(row.cca3)
          ? row.cca3
          : null;
      if (id == null && name != null)
        id = nameIndex.country.get(name.toLowerCase()) ?? null;
      if (id == null || name == null) return null;
      nameIndex.country.set(name.toLowerCase(), id);
      return {
        id,
        name,
        flag: lower(str(row.cca2) ?? str(row.flagCode)),
        group: first(row.continent),
        sub: first(row.subregion),
      };
    }
    case 'state': {
      const name = str(row.state);
      let id =
        typeof row.code === 'string' && /^[A-Z]{2}$/.test(row.code)
          ? row.code
          : null;
      if (id == null && name != null)
        id = nameIndex.state.get(name.toLowerCase()) ?? null;
      if (id == null || name == null) return null;
      nameIndex.state.set(name.toLowerCase(), id);
      const fips = idText(row.fips)?.padStart(2, '0') ?? null;
      return {
        id,
        name,
        flag: id.toLowerCase(),
        group: STATE_REGIONS[id] ?? 'Other',
        fips,
      };
    }
    case 'city': {
      const slug = str(row.slug);
      const city = str(row.city);
      if (slug == null || city == null) return null;
      const code = str(row.code) ?? str(row.stateCode);
      return {
        id: slug,
        name: code == null ? city : `${city}, ${code}`,
        flag: lower(code),
        group: (code == null ? null : STATE_REGIONS[code]) ?? str(row.state),
        sub: str(row.state),
        lat: toNumberOrNull(row.lat ?? row.latitude),
        lng: toNumberOrNull(row.lng ?? row.longitude),
      };
    }
    case 'world-city': {
      const slug = str(row.slug);
      const name = str(row.worldCity) ?? str(row.city);
      if (slug == null || name == null) return null;
      return {
        id: slug,
        name,
        flag: lower(str(row.cca2) ?? str(row.flagCode)),
        group: str(row.country),
        sub: str(row.state),
        lat: toNumberOrNull(row.latitude ?? row.lat),
        lng: toNumberOrNull(row.longitude ?? row.lng),
      };
    }
    case 'county': {
      const fips = idText(row.fips)?.padStart(5, '0');
      if (fips == null) return null;
      const code = str(row.stateCode) ?? str(row.code);
      const county = str(row.county) ?? str(row.name);
      if (county == null) return null;
      return {
        id: fips,
        name: code == null ? county : `${county}, ${code}`,
        flag: lower(code),
        group: code == null ? null : (STATE_REGIONS[code] ?? null),
        sub: str(row.state),
      };
    }
  }
}

const finite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Density, growth and area as the row reports them (units differ by type). */
export function baseAttributes(type: EntityType, row: Row): BaseAttributes {
  return {
    density:
      finite(row.densityMi) ??
      (type === 'country' ? finite(row.density) : null),
    growth: finite(row.growthRate) ?? finite(row.growth),
    growth2020: finite(row.growthSince2020),
    area: type === 'country' ? finite(row.area) : finite(row.areaMi),
  };
}

/** The most recent `popYYYY` field, else `population`. */
export function populationOf(row: Row): number | null {
  let best: number | null = null;
  let bestYear = -1;
  for (const [k, v] of Object.entries(row)) {
    const m = /^pop(\d{4})$/.exec(k);
    if (m?.[1] != null && typeof v === 'number' && Number(m[1]) > bestYear) {
      bestYear = Number(m[1]);
      best = v;
    }
  }
  return best ?? finite(row.population);
}
