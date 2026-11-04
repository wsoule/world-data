import { type RefObject, useEffect, useState } from 'react';

/**
 * Whether the element in `ref` has come within `margin` pixels (above or below) of the
 * viewport. False while server rendering and hydrating, then true for good once it has: used to
 * start large downloads, such as a map's geometry, only for parts of the page a visitor reaches.
 * Watching starts two frames after mount, once a client-side navigation has reset the scroll
 * position, so a block at the end of the new page does not count as seen just because the link
 * that opened it was at the end of the old one. Browsers without IntersectionObserver report
 * true then.
 */
export function useNearViewport(
  ref: RefObject<Element | null>,
  margin = 400
): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    let io: IntersectionObserver | null = null;
    const watch = () => {
      const el = ref.current;
      if (el == null) return;
      if (typeof IntersectionObserver === 'undefined') {
        setNear(true);
        return;
      }
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) setNear(true);
        },
        { rootMargin: `${margin}px 0px` }
      );
      io.observe(el);
    };
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(watch);
    });
    return () => {
      cancelAnimationFrame(frame);
      io?.disconnect();
    };
  }, [ref, near, margin]);
  return near;
}
