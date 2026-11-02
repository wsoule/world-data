# World Data

Explore, compare and overlay thousands of statistics about countries, US states,
US cities, world cities and US counties. The data comes from
[World Population Review](https://worldpopulationreview.com) and the primary
sources it cites.

What it adds over the source site:

- **Search that works.** A ⌘K palette searches places, topics and individual
  metrics, and tolerates typos and synonyms.
- **Overlay any two metrics.** For example, education rank against median
  household income, with a regression line, correlation, p-value and outliers.
- **Combined rankings.** Layer as many metrics as you like, set a weight and
  direction for each, and see who ranks #1 overall.
- **Correlations.** A correlation matrix and auto-generated findings for the
  metrics you picked, plus "what else correlates with this?" across the whole
  catalog.
- **Place profiles and head-to-head comparisons.** Each place's strengths and
  weaknesses across every metric.

Built with React 19, TanStack Router, Query, Table, Virtual and
[TanStack Charts](https://tanstack.com/charts), plus Tailwind CSS 4 and Vite.

## Start

The repo uses the Pierre-derived monorepo toolchain: pnpm workspaces with a
catalog, [moon](https://moonrepo.dev) as the task runner,
[proto](https://moonrepo.dev/docs/proto) for tool pins, oxlint/oxfmt/stylelint,
TypeScript 7 and Bun's test runner.

```bash
proto use                                   # install pinned bun, pnpm, node, moon
pnpm install
moonx web:dev --ignore-ci-checks            # http://localhost:5173
moon run root:format root:lint              # verification baseline
moonx :typecheck :test                      # every project
moonx web:build                             # production build in apps/web/dist
```

## Layout

- `apps/web`: the single-page app. `src/data` holds the dataset types and
  loaders, `src/charts` the shared TanStack Charts components, `src/features`
  one folder per page, and `src/routes` the TanStack Router file routes.
- `packages/stats`: statistics for comparisons (ranks, percentiles,
  Pearson/Spearman with p-values, regression, composite scores), built with
  tsdown and tested with `bun test`.
- `AGENTS.md` and `.agents/skills/`: conventions for coding agents.
- `scripts/`: worktree manager and dev-server helpers. See `scripts/README.md`.

## Data pipeline

The dataset in `apps/web/public/data` is generated and committed, so the site is
fully static.

```bash
moonx web:data-fetch    # cache ranking pages into apps/web/.cache/pages (resumable)
moonx web:data-build    # parse the cache into apps/web/public/data
```

| File                        | Contents                                                 |
| --------------------------- | -------------------------------------------------------- |
| `manifest.json`             | Entity types, categories, build time                     |
| `topics.json`               | Every topic (source page) with its metric ids            |
| `<type>/entities.json`      | Places, ordered by population                            |
| `<type>/metrics.json`       | Metric catalog: label, format, polarity, years, coverage |
| `<type>/values.json`        | Each metric's default-year values, stored sparsely       |
| `<type>/topics/<slug>.json` | One topic: sources, tables, every year of its metrics    |

The pipeline keeps numbers, titles and source citations. It does not copy the
source site's prose.

## Deploy

Deploy `apps/web/dist` to any static host and configure SPA fallback so unknown
paths serve `index.html`. `public/_redirects` (Netlify) and `vercel.json`
already do this.

## License

Apache-2.0. See [`LICENSE.md`](LICENSE.md). The tooling is derived from the
Pierre monorepo (© Pierre Computer Company), and the license file keeps its
copyright lines.
