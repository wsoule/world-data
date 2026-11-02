import { createFileRoute, notFound } from '@tanstack/react-router'
import { topicQuery } from '~/data/api'
import { loadDataset } from '~/data/dataset'
import { isEntityType } from '~/data/types'
import { TopicPage } from '~/features/topic/TopicPage'

export interface TopicSearch {
  /** Focused metric id */
  m?: number
  /** Year for the focused metric */
  year?: number
}

export const Route = createFileRoute('/topics/$type/$slug')({
  validateSearch: (raw: Record<string, unknown>): TopicSearch => ({
    m: Number.isFinite(Number(raw.m)) && raw.m !== undefined && raw.m !== '' ? Number(raw.m) : undefined,
    year: Number.isFinite(Number(raw.year)) && raw.year !== undefined && raw.year !== '' ? Number(raw.year) : undefined,
  }),
  loader: async ({ context, params }) => {
    if (!isEntityType(params.type)) throw notFound()
    const [, topic] = await Promise.all([
      loadDataset(context.queryClient, params.type),
      context.queryClient.ensureQueryData(topicQuery(params.type, params.slug)).catch(() => {
        throw notFound()
      }),
    ])
    return { title: topic.title }
  },
  component: TopicPage,
})
