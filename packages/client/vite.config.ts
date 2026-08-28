import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Where `wrangler dev` serves the Worker during development. */
const WORKER_ORIGIN = process.env.WORKER_ORIGIN ?? 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The app shell is precached; documents come from Yjs + IndexedDB, so
      // there is nothing useful to cache for the API or the sockets.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/parties\//, /^\/\.well-known\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 8 } },
          },
        ],
      },
      manifest: {
        id: '/',
        name: 'Mind Meld',
        short_name: 'Planner',
        description: 'Shared notes, task lists and tables for a team, updating live as you type.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#12141a',
        theme_color: '#12141a',
        categories: ['productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    // Same-origin in development too, so the session cookie is sent on the
    // websocket upgrade exactly as it is in production.
    proxy: {
      '/api': { target: WORKER_ORIGIN, changeOrigin: true },
      '/parties': { target: WORKER_ORIGIN, changeOrigin: true, ws: true },
      '/.well-known': { target: WORKER_ORIGIN, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
