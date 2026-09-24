import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))

// Build-stempel (commit + tijd) voor in Instellingen: zo zie je op een
// telefoon meteen of de PWA de nieuwste versie draait of nog een oude vasthoudt.
function buildStamp() {
  let hash = 'dev'
  try { hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { /* geen git */ }
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${hash} · ${pad(d.getDate())}-${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default defineConfig({
  base: '/FinanceTracker/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_STAMP__: JSON.stringify(buildStamp()),
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
        // Android/Chrome: laat de geïnstalleerde PWA in het systeem-deelmenu
        // verschijnen. iOS/Safari kent de Web Share Target API niet (WebKit-bug
        // 194593) en negeert dit veld gewoon; zie docs/android-share.md.
        share_target: {
          action: '/FinanceTracker/bon',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'receipt', accept: ['image/*', 'application/pdf'] }] },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // De pdf.js-worker is een .mjs van ~1,2 MB. Hij valt al buiten de
        // globPatterns hierboven, maar dit maakt het expliciet: hem precachen
        // zou de installatie meer dan verdubbelen, terwijl een PDF uitlezen
        // toch de AI-dienst (en dus internet) nodig heeft.
        globIgnores: ['**/pdf.worker*.mjs', '**/*.mjs'],
        // Workbox schrijft dit pad ongewijzigd weg als `importScripts('sw-share.js')`
        // in het gegenereerde sw.js. Dat bestand komt straks naast sw.js in de
        // root van dist/ te staan (via public/), dus een relatief pad volstaat:
        // een klassieke worker lost importScripts()-paden op t.o.v. de eigen
        // scriptlocatie (hier /FinanceTracker/sw.js), dus dit wordt
        // /FinanceTracker/sw-share.js — precies binnen de PWA-scope.
        importScripts: ['sw-share.js'],
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
