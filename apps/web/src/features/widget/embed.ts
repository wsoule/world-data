// Addresses and HTML snippets for the embeddable ranking widget (/widget). The widget is one
// client-rendered page driven by its query string, so every topic can be embedded without
// prerendering a second copy of each topic page.

import type { EntityType } from '~/data/types';
import { SITE, SITE_URL } from '~/site';

/** Places shown by default, and the most an embed may ask for. */
export const WIDGET_DEFAULT_PLACES = 10;
export const WIDGET_MAX_PLACES = 50;

/** Search params of /widget: place type, topic slug, focus metric and place count. */
export interface WidgetSearch {
  t?: EntityType;
  s?: string;
  m?: number;
  n?: number;
}

/** Clamps a requested place count to 1…WIDGET_MAX_PLACES, defaulting to WIDGET_DEFAULT_PLACES. */
export function widgetPlaces(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return WIDGET_DEFAULT_PLACES;
  return Math.min(WIDGET_MAX_PLACES, Math.max(1, Math.round(n)));
}

/** Absolute widget URL for a topic, with the focus metric and count only when given. */
export function widgetUrl(
  type: EntityType,
  slug: string,
  metric?: number,
  places?: number
): string {
  const params = new URLSearchParams({ t: type, s: slug });
  if (metric != null) params.set('m', String(metric));
  if (places != null) params.set('n', String(places));
  return `${SITE_URL}/widget?${params.toString()}`;
}

/** Height in pixels that fits a widget of `places` bars with its title and credit. */
export function widgetHeight(places: number): number {
  return 96 + places * 24;
}

/** One-line iframe HTML that embeds a topic's ranking on another site. */
export function embedSnippet(
  type: EntityType,
  slug: string,
  metric?: number
): string {
  const places = WIDGET_DEFAULT_PLACES;
  return `<iframe src="${widgetUrl(type, slug, metric)}" title="${SITE.name} ranking" width="100%" height="${widgetHeight(places)}" style="border:0;max-width:640px" loading="lazy"></iframe>`;
}
