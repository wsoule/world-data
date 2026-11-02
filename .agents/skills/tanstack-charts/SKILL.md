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
- Maps: features come from `src/charts/geo/useGeo.ts` (world-atlas 50m, us-atlas
  states/counties). Countries join by ISO3 via `isoNumeric.ts`, states by
  2-digit FIPS, counties by 5-digit FIPS.
- Pin the package version through the pnpm catalog; the 7-day release-age policy
  applies.
