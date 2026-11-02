# World Data

Explore, compare and overlay thousands of statistics about countries, US states, US cities, world cities and US counties. The data comes from [World Population Review](https://worldpopulationreview.com) and the primary sources it cites.

What it adds over the source site:

- **Search that works.** A ⌘K palette searches places, topics and individual metrics, and tolerates typos and synonyms.
- **Overlay any two metrics.** For example, education rank against median household income, with a regression line, correlation, p-value and outliers.
- **Combined rankings.** Layer as many metrics as you like, set a weight and direction for each, and see who ranks #1 overall.
- **Correlations.** A correlation matrix and auto-generated findings for the metrics you picked, plus a "what else correlates with this?" search across the whole catalog.
- **Place profiles and head-to-head comparisons.** Each place's strengths and weaknesses across every metric.

Built with React 19, TanStack Router, Query, Table, Virtual and [TanStack Charts](https://tanstack.com/charts), plus Tailwind CSS 4 and Vite.

## Develop

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # unit tests (statistics)
pnpm build        # type-check + production build into dist/
```

## Data pipeline

The dataset in `public/data` is generated and committed, so the app is a static site.

```sh
pnpm data:fetch   # cache ranking pages into .cache/pages (polite, resumable)
pnpm data:build   # parse the cache into public/data
```

| File | Contents |
| --- | --- |
| `manifest.json` | Entity types, categories, build time |
| `topics.json` | Every topic (source page) with its metric ids |
| `<type>/entities.json` | Places, ordered by population |
| `<type>/metrics.json` | Metric catalog: label, format, unit, polarity, years, coverage, topics |
| `<type>/values.json` | Each metric's default-year values, stored sparsely |
| `<type>/topics/<slug>.json` | One topic: sources, tables, every year of its metrics |

The pipeline keeps numbers, titles and source citations. It does not copy the source site's prose.

## Layout

```
src/
  data/        types, query options, Dataset (fast column access)
  lib/         stats (correlation, regression, composite scores), formatting, search
  charts/      shared TanStack Charts components (Choropleth, RankBars, …)
  components/  UI primitives, MetricPicker, EntityPicker, Flag, TypeTabs
  features/    pages: home, search, categories, topic, compare (views/), places, vs
  routes/      TanStack Router file routes
scripts/       fetch + build data
```

Deploy `dist/` to any static host. Configure SPA fallback so unknown paths serve `index.html`; `public/_redirects` (Netlify) and `vercel.json` already do this.
