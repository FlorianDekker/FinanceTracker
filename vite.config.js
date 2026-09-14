import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))

export default defineConfig({
  base: '/FinanceTracker/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Budget Tracker',
        short_name: 'Budget',
        lang: 'nl',
        description: 'Budget-app: importeer je bankafschriften, categoriseer automatisch en houd je budgetten bij',
        theme_color: '#1E3A5F',
        background_color: '#111111',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/FinanceTracker/',
        scope: '/FinanceTracker/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // De pdf.js-worker is een .mjs van ~1,2 MB. Hij valt al buiten de
        // globPatterns hierboven, maar dit maakt het expliciet: hem precachen
        // zou de installatie meer dan verdubbelen, terwijl een PDF uitlezen
        // toch de AI-dienst (en dus internet) nodig heeft.
        globIgnores: ['**/pdf.worker*.mjs', '**/*.mjs'],
        navigateFallback: '/FinanceTracker/index.html',
        runtimeCaching: [
          {
            // Na één keer gebruiken staat de worker wel in de cache, zodat het
            // renderen van een PDF-pagina daarna ook offline werkt.
            urlPattern: /pdf\.worker.*\.mjs$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs-worker',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
  ],
})
