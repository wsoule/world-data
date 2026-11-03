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
- Correlation wording ("Weak negative relationship (not statistically
  significant, p = 0.26)") comes from `describeCorrelation` in
  `@world-data/stats`; do not write a local copy.

## URL state

Every shareable choice lives in the URL. Prerendered HTML is built without
search params, so pages read them only after `useHydrated()` (the first render
uses the defaults). Leave a param out when it equals its default, so default
views keep clean URLs.

- Compare (`/compare`, `src/features/compare/state.ts`, `CompareSearch`): entity
  `type`, metric basket `m` (ordered ids), `view`, scatter encodings `x`, `y`,
  `r`, `c` and `log`, weights `w`, direction overrides `d`, highlights `hl`,
  group filter `g`, composite `norm` and `cov`, map/ranking focus `f`, overlay
  axis flips `fl`, and table sort `ts`. Use
  `effectiveDirection`/`effectiveWeight` rather than reading `pol` directly.
- `ts` is the compare table's sort: a column id (`avg`, `place`, `group` or
  `m<metric id>`), prefixed with `-` for descending, e.g. `-avg` (the default,
  best average percentile first, so it is omitted), `m24419` or `-m24419`.
  `parseTableSort`/`formatTableSort` in `insights/tableModel.ts` read and write
  it.
- Topic pages (`/topics/$type/$slug`, `TopicSearch` in the route file): focus
  metric `m` (omitted for the lead metric), `year` (a year, or `latest` for the
  undated series; omitted for the metric's default), and the data table's open
  tab `tab` (index of the source table; omitted for the tab holding the focus
  metric), place filter `tq` and sort `tsort`. `tsort` uses the same form as
  `ts` with the topic table's column ids (`place` or `m<metric id>`), e.g.
  `-m12610`; it is omitted for the default order (the focus metric, best first).
  `parseSort`/`formatSort` in `features/topic/model.ts` read and write it, and
  ignore a column the open table does not have. Switching metric resets `year`,
  `tab` and `tsort`; switching tab resets `tsort`.
- History contract: compare views change state with
  `update(patch, { replace })`. Discrete changes (a view tab, adding or removing
  a metric, a direction flip, a highlight, an axis or focus choice) push a
  history entry so Back undoes them. Sliders (weights, coverage), typing and
  automatic URL normalisation (such as persisting the default scatter axes) pass
  `{ replace: true }` so Back is not flooded. Re-sorting the compare table also
  replaces. Topic pages follow the same rule: metric and year switches push; the
  data table's tab, filter and sort replace.

## Pipeline

`moonx web:data-fetch` caches pages (robots.txt allows crawling; keep
concurrency low). `moonx web:data-build` parses the Astro island props into the
files above. Only data, titles and source citations are kept; never copy the
source site's prose. After a rebuild, spot-check values against the source pages
and confirm that `entities`/`metrics` counts are stable.

What the build decides for each metric (`scripts/build-data.ts`, rules in
`scripts/lib/reference.ts` and `scripts/lib/columns.ts`):

- Rank columns: a label saying rank/ranking over whole numbers from 1 up, mostly
  distinct, is published with `fmt: 'ranking'` even when the source stores it as
  a plain number (`looksLikeRanks`). "Change in … Rank" and "Percentile Rank"
  are not positions. `fmt === 'ranking'` means positions (1st, 2nd, …); `pol`
  says whether rank 1 is the best (-1) or the worst (1) place, so views must not
  assume "1 = best" from the format alone.
- Polarity (`guessPolarity`): ranks are -1 unless the label or the key's leading
  words name a worst-first list ("Worst…", "Most Hated", "Most Stressed", …) or
  the key is in `WORST_FIRST_KEYS`; then rank 1 is the worst place and `pol`
  is 1. Check the source order before adding to either list (worst-\* pages also
  carry best-first sub-ranks). Preferences, years and limits are neutral; taxes
  residents pay are -1, tax collections, shares, brackets and excise taxes are
  neutral; costs are -1. Otherwise the label decides, then the key (minus
  bookkeeping such as `_YearFree`), then the topic titles. Source abbreviations
  ("Agrv", "Vacc.", "STD") are spelled out first.
- Labels: a capitalised word repeated by the source ("Annual Annual") is
  collapsed. `METRIC_FIXES` holds hand corrections for wrong headers/formats.
- A count column that copies another column of the same year (fractions
  included) is dropped for that year (`copiedCountFields`).
- A metric with no values on a topic is left off that topic, and a topic with no
  metric left is not published.
- `<type>/search.json` is the compact catalog the search palette downloads
  instead of `metrics.json`: searchable metrics only, topic slugs and categories
  referenced by index (`src/features/search/searchCatalog.ts` defines both
  directions).
