import { createFileRoute, notFound } from '@tanstack/react-router'
import { loadDataset } from '~/data/dataset'
import { isEntityType } from '~/data/types'
import { PlacesPage } from '~/features/places/PlacesPage'

export const Route = createFileRoute('/places/$type/')({
  loader: async ({ context, params }) => {
    if (!isEntityType(params.type)) throw notFound()
    await loadDataset(context.queryClient, params.type)
  },
  component: PlacesPage,
})
