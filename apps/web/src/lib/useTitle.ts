import { useEffect } from 'react';

/** Sets document.title while the component is mounted. */
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = `${title} — World Data`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
