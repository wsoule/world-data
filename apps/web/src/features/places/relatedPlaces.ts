// Links between place types for a profile: the state a US city or county is in, the country
// of a world city, and the cities and counties inside a state or country. Pure, so it runs in
// route loaders (and on the server while prerendering) and in tests.

import type { Entity, EntityType } from '~/data/types';

/** One linked place: enough to render a link to its profile. */
export interface PlaceLink {
  name: string;
  slug: string;
}

/** A titled list of places inside the profiled one, largest first. */
export interface PlaceGroup {
  type: EntityType;
  title: string;
  places: PlaceLink[];
}

export interface RelatedPlaces {
  /** The state of a US city or county, or the country of a world city */
  parent: (PlaceLink & { type: EntityType }) | null;
  /** Cities and counties in a state, world cities in a country */
  children: PlaceGroup[];
}

/** Entity lists by type; only the types a profile links to need to be present. */
export type EntityLists = Partial<Record<EntityType, readonly Entity[]>>;

/** The parent type each place type links up to, if any. */
const PARENT_TYPE: Partial<Record<EntityType, EntityType>> = {
  city: 'state',
  county: 'state',
  'world-city': 'country',
};

/** The child types listed on a profile, with their list titles. */
const CHILD_TYPES: Partial<
  Record<EntityType, { type: EntityType; title: (name: string) => string }[]>
> = {
  state: [
    { type: 'city', title: (name) => `Cities in ${name}` },
    { type: 'county', title: (name) => `Counties in ${name}` },
  ],
  country: [{ type: 'world-city', title: (name) => `Cities in ${name}` }],
};

/** Place types whose profiles link to other types, so loaders know which lists to fetch. */
export function relatedTypes(type: EntityType): EntityType[] {
  const parent = PARENT_TYPE[type];
  return [
    ...(parent == null ? [] : [parent]),
    ...(CHILD_TYPES[type] ?? []).map((c) => c.type),
  ];
}

/**
 * The name a child place is filed under in its parent: the state name (`sub`) for US cities
 * and counties, the country name (`group`) for world cities.
 */
function parentName(e: Entity, type: EntityType): string | null {
  return type === 'world-city' ? e.group : (e.sub ?? null);
}

const link = (e: Entity): PlaceLink => ({ name: e.name, slug: e.slug });

/**
 * Parent and child places of `entity`. A child belongs to a parent when it is filed under the
 * parent's name, or, when the names differ, when both carry the same flag code (state code for
 * US places, ISO2 for countries). Lists keep the dataset order, which is largest first.
 */
export function relatedPlaces(
  type: EntityType,
  entity: Entity,
  lists: EntityLists
): RelatedPlaces {
  let parent: RelatedPlaces['parent'] = null;
  const parentType = PARENT_TYPE[type];
  const parents = parentType == null ? undefined : lists[parentType];
  if (parentType != null && parents != null) {
    const name = parentName(entity, type);
    const match =
      parents.find((p) => name != null && p.name === name) ??
      parents.find((p) => entity.flag != null && p.flag === entity.flag);
    if (match != null) parent = { type: parentType, ...link(match) };
  }

  const children: PlaceGroup[] = [];
  for (const child of CHILD_TYPES[type] ?? []) {
    const list = lists[child.type];
    if (list == null) continue;
    let places = list.filter((e) => parentName(e, child.type) === entity.name);
    if (places.length === 0 && entity.flag != null)
      places = list.filter((e) => e.flag === entity.flag);
    if (places.length > 0)
      children.push({
        type: child.type,
        title: child.title(entity.name),
        places: places.map(link),
      });
  }
  return { parent, children };
}

/**
 * A child place's name without the state suffix its list title already gives: "Los Angeles
 * County, CA" → "Los Angeles County" under "Counties in California".
 */
export function shortPlaceName(name: string): string {
  return name.replace(/, [A-Z]{2}$/, '');
}
