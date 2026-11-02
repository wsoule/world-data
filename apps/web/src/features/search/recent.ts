// Recently opened search results, kept in localStorage so the empty palette can offer them again.
// Every access is wrapped in try/catch: storage can be unavailable (private mode, blocked cookies).

import type { SearchDoc, SearchKind, SearchTarget } from './searchIndex';
import { type EntityType, isEntityType } from '~/data/types';

export interface RecentItem {
  id: string;
  kind: SearchKind;
  type: EntityType | null;
  title: string;
  subtitle: string;
  flag: string | null;
  target: SearchTarget;
}

const KEY = 'world-data:recent-searches';
const MAX = 6;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v != null && !Array.isArray(v);
}

function isTarget(v: unknown): v is SearchTarget {
  if (!isRecord(v)) return false;
  switch (v.kind) {
    case 'place':
    case 'topic':
      return isEntityType(v.type) && typeof v.slug === 'string';
    case 'metric':
      return (
        isEntityType(v.type) &&
        typeof v.id === 'number' &&
        (v.topic === null || typeof v.topic === 'string')
      );
    case 'category':
      return typeof v.id === 'string';
    default:
      return false;
  }
}

/** Validates one stored entry; anything malformed (older formats, hand edits) is dropped. */
function toRecent(v: unknown): RecentItem | null {
  if (!isRecord(v) || !isTarget(v.target)) return null;
  if (typeof v.id !== 'string' || typeof v.title !== 'string') return null;
  return {
    id: v.id,
    kind: v.target.kind,
    type: isEntityType(v.type) ? v.type : null,
    title: v.title,
    subtitle: typeof v.subtitle === 'string' ? v.subtitle : '',
    flag: typeof v.flag === 'string' ? v.flag : null,
    target: v.target,
  };
}

export function readRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(toRecent)
      .filter((r): r is RecentItem => r != null)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function write(items: RecentItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable: recents simply are not kept */
  }
}

/** Moves (or adds) a result to the front of the recent list and returns the new list. */
export function pushRecent(item: RecentItem | SearchDoc): RecentItem[] {
  const entry: RecentItem = {
    id: item.id,
    kind: item.kind,
    type: item.type,
    title: item.title,
    subtitle: item.subtitle,
    flag: item.flag,
    target: item.target,
  };
  const next = [entry, ...readRecent().filter((r) => r.id !== entry.id)].slice(
    0,
    MAX
  );
  write(next);
  return next;
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
