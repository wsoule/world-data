import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

import { prerenderPages } from './scripts/prerender-pages';
import { DEFAULT_SITE_URL } from './src/site-url';

const dataDir = fileURLToPath(new URL('./public/data', import.meta.url));
const siteUrl = (process.env.VITE_SITE_URL ?? DEFAULT_SITE_URL).replace(
  /\/+$/,
  ''
);

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Topic, place, category and home pages become static HTML at build
      // time; everything else is served by the SPA shell (/_shell.html).
      pages: command === 'build' ? prerenderPages(dataDir) : [],
      prerender: {
        enabled: true,
        crawlLinks: false,
        autoSubfolderIndex: true,
        failOnError: true,
        concurrency: 8,
      },
      sitemap: { enabled: true, host: siteUrl },
      // The SPA shell (/_shell.html) serves non-prerendered routes in
      // production. Only enable it for builds: in dev it would make every
      // request render as the shell instead of the real page.
      // maskPath must not be a real page: on '/' the shell would replace the
      // prerendered home page.
      spa: { enabled: command === 'build', maskPath: '/app-shell' },
    }),
    react(),
  ],
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
}));
