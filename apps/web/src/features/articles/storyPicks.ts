// Which data stories to link from a topic page, a place page and the end of another story. Each
// story charts two statistics (x and y) for one place type, so a topic page links the stories
// that chart its statistics and a place page links stories whose chart includes that place.
// Pure functions over the stories index, covered by test/story-picks.test.ts.

import { PAIR_METRICS, STORY_DEFS } from '~/content/storyDefs';
import type { StorySummary } from '~/content/storyTypes';
import type { EntityType } from '~/data/types';
import { pairHash } from '~/features/topic/related/relatedModel';

type Story = Pick<
  StorySummary,
  'slug' | 'type' | 'kind' | 'cats' | 'r' | 'xId' | 'yId'
>;

/**
 * Every statistic a story can chart: the hand-written stories' two metrics plus the metrics the
 * automatic pair articles are drawn from. A page with none of these has no story to link, which
 * it can know without loading the stories index.
 */
export const STORY_METRICS: ReadonlySet<number> = new Set([
  ...PAIR_METRICS,
  ...STORY_DEFS.flatMap((d) => [d.x, d.y]),
]);

/** Whether any of these statistics can appear in a data story. */
export const mayHaveStories = (metricIds: readonly number[]): boolean =>
  metricIds.some((id) => STORY_METRICS.has(id));

/** Hand-written stories before automatic pair articles, then the strongest link, then A–Z. */
function byQuality(a: Story, b: Story): number {
  if (a.kind !== b.kind) return a.kind === 'flagship' ? -1 : 1;
  const r = Math.abs(b.r) - Math.abs(a.r);
  if (r !== 0) return r;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

const uses = (s: Story, id: number) => s.xId === id || s.yId === id;

/**
 * Stories about this place type that chart one of a topic's statistics, those charting the
 * focused statistic first. `focusOnly` says whether every story listed uses the focused one, so
 * the heading can say "this statistic" rather than "statistics on this page".
 */
export function storiesForTopic<S extends Story>(
  stories: readonly S[],
  type: EntityType,
  metricIds: readonly number[],
  focusId: number | null,
  limit = 4
): { stories: S[]; focusOnly: boolean } {
  const ids = new Set(metricIds);
  const matching = stories.filter(
    (s) => s.type === type && (ids.has(s.xId) || ids.has(s.yId))
  );
  const focused = (s: S) => focusId != null && uses(s, focusId);
  const list = [...matching]
    .sort((a, b) =>
      focused(a) !== focused(b) ? (focused(a) ? -1 : 1) : byQuality(a, b)
    )
    .slice(0, limit);
  return {
    stories: list,
    focusOnly: list.length > 0 && list.every(focused),
  };
}

/** Picks `count` items from a list starting at `seed` (wrapping), so neighbours differ. */
function rotate<T>(list: readonly T[], seed: number, count: number): T[] {
  if (list.length === 0) return [];
  const start = ((seed % list.length) + list.length) % list.length;
  const out: T[] = [];
  for (let k = 0; k < Math.min(count, list.length); k++)
    out.push(list[(start + k) % list.length]);
  return out;
}

/**
 * Up to `limit` stories whose chart includes a place: same place type, and `charted` says the
 * place has both statistics. Half are hand-written stories and half automatic pair articles,
 * each taken in turn starting from `seed` (the place's index), so the places of a type between
 * them link every story rather than all linking the same few.
 */
export function storiesForPlace<S extends Story>(
  stories: readonly S[],
  type: EntityType,
  charted: (s: S) => boolean,
  seed: number,
  limit = 4
): S[] {
  const mine = stories
    .filter((s) => s.type === type && charted(s))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const flagship = mine.filter((s) => s.kind === 'flagship');
  const pairs = mine.filter((s) => s.kind !== 'flagship');
  const wantFlagship = Math.max(Math.ceil(limit / 2), limit - pairs.length);
  const picked = rotate(flagship, seed, wantFlagship);
  picked.push(...rotate(pairs, seed, limit - picked.length));
  return picked;
}

/** Shared x/y statistics, place type and categories between two stories, as one score. */
function closeness(a: Story, b: Story): number {
  const shared = [b.xId, b.yId].filter((id) => uses(a, id)).length;
  const cats = b.cats.filter((c) => a.cats.includes(c)).length;
  return (
    shared * 4 +
    (a.type === b.type ? 3 : 0) +
    cats +
    (b.kind === 'flagship' ? 1 : 0)
  );
}

/**
 * "Further reading" at the end of a story: `count` other stories, closest first (shared
 * statistics, same place type, shared categories, hand-written ones ahead). The next story of the
 * same place type in slug order is always one of them, so every story is linked from at least one
 * other story, not only from the index.
 */
export function furtherReading<S extends Story>(
  stories: readonly S[],
  slug: string,
  count = 3
): S[] {
  const self = stories.find((s) => s.slug === slug);
  if (self == null) return [];
  const sameType = stories
    .filter((s) => s.type === self.type)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const at = sameType.indexOf(self);
  const next =
    sameType.length > 1 ? sameType[(at + 1) % sameType.length] : undefined;
  // Equally close stories are ordered by a hash of the two slugs, so each story's reading list
  // differs instead of every list naming the first stories A–Z.
  const ranked = stories
    .filter((s) => s !== self)
    .map((s) => ({ s, score: closeness(self, s), tie: pairHash(slug, s.slug) }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.tie - b.tie));
  const picked = new Set<S>(next != null ? [next] : []);
  for (const { s } of ranked) {
    if (picked.size >= count) break;
    picked.add(s);
  }
  return ranked.filter(({ s }) => picked.has(s)).map(({ s }) => s);
}
