import { useState } from 'react';

import { cx } from './ui';
import type { Entity, EntityType } from '~/data/types';

/** Flags flagcdn.com does not have, served from public/flags instead. */
const LOCAL_FLAGS = new Set(['us-dc']);

/** Flag image from flagcdn.com. Countries/world cities use ISO2; US places use the state flag. */
export function Flag({
  entity,
  type,
  size = 20,
  className,
}: {
  entity: Pick<Entity, 'flag' | 'name'>;
  type: EntityType;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: Math.round(size * 0.7) };
  if (!entity.flag || failed) {
    return (
      <span
        aria-hidden
        className={cx(
          'bg-surface-2 inline-block shrink-0 rounded-sm',
          className
        )}
        style={box}
      />
    );
  }
  const code =
    type === 'country' || type === 'world-city'
      ? entity.flag
      : `us-${entity.flag}`;
  // Prerendered lists repeat this tag hundreds of times, so it stays lean: the inline style
  // alone sizes the box (it applies before the stylesheet loads, so no width/height attributes
  // are needed against layout shift), and the 1px hairline uses the hex form of rgba(0,0,0,0.08).
  return (
    <img
      src={
        LOCAL_FLAGS.has(code)
          ? `/flags/${code}.svg`
          : `https://flagcdn.com/w40/${code}.png`
      }
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cx(
        'inline-block shrink-0 rounded-sm object-cover shadow-[0_0_0_1px_#00000014]',
        className
      )}
      style={box}
    />
  );
}
