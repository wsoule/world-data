import { useState } from 'react'
import type { Entity, EntityType } from '~/data/types'

/** Flag image from flagcdn.com. Countries/world cities use ISO2; US places use the state flag. */
export function Flag({ entity, type, size = 20, className }: { entity: Pick<Entity, 'flag' | 'name'>; type: EntityType; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!entity.flag || failed) {
    return <span aria-hidden className={`inline-block shrink-0 rounded-sm bg-surface-2 ${className ?? ''}`} style={{ width: size, height: Math.round(size * 0.7) }} />
  }
  const code = type === 'country' || type === 'world-city' ? entity.flag : `us-${entity.flag}`
  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      alt=""
      loading="lazy"
      width={size}
      height={Math.round(size * 0.7)}
      onError={() => setFailed(true)}
      className={`inline-block shrink-0 rounded-sm object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.08)] ${className ?? ''}`}
      style={{ width: size, height: Math.round(size * 0.7) }}
    />
  )
}
