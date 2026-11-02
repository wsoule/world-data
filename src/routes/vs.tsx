import { createFileRoute } from '@tanstack/react-router'
import { loadDataset } from '~/data/dataset'
import { isEntityType, type EntityType } from '~/data/types'
import { VersusPage } from '~/features/vs/VersusPage'

export interface VersusSearch {
  type: EntityType
  /** entity ids being compared */
  e: string[]
  /** optional category filter */
  cat?: string
}

export const Route = createFileRoute('/vs')({
  validateSearch: (raw: Record<string, unknown>): VersusSearch => ({
    type: isEntityType(raw.type) ? raw.type : 'state',
    e: Array.isArray(raw.e) ? raw.e.map(String) : typeof raw.e === 'string' && raw.e ? raw.e.split(',') : [],
    cat: typeof raw.cat === 'string' && raw.cat ? raw.cat : undefined,
  }),
  loaderDeps: ({ search }) => ({ type: search.type }),
  loader: ({ context, deps }) => loadDataset(context.queryClient, deps.type).then(() => null),
  component: VersusPage,
})
