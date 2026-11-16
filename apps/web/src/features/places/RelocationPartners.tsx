import { ExternalLink } from 'lucide-react';

import { RELOCATION_PARTNERS } from '~/commerce';
import type { EntityType } from '~/data/types';
import { SITE } from '~/site';

/** Place types a reader can move to with US partners: states, cities and counties. */
const US_TYPES: readonly EntityType[] = ['state', 'city', 'county'];

/**
 * "Thinking of moving?": partner links for readers comparing US places (homes, movers and
 * insurance), shown on place profiles and head-to-head pages. Partners come from build
 * variables (commerce.ts); with none set, or for countries and world cities, nothing renders.
 * Links are marked rel="sponsored" and the box says that Rankodex may earn a commission.
 */
export function RelocationPartners({
  type,
  placeNames,
}: {
  type: EntityType;
  /** Places the reader is looking at, for the heading ("Moving to Texas?") */
  placeNames: readonly string[];
}) {
  if (!US_TYPES.includes(type) || RELOCATION_PARTNERS.length === 0) return null;
  const heading =
    placeNames.length === 1
      ? `Thinking of moving to ${placeNames[0]}?`
      : `Deciding between ${placeNames.join(' and ')}?`;
  return (
    <aside aria-label="Moving resources" className="card p-4">
      <h2 className="text-base font-semibold">{heading}</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {RELOCATION_PARTNERS.map((p) => (
          <li key={p.id}>
            <a
              href={p.url}
              target="_blank"
              rel="sponsored noopener"
              className="border-app hover:border-accent-300 block h-full rounded-md border p-3"
            >
              <span className="flex items-center gap-1 text-sm font-medium">
                {p.label}
                <ExternalLink className="size-3 opacity-70" aria-hidden />
              </span>
              <span className="text-muted mt-0.5 block text-xs">{p.blurb}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-muted mt-3 text-[11px]">
        Partner links: {SITE.name} may earn a commission if you sign up, at no
        cost to you. It never affects the rankings.
      </p>
    </aside>
  );
}
