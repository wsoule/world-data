import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  BookOpen,
  CalendarClock,
  DatabaseZap,
  ExternalLink,
  Link2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

import { placeNoun } from './model';
import { TYPE_ICONS } from '~/components/TypeTabs';
import { Badge } from '~/components/ui';
import { manifestQuery } from '~/data/api';
import type { Dataset } from '~/data/dataset';
import type { TopicRef } from '~/data/topicPage';
import type { TopicFile } from '~/data/types';
import { formatInt } from '~/lib/format';
import { shownMetrics } from '~/seo/content';
import { canonicalTopicSlug } from '~/seo/indexing';
import { formatDay, sourceTitle } from '~/seo/topic-content';
import { SITE } from '~/site';

/** Related topics shown before the rest collapse behind "+N more". */
const RELATED_PREVIEW = 6;

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
 * "N sources" disclosure listing a topic's cited sources. It stays a native <details> so the links
 * are in the prerendered HTML, and adds what <details> lacks as a dropdown: it closes on a click
 * outside it or on Escape. The list sits at z-50 like the other pickers, above the sticky focus
 * bar and table headers (z-30) that follow it on the page.
 */
function SourcesMenu({ sources }: { sources: TopicFile['sources'] }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = ref.current;
      if (
        el != null &&
        el.open &&
        e.target instanceof Node &&
        !el.contains(e.target)
      )
        el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (e.key !== 'Escape' || el == null || !el.open) return;
      el.open = false;
      el.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <details ref={ref} className="group relative">
      <summary className="hover:text-app inline-flex cursor-pointer list-none items-center gap-1 underline-offset-2 select-none hover:underline [&::-webkit-details-marker]:hidden">
        <BookOpen className="size-3.5" aria-hidden />
        {sources.length === 1 ? '1 source' : `${sources.length} sources`}
      </summary>
      <ul className="border-app bg-surface absolute top-full left-0 z-50 mt-2 w-[min(22rem,80vw)] space-y-1.5 rounded-xl border p-3 text-sm shadow-lg">
        {sources.map((s) => (
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
  );
}

/**
 * Attribution of a topic Rankodex built from a primary source (it has no original page on the
 * ranking site): "Rankodex built this from <dataset> (<agency>)", each source linked.
 */
function BuiltFrom({ sources }: { sources: TopicFile['sources'] }) {
  const named = sources.filter((s) => s.name !== '');
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <DatabaseZap className="size-3.5 shrink-0" aria-hidden />
      {SITE.name} built this from{' '}
      {named.length === 0
        ? 'primary sources'
        : named.map((s, k) => (
            <span key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-app underline underline-offset-2"
              >
                {sourceTitle(s.name)}
              </a>
              {k < named.length - 2
                ? ', '
                : k === named.length - 2
                  ? ' and '
                  : ''}
            </span>
          ))}
    </span>
  );
}

/**
 * Title block of a topic page: type and categories, the answer-first summary, freshness,
 * coverage, the original page and cited sources, and links to related topics.
 */
export function TopicHeader({
  topic,
  dataset,
  summary,
  topics,
}: {
  topic: TopicFile;
  dataset: Dataset;
  /** One or two sentences answering the page's main question (top, bottom, runner-ups) */
  summary: string;
  /** Topics the page names (its data slice's `topics`), where related pages are looked up */
  topics: readonly TopicRef[];
}) {
  const { data: manifest } = useSuspenseQuery(manifestQuery);
  const TypeIcon = TYPE_ICONS[topic.type];
  const updated = updatedOf(topic, dataset);
  const catLabel = new Map(manifest.categories.map((c) => [c.id, c.label]));
  const typeLabel = new Map(manifest.types.map((t) => [t.id, t.label]));
  // The source's related pages, minus thin (noindex) ones and aliases of another topic, so
  // the header links only pages search engines are asked to index.
  const related = topic.related.flatMap((r) => {
    const hit = topics.find((t) => t.type === r.type && t.slug === r.slug);
    return hit != null &&
      hit.noindex !== true &&
      canonicalTopicSlug(hit.type, hit.slug) === hit.slug
      ? [hit]
      : [];
  });
  const places = topic.entities.length;
  const metricCount = shownMetrics(topic, dataset).length;

  return (
    <header className="space-y-3">
      <div>
        <div className="text-accent-600 dark:text-accent-300 mb-1 inline-flex items-center gap-1.5 text-xs font-medium">
          <TypeIcon className="size-3.5" aria-hidden />
          {dataset.type.singular} rankings
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          {topic.title}
        </h1>
        <p className="mt-2 max-w-3xl text-base leading-relaxed text-pretty">
          {summary}
        </p>
      </div>

      <div className="text-muted flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {topic.cats.map((c) => (
          <Link
            key={c}
            to="/categories/$category"
            params={{ category: c }}
            // The hub opens on this place type through history state, so the link is the
            // bare hub URL crawlers may follow (robots.txt disallows its ?type= variants).
            state={{ categoryType: topic.type }}
            className="rounded-full"
          >
            <Badge tone="accent" className="hover:ring-accent-300 hover:ring-1">
              {catLabel.get(c) ?? c}
            </Badge>
          </Link>
        ))}
        <span className="tabular">
          {formatInt(places)} {placeNoun(topic.type, places)} ·{' '}
          {formatInt(metricCount)} {metricCount === 1 ? 'metric' : 'metrics'}
        </span>
        {updated != null ? (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5" aria-hidden />
            {topic.url == null ? 'Fetched' : 'Updated'} {formatDay(updated)}
          </span>
        ) : null}
        {topic.url != null ? (
          <>
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
              <SourcesMenu sources={topic.sources} />
            ) : null}
          </>
        ) : (
          <BuiltFrom sources={topic.sources} />
        )}
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
