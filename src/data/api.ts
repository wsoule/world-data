import { queryOptions } from '@tanstack/react-query'
import type { Entity, EntityType, Manifest, Metric, TopicFile, TopicSummary, ValuesFile } from './types'

const BASE = `${import.meta.env.BASE_URL}data`

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`)
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`)
  return (await res.json()) as T
}

// Static files never change during a session.
const forever = { staleTime: Infinity, gcTime: Infinity } as const

export const manifestQuery = queryOptions({
  queryKey: ['manifest'],
  queryFn: () => getJson<Manifest>('manifest.json'),
  ...forever,
})

export const topicsIndexQuery = queryOptions({
  queryKey: ['topics-index'],
  queryFn: () => getJson<TopicSummary[]>('topics.json'),
  ...forever,
})

export const entitiesQuery = (type: EntityType) =>
  queryOptions({
    queryKey: ['entities', type],
    queryFn: () => getJson<Entity[]>(`${type}/entities.json`),
    ...forever,
  })

export const metricsQuery = (type: EntityType) =>
  queryOptions({
    queryKey: ['metrics', type],
    queryFn: () => getJson<Metric[]>(`${type}/metrics.json`),
    ...forever,
  })

export const valuesQuery = (type: EntityType) =>
  queryOptions({
    queryKey: ['values', type],
    queryFn: () => getJson<ValuesFile>(`${type}/values.json`),
    ...forever,
  })

export const topicQuery = (type: EntityType, slug: string) =>
  queryOptions({
    queryKey: ['topic', type, slug],
    queryFn: () => getJson<TopicFile>(`${type}/topics/${slug}.json`),
    ...forever,
  })
