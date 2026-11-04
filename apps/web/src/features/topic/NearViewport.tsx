import {
  type ReactNode,
  Suspense,
  use,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useNearViewport } from '~/charts/useNearViewport';

/** A promise that one call to `open` resolves, and whether that call happened. */
interface Gate {
  promise: Promise<void>;
  opened: boolean;
  open: () => void;
}

/**
 * A gate, open from the start when `opened`. Opening marks the promise fulfilled the way
 * React's `use` reads it (`status` and `value`), so a render after that never suspends.
 */
function createGate(opened: boolean): Gate {
  let resolve = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  }) as Promise<void> & { status?: string; value?: undefined };
  const gate: Gate = {
    promise,
    opened: false,
    open: () => {
      if (gate.opened) return;
      gate.opened = true;
      promise.status = 'fulfilled';
      promise.value = undefined;
      resolve();
    },
  };
  if (opened) gate.open();
  return gate;
}

/** Suspends in the browser until `gate` opens; the server always renders `children`. */
function Gated({ gate, children }: { gate: Gate; children: ReactNode }) {
  if (!import.meta.env.SSR) use(gate.promise);
  return children;
}

/**
 * Renders `children` in the server HTML, but in the browser only once the block comes within
 * `margin` of the viewport, so a block that needs a large download (the correlations card reads
 * every statistic of the place type) does not hold up the rest of the page. While hydrating,
 * React keeps the server HTML of a suspended boundary on screen, so the block reads the same
 * until it hydrates; on a client-side navigation `fallback` stands in until it loads. `ready`
 * (read when the block mounts) skips the wait when what it needs is already in memory.
 *
 * Give it a `key` that changes with the block's inputs: a boundary that is still showing server
 * HTML is then replaced rather than updated, which React would otherwise have to throw away.
 */
export function NearViewport({
  children,
  fallback,
  ready = false,
  margin = 600,
}: {
  children: ReactNode;
  fallback: ReactNode;
  ready?: boolean;
  /** Pixels above and below the viewport within which loading starts */
  margin?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Already loaded data needs no wait. Read once: a gate never closes again.
  const [gate] = useState(() => createGate(ready));
  const near = useNearViewport(ref, margin);
  useEffect(() => {
    if (near) gate.open();
  }, [near, gate]);

  return (
    <div ref={ref}>
      <Suspense fallback={fallback}>
        <Gated gate={gate}>{children}</Gated>
      </Suspense>
    </div>
  );
}
