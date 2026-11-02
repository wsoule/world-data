// Internal links for place report cards: the parent place (state or country) and the places
// inside this one (cities and counties in a state, cities in a country). Worked out in the
// profile route's loader, so the links are part of the prerendered HTML and the hydrating
// render without the client loading the other place types' full datasets.

import type { QueryClient } from '@tanstack/react-query';

import { entitiesQuery } from '~/data/api';
import type { Entity, EntityType } from '~/data/types';
import {
  type EntityLists,
  relatedPlaces,
  type RelatedPlaces,
  relatedTypes,
} from '~/features/places/relatedPlaces';

const NONE: RelatedPlaces = { parent: null, children: [] };

/**
 * Loads the entity lists (names and slugs only, not the statistics) of the place types a
 * profile links to, and returns its parent and child places. A list that fails to load leaves
 * its links out rather than failing the whole profile.
 */
export async function loadRelatedPlaces(
  queryClient: QueryClient,
  type: EntityType,
  entity: Entity
): Promise<RelatedPlaces> {
  const types = relatedTypes(type);
  if (types.length === 0) return NONE;
  const lists: EntityLists = {};
  await Promise.all(
    types.map(async (t) => {
      try {
        lists[t] = await queryClient.ensureQueryData(entitiesQuery(t));
      } catch {
        // Leave this type's links out.
      }
    })
  );
  return relatedPlaces(type, entity, lists);
}
