// Shared pieces for rendering search results in the palette and on the /search page.

import { Link, useNavigate } from '@tanstack/react-router';
import { BarChart3, FileText } from 'lucide-react';
import { type ReactNode, useCallback } from 'react';

import { CategoryGlyph, categoryTint } from '../categories/categoryIcons';
import type { RecentItem } from './recent';
import {
  highlightParts,
  type SearchDoc,
  type SearchKind,
  type SearchTarget,
} from './searchIndex';
import { Flag } from '~/components/Flag';
import { TYPE_ICONS } from '~/components/TypeTabs';
import { cx } from '~/components/ui';
import type { EntityType } from '~/data/types';

/** Short type names for result badges. */
export const TYPE_SHORT: Record<EntityType, string> = {
  country: 'Country',
  state: 'US state',
  city: 'US city',
  'world-city': 'World city',
  county: 'County',
};

/** Plural type names for coverage ("51 of 51 states"). */
export const TYPE_PLURAL: Record<EntityType, string> = {
  country: 'countries',
  state: 'states',
  city: 'cities',
  'world-city': 'cities',
  county: 'counties',
};

/** Renders a result's destination as a typed router link. */
export function TargetLink({
  target,
  className,
  children,
  onClick,
  tabIndex,
  id,
  role,
  ariaSelected,
  onMouseMove,
}: {
  target: SearchTarget;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  tabIndex?: number;
  id?: string;
  role?: string;
  ariaSelected?: boolean;
  onMouseMove?: () => void;
}) {
  const common = {
    className,
    onClick,
    tabIndex,
    id,
    role,
    'aria-selected': ariaSelected,
    onMouseMove,
  };
  switch (target.kind) {
    case 'place':
      return (
        <Link
          {...common}
          to="/places/$type/$slug"
          params={{ type: target.type, slug: target.slug }}
        >
          {children}
        </Link>
      );
    case 'topic':
      return (
        <Link
          {...common}
          to="/topics/$type/$slug"
          params={{ type: target.type, slug: target.slug }}
        >
          {children}
        </Link>
      );
    case 'metric':
      return target.topic != null ? (
        <Link
          {...common}
          to="/topics/$type/$slug"
          params={{ type: target.type, slug: target.topic }}
          search={{ m: target.id }}
        >
          {children}
        </Link>
      ) : (
        <Link
          {...common}
          to="/compare"
          search={{ type: target.type, view: 'ranking', m: [target.id] }}
        >
          {children}
        </Link>
      );
    case 'category':
      return (
        <Link
          {...common}
          to="/categories/$category"
          params={{ category: target.id }}
        >
          {children}
        </Link>
      );
  }
}

/** Imperative counterpart of TargetLink, for Enter in the palette. */
export function useOpenTarget(): (target: SearchTarget) => void {
  const navigate = useNavigate();
  return useCallback(
    (target: SearchTarget) => {
      switch (target.kind) {
        case 'place':
          void navigate({
            to: '/places/$type/$slug',
            params: { type: target.type, slug: target.slug },
          });
          return;
        case 'topic':
          void navigate({
            to: '/topics/$type/$slug',
            params: { type: target.type, slug: target.slug },
          });
          return;
        case 'metric':
          if (target.topic != null)
            void navigate({
              to: '/topics/$type/$slug',
              params: { type: target.type, slug: target.topic },
              search: { m: target.id },
            });
          else
            void navigate({
              to: '/compare',
              search: { type: target.type, view: 'ranking', m: [target.id] },
            });
          return;
        case 'category':
          void navigate({
            to: '/categories/$category',
            params: { category: target.id },
          });
      }
    },
    [navigate]
  );
}

const KIND_ICONS: Record<
  Exclude<SearchKind, 'place' | 'category'>,
  typeof BarChart3
> = {
  metric: BarChart3,
  topic: FileText,
};

/** Flag for places, category tile for categories, a kind glyph otherwise. */
export function ResultIcon({
  item,
  size = 'md',
}: {
  item: Pick<SearchDoc, 'kind' | 'type' | 'flag' | 'target' | 'title'>;
  size?: 'sm' | 'md';
}) {
  const box = size === 'sm' ? 'size-7' : 'size-8';
  if (item.kind === 'place' && item.type != null) {
    return (
      <span className={cx('grid shrink-0 place-items-center', box)}>
        {item.flag != null ? (
          <Flag
            entity={{ flag: item.flag, name: item.title }}
            type={item.type}
            size={size === 'sm' ? 20 : 24}
          />
        ) : (
          <PlaceGlyph type={item.type} />
        )}
      </span>
    );
  }
  if (item.target.kind === 'category') {
    return (
      <span
        className={cx(
          'grid shrink-0 place-items-center rounded-lg',
          box,
          categoryTint(item.target.id)
        )}
      >
        <CategoryGlyph id={item.target.id} />
      </span>
    );
  }
  const Icon = item.kind === 'metric' ? KIND_ICONS.metric : KIND_ICONS.topic;
  return (
    <span
      className={cx(
        'grid shrink-0 place-items-center rounded-lg',
        box,
        item.kind === 'metric'
          ? 'bg-accent-50 text-accent-600 dark:bg-accent-900/40 dark:text-accent-300'
          : 'bg-surface-2 text-muted'
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

function PlaceGlyph({ type }: { type: EntityType }) {
  const Icon = TYPE_ICONS[type];
  return <Icon className="text-muted size-4" aria-hidden />;
}

/** Text with the parts matching the query wrapped in <mark>. */
export function Highlighted({
  text,
  query,
  terms,
}: {
  text: string;
  query: string;
  terms?: readonly string[];
}) {
  const parts = highlightParts(text, query, terms);
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <mark
            key={i}
            className="text-accent-700 dark:text-accent-200 rounded-sm bg-transparent font-semibold"
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

/** Compact coverage / size facts for a result ("51/51 states", "7 metrics"). */
export function resultFacts(doc: SearchDoc): string[] {
  const facts: string[] = [];
  if (doc.kind === 'metric' && doc.n != null && doc.type != null) {
    facts.push(
      `${doc.n.toLocaleString('en-US')}/${(doc.total ?? doc.n).toLocaleString('en-US')} ${TYPE_PLURAL[doc.type]}`
    );
    if (doc.year != null) facts.push(String(doc.year));
  }
  if (doc.kind === 'topic' && doc.n != null && doc.type != null) {
    facts.push(`${doc.n.toLocaleString('en-US')} ${TYPE_PLURAL[doc.type]}`);
    if (doc.metricCount != null)
      facts.push(
        `${doc.metricCount} ${doc.metricCount === 1 ? 'metric' : 'metrics'}`
      );
  }
  if (doc.kind === 'category' && doc.topicCount != null)
    facts.push(`${doc.topicCount.toLocaleString('en-US')} topics`);
  return facts;
}

/** "also in 3 other topics" for a metric whose same-label siblings were folded into it. */
export function variantsFact(count: number): string | null {
  if (count <= 0) return null;
  return `also in ${count.toLocaleString('en-US')} other ${count === 1 ? 'topic' : 'topics'}`;
}

/** Shape shared by live results and stored recents. */
export type ResultLike = SearchDoc | RecentItem;
