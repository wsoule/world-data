// URL state for the places list (/places/$type): the search text, the group chips and the
// sort column, so a filtered, sorted list survives Back from a place, a reload and sharing.

/** Search params of /places/$type. Every key is optional; defaults stay out of the URL. */
export interface PlacesSearch {
  /** Text filter */
  q?: string;
  /** Selected groups (continents, census regions or countries) */
  g?: string[];
  /** Sort column, prefixed with "-" for descending ("-density"); default "-pop" */
  sort?: string;
}

/** Sortable columns of the places table. */
export const PLACE_SORT_COLUMNS = [
  'name',
  'group',
  'pop',
  'density',
  'growth',
  'metrics',
] as const;

export type PlaceSortColumn = (typeof PLACE_SORT_COLUMNS)[number];

export interface PlaceSort {
  id: PlaceSortColumn;
  desc: boolean;
}

/** The list's default order: most populous first. */
export const DEFAULT_PLACE_SORT: PlaceSort = { id: 'pop', desc: true };

const isSortColumn = (v: string): v is PlaceSortColumn =>
  (PLACE_SORT_COLUMNS as readonly string[]).includes(v);

/** "-density" → density, descending; anything unknown → the default sort. */
export function parsePlaceSort(raw: string | undefined): PlaceSort {
  if (raw == null || raw === '') return DEFAULT_PLACE_SORT;
  const desc = raw.startsWith('-');
  const id = desc ? raw.slice(1) : raw;
  return isSortColumn(id) ? { id, desc } : DEFAULT_PLACE_SORT;
}

/** Inverse of `parsePlaceSort`; the default sort maps to `undefined` to keep the URL clean. */
export function formatPlaceSort(sort: PlaceSort): string | undefined {
  if (
    sort.id === DEFAULT_PLACE_SORT.id &&
    sort.desc === DEFAULT_PLACE_SORT.desc
  )
    return undefined;
  return `${sort.desc ? '-' : ''}${sort.id}`;
}

/**
 * validateSearch for /places/$type: keeps a non-empty text query, a de-duplicated list of
 * group names (a single string is accepted as one group) and a known sort column.
 */
export function parsePlacesSearch(raw: Record<string, unknown>): PlacesSearch {
  const out: PlacesSearch = {};
  if (typeof raw.q === 'string' && raw.q.trim() !== '') out.q = raw.q;
  const groups = Array.isArray(raw.g)
    ? raw.g.filter((x): x is string => typeof x === 'string' && x !== '')
    : typeof raw.g === 'string' && raw.g !== ''
      ? [raw.g]
      : [];
  if (groups.length > 0) out.g = [...new Set(groups)];
  if (typeof raw.sort === 'string') {
    const sort = formatPlaceSort(parsePlaceSort(raw.sort));
    if (sort != null) out.sort = sort;
  }
  return out;
}
