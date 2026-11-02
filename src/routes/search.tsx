import { createFileRoute } from '@tanstack/react-router'
import { SearchPage } from '~/features/search/SearchPage'

export interface SearchPageSearch {
  q?: string
}

export const Route = createFileRoute('/search')({
  validateSearch: (raw: Record<string, unknown>): SearchPageSearch => ({ q: typeof raw.q === 'string' && raw.q ? raw.q : undefined }),
  component: SearchPage,
})
