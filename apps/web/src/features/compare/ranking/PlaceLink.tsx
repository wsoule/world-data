import { Link } from '@tanstack/react-router';

import { Flag } from '~/components/Flag';
import { cx } from '~/components/ui';
import type { Dataset } from '~/data/dataset';

/** Flag + place name linking to the place profile. `index` is a dataset entity index. */
export function PlaceLink({
  dataset,
  index,
  className,
  flagSize = 16,
}: {
  dataset: Dataset;
  index: number;
  className?: string;
  flagSize?: number;
}) {
  const e = dataset.entities[index];
  return (
    <Link
      to="/places/$type/$slug"
      params={{ type: dataset.type.id, slug: e.slug }}
      className={cx(
        'inline-flex min-w-0 items-center gap-1.5 hover:underline',
        className
      )}
      title={e.name}
    >
      <Flag entity={e} type={dataset.type.id} size={flagSize} />
      <span className="truncate">{e.name}</span>
    </Link>
  );
}
