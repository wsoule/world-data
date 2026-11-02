// Builds a SearchIndex from the committed dataset in public/data, the same way the app's loader
// does, so search tests exercise real names, labels and topic titles.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Entity, Manifest, Metric, TopicSummary } from '../src/data/types';
import {
  featuredMetricIds,
  featuredTopicKeys,
} from '../src/features/home/presets';
import {
  categoryDocs,
  categoryLabelMap,
  metricDocs,
  placeDocs,
  SearchIndex,
  topicDocs,
  topicTitleMap,
} from '../src/features/search/searchIndex';

const DATA = join(import.meta.dir, '..', 'public', 'data');

function read<T>(path: string): T {
  return JSON.parse(readFileSync(join(DATA, path), 'utf8')) as T;
}

let cached: SearchIndex | null = null;

export function loadFullIndex(): SearchIndex {
  if (cached != null) return cached;
  const manifest = read<Manifest>('manifest.json');
  const topics = read<TopicSummary[]>('topics.json');
  const index = new SearchIndex();
  const titles = topicTitleMap(topics);
  const cats = categoryLabelMap(manifest);
  index.add('categories', categoryDocs(manifest));
  index.add(
    'topics',
    topicDocs(topics, manifest, { featured: featuredTopicKeys() })
  );
  for (const info of manifest.types) {
    index.add(
      `places:${info.id}`,
      placeDocs(info, read<Entity[]>(`${info.id}/entities.json`))
    );
    index.add(
      `metrics:${info.id}`,
      metricDocs(
        info,
        read<Metric[]>(`${info.id}/metrics.json`),
        titles,
        cats,
        {
          featured: featuredMetricIds(info.id),
        }
      )
    );
  }
  cached = index;
  return index;
}
