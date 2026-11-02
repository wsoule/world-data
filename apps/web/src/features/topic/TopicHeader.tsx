import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BookOpen, CalendarClock, ExternalLink, Link2 } from 'lucide-react';

import { placeNoun } from './model';
import { TYPE_ICONS } from '~/components/TypeTabs';
import { Badge } from '~/components/ui';
import { manifestQuery, topicsIndexQuery } from '~/data/api';
import type { Dataset } from '~/data/dataset';
import type { TopicFile } from '~/data/types';
import { formatInt } from '~/lib/format';

/** Related topics shown before the rest collapse behind "+N more". */
const RELATED_PREVIEW = 6;

/** "2026-10-28" → "Oct 28, 2026" (read as a calendar date, not shifted by time zone). */
function formatDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Latest "updated" date of the topic, falling back to its newest metric update. */
function updatedOf(topic: TopicFile, dataset: Dataset): string | null {
  if (topic.updated != null) return topic.updated;
  let latest: string | null = null;
  for (const id of topic.metrics) {
    const u = dataset.metric(id)?.updated;
    if (u != null && (latest == null || u > latest)) latest = u;
  }
  return latest;
}

/**
 * Title block of a topic page: type and categories, freshness, coverage, the original page and
 * cited sources, and links to related topics.
 */
export function TopicHeader({
  topic,
  dataset,
}: {
  topic: TopicFile;
  dataset: Dataset;
}) {
  const { data: manifest } = useSuspenseQuery(manifestQuery);
  const { data: index } = useSuspenseQuery(topicsIndexQuery);
  const TypeIcon = TYPE_ICONS[topic.type];
  const updated = updatedOf(topic, dataset);
  const catLabel = new Map(manifest.categories.map((c) => [c.id, c.label]));
  const typeLabel = new Map(manifest.types.map((t) => [t.id, t.label]));
  const related = topic.related.flatMap((r) => {
    const hit = index.find((t) => t.type === r.type && t.slug === r.slug);
    return hit != null ? [hit] : [];
  });
  const places = topic.entities.length;

  return (
    <header className="space-y-3">
      <div>
        <div className="text-accent-600 dark:text-accent-300 mb-1 inline-flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <TypeIcon className="size-3.5" aria-hidden />
          {dataset.type.singular} rankings
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          {topic.title}
        </h1>
      </div>

      <div className="text-muted flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {topic.cats.map((c) => (
          <Link
            key={c}
            to="/categories/$category"
            params={{ category: c }}
            search={{ type: topic.type }}
            className="rounded-full"
          >
            <Badge tone="accent" className="hover:ring-accent-300 hover:ring-1">
              {catLabel.get(c) ?? c}
            </Badge>
          </Link>
        ))}
        <span className="tabular">
          {formatInt(places)} {placeNoun(topic.type, places)} ·{' '}
          {formatInt(topic.metrics.length)}{' '}
          {topic.metrics.length === 1 ? 'metric' : 'metrics'}
        </span>
        {updated != null ? (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5" aria-hidden />
            Updated {formatDay(updated)}
          </span>
        ) : null}
        <a
          href={topic.url}
          target="_blank"
          rel="noreferrer"
          className="hover:text-app inline-flex items-center gap-1 underline-offset-2 hover:underline"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          Original page
        </a>
        {topic.sources.length > 0 ? (
          <details className="group relative">
            <summary className="hover:text-app inline-flex cursor-pointer list-none items-center gap-1 underline-offset-2 select-none hover:underline [&::-webkit-details-marker]:hidden">
              <BookOpen className="size-3.5" aria-hidden />
              {topic.sources.length === 1
                ? '1 source'
                : `${topic.sources.length} sources`}
            </summary>
            <ul className="border-app bg-surface absolute top-full left-0 z-30 mt-2 w-[min(22rem,80vw)] space-y-1.5 rounded-xl border p-3 text-sm shadow-lg">
              {topic.sources.map((s) => (
                <li key={s.url} className="min-w-0">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-app hover:text-accent-600 dark:hover:text-accent-300 flex items-start gap-1.5"
                  >
                    <ExternalLink
                      className="text-muted mt-0.5 size-3.5 shrink-0"
                      aria-hidden
                    />
                    <span className="min-w-0 break-words">
                      {s.name !== '' ? s.name : s.url}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {related.length > 0 ? (
        <nav
          aria-label="Related topics"
          className="flex flex-wrap items-center gap-1.5 text-sm"
        >
          <span className="text-muted mr-1 inline-flex items-center gap-1 text-xs">
            <Link2 className="size-3.5" aria-hidden />
            Related
          </span>
          {related.slice(0, RELATED_PREVIEW).map((t) => (
            <Link
              key={`${t.type}/${t.slug}`}
              to="/topics/$type/$slug"
              params={{ type: t.type, slug: t.slug }}
              className="border-app bg-surface hover:border-accent-300 hover:text-accent-700 dark:hover:text-accent-200 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs"
            >
              {t.title}
              {t.type !== topic.type ? (
                <span className="text-muted">
                  · {typeLabel.get(t.type) ?? t.type}
                </span>
              ) : null}
            </Link>
          ))}
          {related.length > RELATED_PREVIEW ? (
            <span className="text-muted text-xs">
              +{related.length - RELATED_PREVIEW} more
            </span>
          ) : null}
        </nav>
      ) : null}
    </header>
  );
}
