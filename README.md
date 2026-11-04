# Rankodex

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

Built with [TanStack Start](https://tanstack.com/start) (React 19, Router,
Query, Table, Virtual and [TanStack Charts](https://tanstack.com/charts)),
Tailwind CSS 4 and Vite. Content pages are prerendered to static HTML for search
engines and AI answer engines.

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

- `apps/web`: the TanStack Start app. `src/data` holds the dataset types and
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

`moonx web:build` prerenders every topic, place, category and type page (about
8,000 HTML files) plus `sitemap.xml` into `apps/web/dist/client`. The
browser-only `/compare`, `/vs` and `/search` are prerendered as client-rendered
shells, so no rewrites are needed. Deploy that folder to any static host that
serves `404.html` for unknown paths (Netlify, Cloudflare Pages, Vercel and
GitHub Pages all do). Set `VITE_SITE_URL` to the public origin at build time so
canonical URLs and the sitemap point at it.

### Docker and Railway

The root `Dockerfile` builds the site in a Node stage and serves it with Caddy
(root `Caddyfile`): precompressed gzip, a 404 status with `404.html` for unknown
paths, one-year caching for hashed assets, and a 308 from trailing-slash URLs to
their canonical form. It listens on `$PORT` (default 8080). Base images come
through `mirror.gcr.io`, because Docker Hub rate-limits shared build machines.

```bash
docker build -t rankodex . && docker run -p 8080:8080 rankodex
```

Set the runtime variable `CANONICAL_HOST` to the public host name, without a
scheme (for example `rankodex.com`), and Caddy answers every request for any
other host with a 301 to the same path and query on `https://<CANONICAL_HOST>`:
the service's `*.up.railway.app` domain, and `www` once its DNS record and
custom domain exist. Requests with the host `healthcheck.railway.app` (Railway's
healthcheck) are never redirected. Leave it unset for local runs, where every
host is served as is. A value that is not a bare host name (with a scheme, port
or path, such as `https://rankodex.com/`) is ignored the same way, so a typo
cannot redirect every visitor to a host that does not exist. To see the redirect
locally:

```bash
docker run -p 8080:8080 -e CANONICAL_HOST=rankodex.com rankodex
curl -I -H 'Host: www.rankodex.com' http://localhost:8080/glossary
# 301, Location: https://rankodex.com/glossary
```

Railway builds a root `Dockerfile` with no config file (Config as Code is
deprecated). It deploys the repository's default branch, so merge this work into
`main` first, or point the service at another branch in step 1.

1. Create an empty project, add an Empty Service, and under the service's
   Settings, Source, connect this repository (and pick the trigger branch if it
   is not `main`). Starting from "Deploy from GitHub repo" instead makes Railway
   stage one service per workspace package with pnpm build and start commands;
   if you go that way, delete the extra services (such as `stats`) and clear the
   web service's custom build command, start command and watch paths so the
   Dockerfile's own commands apply.
2. Under Settings, Networking, generate a domain. Under Settings, Deploy, set
   the healthcheck path to `/`.
3. Deploy. The build log should say "Using detected Dockerfile!"; the build
   takes a few minutes (about 8,000 pages are prerendered).
4. Canonical URLs, the sitemap and robots.txt are baked in at build time. With
   no `VITE_SITE_URL` variable the Dockerfile uses the generated Railway domain
   (`RAILWAY_PUBLIC_DOMAIN`), so redeploy once after generating it. When a
   custom domain is attached, set `VITE_SITE_URL` to its origin (for example
   `https://rankodex.com`) and redeploy.
5. For a custom domain, add it under Settings, Networking and create both the
   CNAME and the TXT record Railway shows. An apex domain needs a DNS provider
   with CNAME flattening or ALIAS records (Cloudflare, for example), and plans
   limit custom domains per service.
6. Under Variables, set `CANONICAL_HOST` to the custom domain's host (for
   example `rankodex.com`) so the Railway domain redirects to it. Caddy reads it
   when the container starts, so it takes effect with the next deploy. Set it
   only once the custom domain serves the site, or the redirect points at a host
   that does not answer yet.

The CLI equivalent of steps 1-3 is `railway init`, `railway up` (which uploads
this checkout, without GitHub autodeploys) and `railway domain`; set the
healthcheck path in the dashboard.

## License

Apache-2.0. See [`LICENSE.md`](LICENSE.md). The tooling is derived from the
Pierre monorepo (© Pierre Computer Company), and the license file keeps its
copyright lines.
