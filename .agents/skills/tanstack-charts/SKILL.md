---
name: tanstack-charts
description:
  Use when creating or changing any chart, map or plot in apps/web with TanStack
  Charts (@tanstack/charts) — marks, scales, tooltips, colours, geographic maps,
  interaction callbacks, or chart performance.
---

# TanStack Charts

`@tanstack/charts` 1.x is newer than most model training data. Do not guess its
API: read the installed docs and typings.

- Docs map: `apps/web/node_modules/@tanstack/charts/llms.txt`; pages under
  `docs/` (concepts/, guides/, reference/marks/_.md, examples/_.md,
  framework/react/). Task skills:
  `node_modules/@tanstack/charts/skills/*/SKILL.md`.
- Typings: `node_modules/@tanstack/charts/dist/*.d.ts`; subpath entries are
  listed in that package's `package.json` `exports`.

## Working examples in this repo

Copy patterns from `apps/web/src/charts/Choropleth.tsx` (geoShape maps, layered
`decorative()` overlay, tooltip `content`, `onSelect`) and
`apps/web/src/charts/RankBars.tsx` (barX + text labels, band/linear scales).

## Rules

- Build with `defineChart({ marks, scales: { x: {...}, y: {...} }, tooltip })`
  and render `<Chart definition height ariaLabel />` from
  `@tanstack/charts/react`. Memoize the whole definition with `useMemo`;
  definition identity is the update boundary.
- Marks come from `@tanstack/charts` (dot, lineY, barX, barY, cell, rect, text,
  ruleX, ruleY, tickX, link, …); geo from `@tanstack/charts/geo`; regression
  from `@tanstack/charts/regression`; non-interactive layers via `decorative()`
  from `@tanstack/charts/mark/decorative`.
- Scales: `@tanstack/charts/scales/linear|band|point|ordinal`. Reach for
  `d3-scale` only for log/time/quantile semantics (see
  `docs/concepts/scales-and-d3.md`).
- Option names that differ from other libraries: bar corner radius is
  `radius: { end: 3 }`; text alignment is `anchor`; tooltips use
  `tooltip: { use: tooltip, content: (points) => ({ title, rows }) }` with
  `tooltip` imported from `@tanstack/charts/tooltip`.
- One definition infers one datum type. Render separate `<Chart>`s rather than
  unioning definitions; never cast or `@ts-expect-error` a chart into shape.
- Colours are literal strings: read them from `chartColors(useTheme())` in
  `src/lib/theme.ts` so charts follow light/dark mode. For data-driven colour,
  either a `color` channel with a configured scale or an explicit `fill`
  function (the maps use a d3 quantile scale plus an HTML legend).
- Value axes use the shared helpers in `src/lib/axis.ts`: give the scale an
  explicit domain (`linearAxisDomain` for dots and lines, which pads edge dots
  but never below zero for non-negative data; `barAxisDomain` for bars, which
  start exactly at zero) and label ticks with `axisTickFormat(metric, domain)`,
  so every tick on an axis uses one form (`$50K` and `$100K`, never `$50,000`
  next to `$100K`). Each topic chart builds `axisTickFormat(metric, domain)`
  from its own domain, and value labels within one chart (bar labels, legend
  ends, stat hints) come from `labelFormat(metric, extent)` in
  `src/lib/format.ts`, so they share one form too.
- Maps keep green = better. Pass the metric's polarity to `Choropleth`: `1`
  greens high values, `-1` uses RdYlGn reversed (low values green, high red),
  `0` is neutral blue. Pass raw values (never negate them to flip colours); the
  legend lists a lower-is-better metric from its highest value, so every legend
  with a better side reads worst (left) to best (right).
- Maps: features come from `src/charts/geo/useGeo.ts` (world-atlas 50m, us-atlas
  states/counties). Countries join by ISO3 via `isoNumeric.ts`, states by
  2-digit FIPS, counties by 5-digit FIPS.
- Pin the package version through the pnpm catalog; the 7-day release-age policy
  applies.
