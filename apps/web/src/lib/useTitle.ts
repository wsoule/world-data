import { useEffect } from 'react';

import { SITE } from '~/site';

/**
 * Sets document.title ("<title> — Rankodex") while the component is mounted, for pages whose
 * title depends on client-only state. On unmount or a new title, the previous title comes back
 * only while the tab still shows the one set here: when the user leaves the page, the router has
 * usually written the next page's title already, and restoring would overwrite it.
 */
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title == null || title === '') return;
    const prev = document.title;
    const next = `${title} — ${SITE.name}`;
    document.title = next;
    return () => {
      if (document.title === next) document.title = prev;
    };
  }, [title]);
}
