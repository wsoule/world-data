// Picks the head-to-head matchups that get their own prerendered page (src/features/vs/pairs.ts
// explains why) and writes them to public/data/pairs.json. Every pair is kept in canonical slug
// order and the lists are sorted, so a rebuild only changes the file when the data changes.
//
// Run by scripts/build-data.ts, or alone with `bun scripts/build-pairs.ts` from apps/web.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Dataset } from '../src/data/dataset';
import type {
  Entity,
  Manifest,
  Metric,
  TopicSummary,
  ValuesFile,
} from '../src/data/types';
import { similarityBasisFor } from '../src/features/places/datasetFacts';
import { byKeys, similarPlaces } from '../src/features/places/profileModel';
import {
  PAIR_RULES,
  pairOrder,
  PAIRS_PATH,
  type PairsFile,
} from '../src/features/vs/pairs';

/** Indexes of `entities`, most populous first (places without a population last). */
function byPopulation(entities: readonly Entity[]): number[] {
  return entities
    .map((_, i) => i)
    .sort((a, b) =>
      byKeys((entities[b].pop ?? -1) - (entities[a].pop ?? -1), a - b)
    );
}

/** Writes public/data/pairs.json from the dataset in `dataDir`; returns the pair count. */
export async function buildPairs(dataDir: string): Promise<number> {
  const read = async <T>(file: string): Promise<T> =>
    JSON.parse(await readFile(path.join(dataDir, file), 'utf8')) as T;
  const manifest = await read<Manifest>('manifest.json');
  const topics = await read<TopicSummary[]>('topics.json');
  const out: PairsFile = {};
  let count = 0;
  for (const info of manifest.types) {
    const rule = PAIR_RULES[info.id];
    if (rule == null) continue;
    const [entities, metrics, values] = await Promise.all([
      read<Entity[]>(`${info.id}/entities.json`),
      read<Metric[]>(`${info.id}/metrics.json`),
      read<ValuesFile>(`${info.id}/values.json`),
    ]);
    const full = new Dataset(info, entities, metrics, values, topics);
    const order = byPopulation(entities);
    const keys = new Set<string>();
    const add = (i: number, j: number) => {
      if (i !== j)
        keys.add(pairOrder(entities[i].slug, entities[j].slug).join(' '));
    };
    const top = order.slice(0, rule.allPairsTop);
    for (const [k, i] of top.entries())
      for (const j of top.slice(k + 1)) add(i, j);
    if (rule.similar > 0) {
      const basis = similarityBasisFor(full);
      for (const i of order.slice(0, rule.similarTop))
        for (const s of similarPlaces(basis, i, entities.length, {
          limit: rule.similar,
        }))
          add(i, s.index);
    }
    out[info.id] = [...keys]
      .sort()
      .map((k) => k.split(' ') as [string, string]);
    count += keys.size;
  }
  await writeFile(path.join(dataDir, PAIRS_PATH), `${JSON.stringify(out)}\n`);
  return count;
}

if (import.meta.main)
  console.log(`${await buildPairs(path.resolve('public/data'))} matchup pairs`);
