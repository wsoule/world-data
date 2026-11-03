# Production image for Rankodex. A Node stage prerenders the static site
# (apps/web/dist/client) and a Caddy stage serves it with the root Caddyfile.
# Railway builds a root Dockerfile automatically; any other Docker host works
# the same way:
#
#   docker build -t rankodex . && docker run -p 8080:8080 rankodex
#
# Canonical URLs, Open Graph tags and the sitemap are baked in at build time
# from VITE_SITE_URL (a Railway service variable or --build-arg). When it is
# unset, Railway's generated domain is used if there is one, and otherwise
# https://rankodex.com (src/site-url.ts).
#
# Base images are the official Docker Hub images pulled through Google's
# mirror, because Docker Hub rate-limits shared build machines (429s).

# ---- build: prerender the site ------------------------------------------------
FROM mirror.gcr.io/library/node:24.21.0-bookworm-slim AS build

# Same versions as .prototools. moon is not used here: it downloads toolchain
# plugins at startup, and the two build steps below are all web:build does.
RUN npm install --global pnpm@12.6.0 bun@1.4.2 && npm cache clean --force

WORKDIR /repo

# Dependencies first, so source-only changes reuse this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/stats/package.json packages/stats/
RUN pnpm install --frozen-lockfile

# Only what the build reads, so edits to docs, the Caddyfile or CI do not
# rerun the prerender. .gitignore matters: Tailwind's automatic source scan
# skips ignored paths, and without it the server build scans the client build
# in dist/ and emits a stylesheet with a different hash than the client's.
COPY .gitignore tsconfig.json tsconfig.options.json .browserslistrc ./
COPY packages/stats packages/stats
COPY apps/web apps/web

# stats:build, then web:build (vite build prerenders every page and writes
# sitemap.xml; seo-files.ts adds robots.txt, llms.txt, 404.html and CSVs).
ARG VITE_SITE_URL
ARG RAILWAY_PUBLIC_DOMAIN
RUN cd packages/stats && pnpm exec tsdown --clean
RUN if [ -z "$VITE_SITE_URL" ] && [ -n "$RAILWAY_PUBLIC_DOMAIN" ]; then \
      export VITE_SITE_URL="https://$RAILWAY_PUBLIC_DOMAIN"; \
    fi \
    && echo "Site URL: ${VITE_SITE_URL:-default}" \
    && cd apps/web && pnpm exec vite build && bun scripts/seo-files.ts

# Precompress text files once so Caddy serves the .gz copies instead of
# compressing every response.
RUN find apps/web/dist/client -type f -size +1k \
      \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' \
         -o -name '*.svg' -o -name '*.txt' -o -name '*.xml' -o -name '*.csv' \
         -o -name '*.webmanifest' \) \
      -exec gzip -9 --keep {} +

# ---- serve: static files behind Caddy -----------------------------------------
FROM mirror.gcr.io/library/caddy:2.11.7-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist/client /srv

# Railway injects PORT; 8080 is the default elsewhere.
ENV PORT=8080
EXPOSE 8080
