import type { StoryData, StoryPoint, StorySummary } from '~/content/storyTypes';
import { formatValue } from '~/lib/format';

/** Conventional party colours; other categories use the accent. */
const CATEGORY_COLORS: Record<string, string> = {
  Republican: '#dc2626',
  Democratic: '#2563eb',
};
const DOT = 'var(--accent)';
const colorOf = (c: string | null | undefined) =>
  c == null ? DOT : (CATEGORY_COLORS[c] ?? DOT);

/** A metric name as an axis caption: without a trailing unit. */
const caption = (label: string) => {
  const bare = label.replace(/\s*\([^()]*\)$/, '').trim();
  return bare === '' ? label : bare;
};

/**
 * Small scatter for story cards, drawn from the index thumbnail (points already scaled to 0–1):
 * round dots inside light L-shaped axes, each axis captioned with its metric, and the trend line.
 * Plain SVG at a fixed aspect ratio, so it renders on the server and dots stay round.
 */
export function StoryThumb({
  story,
  className,
}: {
  story: Pick<StorySummary, 'thumb' | 'line' | 'xLabel' | 'yLabel'>;
  className?: string;
}) {
  const W = 320;
  const H = 190;
  // Plot area: room on the left and bottom for the axis captions.
  const L = 18;
  const B = 22;
  const T = 10;
  const R = 10;
  const sx = (v: number) => px(L + 6 + v * (W - L - R - 12));
  const sy = (v: number) => px(H - B - 6 - v * (H - B - T - 12));
  const n = story.thumb.length;
  const r = n > 100 ? 2.4 : n > 40 ? 3.2 : 4;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={`Chart of ${caption(story.yLabel)} against ${caption(story.xLabel)}`}
    >
      <path
        d={`M${L} ${T} V${H - B} H${W - R}`}
        fill="none"
        stroke="var(--border)"
        strokeWidth={1.5}
      />
      {story.line != null ? (
        <line
          x1={sx(story.line[0])}
          y1={sy(story.line[1])}
          x2={sx(story.line[2])}
          y2={sy(story.line[3])}
          stroke="var(--text)"
          strokeOpacity={0.35}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ) : null}
      {story.thumb.map(([x, y, c], i) => (
        <circle
          key={i}
          cx={sx(x)}
          cy={sy(y)}
          r={r}
          fill={colorOf(c)}
          fillOpacity={0.72}
        />
      ))}
      <text
        x={W - R}
        y={H - 6}
        textAnchor="end"
        fontSize={11}
        fill="var(--muted)"
      >
        {caption(story.xLabel)} →
      </text>
      <text
        transform={`translate(12 ${T}) rotate(-90)`}
        textAnchor="end"
        fontSize={11}
        fill="var(--muted)"
      >
        {caption(story.yLabel)} →
      </text>
    </svg>
  );
}

/** A pixel coordinate rounded to 0.01. */
const px = (v: number) => Math.round(v * 100) / 100;

/** Rounded tick values across [lo, hi]. */
function ticks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo === 0 ? 1 : hi - lo;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ??
    mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step)
    out.push(Number(v.toPrecision(10)));
  return out;
}

/**
 * The article's chart: every place as a dot, the trend line, axis ticks, and labels on the named
 * places (the extremes and exceptions the text mentions). Party colours when the story has them.
 */
export function StoryChart({ story }: { story: StoryData }) {
  const W = 720;
  const H = 440;
  const M = { top: 16, right: 20, bottom: 48, left: 64 };
  const tx = (x: number) => (story.logX ? Math.log10(x) : x);
  const xs = story.points.map((p) => tx(p[0]));
  const ys = story.points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const padX = x1 === x0 ? 1 : (x1 - x0) * 0.03;
  const padY = y1 === y0 ? 1 : (y1 - y0) * 0.05;
  // Coordinates are rounded to 0.01px: Math.log10 can differ in the last digit between the
  // server and the browser, and unrounded attributes would then fail hydration.
  const sx = (v: number) =>
    px(
      M.left +
        ((v - (x0 - padX)) / (x1 - x0 + 2 * padX)) * (W - M.left - M.right)
    );
  const sy = (v: number) =>
    px(
      H -
        M.bottom -
        ((v - (y0 - padY)) / (y1 - y0 + 2 * padY)) * (H - M.top - M.bottom)
    );
  const xTicks = story.logX
    ? ticks(x0, x1, 4).filter((t) => Number.isInteger(t))
    : ticks(x0, x1);
  const yTicks = ticks(y0, y1);
  const xm = { fmt: story.x.fmt, unit: story.x.unit, kind: 'num' as const };
  const ym = { fmt: story.y.fmt, unit: story.y.unit, kind: 'num' as const };
  const dot =
    story.points.length > 1000 ? 1.8 : story.points.length > 200 ? 2.6 : 4.5;
  const labelled: StoryPoint[] = [];
  for (const p of [
    ...story.top.slice(0, 2),
    ...story.bottom.slice(0, 2),
    ...story.above.slice(0, 1),
    ...story.below.slice(0, 1),
  ])
    if (!labelled.some((q) => q.name === p.name)) labelled.push(p);
  const lineAt = (x: number) => story.intercept + story.slope * x;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Scatter chart of ${story.y.label} against ${story.x.label} for ${story.n} places`}
    >
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line
            x1={M.left}
            x2={W - M.right}
            y1={sy(t)}
            y2={sy(t)}
            stroke="var(--border)"
          />
          <text
            x={M.left - 8}
            y={sy(t)}
            dy="0.32em"
            textAnchor="end"
            fontSize={11}
            fill="var(--muted)"
          >
            {formatValue(ym, t, { compact: true })}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text
          key={`x${t}`}
          x={sx(t)}
          y={H - M.bottom + 18}
          textAnchor="middle"
          fontSize={11}
          fill="var(--muted)"
        >
          {formatValue(xm, story.logX ? 10 ** t : t, { compact: true })}
        </text>
      ))}
      <text
        x={(M.left + W - M.right) / 2}
        y={H - 8}
        textAnchor="middle"
        fontSize={12}
        fill="var(--text)"
      >
        {story.x.label}
        {story.logX ? ' (log scale)' : ''}
      </text>
      <text
        transform={`translate(14 ${(M.top + H - M.bottom) / 2}) rotate(-90)`}
        textAnchor="middle"
        fontSize={12}
        fill="var(--text)"
      >
        {story.y.label}
      </text>
      {Number.isFinite(story.slope) ? (
        <line
          x1={sx(x0)}
          y1={sy(lineAt(x0))}
          x2={sx(x1)}
          y2={sy(lineAt(x1))}
          stroke="var(--text)"
          strokeOpacity={0.45}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      ) : null}
      {story.points.map(([x, y, c], i) => (
        <circle
          key={i}
          cx={sx(tx(x))}
          cy={sy(y)}
          r={dot}
          fill={colorOf(c)}
          fillOpacity={story.points.length > 1000 ? 0.45 : 0.75}
        />
      ))}
      {labelled.map((p) => {
        const cx = sx(tx(p.x));
        const right = cx < W * 0.7;
        return (
          <g key={p.name}>
            <circle
              cx={cx}
              cy={sy(p.y)}
              r={dot + 1.5}
              fill="none"
              stroke="var(--text)"
              strokeWidth={1}
            />
            <text
              x={cx + (right ? 7 : -7)}
              y={sy(p.y)}
              dy="0.32em"
              textAnchor={right ? 'start' : 'end'}
              fontSize={11}
              fill="var(--text)"
              paintOrder="stroke"
              stroke="var(--surface)"
              strokeWidth={3}
            >
              {p.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
