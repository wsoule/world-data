import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import { SEQ, shapeId } from './mapStyle';
import { InfoTip } from '~/components/InfoTip';
import { cx } from '~/components/ui';
import type { CombinedMap, MapShapes } from '~/content/mapTypes';

/** Fixed score bands (0–100 in sevenths), so a colour means the same score whatever is selected. */
const bandOfScore = (score: number) =>
  Math.min(6, Math.floor(score / (100 / 7)));

/**
 * The home page's build-your-own map: switch statistics on and off, and every state is coloured
 * by its average percentile across the ones that are on (darker = better overall), with the top
 * and bottom five beside it and a link to the same selection in the full compare map.
 */
export function CombinedMapCard({
  combined,
  shapes,
}: {
  combined: CombinedMap;
  shapes: MapShapes;
}) {
  const [on, setOn] = useState<number[]>(combined.defaults);
  const index = useMemo(
    () => new Map(combined.metrics.map((m, i) => [m.id, i])),
    [combined]
  );
  const scores = useMemo(() => {
    const out = new Map<string, number>();
    for (const [id, pcts] of Object.entries(combined.places)) {
      let sum = 0;
      let n = 0;
      for (const mid of on) {
        const v = pcts[index.get(mid) ?? -1];
        if (v != null) {
          sum += v;
          n++;
        }
      }
      // A state needs most of the selected statistics to get a score.
      if (n > 0 && n >= Math.ceil(on.length / 2)) out.set(id, sum / n);
    }
    return out;
  }, [combined, on, index]);
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  const toggle = (id: number) =>
    setOn((cur) =>
      cur.includes(id)
        ? cur.length > 1
          ? cur.filter((x) => x !== id)
          : cur
        : [...cur, id]
    );

  return (
    <section
      aria-labelledby="combined-map-heading"
      className="border-app bg-surface rounded-xl border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="combined-map-heading" className="text-lg font-semibold">
          Build your own map of the states
        </h3>
        <Link
          to="/compare"
          search={{ type: 'state', view: 'map', m: on }}
          className="text-accent-700 dark:text-accent-300 text-sm font-medium hover:underline"
        >
          Open this map in Compare
        </Link>
      </div>
      <p className="text-muted mt-1 text-sm">
        Choose what matters to you. Each state is scored on every statistic you
        pick (100 is the best state, 0 the worst) and the map shows the average.
      </p>

      <div
        role="group"
        aria-label="Statistics in the score"
        className="mt-3 flex flex-wrap gap-1.5"
      >
        {combined.metrics.map((m) => {
          const pressed = on.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => toggle(m.id)}
              title={
                pressed && on.length === 1
                  ? 'Keep at least one statistic'
                  : undefined
              }
              className={cx(
                'rounded-full border px-3 py-1 text-sm',
                pressed
                  ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-900/40 dark:text-accent-200'
                  : 'border-app text-muted hover:text-app'
              )}
            >
              {m.label}
              <span className="ml-1 text-xs opacity-70">
                {m.pol === 1 ? '↑ better' : '↓ better'}
              </span>
            </button>
          );
        })}
        <InfoTip term="combined-score" className="self-center" />
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <svg
            viewBox={`0 0 ${shapes.width} ${shapes.height}`}
            className="h-auto w-full"
            role="img"
            aria-label="Map of the combined score by state"
          >
            {Object.keys(shapes.paths).map((id) => {
              const s = scores.get(id);
              return (
                <use
                  key={id}
                  href={`#${shapeId(shapes.geo, id)}`}
                  fill={s == null ? 'var(--surface-2)' : SEQ[bandOfScore(s)]}
                  stroke="var(--surface)"
                  strokeWidth={0.6}
                />
              );
            })}
          </svg>
          <div className="text-muted mt-2 flex items-center gap-2 text-xs">
            <span>Worse overall</span>
            <span className="flex h-2 flex-1 overflow-hidden rounded-full">
              {SEQ.map((c) => (
                <span key={c} className="flex-1" style={{ background: c }} />
              ))}
            </span>
            <span>Better overall</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-1">
          <RankList
            title="Top 5"
            rows={ranked.slice(0, 5)}
            names={combined.names}
            start={1}
          />
          <RankList
            title="Bottom 5"
            rows={ranked.slice(-5)}
            names={combined.names}
            start={ranked.length - 4}
          />
        </div>
      </div>
    </section>
  );
}

function RankList({
  title,
  rows,
  names,
  start,
}: {
  title: string;
  rows: [string, number][];
  names: Record<string, string>;
  start: number;
}) {
  return (
    <div>
      <h4 className="text-muted mb-1 text-xs font-medium">{title}</h4>
      <ol>
        {rows.map(([id, score], i) => (
          <li
            key={id}
            className="flex items-baseline justify-between gap-2 py-0.5"
          >
            <span className="min-w-0 truncate">
              <span className="text-muted tabular mr-1.5 text-xs">
                {start + i}
              </span>
              {names[id] ?? id}
            </span>
            <span className="tabular text-muted text-xs">
              {Math.round(score)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
