import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

import { prerenderPages } from './scripts/prerender-pages';
import { resolveSiteUrl } from './src/site-url';

const dataDir = fileURLToPath(new URL('./public/data', import.meta.url));
const siteUrl = resolveSiteUrl(process.env.VITE_SITE_URL);

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Every page becomes static HTML at build time. /compare, /vs and
      // /search are ssr: false, so theirs is the client-rendered shell.
      pages: command === 'build' ? prerenderPages(dataDir) : [],
      prerender: {
        enabled: true,
        crawlLinks: false,
        autoSubfolderIndex: true,
        failOnError: true,
        concurrency: 8,
        // No retryCount: TanStack's retry re-queues a path it has already
        // seen, so a "retried" page is silently skipped instead of rendered.
      },
      sitemap: { enabled: true, host: siteUrl },
    }),
    react(),
    // The prerenderer fetches every page from a `vite preview` server running
    // in this same process. A slow page can hold the event loop until a
    // keep-alive socket is closed just as the next request reuses it, failing
    // the build with "fetch failed: ECONNRESET". Closing each connection after
    // its response means no socket is ever reused. Production is served by
    // Caddy, so this only affects `vite preview`.
    {
      name: 'preview-close-connections',
      configurePreviewServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Connection', 'close');
          next();
        });
      },
    },
  ],
  // The prerenderer fetches from this preview server's resolved URL. With
  // "localhost" that has two addresses, and Node gives ::1 only 250ms before
  // falling back to 127.0.0.1, where nothing listens; while a slow page holds
  // the event loop, that timer fires first and the build fails with
  // ETIMEDOUT ::1 / ECONNREFUSED 127.0.0.1. One IPv4 address avoids the race.
  preview: { host: '127.0.0.1' },
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
}));
