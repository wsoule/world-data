# Rankodex: Railway deploy handoff

2026-11-03. Also published as a Claude Doc:
https://claude.ai/artifact/Xs2dfrNUaoJAeVSkaDb81b

## Read this first

The code is ready and builds; the open job is getting it live on Railway. The
first Railway build failed, and nobody has read its log yet. For: a Claude Code
session on the owner's computer, picking up from a cloud session that built the
site.

- **What Rankodex is:** a static site (rankodex.com) that ranks and compares
  countries, US states, cities and counties on about 6,000 statistics. TanStack
  Start prerenders about 8,000 HTML pages at build time, and Caddy serves them
  from a Docker image.
- **Repository:** [wsoule/world-data](https://github.com/wsoule/world-data).
  `main` and `world-data-app` hold the same code.
- **Known good:** on 2026-11-03 the cloud session built that branch from a fresh
  clone with `docker build --no-cache`. Pages returned 200, unknown paths
  returned 404, and canonical URLs used the Railway domain.
- **Probable cause of the failure:** at that time `main` held only an initial
  README commit (`fa63913`). A service watching `main`, or set up with "Deploy
  from GitHub repo", had nothing to build. `main` was fast-forwarded afterwards.
- **Not known:** the actual error. Read the build log before changing anything.

**Your first step:** in Railway, open the failed deployment and read its Build
Logs. Check the service settings below, redeploy the latest commit of `main`,
and if it fails again, find the first error line in the diagnosis table.

## How the image is built and served

Railway always uses a `Dockerfile` at the repository root, and that file does
the whole build. Moon is not used inside the image.

| File                            | Role                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `Dockerfile`                    | Two stages: a Node build stage, then a Caddy serve stage                                |
| `Caddyfile`                     | Caddy config, copied to `/etc/caddy/Caddyfile`                                          |
| `.dockerignore`                 | Keeps `.git`, `node_modules`, `dist` and `.claude` out of the build context             |
| `apps/web/vite.config.ts`       | Prerender list, concurrency (8) and sitemap host                                        |
| `apps/web/scripts/seo-files.ts` | Runs after the build: writes robots.txt, llms.txt, 404.html and CSVs, and checks assets |
| `apps/web/src/site-url.ts`      | Default site URL, and validation of `VITE_SITE_URL`                                     |
| `README.md`                     | "Docker and Railway" section with the deploy steps                                      |

The build stage, in order:

1. `FROM mirror.gcr.io/library/node:24.21.0-bookworm-slim`. This is Docker Hub's
   official image, pulled through Google's mirror because Docker Hub rate-limits
   shared builders with 429 errors.
2. `npm install --global pnpm@12.6.0 bun@1.4.2`. These match `.prototools`.
3. Copy the three `package.json` files and the lockfile, then run
   `pnpm install --frozen-lockfile`.
4. Copy only the build inputs: `.gitignore`, `tsconfig*.json`,
   `.browserslistrc`, `packages/stats` and `apps/web`. Keep the `.gitignore`
   copy: Tailwind's source scan needs it to skip `dist/`. Without it, the server
   and client builds emit stylesheets with different hashes, and every page
   links a CSS file that does not exist.
5. `cd packages/stats && pnpm exec tsdown --clean`.
6. Set the site URL: `VITE_SITE_URL` if given, otherwise
   `https://$RAILWAY_PUBLIC_DOMAIN`, otherwise `https://rankodex.com`.
7. `cd apps/web && pnpm exec vite build && bun scripts/seo-files.ts`. Vite
   prerenders about 8,000 pages in roughly 75 seconds.
8. gzip every text file over 1 KB in `apps/web/dist/client`, keeping the
   originals.

The serve stage is `mirror.gcr.io/library/caddy:2.11.7-alpine`, with
`dist/client` copied to `/srv`. It listens on `:$PORT` over plain HTTP,
defaulting to 8080, because Railway's edge terminates TLS.

The local build took about 2 minutes without cache. The final image is about 1.3
GB, mostly prerendered HTML.

## Railway service settings

One service, built from the root `Dockerfile`, with every custom command left
empty. Don't add `railway.json` or `railway.toml`: Railway has deprecated Config
as Code, new services ignore it, and existing files stop being read on
2026-12-01.

| Setting              | Value               | Why                                                                |
| -------------------- | ------------------- | ------------------------------------------------------------------ |
| Source repo          | `wsoule/world-data` |                                                                    |
| Branch               | `main`              | `world-data-app` is identical; `main` gets autodeploys             |
| Root Directory       | empty (or `/`)      | The build needs the whole monorepo                                 |
| Builder              | Dockerfile          | Log should say "Using detected Dockerfile!"                        |
| Dockerfile Path      | `Dockerfile`        | Relative to the Root Directory                                     |
| Custom Build Command | empty               | The Dockerfile builds                                              |
| Custom Start Command | empty               | It would override Caddy; the serve image has no pnpm or node       |
| Watch Paths          | empty               | A path like `/apps/web/**` skips commits that touch the root files |
| Healthcheck Path     | `/`                 | Under Settings → Deploy                                            |
| Public domain        | Generate one        | Settings → Networking                                              |
| `VITE_SITE_URL`      | leave unset for now | The build falls back to `RAILWAY_PUBLIC_DOMAIN`                    |

- "Deploy from GitHub repo" stages one service per workspace package, with
  `pnpm --filter … start` commands. If the project was created that way, delete
  any extra service (such as `stats`) and clear the commands and watch paths
  above. Or create an Empty Service and connect the repo under Settings →
  Source.
- Canonical URLs, the sitemap and robots.txt are baked in at build time. After
  the first successful deploy with a generated domain, redeploy once so they use
  it.
- **`rankodex.com` is not registered.** On 2026-11-03 it returned NXDOMAIN and
  an RDAP 404. Until the owner registers it and attaches it as a custom domain,
  don't set `VITE_SITE_URL` to it. Once it's attached: add the CNAME and TXT
  records Railway shows (both are required). An apex domain needs a DNS provider
  with CNAME flattening or ALIAS records, such as Cloudflare. Then set
  `VITE_SITE_URL=https://rankodex.com` and redeploy.
- CLI route, if the owner has the Railway CLI logged in: `railway link` to the
  project, `railway up` (uploads the checkout, with no GitHub autodeploys) and
  `railway domain`. Set the healthcheck path in the dashboard.

## Diagnosing a failed build

Match the first error line in the Build Logs (or the Deploy Logs, if the build
passed) against this table. Then fix and reproduce locally before you push;
every push to `main` redeploys.

| What the log shows                                                                 | Likely cause                                                                                | Fix                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Railpack", "could not determine how to build", or no "Using detected Dockerfile!" | Built `main` from before the merge, a wrong Root Directory, or a Railpack builder           | Use the settings table above, then "Deploy latest commit"                                                                                                    |
| `pnpm --filter …` build or start commands, or a second `stats` service             | Monorepo auto-import from "Deploy from GitHub repo"                                         | Delete the extra services; clear the custom build/start commands and watch paths                                                                             |
| Pull errors or 429 on `mirror.gcr.io/library/…`                                    | Registry outage or rate limit                                                               | Retry. If it persists, switch both `FROM` lines to `node:24.21.0-bookworm-slim` and `caddy:2.11.7-alpine` (Docker Hub), or `public.ecr.aws/docker/library/…` |
| `npm install --global pnpm@12.6.0 bun@1.4.2` fails (ETIMEDOUT, EAI_AGAIN)          | Network flake on the builder                                                                | Retry                                                                                                                                                        |
| `ERR_PNPM_OUTDATED_LOCKFILE` or another frozen-lockfile error                      | `pnpm-lock.yaml` out of sync with a `package.json`                                          | Run `pnpm install` locally and commit the lockfile; add versions only through the catalog in `pnpm-workspace.yaml`                                           |
| Error in the `tsdown` step (packages/stats)                                        | The TypeScript 7 native binary is missing for the builder's platform                        | Check whether the builder is x86_64 or arm64, and that the lockfile includes that platform's `@typescript/native-preview` package                            |
| `JavaScript heap out of memory`, exit 137 or "Killed" during `vite build`          | Not enough build memory for prerendering 8,000 pages at concurrency 8                       | Lower `prerender.concurrency` in `apps/web/vite.config.ts` to 2–4, and/or add `ENV NODE_OPTIONS=--max-old-space-size=4096` to the build stage                |
| `[prerender]` failure naming one path                                              | That page threw during SSR; `failOnError` is on                                             | Reproduce with `moonx web:build` and fix the page                                                                                                            |
| `Pages reference assets that were not built`                                       | Server and client stylesheet hashes differ                                                  | Make sure the Dockerfile still copies `.gitignore` (see the build steps above)                                                                               |
| `404.html: rendering /__not-found gave status …`                                   | `seo-files.ts` could not server-render the not-found page from `dist/server`                | Reproduce locally with `cd apps/web && pnpm exec vite build && bun scripts/seo-files.ts`                                                                     |
| `VITE_SITE_URL is not a URL` or `has no host`                                      | The variable was set to an empty or invalid reference                                       | Remove the variable, or set it to a full origin such as `https://x.up.railway.app`                                                                           |
| Build passes; the healthcheck fails with "service unavailable"                     | A custom start command replaced Caddy, or the networking target port does not match `$PORT` | Clear the start command; let Railway inject `PORT` (Caddy listens on `:$PORT`)                                                                               |
| Deploy log shows `pnpm: not found` or `node: not found`                            | A custom start command is set (the serve image has neither tool)                            | Clear it                                                                                                                                                     |
| Site loads unstyled                                                                | CSS hash mismatch                                                                           | Same fix as the missing-assets row                                                                                                                           |

Caddy's startup log normally shows "serving initial configuration", plus three
harmless warnings: admin endpoint disabled, HTTP/2 skipped without TLS, and a
TLS storage cleanup.

## Verifying

Build the same image locally, check it with curl, then check the live site the
same way.

Local image (Docker Desktop or any Docker host):

```bash
git clone https://github.com/wsoule/world-data && cd world-data
docker build --build-arg RAILWAY_PUBLIC_DOMAIN=example.up.railway.app -t rankodex .
docker run --rm -p 8080:8080 rankodex
```

Then, against `http://localhost:8080` (and later the Railway URL):

| Request                                          | Expect                                                          |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `/`                                              | 200, `Content-Encoding: gzip`, a canonical link to the site URL |
| `/topics/state/median-household-income-by-state` | 200                                                             |
| `/categories/`                                   | 308 to `/categories`                                            |
| `/does-not-exist`                                | 404, with the "Page not found" page as its body                 |
| `/%5Cevil.com/`                                  | 404, with no `Location` header (an open-redirect guard)         |
| `/assets/<any file>`                             | `Cache-Control: public, max-age=31536000, immutable`            |
| `/sitemap.xml`, `/robots.txt`                    | URLs on the site URL, never on an unregistered host             |

Repository checks before any commit, from the repo root:

```bash
pnpm install
export PATH="$PWD/node_modules/.bin:$PATH" AGENT=1
moon run root:format root:lint      # lint also runs web:build
moonx web:typecheck web:test stats:test
```

On 2026-11-03 these passed at `ea60ba1`: 324 web tests and 17 stats tests. After
a deploy, open a topic page, a place page and `/compare` in a browser, and check
the console for errors.

## Working rules and open items

Follow the repository's own `AGENTS.md` and `.agents/skills/`; they override
anything here. The points that matter most for deploy work:

- **Commits:** follow `.agents/skills/git-commits`: `type(scope): subject`, a
  body that gives the flow and then the change, wrapped at 72 columns, with no
  AI attribution lines.
- **Branches:** `main` is what Railway deploys, and every push to it redeploys.
  Ask the owner before pushing to `main`; otherwise work on a branch.
- **Dependencies:** use pnpm and the catalog in `pnpm-workspace.yaml` only, with
  a 7-day minimum release age. Pin tool versions in `.prototools`.
- **Data:** `apps/web/public/data` is generated and committed. Rebuild it with
  `moonx web:data-build` and don't hand-edit it.
- **Prerendering:** server-rendered markup must match the first client render.
  Read `AGENTS.md` before touching routes or components.

Open items, in priority order:

- [ ] Read the failed build's log and get the first successful deploy
- [ ] Generate a Railway domain, set the healthcheck path to `/`, and redeploy
      once so canonical URLs use the domain
- [ ] Owner: decide whether to register `rankodex.com`; if yes, attach it and
      set `VITE_SITE_URL`
- [ ] Optional: move the dashboard settings into Railway Infrastructure as Code
      (`.railway/railway.ts`) once the deploy works
- [ ] Known gaps, not blocking: Connecticut counties don't join the 2022 county
      map; French overseas departments are coloured as France; every page
      downloads its type's whole dataset; a few source columns are duplicated
      (chocolate 16580/16581, WHO obesity 17984–17986)
