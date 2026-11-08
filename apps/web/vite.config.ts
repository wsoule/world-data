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
        // The preview server shares this process, so a slow page can hold the
        // event loop long enough for a keep-alive socket to be reset under the
        // next request (fetch failed: ECONNRESET). Retry rather than fail the
        // whole build; a page that really errors still fails after these.
        retryCount: 3,
        retryDelay: 1000,
      },
      sitemap: { enabled: true, host: siteUrl },
    }),
    react(),
  ],
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
}));
