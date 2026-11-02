import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

/**
 * Track an element's content width with a ResizeObserver (0 until measured). Used where layout
 * choices that live outside a chart definition, such as its height, depend on available width.
 */
export function useWidth<T extends HTMLElement>(): [
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
