import { createFileRoute, notFound } from '@tanstack/react-router';

import { loadDataset } from '~/data/dataset';
import { isEntityType } from '~/data/types';
import { PlaceProfilePage } from '~/features/places/PlaceProfilePage';

export const Route = createFileRoute('/places/$type/$slug')({
  loader: async ({ context, params }) => {
    if (!isEntityType(params.type)) throw notFound();
    const ds = await loadDataset(context.queryClient, params.type);
    const idx = ds.entityBySlug.get(params.slug);
    if (idx == null) throw notFound();
    return { name: ds.entities[idx].name };
  },
  component: PlaceProfilePage,
});
