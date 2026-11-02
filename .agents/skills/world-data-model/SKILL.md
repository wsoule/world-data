---
name: world-data-model
description:
  Use when reading or changing the World Data dataset, the data pipeline
  (apps/web/scripts), the Dataset API, metric semantics (polarity, coverage,
  years), comparison URL state, or anything that computes rankings and
  correlations.
---

# World Data model

## Files (apps/web/public/data, generated and committed)

Shapes are typed in `apps/web/src/data/types.ts`; the pipeline imports the same
types, so a shape change must update both.

- `manifest.json`: entity types (`country`, `state`, `city`, `world-city`,
  `county`) with counts, plus the 20 categories.
- `topics.json`: every source page (topic) with its metric ids.
- `<type>/entities.json`: places ordered by population, descending. The array
  index is the entity index used everywhere else. Ids: ISO3 (countries), USPS
  code (states, includes DC), slug (cities), 5-digit FIPS (counties). `group` is
  continent / census region / country.
- `<type>/metrics.json`: the catalog. `kind` is num | cat | text. `pol` is 1
  (higher is better), -1 (lower is better) or 0 (neutral); it is a heuristic
  seed and users can flip it. `n` is coverage at the default `year`. `topics[0]`
  is the primary topic, used to disambiguate short labels. `meta` marks
  bookkeeping columns ("Data Year"); hide them from pickers. Negative ids are
  synthetic base metrics (-1 population, -2 density, -3 growth, -4 growth since
  2020, -5 area).
- `<type>/values.json`: default-year values, sparse:
  `[metricId, entityIndexes, values]`.
- `<type>/topics/<slug>.json`: one topic with sources, tables and every year
  (`series[metricId][year | '_'] = [entityIndexes, values]`).

## In the app

- `useDataset(type)` (suspense) / `loadDataset(queryClient, type)` (route
  loaders) return a cached `Dataset`. `numeric(id)` is a `Float64Array` aligned
  to `entities`, with NaN for missing values. Use it for every calculation.
  `metricContext(id)` and `metricFullLabel(id)` add topic context to labels.
- Statistics come from `@world-data/stats`; do not re-implement correlation,
  ranking or composites in components.
- Format every value with `formatValue(metric, v)` from `src/lib/format.ts`.
  `percAlt` values are already percentages and `perc` values are fractions.
- The compare workbench state lives in the URL and is defined in
  `src/features/compare/state.ts`: metric basket `m`, view, scatter encodings,
  weights `w`, direction overrides `d`, highlights `hl` and group filter `g`.
  Use `effectiveDirection`/`effectiveWeight` rather than reading `pol` directly.

## Pipeline

`moonx web:data-fetch` caches pages (robots.txt allows crawling; keep
concurrency low). `moonx web:data-build` parses the Astro island props into the
files above. Only data, titles and source citations are kept; never copy the
source site's prose. After a rebuild, spot-check values against the source pages
and confirm that `entities`/`metrics` counts are stable.
