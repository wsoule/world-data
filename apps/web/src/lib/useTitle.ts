import { useEffect } from 'react';

import { SITE } from '~/site';

/** Sets document.title while the component is mounted. */
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = `${title} — ${SITE.name}`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
