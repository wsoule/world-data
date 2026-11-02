import { useSuspenseQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  type RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { manifestQuery } from '~/data/api';

/** Category id → display label from the manifest ("crime-safety" → "Crime & Safety"). */
export function useCategoryLabels(): (id: string) => string {
  const { data } = useSuspenseQuery(manifestQuery);
  return useMemo(() => {
    const labels = new Map(data.categories.map((c) => [c.id, c.label]));
    return (id: string) =>
      labels.get(id) ??
      id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }, [data]);
}

/**
 * Track an element's content width with a ResizeObserver (0 until measured), for layout choices
 * made outside a chart definition such as label truncation and chart height.
 */
export function useElementWidth<T extends HTMLElement>(): [
  RefObject<T | null>,
  number,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el == null) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Row virtualization for a <table> inside a scroll container: returns the row indexes to render
 * plus spacer heights for the rows above and below the window. Below `threshold` rows every row
 * renders and no spacers are needed.
 */
export function useVirtualRows({
  count,
  rowHeight,
  scrollRef,
  threshold = 120,
  getKey,
}: {
  count: number;
  rowHeight: number;
  scrollRef: RefObject<HTMLElement | null>;
  threshold?: number;
  getKey: (index: number) => string;
}) {
  const enabled = count > threshold;
  const virtualizer = useVirtualizer({
    count: enabled ? count : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    getItemKey: (i) => getKey(i),
    overscan: 12,
  });
  if (!enabled)
    return {
      enabled,
      indexes: Array.from({ length: count }, (_, i) => i),
      padTop: 0,
      padBottom: 0,
    };
  const items = virtualizer.getVirtualItems();
  const padTop = items.length > 0 ? items[0].start : 0;
  const padBottom =
    items.length > 0
      ? virtualizer.getTotalSize() - items[items.length - 1].end
      : 0;
  return { enabled, indexes: items.map((it) => it.index), padTop, padBottom };
}
