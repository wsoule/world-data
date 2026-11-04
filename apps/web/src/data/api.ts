import { queryOptions } from '@tanstack/react-query';
import { createIsomorphicFn } from '@tanstack/react-start';

import type {
  Entity,
  EntityType,
  Manifest,
  Metric,
  TopicFile,
  TopicSummary,
  ValuesFile,
} from './types';
import type { HomeMapsFile, MapShapes } from '~/content/mapTypes';
import type { StoryData, StorySummary } from '~/content/storyTypes';

const BASE = `${import.meta.env.BASE_URL}data`;

/** Parsed data files kept for the life of the server process (prerender reuses them across pages). */
const serverCache = new Map<string, Promise<unknown>>();

/**
 * Loads a dataset file. In the browser it is fetched from /data; during server
 * rendering and prerendering it is read from public/data on disk, so no HTTP
 * server is needed and large files are parsed once per build.
 */
const loadJson = createIsomorphicFn()
  .server((path: string): Promise<unknown> => {
    let hit = serverCache.get(path);
    if (hit === undefined) {
      hit = (async () => {
        const { readFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const file = join(process.cwd(), 'public', 'data', path);
        return JSON.parse(await readFile(file, 'utf8')) as unknown;
      })();
      serverCache.set(path, hit);
    }
    return hit;
  })
  .client(async (path: string): Promise<unknown> => {
    const res = await fetch(`${BASE}/${path}`);
    if (!res.ok) throw new DataFileError(path, res.status);
    return (await res.json()) as unknown;
  });

/** A dataset file the server answered with an error status. */
export class DataFileError extends Error {
  constructor(
    readonly path: string,
    readonly status: number
  ) {
    super(`Failed to load ${path} (${status})`);
    this.name = 'DataFileError';
  }
}

/**
 * React Query retry policy: up to three retries for network failures and
 * server errors, none for 4xx answers. A missing file (an unknown topic slug)
 * will not appear on retry, and retrying would delay the 404 view by seconds.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (
    error instanceof DataFileError &&
    error.status >= 400 &&
    error.status < 500
  )
    return false;
  return failureCount < 3;
}

/** One dataset file, parsed: read from disk on the server, fetched from /data in the browser. */
export async function getJson<T>(path: string): Promise<T> {
  return (await loadJson(path)) as T;
}

/** URL a dataset file is served at, for preload links. */
export function dataUrl(path: string): string {
  return `${BASE}/${path}`;
}

/**
 * <link rel="preload"> tags for dataset files a page fetches while hydrating, so the browser
 * downloads them alongside the scripts instead of after them. `crossOrigin: 'anonymous'` gives
 * the preload the same mode and credentials as `fetch()`, so the fetch reuses it. Low priority
 * leaves the stylesheet, which holds up the first paint, to load first.
 */
export function preloadData(paths: readonly string[]) {
  return paths.map((path) => ({
    rel: 'preload',
    as: 'fetch',
    href: dataUrl(path),
    crossOrigin: 'anonymous' as const,
    fetchPriority: 'low' as const,
  }));
}

// Static files never change during a session.
const forever = { staleTime: Infinity, gcTime: Infinity } as const;

export const manifestQuery = queryOptions({
  queryKey: ['manifest'],
  queryFn: () => getJson<Manifest>('manifest.json'),
  ...forever,
});

export const topicsIndexQuery = queryOptions({
  queryKey: ['topics-index'],
  queryFn: () => getJson<TopicSummary[]>('topics.json'),
  ...forever,
});

export const entitiesQuery = (type: EntityType) =>
  queryOptions({
    queryKey: ['entities', type],
    queryFn: () => getJson<Entity[]>(`${type}/entities.json`),
    ...forever,
  });

export const metricsQuery = (type: EntityType) =>
  queryOptions({
    queryKey: ['metrics', type],
    queryFn: () => getJson<Metric[]>(`${type}/metrics.json`),
    ...forever,
  });

export const valuesQuery = (type: EntityType) =>
  queryOptions({
    queryKey: ['values', type],
    queryFn: () => getJson<ValuesFile>(`${type}/values.json`),
    ...forever,
  });

export const topicQuery = (type: EntityType, slug: string) =>
  queryOptions({
    queryKey: ['topic', type, slug],
    queryFn: () => getJson<TopicFile>(`${type}/topics/${slug}.json`),
    ...forever,
  });

/** Every data story with its card thumbnail (public/data/stories/index.json). */
export const storiesIndexQuery = queryOptions({
  queryKey: ['stories'],
  queryFn: () => getJson<StorySummary[]>('stories/index.json'),
  ...forever,
});

/** One data story's computed numbers. */
export const storyQuery = (slug: string) =>
  queryOptions({
    queryKey: ['story', slug],
    queryFn: () => getJson<StoryData>(`stories/${slug}.json`),
    ...forever,
  });

/** The home page's pre-drawn maps (public/data/maps/home.json). */
export const homeMapsQuery = queryOptions({
  queryKey: ['home-maps'],
  queryFn: () => getJson<HomeMapsFile>('maps/home.json'),
  ...forever,
});

/** One geography's pre-projected shapes for the home maps. */
export const mapShapesQuery = (geo: MapShapes['geo']) =>
  queryOptions({
    queryKey: ['map-shapes', geo],
    queryFn: () => getJson<MapShapes>(`maps/shapes-${geo}.json`),
    ...forever,
  });
