import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Built into ../../wo so it's served at <site>/wo/ next to the studio.
export default defineConfig({
  base: './',
  build: { outDir: '../../wo', emptyOutDir: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Work Orders',
        short_name: 'Work Orders',
        description: 'Work orders, estimates, signatures and invoices for mobile mechanics.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0e1013',
        theme_color: '#1f6feb',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // Never cache Supabase or VIN lookups; those are live data.
        navigateFallbackDenylist: [/^\/auth/],
      },
    }),
  ],
})
